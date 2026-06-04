#!/usr/bin/env python3
"""
caddyfile-lint.py — Block insecure Caddyfile commits before they ship.

Pre-commit gate complementing the nightly exposure audit (T3.4). The audit
catches drift at runtime — this lint catches it at commit time, before the
service ever goes live. Together they form complete coverage of the
2026-04-07 google-token-vault failure pattern (code says "protected", config
disabled it, no automated check noticed for 13 days).

How it works:
  1. Parse the Caddyfile, extract every public host block
     (matching `<hostname> { ... }` at the top level)
  2. For each block, check:
       - Is the hostname in `public-endpoints-allowlist.yaml`?
         If not → REJECT (default-deny posture for new public services)
       - Does the host's `auth_strategy` match what's in the block?
           - forward_auth → block MUST contain `import authentik_forward_auth`
             OR an explicit `# AUDITED: public-ok — <reason>` annotation
           - self_auth   → no requirement (host has its own auth)
           - public      → no requirement (intentionally public)
           - exempt      → MUST contain `# AUDITED: public-ok — <reason>`
  3. Print clear remediation instructions for each violation
  4. Exit 0 if clean, exit 1 if any violation

Usage:
    python3 caddyfile-lint.py [path/to/Caddyfile]

Default Caddyfile path: ~/Docker/mydocker/caddy/Caddyfile

Pre-commit integration: see ~/Docker/mydocker/.pre-commit-config.yaml

Created: 2026-04-08 as security-remediation-2026-04 T3.5 (AIProjects-8dnh)
"""
from __future__ import annotations

import os
import re
import sys
from pathlib import Path
from typing import Dict, List, NamedTuple, Optional


# ============================================================================
# Config paths
# ============================================================================

DEFAULT_CADDYFILE = Path(os.path.expanduser("~/Docker/mydocker/caddy/Caddyfile"))
ALLOWLIST_PATH = Path(os.path.expanduser(
    "~/AIProjects/.claude/registries/public-endpoints-allowlist.yaml"
))


# ============================================================================
# Allowlist loader (no PyYAML dependency — minimal hand-rolled parser)
# ============================================================================
#
# We parse only the fields we need (hostname, auth_strategy, auth_justification)
# to avoid pulling in PyYAML as a pre-commit dependency. The allowlist format is
# regular and predictable enough for a small parser.

class HostEntry(NamedTuple):
    hostname: str
    auth_strategy: str
    auth_justification: str
    line_number: int


def load_allowlist(path: Path = ALLOWLIST_PATH) -> Dict[str, HostEntry]:
    """Parse public-endpoints-allowlist.yaml and return {hostname: HostEntry}."""
    if not path.exists():
        raise SystemExit(f"caddyfile-lint: allowlist not found at {path}")

    entries: Dict[str, HostEntry] = {}
    current_host: Optional[str] = None
    current_strategy: Optional[str] = None
    current_justification: str = ""
    current_line: int = 0

    in_hostnames_section = False
    host_re = re.compile(r"^  ([a-z][a-z0-9.-]+\.[a-z]+):\s*$")

    with open(path) as f:
        for lineno, line in enumerate(f, start=1):
            stripped = line.rstrip("\n")

            if stripped == "hostnames:":
                in_hostnames_section = True
                continue

            if not in_hostnames_section:
                continue

            m = host_re.match(stripped)
            if m:
                # Flush previous host
                if current_host:
                    entries[current_host] = HostEntry(
                        hostname=current_host,
                        auth_strategy=current_strategy or "MISSING",
                        auth_justification=current_justification,
                        line_number=current_line,
                    )
                current_host = m.group(1)
                current_strategy = None
                current_justification = ""
                current_line = lineno
                continue

            if current_host:
                key_match = re.match(r"^    ([a-z_]+):\s*(.*)$", stripped)
                if key_match:
                    key, value = key_match.group(1), key_match.group(2)
                    if key == "auth_strategy":
                        current_strategy = value.strip().strip('"').strip("'")
                    elif key == "auth_justification":
                        current_justification = value.strip().strip('"').strip("'")

    # Flush the last host
    if current_host:
        entries[current_host] = HostEntry(
            hostname=current_host,
            auth_strategy=current_strategy or "MISSING",
            auth_justification=current_justification,
            line_number=current_line,
        )

    return entries


# ============================================================================
# Caddyfile parser (top-level host block extractor)
# ============================================================================

class CaddyHostBlock(NamedTuple):
    hostname: str
    start_line: int
    end_line: int
    body: str
    has_forward_auth: bool
    has_audited_annotation: bool
    audited_reason: Optional[str]


def parse_caddyfile(path: Path) -> List[CaddyHostBlock]:
    """
    Walk a Caddyfile and return one CaddyHostBlock per top-level
    `<hostname.tld> { ... }` block. Brace-counted to handle nested blocks.

    Skips:
      - Lines that start with `#` (commented-out blocks)
      - Snippet definitions like `(name) { ... }`
      - Internal blocks like `{ admin off }` at the top
    """
    if not path.exists():
        raise SystemExit(f"caddyfile-lint: Caddyfile not found at {path}")

    text = path.read_text()
    lines = text.split("\n")

    blocks: List[CaddyHostBlock] = []
    # Match a hostname line at column 0: `host.example.com {` or `host.com:443 {`
    host_open_re = re.compile(r"^([a-z][a-z0-9.-]*\.[a-z]+)(:\d+)?\s*\{\s*$")

    i = 0
    while i < len(lines):
        line = lines[i]
        m = host_open_re.match(line)
        if not m:
            i += 1
            continue

        hostname = m.group(1)
        start_line = i + 1
        depth = 1
        body_lines: List[str] = []
        j = i + 1
        while j < len(lines) and depth > 0:
            line2 = lines[j]
            depth += line2.count("{") - line2.count("}")
            if depth > 0:
                body_lines.append(line2)
            j += 1
        end_line = j

        body = "\n".join(body_lines)
        has_fa = bool(re.search(r"^\s*import\s+authentik_forward_auth\b", body, re.MULTILINE))
        audited_match = re.search(
            r"^\s*#\s*AUDITED:\s*public-ok\s*[—-]\s*(.+)$",
            body,
            re.MULTILINE,
        )
        has_audited = bool(audited_match)
        audited_reason = audited_match.group(1).strip() if audited_match else None

        blocks.append(CaddyHostBlock(
            hostname=hostname,
            start_line=start_line,
            end_line=end_line,
            body=body,
            has_forward_auth=has_fa,
            has_audited_annotation=has_audited,
            audited_reason=audited_reason,
        ))

        i = j

    return blocks


# ============================================================================
# Lint rules
# ============================================================================

class Violation(NamedTuple):
    severity: str   # "error" or "warn"
    hostname: str
    line: int
    rule: str
    message: str
    fix_hint: str


def lint(
    caddyfile_path: Path = DEFAULT_CADDYFILE,
    allowlist_path: Path = ALLOWLIST_PATH,
) -> List[Violation]:
    allowlist = load_allowlist(allowlist_path)
    blocks = parse_caddyfile(caddyfile_path)

    violations: List[Violation] = []

    for block in blocks:
        host = block.hostname
        entry = allowlist.get(host)

        # Rule 1: Default-deny — every public host MUST be in the allowlist
        if entry is None:
            violations.append(Violation(
                severity="error",
                hostname=host,
                line=block.start_line,
                rule="undeclared-host",
                message=f"Public host '{host}' is not declared in the allowlist.",
                fix_hint=(
                    f"Add an entry to {allowlist_path.name} under `hostnames:` "
                    f"with `description`, `auth_strategy` (forward_auth/self_auth/public/exempt), "
                    f"and `auth_justification`. See existing entries for examples."
                ),
            ))
            continue

        strategy = entry.auth_strategy

        # Rule 2: forward_auth strategy → block must contain import or AUDITED
        if strategy == "forward_auth":
            if not block.has_forward_auth and not block.has_audited_annotation:
                violations.append(Violation(
                    severity="error",
                    hostname=host,
                    line=block.start_line,
                    rule="missing-forward-auth",
                    message=(
                        f"Host '{host}' has auth_strategy=forward_auth in the allowlist "
                        f"but the Caddyfile block lacks `import authentik_forward_auth` "
                        f"AND has no `# AUDITED: public-ok — <reason>` annotation."
                    ),
                    fix_hint=(
                        "Add `import authentik_forward_auth` to the block, OR add a "
                        "`# AUDITED: public-ok — <reason>` annotation explaining why "
                        "the host is intentionally public for this commit. The annotation "
                        "is reviewed at the next nightly exposure audit."
                    ),
                ))

        # Rule 3: exempt strategy requires the AUDITED annotation
        elif strategy == "exempt":
            if not block.has_audited_annotation:
                violations.append(Violation(
                    severity="error",
                    hostname=host,
                    line=block.start_line,
                    rule="missing-audited-annotation",
                    message=(
                        f"Host '{host}' has auth_strategy=exempt in the allowlist "
                        f"but the Caddyfile block has no `# AUDITED: public-ok — <reason>` "
                        f"annotation."
                    ),
                    fix_hint=(
                        "Either flip auth_strategy to a real value (forward_auth/self_auth/"
                        "public) and document the choice, or add the AUDITED annotation."
                    ),
                ))

        # Rule 4: ip_gated requires the block to use a `client_ip` matcher
        # (Caddy-layer LAN/VPN gating). We check for the literal directive
        # since that's the only way to ip-gate in Caddy.
        elif strategy == "ip_gated":
            if "client_ip" not in block.body:
                violations.append(Violation(
                    severity="error",
                    hostname=host,
                    line=block.start_line,
                    rule="missing-ip-gate",
                    message=(
                        f"Host '{host}' has auth_strategy=ip_gated in the allowlist "
                        f"but the Caddyfile block has no `client_ip` matcher."
                    ),
                    fix_hint=(
                        "Add a `client_ip` matcher (e.g. `@lan { client_ip 192.168.0.0/16 "
                        "10.0.0.0/8 }`) and route protected handles through it. Or change "
                        "the allowlist auth_strategy to a different value."
                    ),
                ))

        # Rule 5: self_auth and public are no-op (host's own auth or intentionally open)
        # Rule 6: anything else (typo, unknown strategy) is an error
        elif strategy not in ("self_auth", "public"):
            violations.append(Violation(
                severity="error",
                hostname=host,
                line=block.start_line,
                rule="invalid-auth-strategy",
                message=(
                    f"Host '{host}' has auth_strategy={strategy!r} which is not a valid "
                    f"value. Allowed: forward_auth | self_auth | public | exempt."
                ),
                fix_hint="Fix the auth_strategy field in the allowlist YAML.",
            ))

    return violations


# ============================================================================
# CLI
# ============================================================================

def format_violation(v: Violation) -> str:
    icon = "❌" if v.severity == "error" else "⚠️ "
    return (
        f"{icon} [{v.rule}] {v.hostname} (Caddyfile line {v.line})\n"
        f"   {v.message}\n"
        f"   FIX: {v.fix_hint}"
    )


def main() -> int:
    import argparse
    ap = argparse.ArgumentParser(
        description="Lint a Caddyfile against the public-endpoints allowlist."
    )
    ap.add_argument(
        "caddyfile",
        nargs="?",
        default=str(DEFAULT_CADDYFILE),
        help=f"Path to Caddyfile (default: {DEFAULT_CADDYFILE})",
    )
    ap.add_argument(
        "--allowlist",
        default=str(ALLOWLIST_PATH),
        help=f"Path to allowlist YAML (default: {ALLOWLIST_PATH})",
    )
    ap.add_argument(
        "--quiet", action="store_true",
        help="Only print on violations (silent on success)",
    )
    args = ap.parse_args()

    violations = lint(Path(args.caddyfile), Path(args.allowlist))

    errors = [v for v in violations if v.severity == "error"]
    warns = [v for v in violations if v.severity == "warn"]

    if not violations:
        if not args.quiet:
            print(f"✓ caddyfile-lint: clean ({Path(args.caddyfile).name})")
        return 0

    print(f"caddyfile-lint: {len(errors)} error(s), {len(warns)} warning(s)\n")
    for v in violations:
        print(format_violation(v))
        print()

    if errors:
        print(
            "COMMIT REJECTED. Fix the errors above and try again.\n"
            "If you genuinely need to merge a public-without-auth service, add a\n"
            "`# AUDITED: public-ok — <reason>` annotation inside the Caddyfile block\n"
            "explaining why. The next nightly exposure audit will surface it for review."
        )
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())

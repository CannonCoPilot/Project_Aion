#!/usr/bin/env python3
"""session-extractor.py — Extract training captures from Claude Code interactive sessions.

Parses a Claude Code session JSONL file, segments by user prompt boundaries,
extracts prompt/response pairs, detects quality signals, filters noise,
and outputs capture-format JSON lines to stdout.

Usage:
    python3 session-extractor.py <session.jsonl> [--min-prompt-len N] [--max-segments N]
"""

import json
import re
import sys
from pathlib import Path

# Noise patterns — user prompts that are not training-worthy
NOISE_PATTERNS = [
    re.compile(r"^(ok|yes|no|sure|yeah|yep|nope|thanks|thank you|cool|great|good|nice|perfect|done|go|do it|proceed|continue|approved?)\.?$", re.I),
    re.compile(r"^(end session|checkpoint|save session|/clear|/help|/compact)", re.I),
    re.compile(r"^<local-command-caveat>", re.I),
    re.compile(r"^<command-name>/(clear|help|compact|init)", re.I),
]

# Correction keywords — indicates user is fixing the previous response
CORRECTION_KEYWORDS = [
    "no,", "no ", "wrong", "that's not", "thats not", "undo", "revert",
    "actually,", "actually ", "not what i", "i said", "i meant",
    "don't do", "dont do", "stop", "cancel", "go back",
]

# Credential patterns to redact
CREDENTIAL_PATTERNS = [
    re.compile(r"(sk-[a-zA-Z0-9]{20,})"),          # OpenAI/Anthropic keys
    re.compile(r"(ghp_[a-zA-Z0-9]{36,})"),          # GitHub PATs
    re.compile(r"(ghs_[a-zA-Z0-9]{36,})"),          # GitHub app tokens
    re.compile(r"(glpat-[a-zA-Z0-9\-_]{20,})"),     # GitLab PATs
    re.compile(r"(Bearer\s+[a-zA-Z0-9\-_.]{20,})"), # Bearer tokens
    re.compile(r"(password\s*[:=]\s*\S+)", re.I),    # password= or password:
    re.compile(r"(ANTHROPIC_API_KEY\s*=\s*\S+)"),
    re.compile(r"(OPENAI_API_KEY\s*=\s*\S+)"),
]

MIN_PROMPT_LENGTH = 20
MIN_RESPONSE_TEXT_LENGTH = 100
MAX_SEGMENTS_PER_SESSION = 50
MAX_TOOL_RESULT_LENGTH = 1024


def sanitize_text(text: str) -> str:
    """Redact credentials from text."""
    for pattern in CREDENTIAL_PATTERNS:
        text = pattern.sub("[REDACTED]", text)
    return text


def parse_session(filepath: str) -> list[dict]:
    """Read all JSONL entries from a session file."""
    entries = []
    with open(filepath) as f:
        for line_num, line in enumerate(f):
            line = line.strip()
            if not line:
                continue
            try:
                entries.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    return entries


def is_real_user_prompt(entry: dict) -> bool:
    """Is this a genuine user prompt (not a tool result or system message)?"""
    if entry.get("type") != "user":
        return False

    # Skip tool result continuations
    if entry.get("sourceToolUseID"):
        return False

    msg = entry.get("message", {})
    content = msg.get("content", "")

    # Tool results come as list with tool_result blocks
    if isinstance(content, list):
        for block in content:
            if block.get("type") == "tool_result":
                return False
        # List with text blocks from sourceToolUseID responses
        return False

    # Must be a plain string
    if not isinstance(content, str):
        return False

    # Skip local command caveats and slash commands
    if content.startswith("<local-command-caveat>"):
        return False
    if content.startswith("<command-name>/"):
        return False

    return True


def get_user_prompt_text(entry: dict) -> str:
    """Extract the user's prompt text."""
    msg = entry.get("message", {})
    content = msg.get("content", "")
    if isinstance(content, str):
        # Strip system-reminder tags — these are injected, not user-written
        text = re.sub(r"<system-reminder>.*?</system-reminder>", "", content, flags=re.DOTALL)
        return text.strip()
    return ""


def is_noise_prompt(text: str) -> bool:
    """Check if prompt matches noise patterns."""
    for pattern in NOISE_PATTERNS:
        if pattern.search(text):
            return True
    return False


def has_correction_keywords(text: str) -> bool:
    """Check if prompt text indicates a correction of previous response."""
    lower = text.lower()
    return any(kw in lower for kw in CORRECTION_KEYWORDS)


def flatten_response_chain(entries: list[dict]) -> dict:
    """Flatten a chain of assistant/tool messages into a single response.

    Returns dict with:
        text: flattened response text
        tool_calls: list of {name, args_preview}
        tool_names: set of tool names used
        has_writes: bool
        has_commits: bool
        has_errors: bool
        total_output_tokens: int
        num_assistant_turns: int
    """
    text_parts = []
    tool_calls = []
    tool_names = set()
    has_writes = False
    has_commits = False
    has_errors = False
    total_output_tokens = 0
    num_assistant_turns = 0

    for entry in entries:
        etype = entry.get("type")

        if etype == "assistant":
            num_assistant_turns += 1
            msg = entry.get("message", {})
            usage = msg.get("usage", {})
            total_output_tokens += usage.get("output_tokens", 0)

            for block in msg.get("content", []):
                btype = block.get("type")

                if btype == "text":
                    text = block.get("text", "").strip()
                    if text:
                        text_parts.append(text)

                elif btype == "tool_use":
                    tool_name = block.get("name", "unknown")
                    tool_input = block.get("input", {})
                    tool_names.add(tool_name)

                    # Check for write operations
                    if tool_name in ("Write", "Edit", "NotebookEdit"):
                        has_writes = True

                    # Build args preview
                    args_preview = ""
                    if tool_name == "Bash":
                        cmd = tool_input.get("command", "")
                        args_preview = cmd[:200]
                        # Check for git commit
                        if re.search(r"git\s+commit", cmd):
                            has_commits = True
                    elif tool_name == "Read":
                        args_preview = tool_input.get("file_path", "")
                    elif tool_name in ("Write", "Edit"):
                        args_preview = tool_input.get("file_path", "")
                    elif tool_name == "Grep":
                        args_preview = f"pattern={tool_input.get('pattern', '')}"
                    elif tool_name == "Glob":
                        args_preview = f"pattern={tool_input.get('pattern', '')}"
                    elif tool_name == "Skill":
                        args_preview = tool_input.get("skill", "")
                    elif tool_name == "Agent":
                        args_preview = tool_input.get("description", "")[:100]
                    else:
                        args_preview = json.dumps(tool_input)[:150]

                    tool_calls.append({"name": tool_name, "args": args_preview})
                    text_parts.append(f"\n[Tool: {tool_name} {args_preview}]")

                # Skip thinking blocks for training output

        elif etype == "user":
            # Tool results
            msg = entry.get("message", {})
            content = msg.get("content", "")
            if isinstance(content, list):
                for block in content:
                    if block.get("type") == "tool_result":
                        result_text = str(block.get("content", ""))
                        is_error = block.get("is_error", False)
                        if is_error:
                            has_errors = True
                        # Truncate large tool results
                        if len(result_text) > MAX_TOOL_RESULT_LENGTH:
                            result_text = result_text[:MAX_TOOL_RESULT_LENGTH] + "...[truncated]"
                        text_parts.append(f"[Result: {result_text}]")
                    elif block.get("type") == "text":
                        # Skill/hook injected text
                        text = block.get("text", "").strip()
                        if text:
                            text_parts.append(f"[Injected: {text[:500]}]")

        elif etype == "system":
            # Check for error indicators
            sub = entry.get("subtype", "")
            if sub == "tool_result":
                tool_result = entry.get("toolUseResult", {})
                stderr = tool_result.get("stderr", "")
                if stderr and ("error" in stderr.lower() or "fatal" in stderr.lower()):
                    has_errors = True
                # Check bash results for git commit
                stdout = tool_result.get("stdout", "")
                if re.search(r"^\[.+\]\s+\w+", stdout):  # git commit output pattern
                    has_commits = True

    return {
        "text": "\n\n".join(text_parts),
        "tool_calls": tool_calls,
        "tool_names": tool_names,
        "has_writes": has_writes,
        "has_commits": has_commits,
        "has_errors": has_errors,
        "total_output_tokens": total_output_tokens,
        "num_assistant_turns": num_assistant_turns,
    }


def segment_session(entries: list[dict]) -> list[dict]:
    """Segment a session into user prompt → response chain pairs.

    Returns list of segments, each with:
        prompt_text, response, timestamp, segment_index,
        next_prompt_text (for correction detection)
    """
    # Find all real user prompt indices
    prompt_indices = []
    for i, entry in enumerate(entries):
        if is_real_user_prompt(entry):
            prompt_indices.append(i)

    if not prompt_indices:
        return []

    segments = []
    for seg_idx, pi in enumerate(prompt_indices):
        if seg_idx >= MAX_SEGMENTS_PER_SESSION:
            break

        prompt_entry = entries[pi]
        prompt_text = get_user_prompt_text(prompt_entry)

        # Collect all entries from this prompt to the next user prompt
        next_pi = prompt_indices[seg_idx + 1] if seg_idx + 1 < len(prompt_indices) else len(entries)
        chain_entries = entries[pi + 1 : next_pi]

        # Get next prompt text for correction detection
        next_prompt_text = ""
        if seg_idx + 1 < len(prompt_indices):
            next_prompt_text = get_user_prompt_text(entries[prompt_indices[seg_idx + 1]])

        response = flatten_response_chain(chain_entries)
        timestamp = prompt_entry.get("timestamp", "")

        segments.append({
            "prompt_text": prompt_text,
            "response": response,
            "timestamp": timestamp,
            "segment_index": seg_idx,
            "next_prompt_text": next_prompt_text,
        })

    return segments


def detect_signals(segment: dict, total_prompts: int) -> list[str]:
    """Detect quality signals for a segment."""
    signals = []
    resp = segment["response"]

    # clean_execution: no errors in the response chain
    if not resp["has_errors"]:
        signals.append("clean_execution")

    # session_continued: there is a next prompt (user kept going)
    if segment["next_prompt_text"]:
        signals.append("session_continued")

    # deep_implementation: 5+ tool calls including writes
    if len(resp["tool_calls"]) >= 5 and resp["has_writes"]:
        signals.append("deep_implementation")

    # commit_in_response: git commit happened
    if resp["has_commits"]:
        signals.append("commit_in_response")

    # long_session: session has 10+ user prompts
    if total_prompts >= 10:
        signals.append("long_session")

    # user_correction: next prompt corrects this response
    if segment["next_prompt_text"] and has_correction_keywords(segment["next_prompt_text"]):
        signals.append("user_correction")

    return signals


def should_skip(segment: dict) -> bool:
    """Apply noise filter — return True if this segment should be skipped."""
    prompt = segment["prompt_text"]
    resp = segment["response"]

    # Too short
    if len(prompt) < MIN_PROMPT_LENGTH:
        return True

    # Noise pattern
    if is_noise_prompt(prompt):
        return True

    # No real work: no tool calls and short text response
    if len(resp["tool_calls"]) == 0 and len(resp["text"]) < MIN_RESPONSE_TEXT_LENGTH:
        return True

    # Empty response (assistant produced nothing)
    if not resp["text"].strip():
        return True

    return False


def extract_session(filepath: str) -> list[dict]:
    """Main extraction: parse session, segment, filter, signal, output."""
    entries = parse_session(filepath)
    if not entries:
        return []

    # Extract session metadata
    session_id = ""
    project = ""
    for entry in entries:
        if entry.get("sessionId"):
            session_id = entry["sessionId"]
        if entry.get("cwd"):
            cwd = entry["cwd"]
            # Derive project name from cwd
            if "/AIProjects" in cwd:
                project = "AIProjects"
            elif "/CreativeProjects" in cwd:
                project = "CreativeProjects"
            elif "/Code/" in cwd:
                project = cwd.split("/Code/")[-1].split("/")[0]
            else:
                project = Path(cwd).name
        if session_id and project:
            break

    segments = segment_session(entries)
    total_prompts = len([s for s in segments])

    results = []
    for segment in segments:
        if should_skip(segment):
            continue

        signals = detect_signals(segment, total_prompts)
        resp = segment["response"]

        # Sanitize content
        prompt_text = sanitize_text(segment["prompt_text"])
        response_text = sanitize_text(resp["text"])

        results.append({
            "prompt_text": prompt_text,
            "response_text": response_text,
            "signals": signals,
            "metrics": {
                "tool_call_count": len(resp["tool_calls"]),
                "tool_names": sorted(resp["tool_names"]),
                "has_writes": resp["has_writes"],
                "has_commits": resp["has_commits"],
                "has_errors": resp["has_errors"],
                "output_tokens": resp["total_output_tokens"],
                "num_assistant_turns": resp["num_assistant_turns"],
                "prompt_length": len(prompt_text),
                "response_length": len(response_text),
            },
            "session_id": session_id,
            "project": project,
            "timestamp": segment["timestamp"],
            "segment_index": segment["segment_index"],
            "total_session_prompts": total_prompts,
        })

    return results


def main():
    if len(sys.argv) < 2:
        print("Usage: session-extractor.py <session.jsonl>", file=sys.stderr)
        sys.exit(1)

    filepath = sys.argv[1]
    if not Path(filepath).exists():
        print(f"File not found: {filepath}", file=sys.stderr)
        sys.exit(1)

    results = extract_session(filepath)

    for result in results:
        print(json.dumps(result))


if __name__ == "__main__":
    main()

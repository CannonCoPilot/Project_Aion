#!/usr/bin/env python3
"""Map logic for chrome-pin.sh. Python, not bash, because the map is JSON and
nested heredocs in bash are how the first version of this broke.

Nothing here guesses a deviceId. An unresolved role prints UNRESOLVED and says
so, because sending a lane at the wrong session can push credentialed work into
the wrong account, and a wrong answer is worse than no answer.
"""
import json, os, sys, tempfile


def load(p):
    with open(p) as f:
        return json.load(f)


def save(p, d):
    # Same-directory temp + rename. ~/.claude.json is live state for every
    # running session; a partial write corrupts all of them.
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(p) or ".")
    with os.fdopen(fd, "w") as f:
        json.dump(d, f, indent=2)
    os.replace(tmp, p)


def role_for(m, lane, want):
    l = m["lanes"].get(lane)
    if not l:
        return None, None
    role = want or l["primary"]
    if want and want != l["primary"] and want not in l.get("alternates", []):
        return l, None            # not permitted for this lane
    return l, role


def device(m, role):
    return (m["roles"].get(role) or {}).get("deviceId")


def role_of_device(m, dev):
    for r, v in m["roles"].items():
        if v.get("deviceId") == dev:
            return r
    return "(unrecognised)"


def current_pin(cfg):
    try:
        return load(cfg).get("chromeExtension", {}).get("pairedDeviceId") or ""
    except Exception:
        return ""


RESOLVE = """RESOLVING WHICH deviceId IS WHICH — measured, never guessed.

Known:
  * Two extensions connected: da3bf06e… ("Browser 1"), b72a12c5… ("Browser 2").
  * Chrome has exactly TWO profiles:
        Default    "Your Chrome"       nathaniel.cannon@gmail.com
        Profile 1  "expert.micro1.ai"  naca028@expert.micro1.ai
  * Arc, Brave, Chromium, Edge, Firefox are ALSO installed. Any Chromium one can
    carry the extension, so the two connected browsers need not be those profiles.
  * NO profile is named for BYU or journal access, so the library session lives
    inside one of these, or in a browser that is not currently connected.

Why list_connected_browsers cannot settle it:
  it returns deviceId, name, osPlatform, connectedAt, isLocal — and NO account.

The measurement, about a minute per browser:
  1. select_browser <deviceId>
  2. navigate to https://myaccount.google.com/   (or the library's landing page)
  3. read the signed-in account off the page
  4. chrome-pin.sh set-role <role> <deviceId>

If the library session is in a browser that is not connected, open that browser
with the Claude extension first; it will then appear in list_connected_browsers."""


def main():
    mp, cfg, verb = sys.argv[1], sys.argv[2], sys.argv[3]
    a = sys.argv[4:]
    m = load(mp)

    if verb == "roles":
        for r, v in m["roles"].items():
            print(f"  {r:9s} {v.get('deviceId') or 'UNRESOLVED':40s} {v['purpose'][:58]}")
        return 0

    if verb == "list":
        for k, v in m["lanes"].items():
            d = device(m, v["primary"]) or "UNRESOLVED"
            alt = ",".join(v.get("alternates", [])) or "-"
            nw = "new-window" if v.get("new_window") else "reuse"
            print(f"  {k:9s} primary={v['primary']:8s} alt={alt:8s} {nw:10s} {d}")
        return 0

    if verb == "resolve":
        print(RESOLVE)
        return 0

    if verb == "set-role":
        role, dev = (a + ["", ""])[:2]
        if role not in m["roles"]:
            print(f"unknown role {role!r}; known: {list(m['roles'])}", file=sys.stderr)
            return 2
        if not dev:
            print("usage: chrome-pin.sh set-role <role> <deviceId>", file=sys.stderr)
            return 2
        before = m["roles"][role].get("deviceId")
        m["roles"][role]["deviceId"] = dev
        m["roles"][role]["evidence"] = "VERIFIED via chrome-pin.sh set-role (account read from the live session)"
        save(mp, m)
        print(f"role {role}: {before} -> {dev}")
        return 0

    if verb == "set-default":
        target = (a + [""])[0]
        dev = device(m, target) or target
        if not dev:
            print("usage: chrome-pin.sh set-default <role|deviceId>", file=sys.stderr)
            return 2
        if dev == target and target in m["roles"]:
            print(f"role {target!r} is UNRESOLVED — nothing to pin. Run: chrome-pin.sh resolve",
                  file=sys.stderr)
            return 2
        d = load(cfg)
        ce = d.setdefault("chromeExtension", {})
        before = ce.get("pairedDeviceId")
        ce["pairedDeviceId"] = dev
        ce["pairedDeviceName"] = role_of_device(m, dev)
        save(cfg, d)
        print(f"global pin {before} -> {dev} ({role_of_device(m, dev)})")
        print("New SESSIONS inherit this. Running sessions keep their in-memory selection.")
        return 0

    lane = a[0] if a else ""
    want = a[1] if len(a) > 1 and a[1] else None
    l, role = role_for(m, lane, want)

    if verb == "id":
        print(device(m, role) or "" if role else "")
        return 0

    # show
    if not l:
        print(f"lane            : {lane}\nrole            : (UNMAPPED LANE — add it to {mp})")
        return 0
    if role is None:
        print(f"lane            : {lane}")
        print(f"role            : {want!r} is NOT permitted for this lane")
        print(f"                  primary={l['primary']} alternates={l.get('alternates', []) or '-'}")
        return 0
    dev, pin = device(m, role), current_pin(cfg)
    print(f"lane            : {lane}")
    print(f"role            : {role}" + ("  (primary)" if role == l["primary"] else "  (alternate)"))
    print(f"open new window : {'yes' if l.get('new_window') else 'no'}")
    if not dev:
        print("deviceId        : UNRESOLVED — this role has no verified deviceId")
        print("\nDO NOT GUESS. Run: chrome-pin.sh resolve")
        print("Driving the wrong session can push credentialed work into the wrong account.")
        return 0
    print(f"deviceId        : {dev}")
    print(f"global pin      : {pin or '(none)'} ({role_of_device(m, pin) if pin else '-'})")
    if dev != pin:
        print(f"\nACTION: call select_browser with {dev} as this lane's FIRST browser action.")
        print("        Per-session and promptless; other lanes are unaffected.")
    else:
        print("\nOK: global pin already matches. The MCP auto-connects silently.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

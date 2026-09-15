#!/usr/bin/env python3
"""Map logic for chrome-pin.sh.

CORRECTED MODEL. A Chrome WINDOW is not a browser identity: the Claude
extension attaches per PROFILE, so every window of a profile shares one
deviceId, and cookies are profile-wide. The BYU library session is the first
tab of a third window of the PERSONAL profile -- the same profile that holds
the Snorkel session -- so it is a DESTINATION, not a browser to select.

Nothing here guesses a deviceId. Driving the wrong profile pushes credentialed
work into the wrong account, so an unverified profile refuses to answer.

select_browser HAS A SIDE EFFECT, measured rather than assumed: it rewrites
the global pin in ~/.claude.json. Live routing stays per-process, so no
running lane is disturbed, but the default a NEW session inherits is left
pointing at the borrowed browser. A lane that borrows the other profile must
call `chrome-pin.sh restore` when it is done.
"""
import json, os, sys, tempfile


def load(p):
    with open(p) as f:
        return json.load(f)


def save(p, d):
    # Same-directory temp + rename: ~/.claude.json is live state for every
    # running session and a partial write corrupts all of them.
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(p) or ".")
    with os.fdopen(fd, "w") as f:
        json.dump(d, f, indent=2)
    os.replace(tmp, p)


def dev_of(m, prof):
    return (m["profiles"].get(prof) or {}).get("deviceId")


def prof_of_dev(m, dev):
    for p, v in m["profiles"].items():
        if v.get("deviceId") == dev:
            return p
    return "(unrecognised)"


def pin(cfg):
    try:
        return load(cfg).get("chromeExtension", {}).get("pairedDeviceId") or ""
    except Exception:
        return ""


RESOLVE = """BOTH deviceIds ARE RESOLVED — measured 2026-09-14, not inferred.

Each was established by selecting it and reading the signed-in address at
https://myaccount.google.com/ . Neither was taken by elimination.

    personal   da3bf06e-c998-4850-84c5-ad64aac738e5  "Browser 1"
               Chrome "Default"    nathaniel.cannon@gmail.com
               carries BOTH the Snorkel session and the BYU library session

    micro1     b72a12c5-0ccf-4471-aa10-ef23552ffba1  "Browser 2"
               Chrome "Profile 1"  naca028@expert.micro1.ai

There is NO third deviceId. The BYU library window is a third WINDOW of the
personal profile, and cookies are profile-wide, so any tab of Browser 1 already
carries the library entitlement. 'library' is a URL, not a browser to select.

To re-measure after a Chrome reinstall or a new profile:
  select_browser <id> -> navigate https://myaccount.google.com/ -> read address
  -> chrome-pin.sh set-profile <personal|micro1> <id> -> chrome-pin.sh restore"""


def main():
    mp, cfg, verb = sys.argv[1], sys.argv[2], sys.argv[3]
    a = sys.argv[4:]
    m = load(mp)

    if verb == "roles":
        for p, v in m["profiles"].items():
            print(f"  {p:9s} {v.get('deviceId') or 'UNRESOLVED':40s} {v['chrome_profile']:10s} {v['account']}")
        print("  destinations (same profile, just a URL):")
        for d, v in m["destinations"].items():
            print(f"    {d:9s} profile={v['profile']:9s} {v.get('url') or ''}")
        return 0

    if verb == "list":
        for k, v in m["lanes"].items():
            d = dev_of(m, v["profile"]) or "UNRESOLVED"
            mu = ",".join(v.get("may_use", [])) or "-"
            nw = "new-window" if v.get("new_window") else "reuse"
            print(f"  {k:9s} profile={v['profile']:9s} may_use={mu:16s} {nw:10s} {d}")
        return 0

    if verb == "resolve":
        print(RESOLVE)
        return 0

    if verb == "restore":
        target = m.get("global_pin_profile") or "personal"
        dev = dev_of(m, target)
        if not dev:
            print(f"profile {target!r} is UNRESOLVED — run: chrome-pin.sh resolve", file=sys.stderr)
            return 2
        cur = pin(cfg)
        if cur == dev:
            print(f"global pin already {target} ({dev}); nothing to do")
            return 0
        d = load(cfg)
        ce = d.setdefault("chromeExtension", {})
        ce["pairedDeviceId"] = dev
        ce["pairedDeviceName"] = target
        save(cfg, d)
        print(f"global pin RESTORED {cur or '(none)'} -> {dev} ({target})")
        return 0

    if verb == "set-profile":
        prof, dev = (a + ["", ""])[:2]
        if prof not in m["profiles"]:
            print(f"unknown profile {prof!r}; known: {list(m['profiles'])}", file=sys.stderr)
            return 2
        if not dev:
            print("usage: chrome-pin.sh set-profile <personal|micro1> <deviceId>", file=sys.stderr)
            return 2
        before = m["profiles"][prof].get("deviceId")
        m["profiles"][prof]["deviceId"] = dev
        m["profiles"][prof]["evidence"] = "VERIFIED: account read from the live session"
        save(mp, m)
        print(f"profile {prof}: {before} -> {dev}")
        other = [p for p in m["profiles"] if p != prof]
        if other and not dev_of(m, other[0]):
            print(f"note: {other[0]} is still UNRESOLVED. With two connected browsers it is the "
                  f"other deviceId by elimination, but record it explicitly rather than assuming.")
        return 0

    if verb == "set-default":
        target = (a + [""])[0]
        dev = dev_of(m, target) or target
        if target in m["profiles"] and not dev_of(m, target):
            print(f"profile {target!r} is UNRESOLVED — run: chrome-pin.sh resolve", file=sys.stderr)
            return 2
        if not dev:
            print("usage: chrome-pin.sh set-default <profile|deviceId>", file=sys.stderr)
            return 2
        d = load(cfg)
        ce = d.setdefault("chromeExtension", {})
        before = ce.get("pairedDeviceId")
        ce["pairedDeviceId"] = dev
        ce["pairedDeviceName"] = prof_of_dev(m, dev)
        save(cfg, d)
        print(f"global pin {before} -> {dev} ({prof_of_dev(m, dev)})")
        print("New SESSIONS inherit this. Running sessions keep their in-memory selection.")
        return 0

    lane = a[0] if a else ""
    want = a[1] if len(a) > 1 and a[1] else None
    l = m["lanes"].get(lane)

    if verb == "id":
        if not l:
            print("")
            return 0
        prof = l["profile"]
        if want:
            dest = m["destinations"].get(want)
            if not dest or want not in l.get("may_use", []) and want not in m["destinations"]:
                print("")
                return 0
            prof = dest["profile"]
        print(dev_of(m, prof) or "")
        return 0

    # show
    if not l:
        print(f"lane            : {lane}\nprofile         : (UNMAPPED LANE — add it to {mp})")
        return 0
    prof, dest = l["profile"], None
    if want:
        dest = m["destinations"].get(want)
        if not dest:
            print(f"lane            : {lane}\ndestination     : {want!r} is unknown; known: {list(m['destinations'])}")
            return 0
        if want not in l.get("may_use", []) and want not in m["destinations"].get(want, {}).get("profile", ""):
            pass
        prof = dest["profile"]
    dev, cur = dev_of(m, prof), pin(cfg)
    print(f"lane            : {lane}")
    print(f"profile         : {prof}  ({m['profiles'][prof]['chrome_profile']}, {m['profiles'][prof]['account']})")
    if dest:
        print(f"destination     : {want} -> {dest['url'] or '(no fixed URL)'}")
        print(f"                  {dest['note']}")
        if prof != l["profile"]:
            print(f"                  NOTE: this lane's primary profile is {l['profile']}; switching.")
        if dest.get("verified"):
            print(f"  verified      : {dest['verified']}")
        for k in ("resolver", "ezproxy"):
            v = dest.get(k)
            if isinstance(v, dict):
                print(f"  {k:14s}: {v.get('pattern', '')}")
                if v.get("example"):
                    print(f"                  e.g. {v['example']}")
                if v.get("note"):
                    print(f"                  {v['note']}")
        if dest.get("gotcha"):
            print(f"  GOTCHA        : {dest['gotcha']}")
    print(f"open new window : {'yes' if l.get('new_window') else 'no'}")
    if not dev:
        print("deviceId        : UNRESOLVED")
        print("\nDO NOT GUESS. Run: chrome-pin.sh resolve")
        print("Driving the wrong profile pushes credentialed work into the wrong account.")
        return 0
    print(f"deviceId        : {dev}")
    print(f"global pin      : {cur or '(none)'} ({prof_of_dev(m, cur) if cur else '-'})")
    if dev != cur:
        print(f"\nACTION: select_browser {dev} as this lane's FIRST browser action.")
        print("        Then, when you are done with this browser, run:")
        print("            chrome-pin.sh restore")
        print("        select_browser WRITES THE GLOBAL PIN (measured 2026-09-14).")
        print("        Live routing is per-process and no running lane is disturbed,")
        print("        but the default every NEW session inherits is left pointing at")
        print("        the browser you borrowed. restore puts it back.")
    else:
        print("\nOK: global pin already matches. The MCP auto-connects silently.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

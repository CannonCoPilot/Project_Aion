# Token-compression Phase 1 — Manual post-deploy capture

**Owner**: Sir
**Created**: 2026-04-30
**Deadline**: 2026-05-03 21:00 America/Denver (= 03:00 UTC May 4)
**Why deadline**: A remote agent (`trig_01EtBi9X7q42owtUCWzmSgLH`) fires at that time to compute Δ vs the 2026-04-30 baseline. Without this capture committed first, that agent will only be able to report `PENDING`.

## What this task does

Captures a fresh post-deploy cache-telemetry CSV and a delta report, commits both to the Jarvis repo, and pushes. That gives the remote verification agent something to compare against on May 3.

## Prerequisites

- At least 3 Jarvis sessions completed AFTER the 2026-04-30 deploy (so the post-deploy turns dominate the average). The more, the better. If you've only done 1–2 sessions, defer the capture by a day.
- Working tree of `/Users/nathanielcannon/Claude/Jarvis` must be reasonably clean (or the relevant changes already staged separately).

## Commands (copy-paste)

```bash
# Set today's date suffix for filenames
DATESTAMP=$(date +%Y%m%d)
METRICS=/Users/nathanielcannon/Claude/Jarvis/.claude/metrics/token-compression
SKILL=/Users/nathanielcannon/Claude/Jarvis/.claude/skills/token-compression/scripts

# 1. Re-run the extractor on the full Jarvis session corpus
python3 "$SKILL/cache-telemetry-extractor.py" \
  ~/.claude/projects/-Users-nathanielcannon-Claude-Jarvis/ \
  --out "$METRICS/cache-telemetry-$DATESTAMP.csv"

# 2. Aggregate
bash "$SKILL/cache-telemetry-aggregate.sh" \
  "$METRICS/cache-telemetry-$DATESTAMP.csv" \
  > "$METRICS/cache-telemetry-$DATESTAMP-summary.txt"

# 3. Compute delta vs baseline
python3 - <<PY
from pathlib import Path
import csv

base_csv = Path("$METRICS/cache-telemetry-20260430.csv")
new_csv  = Path("$METRICS/cache-telemetry-$DATESTAMP.csv")

def stats(path):
    cr=e5=e1=ip=op=n=0
    with open(path) as f:
        r = csv.DictReader(f)
        for row in r:
            n += 1
            ip += int(row["input_tokens"])
            cr += int(row["cache_read"])
            e5 += int(row["eph_5m"])
            e1 += int(row["eph_1h"])
            op += int(row["output_tokens"])
    denom = ip + cr + e5 + e1
    return {
        "turns": n,
        "global_hit_rate": cr / denom * 100 if denom else 0,
        "eph_1h_pct": (sum(1 for _ in [None]),) and 0,  # placeholder
        "mean_output": op / n if n else 0,
        "total_output": op,
        "total_cache_read": cr,
        "total_eph_1h": e1,
    }

# Recompute eph_1h adoption properly (turn-level)
def eph1h_adopt(path):
    n = h = 0
    with open(path) as f:
        r = csv.DictReader(f)
        for row in r:
            n += 1
            if int(row["eph_1h"]) > 0:
                h += 1
    return h / n * 100 if n else 0

s_base = stats(base_csv)
s_new  = stats(new_csv)
s_base["eph_1h_pct"] = eph1h_adopt(base_csv)
s_new["eph_1h_pct"]  = eph1h_adopt(new_csv)

print(f"Baseline (2026-04-30): {s_base['turns']} turns, hit={s_base['global_hit_rate']:.1f}%, eph_1h_adopt={s_base['eph_1h_pct']:.1f}%, mean_out={s_base['mean_output']:.0f}")
print(f"Post-deploy ($DATESTAMP): {s_new['turns']} turns, hit={s_new['global_hit_rate']:.1f}%, eph_1h_adopt={s_new['eph_1h_pct']:.1f}%, mean_out={s_new['mean_output']:.0f}")
print(f"\nΔ hit rate: {s_new['global_hit_rate']-s_base['global_hit_rate']:+.1f}pp (band: ±5pp)")
print(f"Δ eph_1h adopt: {s_new['eph_1h_pct']-s_base['eph_1h_pct']:+.1f}pp (floor: 30%)")
print(f"Δ mean_output: {(s_new['mean_output']/s_base['mean_output']-1)*100:+.1f}% (target: -20% to -34%)")
PY \
  | tee "$METRICS/delta-report-$DATESTAMP.md"

# 4. Commit + push
cd /Users/nathanielcannon/Claude/Jarvis
git add ".claude/metrics/token-compression/cache-telemetry-$DATESTAMP.csv" \
        ".claude/metrics/token-compression/cache-telemetry-$DATESTAMP-summary.txt" \
        ".claude/metrics/token-compression/delta-report-$DATESTAMP.md"
git commit -m "metrics(token-compression): post-deploy capture $DATESTAMP — Phase 1 verification"
PAT=$(yq -r '.github.aifred_token' .claude/secrets/credentials.yaml | head -1 | tr -d '[:space:]')
git -c "credential.helper=!f() { echo username=CannonCoPilot; echo password=$PAT; }; f" \
    push origin Project_Aion:main
```

## Pass criteria (per implementation guide §2.4 / §3.3)

| Metric | Baseline | Acceptable band | Status |
|---|---|---|---|
| Global hit rate | 93.6% | 88.6% – 98.6% (±5pp) | TBD |
| eph_1h adoption | 84.6% | ≥30% | TBD |
| Mean output_tokens | TBD (re-baseline) | -20% to -34% | TBD |

## What if hit rate dropped >5pp?

Don't push. Investigate. Likely cause: the Jeeves-Brief insert pushed CLAUDE.md content that previously fit in the cached prefix to past the cache-key boundary. Roll back commit `75c9d97` and consider moving the directive lower in CLAUDE.md (per implementation guide §2.4 fail-mode notes).

## After commit + push

The remote agent (`trig_01EtBi9X7q42owtUCWzmSgLH`) at fire time will pick up the new files automatically. Manual notification not required.

## Cancel reminder

If you want to silence the LaunchAgent before it fires:

```bash
launchctl bootout gui/$(id -u)/com.aion.token-compression-reminder
rm ~/Library/LaunchAgents/com.aion.token-compression-reminder.plist
```

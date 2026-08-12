# Genie — Session State

**Lane:** `genie` (`aion:12`) · **cwd:** `/Users/nathanielcannon/Claude/Projects/WVU`
**Purpose:** Compact status snapshot for this lane only. Updated at task start, blocker, and
end of session. This is Genie's file — W0's `session-state.md` is a different lane's memory
and is not read or written from here.

---

## ACTIVE (2026-08-11) — Genie established; Phase 2 is the work

Plan: `/Users/nathanielcannon/Claude/Project_Aion/.claude/plans/eager-plotting-umbrella.md`

**Phase 1 COMPLETE** (installed by W5:Jarvis-dev). Verified live, not assumed:
- Window `aion:12`, deterministic session `468a0010-55cd-5c85-b152-fdb34d7c607b`, resumes.
- JICM lane key `genie`, `actuation_mode: pane`, registry `tmux_target: aion:12`,
  HUD row `live / OCC=ok`. Supervised by `jicm-supervisor.sh` (NOT the legacy
  `jicm-watcher.sh`, which is a W0-only singleton by design).
- Memory namespace live and empty: `genie-{context,research,sessions,codebase}` in Qdrant
  (2560/Cosine), `genie-core` in Graphiti. Jarvis's collections untouched.
- Pulse label `agent:genie` round-trips. Nexus persona at
  `alfred/.claude/jobs/personas/genie/`.

**Not yet exercised:** a full JICM compress→clear→resume cycle on this lane. Deferred
because the User was working in the window at install time. Run it at a natural break.

**Install gotcha worth remembering:** Genie's cwd is outside the monorepo, so Claude Code
does not discover Project_Aion's `.claude/settings.json`. Genie's hooks are registered in
`Projects/WVU/.claude/settings.json` with ABSOLUTE paths, and `JICM_PROJECT_DIR` redirects
all JICM state back to the monorepo. Without both, Genie runs with zero hooks — silently.

## Repo + Driveline — DONE (2026-08-11), one human step remaining

- Repo `github.com/CannonCoPilot/WVU-GENESIS` (**private**), branch `main`,
  first commit `e12db39`. Source docs moved to `refs/` and `refs/papers/`.
- Driveline built from scratch at `src/driveline/`, CLI `scripts/driveline`:
  `auth | status | register | push | hydrate | verify | scan`. Zero third-party
  dependencies — runs on system `python3`, no venv. 11 tests pass.
- Three states: present / absent / **drifted**. Drift is never auto-resolved.
  `hydrate` always verifies SHA-256 of what it fetched.
- `status` exits 2 on drift or untracked files (CI gate). `--fast` compares sizes
  only and *says so* rather than reporting clean.
- `rclone` v1.75.0 installed. Remote `wvu` **CONFIGURED** (user OAuth, 2026-08-11).
  Token at `~/.config/rclone/rclone.conf` (0600), gitignored. **No longer blocked.**

## Drive inventory — first scan (2026-08-11)

**54,446 files · 82.2 GB.** Two orders of magnitude more than the three docs on local disk.

| Files | Size | Top-level |
|---|---|---|
| 25,936 | 69.5 GB | `IMAGINE.AI.Embersdata` |
| 26 | 8.9 GB | `Jen_data from NFixDB` |
| 24,372 | 1.2 GB | `Jen_data master phenotype matrix` |
| 3,503 | 1.0 GB | `Jen_data from literature` |
| 276 | 854 MB | `Jen_culture collection_genomes_from_16S` |
| 154 | 318 MB | `Proposal Documents` |
| 10 | 163 MB | `Jen_data from ProTraits` |
| 89 | 67.5 MB | `Jen_260805_github_upload` |
| 17 | 59.2 MB | `Refs` (17 papers — supersedes the 1 on disk) |

By type: 12,108 `.fna` (51.8 GB) + 12,039 `.faa` (18.2 GB) = 85% of the Drive is genomes
and proteomes. 28,527 `.json` (1.9 GB) is almost certainly the BacDive/phenotype pull.

**7 files exceed GitHub's 100 MB limit** — largest `Jen_data from NFixDB/nfixdb_raw/
genomes.zip` at 7.1 GB. Concrete proof the Drive-is-system-of-record rule is load-bearing,
not a convention.

**"Jen"** appears across 6 top-level dirs and is not yet identified — presumably a
Morrissey-group member who did the data assembly. Ask before citing provenance.

## Next

1. **Corpus review** — read every document and dataset the Drive holds; inventory what is
   analysis-ready, what is missing, what is at risk. → `reports/corpus-review-<date>.md`
2. **Opening moves** — sequenced project plan for the User as AI Engineer / bioinformatics
   consultant, filed into Pulse as tracked tasks, plus a group-facing brief.

## Known state of the work

- The grant narrative (`refs/DOE Genesis Key info and emerging draft.docx`) is a live draft
  with `XXX` placeholders — each one a citable research task, never to be filled with a
  plausible-looking number. Not yet read.
- `data/MANIFEST.json` exists and is empty. Correct state: nothing inventoried yet.
- Naming is unsettled: the draft lists IMAGINE alongside Micro-REPP, MEGAPRO, IMPROVE and
  others. IMAGINE is current, not decided.
- **Doc bug:** Genie's persona `CLAUDE.md` lists `.claude/skills/gdrive-ops/SKILL.md` as an
  on-demand reference. That skill does not exist — the whole `skills/` tree has no
  `gdrive-ops`. Driveline was written from scratch; the persona line needs correcting or
  repointing at `src/driveline/`.

## Open questions for the User

- Whether large data should instead be versioned in GitHub via Git LFS. Current build
  assumes **no** — Drive is the system of record and LFS quota would bind fast on
  metagenome-scale data — but this was decided by default, not by the User.
- Whether the grant narrative `.docx` belongs in git at all. It is committed (200 KB, safe
  on size) but binary, so diffs are opaque and concurrent edits with the Morrissey group
  will conflict badly. A text mirror may be worth maintaining.

---

*Genie lane established 2026-08-11.*

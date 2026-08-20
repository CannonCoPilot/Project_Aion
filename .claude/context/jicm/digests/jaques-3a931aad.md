# FORENSIC RECORD

## Session Progression

### Phase 2 - Repo Reorganization
The repository was reorganized into a three-project structure using `git mv` for all file renames. This included:
- Creating `projects/ec-beech/`, `projects/ecs-otter/`, and `projects/ec-starfish/` directories
- Moving Beech-specific files into `projects/ec-beech/` including documentation, source materials, tasks, and metadata
- Refactoring `package_task.sh` to accept project and task ID arguments, making it generic across projects
- Moving `package_resubmission.sh` to `projects/ec-beech/scripts/` as it was Beech-specific
- Fixing path references in scripts and documentation
- Verifying that the reorganization preserved file integrity and functionality

The reorganization was verified through multiple checks:
- Gate 1: 21/21 tests passed with reward=1
- Gate 2: 6/6 naive baselines failed
- Archive checksum: `ad7898fd...` remained byte-identical after reorganization
- Data build determinism was confirmed

### Your Zip Request
- Only Otter had zips; Beech and Starfish had none
- Pulled all four Otter objects and unpacked both zips
- The bulk content (336 MB zip and 323 MB `task_inputs/`) was gitignored
- Staged total was 19.1 MB
- Otter was found to be a real ML project with a different structure from Beech

### Credentials Management
- Stored Otter and Starfish credentials in `.claude/secrets/credentials.yaml`
- Both keys were 28 characters with correct base URLs
- The file was multi-document YAML, so retrieval required using `yq eval-all`

### Browser Access Verification
- Confirmed access to all three project dashboards at:
  - https://expertdocs.snorkel-ai.com/cdg_starfish_pilot_utyav_coding
  - https://expertdocs.snorkel-ai.com/otter-guidelines
  - https://experts.snorkel-ai.com/home
- Verified the presence of three project dashboard tiles: CDG_Starfish_Pilot_uTYAV_Coding, CDG_Otter_Prod, and STEM_Beech_Samples-tB2AU
- Confirmed Beech task status: UUID 98a49052-afbe-40b0-9e51-f727cf3c236f created on 7/27, first submission on 7/30 at 8:17 PM MDT

### GitBook Mirroring
- Mirrored 43 pages from GitBook spaces
- Pages were available as Markdown files but required browser session for access
- Pages included `llms.txt` and a Markdown variant of every page
- All unauthenticated requests failed, confirming browser session was required

### Slack Integration
- Confirmed full read access through Chrome without credentials
- Discovered a critical project policy in Otter prohibiting LLM use
- Beech deadline was confirmed as today (8/12) with pay rates doubled
- Found that the Beech resubmission had been updated automatically
- Built a Slack channel watcher named "Trawl" to monitor channels and download files

## Critical Findings

### Otter LLM Restriction
- Tyler clarified that the LLM restriction in Otter applied only to submitted work
- Collaboration on tasks at any stage was permitted
- The restriction was documented in memory files, repo law, and the Otter README
- The restriction was mechanical, not just contractual, as Workflow B attempts populated `human_scores.json`

### Beech Resubmission
- The resubmission was confirmed to have been updated automatically
- The submitted files were updated without user action
- The resubmission was confirmed to be "nearly clear" with zero blockers
- The resubmission was closed as per user instruction

### Slack Watcher
- Built a Slack channel watcher named "Trawl"
- The watcher could handle file downloads and link-following
- The watcher was tested end-to-end and found to work
- The watcher was designed to avoid violating Slack's ToS

## Completed Work

### Otter Work
- Completed the Otter work that was truncated earlier
- Downloaded the `Beech_common submission issues.pdf` and mirrored both GitBook spaces
- Built the Slack channel watcher with file download and link-following capabilities
- Documented the Otter LLM restriction in multiple layers

### Starfish Task
- Downloaded the `Sample Starfish Task.zip` file
- Verified that the Starfish task was structurally closer to Beech than Otter
- Found that the Starfish task had a deterministic outcome type and "frontier" difficulty level

### Otter Skeleton Diff
- Found a discrepancy between the Drive skeleton and the shipped example task
- The differences were lint-only but could trip static checks
- The Drive skeleton was confirmed to be the newer version

### rclone Research
- Recommended minting a new Google Cloud OAuth client
- Deferred the migration until after Google's notice was given
- Documented the risks of the current shared-client_id retirement

## Remaining Work

### Driveline Extraction
- Left Driveline untouched as instructed
- The Driveline extraction crossed into Genie's territory
- The Driveline extraction was not in scope for the current work

### rclone Migration
- Deferred the rclone migration until after Google's notice was given
- The migration was not in scope for the current work

## Final State

- All three projects verified clean with 0 missing objects
- Verification was by sha256, not path
- The local tree was confirmed to match Drive by content
- The plan was complete except for Driveline and the deferred rclone migration
- Nothing was pushed to the remote repository
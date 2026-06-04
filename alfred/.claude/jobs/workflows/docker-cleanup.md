# Safe Docker image/volume/cache cleanup with human review for risky removals

Perform a safe Docker cleanup on this system. Follow these phases exactly.

## Phase 1 — Assessment

Run these commands to understand current state:
```
docker system df
docker image ls --format '{{.Repository}}\t{{.Tag}}\t{{.Size}}\t{{.CreatedSince}}\t{{.ID}}'
docker ps -a --format '{{.Image}}\t{{.Names}}\t{{.Status}}' | sort
```

## Phase 2 — Safe Auto-Cleanup (always safe, no confirmation needed)

Execute these cleanup commands:

1. **Dangling images** (untagged, unreferenced):
   ```
   docker image prune -f
   ```
2. **Build cache**:
   ```
   docker builder prune -f
   ```
3. **Exited containers** older than 7 days:
   ```
   docker container prune -f --filter "until=168h"
   ```

Record bytes reclaimed from each step.

## Phase 3 — Smart Image Cleanup

Analyze the image list to find:

**A. Superseded images** (same repository, old tag coexisting with newer tag):
For example, if both `grafana/grafana:10.2.3` (old) and `grafana/grafana:latest`
(newer) exist, the old versioned tag is superseded. Remove these automatically:
```
docker rmi <image:tag>
```
Only remove the OLD version, never the newer one. If removal fails (image in use),
skip it silently and note it in the report.

**B. Unused images** (not referenced by ANY running or stopped container):
Auto-remove these. Images are always re-pullable — there is no data risk.
```
docker rmi <image:tag>
```
If removal fails (image in use), skip it silently. Log each removed image
and its size in the report.

## Phase 4 — Volume Assessment (status-aware)

List unused/dangling volumes:
```
docker volume ls -f dangling=true --format '{{.Name}}'
docker system df -v
```

Before removing ANY volume, check the project's `service_status` in
`paths-registry.yaml` (under `coding.projects`). Cross-reference volume
names against project `docker_container`/`docker_containers`/`docker_db` fields.

**Volume cleanup rules by service_status:**

| service_status | Volume action |
|----------------|---------------|
| `active`       | NEVER touch   |
| `paused`       | NEVER touch — data preserved for restart |
| `archived`     | Remove orphan volumes OK, create Pulse task first |
| `dead`         | Auto-remove   |
| *(not in registry)* | Check `docker volume inspect` — if empty (< 1 MB), auto-remove. Otherwise create Pulse task for review |

**Auto-remove** (no task needed):
- Truly empty volumes (< 1 MB, no meaningful data)
- Volumes from `dead` projects

**Create Pulse task** for anything else with significant size (> 100 MB):
```
pulse create "Docker cleanup: review N unused volumes (X GB reclaimable)" \
  -t task -p 3 \
  -l "domain:infrastructure,project:aiprojects,source:headless" \
  -d "Weekly docker-cleanup found dangling volumes.
Volumes:
<list each volume name, size, and matched project status>

WARNING: Volumes may contain persistent data (databases, configs).
Inspect before removing: docker volume inspect <name>
To remove: docker volume rm <name>"
```

## Phase 5 — Dedup Check

Before creating any Pulse tasks, check for existing open tasks:
```
pulse list --status open --label source:headless | grep -i docker
```
If a similar task already exists, skip creating a duplicate.

## Phase 6 — Report

Output your first line as a severity tag:
- If cleanup reclaimed >5 GB total: "SEVERITY: info"
- If cleanup reclaimed <1 GB and >10 GB still reclaimable: "SEVERITY: warning"
- If Docker is unreachable or errors occurred: "SEVERITY: critical"
- Otherwise: "SEVERITY: info"

Then output a concise summary:
```
Docker Cleanup Summary — YYYY-MM-DD
====================================
Auto-cleaned:
  Dangling images: X removed (Y MB)
  Build cache: X MB reclaimed
  Old containers: X removed
  Superseded images: X removed (Y MB) — list which ones

Auto-cleaned (images):
  Unused images: X removed (Y GB) — images are re-pullable, no data risk
Volumes:
  Auto-removed: X empty/dead volumes (Y MB)
  Preserved: X volumes (Y GB) — matched to active/paused projects
  Needs review: X volumes (Y GB) — [Pulse task created / existing task found / under threshold]

Total reclaimed this run: X GB
Total still reclaimable: X GB
```

Keep the output concise. Do NOT list every single image — summarize.

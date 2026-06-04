# AIServer Backup Strategy

**Last Updated**: 2026-02-25
**Status**: ✅ ACTIVE - Automated daily backups configured
**Tool**: Restic
**Destination**: Backup NAS (/mnt/backup_nas/AIServer/restic)

## Overview

AIServer uses **Restic** for automated, encrypted, deduplicated backups to Backup NAS via NFS. Two backup sets run daily: system backup (`aiserver-system` tag) and Obsidian vault backup (`obsidian-vault` tag).

## Architecture

```
┌─────────────┐                    ┌──────────────┐
│  AIServer   │   NFS4             │  Backup NAS  │
│             ├───────────────────>│  <gateway-ip>00│
│  Restic     │   Encrypted data   │  /volume1/   │
│  Client     │   Deduplicated     │  Backup/     │
│             │                    │  AIServer/   │
└─────────────┘                    └──────────────┘
   Daily 2 AM                        22 TB total
   Automated                         11 TB free

┌─────────────┐                    ┌──────────────┐
│  NAS Primary│   NFS4 mount       │  AIServer    │
│  <nas-ip>├──────────────────>│              │
│  Obsidian/  │  /mnt/synology_nas │  Restic backs│
│  (all vaults)│                   │  up to Backup│
└─────────────┘                    │  NAS         │
                                   └──────────────┘
```

## Backup Scope

### Included in Backups

**Tag: `aiserver-system`** (system backup):
✅ **Entire filesystem** (`/`) — full system recovery capability
✅ **User data** (`$HOME`) — AIProjects, Docker configs, scripts, SSH keys
✅ **System configurations** (`/etc`) — network, services, systemd units

**Tag: `obsidian-vault`** (added 2026-02-25):
✅ **Obsidian vault** (`/mnt/synology_nas/Obsidian`) — all vaults (Master, Development, Jeremiah, S25)
✅ Includes plugins, themes, settings, attachments — full vault restore capability
✅ Gracefully skips if NAS Primary is unreachable

### Excluded from System Backup

❌ **System ephemeral** - `/proc`, `/sys`, `/dev`, `/run`, `/tmp`
❌ **Docker internals** - overlay2 filesystems (container layers)
❌ **Cache directories** - `~/.cache`, `/var/cache`
❌ **Mount points** - `/mnt`, `/media` (except Obsidian via separate backup call)
❌ **Large logs** - `/var/log/journal`

**Rationale**: These are either regenerated at boot, redundant with Docker configs, or use excessive space without recovery value.

## Backup Schedule & Retention

### Schedule

**Primary backup**: Daily at 2:00 AM MST
- Systemd timer: `restic-backup.timer`
- Randomized delay: ±30 minutes (avoid predictable patterns)
- Persistent: Runs on next boot if system was off

**Weekly integrity check**: Sunday (during backup)
- Verifies 5% of data blocks
- Detects corruption early

### Retention Policy

| Period | Retention |
|--------|-----------|
| Daily | 30 days |
| Weekly | 8 weeks |
| Monthly | 12 months |
| Yearly | 5 years |

**Example**: A snapshot from January 15, 2025 will be kept as:
- Daily for 30 days (until Feb 14, 2025)
- Weekly for 8 weeks (if it's the last snapshot of that week)
- Monthly for 12 months (if it's the last snapshot of January)
- Yearly for 5 years (if it's the last snapshot of 2025)

## Technical Details

### Repository Configuration

- **Repository ID**: a5a4ae8caa
- **Version**: 2
- **Compression**: Auto (enabled)
- **Encryption**: AES-256-CTR with Poly1305-AES authentication
- **Deduplication**: Content-defined chunking (CDC)

### Storage Efficiency

**Deduplication**: Only unique data chunks are stored
- Changed files: Only modified chunks backed up
- Duplicate files: Stored once, referenced multiple times
- Incremental: 95%+ storage savings after first backup

**Compression**: Automatic per-file
- Text files: 60-80% reduction
- Binaries: 20-40% reduction
- Already compressed (images, videos): Minimal overhead

**Example from test backup**:
- Raw data: 3.468 MiB
- Stored: 1.951 MiB
- Savings: 44% (typical for first backup)

### Network Transport

- **Protocol**: SFTP (SSH File Transfer Protocol)
- **Encryption**: SSH (Ed25519 key-based authentication)
- **Compression**: SSH compression enabled
- **Bandwidth**: Adapts to network conditions
- **Resilience**: Automatic retry on transient failures

## Scripts & Tools

### Main Backup Script

**Location**: `$HOME/Scripts/restic-backup.sh`

**Features**:
- Automatic exclusion of system/temporary files
- Logging to `~/.restic/backup.log`
- Retention policy enforcement
- Weekly integrity checks
- Backup verification

**Usage**:
```bash
$HOME/Scripts/restic-backup.sh
```

### Status & Monitoring

**Location**: `$HOME/Scripts/restic-status.sh`

**Commands**:
```bash
# Health check (default)
./restic-status.sh health

# Check connectivity only
./restic-status.sh check

# View recent snapshots
./restic-status.sh snapshots

# Repository statistics
./restic-status.sh stats
```

### Restore Helper

**Location**: `$HOME/Scripts/restic-restore.sh`

**Commands**:
```bash
# List all snapshots
./restic-restore.sh list

# Browse snapshot contents
./restic-restore.sh browse latest $HOME

# Restore specific path
./restic-restore.sh restore latest /tmp/restore $HOME/Docker

# Mount repository for browsing
./restic-restore.sh mount

# Show examples
./restic-restore.sh examples
```

## Daily Operations

### Monitoring

**Check backup health**:
```bash
$HOME/Scripts/restic-status.sh health
```

**Expected output**:
- ✓ Repository accessible
- ✓ Last backup < 30 hours old
- ✓ Timer is active
- Recent logs show no errors

### View Backup Logs

```bash
# Recent backup activity
tail -50 ~/.restic/backup.log

# Systemd service logs
journalctl -u restic-backup.service -n 50

# Real-time monitoring
journalctl -u restic-backup.service -f
```

### Manual Backup

```bash
# Run backup immediately
$HOME/Scripts/restic-backup.sh
```

## Security

### Encryption

**Repository encryption**: AES-256-CTR
- All data encrypted at rest
- Encryption key derived from password via scrypt
- **Password required for ALL operations** (backup, restore, list)

**Password storage**: `~/.restic/aiserver-backup-password.txt`
- Permissions: 600 (owner read/write only)
- ⚠️ **CRITICAL**: Backup this password securely offline
- **Without password, backups are UNRECOVERABLE**

### Network Security

**SSH key authentication**:
- Ed25519 key pair
- Private key: `~/.ssh/mediaserver_key` (600 permissions)
- No password authentication to MediaServer

**SFTP transport**:
- All data encrypted in transit
- Man-in-the-middle protection via SSH host key verification

### Access Control

**Who can access backups**:
- AIServer with correct SSH key AND Restic password
- Anyone with both credentials can decrypt backups

**MediaServer security**:
- SSH restricted to AIServer IP and local subnet
- OpenSSH Server firewall rules in place
- See: `.claude/context/systems/mediaserver-ssh-setup.md`

## Disaster Recovery

**Full documentation**: `.claude/context/systems/backup-disaster-recovery.md`

**Quick restore for common scenarios**:

1. **Accidental file deletion** (5 min):
   ```bash
   restic find "filename"
   restic restore latest --target /tmp/restore --include /path/to/file
   ```

2. **Docker config corrupted** (15 min):
   ```bash
   $HOME/Scripts/restic-restore.sh restore latest /tmp/restore $HOME/Docker
   ```

3. **Full system failure** (2-4 hours):
   - Install Ubuntu on new hardware
   - Install Restic, restore SSH keys & password
   - Restore from latest snapshot
   - See full playbook in disaster recovery doc

## Limitations & Considerations

### Current Limitations

**Single backup destination**:
- Only to MediaServer (on-premises)
- If MediaServer fails, no backups exist
- **Mitigation**: Consider future offsite backup (cloud, remote VPS)

**Network dependency**:
- Requires local network operational
- MediaServer must be powered on and accessible
- **Mitigation**: Persistent timer runs on next boot if missed

**Docker volumes**:
- Container data layers excluded (in overlay2)
- Docker configs backed up, but not running container state
- **Mitigation**: Individual Docker services have their own backup scripts
- **postgres-unified**: Data dir is a bind mount at `~/Docker/mydocker/n8n/data/postgres-unified/` (included in Restic backup). Also backed up via daily pg_dump cron (see below).

### PostgreSQL Backup (Dedicated)

**Script**: `$HOME/Docker/mydocker/n8n/backups/backup-postgres.sh`
**Schedule**: Daily at 2 AM via cron
**Databases**: n8n, pgvector_db, scripture_graph, voice_jobs (all on `postgres-unified`)
**Local retention**: 30 days at `~/Docker/mydocker/n8n/backups/postgres/`
**NAS retention**: 90 days at `/mnt/synology_nas/main/backups/n8n/postgres/`

### Not Backed Up Separately

**Docker volumes**: Some services have dedicated backup scripts
- See individual service docs in `.claude/context/systems/docker/`
- Examples: Caddy, MISP

**Git repositories**: Already in remote repositories (GitHub)
- AIProjects: Pushed to GitHub regularly
- Local changes backed up as part of `$HOME`

## Future Enhancements

**Possible improvements** (not currently implemented):

1. **Offsite backup**:
   - Periodic sync to Backblaze B2 or AWS S3
   - Or secondary Restic repository to cloud

2. **Pre/post-backup hooks**:
   - Stop services before backup
   - Dump databases to files
   - Application-consistent snapshots

3. **Monitoring integration**:
   - Send alerts to n8n workflow
   - Push metrics to Prometheus
   - Grafana dashboard for backup status

4. **Automated restore testing**:
   - Monthly automated restore verification
   - Restore to temporary VM/container
   - Validate critical files integrity

## Troubleshooting

### Common Issues

**Backup failed - cannot connect to repository**:
```bash
# Check SSH connectivity
ssh mediaserver hostname

# Verify repository path
ssh mediaserver 'dir D:\Restic\AIServer-Backups'

# Test Restic connectivity
restic snapshots
```

**Out of space on MediaServer**:
```bash
# Check current usage
ssh mediaserver 'powershell -Command "Get-PSDrive D | Select-Object Used,Free"'

# Manually prune old snapshots
restic forget --keep-daily 15 --keep-weekly 4 --prune
```

**Backup running slowly**:
- Normal for first backup (all data uploaded)
- Incremental backups much faster
- Network congestion can slow SFTP transfers
- Check with: `restic backup --verbose=2`

**Full troubleshooting**: See disaster recovery playbook

## Quick Reference

### Essential Commands

```bash
# Environment (set in all scripts)
export RESTIC_REPOSITORY="/mnt/backup_nas/AIServer/restic"
export RESTIC_PASSWORD_FILE="$HOME/.restic/aiserver-backup-password.txt"

# Health check
$HOME/Scripts/restic-status.sh health

# List snapshots
restic snapshots

# View latest snapshot
restic ls latest

# Find file in backups
restic find "filename"

# Quick restore
restic restore latest --target /tmp/restore --include /path

# Check repository integrity
restic check

# View statistics
restic stats
```

### Systemd Management

```bash
# Timer status
systemctl status restic-backup.timer

# Service status (after backup runs)
systemctl status restic-backup.service

# View logs
journalctl -u restic-backup.service -n 100

# Manually trigger backup
sudo systemctl start restic-backup.service

# Disable automated backups
sudo systemctl stop restic-backup.timer
sudo systemctl disable restic-backup.timer

# Re-enable
sudo systemctl enable restic-backup.timer
sudo systemctl start restic-backup.timer
```

## Related Documentation

- **Disaster Recovery Playbook**: `.claude/context/systems/backup-disaster-recovery.md`
- **MediaServer SSH Setup**: `.claude/context/systems/mediaserver-ssh-setup.md`
- **MediaServer Operations**: `.claude/context/systems/mediaserver-operations.md`
- **Restic Official Docs**: https://restic.readthedocs.io/

---

**Last backup test**: 2026-02-25 (Obsidian vault backup added)
**Next full backup**: 2026-02-26 ~02:00 MST (automated)

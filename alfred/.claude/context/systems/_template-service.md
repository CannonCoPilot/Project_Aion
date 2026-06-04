# [Service Name]

**Template for documenting infrastructure services**

## Overview
Brief description of what this service does and why it exists in your infrastructure.

## Location & Access

### Container/Service Info
- **Container name**:
- **Image**:
- **Compose file**: (symlink in external-sources or absolute path)
- **Data volumes**:
- **Network**:
- **Ports**:

### Access Points
- **Web UI**: http://
- **API**: http://
- **SSH/CLI**:

## Configuration

### Environment Variables
```bash
KEY=value
ANOTHER_KEY=value
```

### Important Config Files
- Main config: (path or symlink)
- Other configs:

### Volumes/Data Paths
- Config:
- Data:
- Logs:

## Common Tasks

### Start/Stop/Restart
```bash
docker-compose up -d
docker-compose restart
docker-compose down
```

### View Logs
```bash
docker logs -f container-name
# or
tail -f /path/to/logs
```

### Backup
```bash
# Commands for backing up data/config
```

### Update
```bash
# Commands for updating service
```

## Integrations

### Connects To
- Service 1: (how and why)
- Service 2: (how and why)

### Provides To
- What other services consume from this one

### API Endpoints (if applicable)
- `GET /api/endpoint` - Description
- `POST /api/endpoint` - Description

## Troubleshooting

### Common Issues
1. **Issue description**
   - Cause:
   - Solution:

### Health Check
```bash
# Command to verify service is healthy
```

### Reset/Rebuild
```bash
# Nuclear option commands (document carefully!)
```

## Notes & Learnings

- Important things discovered while working with this service
- Quirks or gotchas to remember
- Links to documentation

## Related Context Files
- [Other service](./other-service.md)
- [Integration project](../projects/integration-project.md)

---
**Last Updated**: YYYY-MM-DD
**Status**: Active | Testing | Planned | Deprecated

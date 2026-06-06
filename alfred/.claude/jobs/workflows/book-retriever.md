# Book Retrieval via Anna's Archive

Process book and article retrieval requests. Search Anna's Archive using
MCP tools, select best match by edition/format/quality, download via
member API, and close the originating Pulse task with results.

Requires `annas-archive` MCP server with ANNAS_SECRET_KEY configured.

## Parameters

- `task_ids`: Comma-separated Pulse task IDs to process (optional — if empty, query for open tasks with `action:retrieve` label)
- `format`: Preferred file format — epub, pdf, mobi (default: epub)
- `max_downloads`: Maximum downloads this run (default: 5, max: 10)

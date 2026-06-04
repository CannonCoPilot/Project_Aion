# PuppyPals Affiliate Link Validator

Validate all Amazon affiliate links across puppypalsutah.com weekly.

## Instructions

1. Source credentials: `source .credentials/bluehost-ftp.env`
2. Read the link registry: `.claude/data/affiliate-link-registry.yaml`
3. For each link with status `active` or `needs_tag`:
   a. Check if the Amazon product page returns HTTP 200 (not 404 or redirect to search)
   b. Verify the product is still available (not "Currently unavailable")
   c. Verify the affiliate tag is present
4. Update `last_validated` date for passing links
5. For failures:
   - Set status to `broken` or `discontinued`
   - Create a Pulse task to fix the link, tagged with `domain:content` and `project:puppypals`
6. For `needs_tag` links:
   - Create a Pulse task to update the post with the proper affiliate tag
7. Save a validation report to `.claude/agent-output/results/puppypals/`

## Validation Check

```bash
# Check if an ASIN is still valid
check_asin() {
  local asin="$1"
  local http_code
  http_code=$(curl -s -o /dev/null -w "%{http_code}" -L \
    "https://www.amazon.com/dp/${asin}" \
    -H "User-Agent: Mozilla/5.0" \
    --max-time 10)
  echo "$http_code"
}
```

- HTTP 200 = product exists
- HTTP 404 or 301 to search = product removed/changed
- Timeout = retry once, then flag

## Report Format

```json
{
  "timestamp": "ISO-8601",
  "total_links": 4,
  "checked": 4,
  "passed": 3,
  "failed": 1,
  "needs_tag": 1,
  "details": [
    {"asin": "B000QFT1RC", "status": "ok", "http_code": 200},
    {"asin": "B074357421", "status": "needs_tag", "http_code": 200}
  ],
  "tasks_created": ["AIProjects-xxxx"]
}
```

## Rules

- Max 3 affiliate links per blog post (different product categories)
- All links must use tag `puppypals06-20`
- All links must include `rel="nofollow noopener sponsored"`
- When a product is discontinued, search for a current replacement and create a task to update the post

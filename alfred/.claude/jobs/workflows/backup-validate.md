# Validate backup systems and log ingestion pipelines

Run ~/AIProjects/Scripts/validate-backups-and-logs.sh --json --quiet
Read the JSON output and summarize.

IMPORTANT: Your FIRST output line must be an explicit severity tag based
on the validation score:
  - Score >= 80: output "SEVERITY: info"
  - Score 50-79: output "SEVERITY: warning"
  - Score < 50 or any FAILED checks: output "SEVERITY: critical"

Then provide a brief summary:
  - If all checks passed with no warnings: "All healthy (score/100)"
  - If warnings only: "Score: X/100 — N warnings" followed by a
    one-line summary of each warning
  - If failures: list each failure with check ID and remediation

Keep output concise. Do NOT modify anything.

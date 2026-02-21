# /correct — Capture Corrections

**Purpose**: Log a user correction or self-correction to feed AC-05 reflection cycles.

**Usage**: `/correct [--self] [description]`

---

## Overview

The `/correct` command captures corrections — situations where Jarvis was corrected by the user or caught its own mistake. These entries feed into `/reflect` Phase 1 (data collection) and Pattern matching.

## Options

| Option | Values | Default | Description |
|--------|--------|---------|-------------|
| `--self` | flag | false | Log as self-correction (Jarvis caught own mistake) |

## Workflow

### 1. Determine correction type

If `--self` flag is present → self-correction (Jarvis-initiated)
Otherwise → user correction (user pointed out the issue)

### 2. Gather correction details

Ask the user (or derive from context) for:

**For user corrections** (`.claude/context/psyche/self-knowledge/corrections.md`):
- **Category**: approach, tool-use, communication, architecture, safety
- **Correction**: What the user corrected
- **Lesson**: What Jarvis should do differently

**For self-corrections** (`.claude/context/psyche/self-knowledge/self-corrections.md`):
- **Category**: approach, tool-use, efficiency, architecture, judgment
- **What happened**: The mistake that was made
- **What should have happened**: The correct behavior
- **Lesson**: The takeaway

If the user provided a description with the command, extract these fields from context rather than asking interactively.

### 3. Append to corrections file

**User correction format** — append to `.claude/context/psyche/self-knowledge/corrections.md`:
```
# YYYY-MM-DD | <category> | <correction> | <lesson>
```

**Self-correction format** — append to `.claude/context/psyche/self-knowledge/self-corrections.md`:
```
# YYYY-MM-DD | <category> | <what-happened> | <what-should-have-happened> | <lesson>
```

### 4. Confirm

Report what was logged:
```
Correction logged:
  Type: [user | self]
  Category: <category>
  File: <path>

This will be analyzed in the next /reflect cycle.
```

## Examples

```bash
# User corrects Jarvis
/correct Don't use relative paths in response text

# Self-correction
/correct --self Used grep in bash instead of Grep tool

# Interactive (no description — will prompt for details)
/correct
```

## Integration

- **AC-05**: Corrections are consumed by `/reflect` Phase 1 (data collection)
- **self-correction-capture.js**: The UserPromptSubmit hook also auto-captures corrections from user messages containing correction keywords. This command provides a manual, explicit alternative.

---

*Part of Jarvis Phase 6 Autonomic System (AC-05)*

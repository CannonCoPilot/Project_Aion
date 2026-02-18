# PR-2 Validation: Project Registration Smoke Tests

*Created: 2026-01-05*
*Status: Validation Document*

---

## Overview

This document defines smoke tests to validate that project registration works correctly per the workspace-path-policy (PR-1.E).

---

## Test Cases

### Test 1: Register Existing Local Project

**Scenario**: Register an existing project at a local path.

**Input**:
```
/register-project /Users/nathanielcannon/Claude/SomeExistingProject
```

**Expected Behavior**:
1. ✅ Path validated (exists and is a directory)
2. ✅ Project properties auto-detected (language, type)
3. ✅ Entry added to `paths-registry.yaml` under `development.projects`
4. ✅ Summary created at `Jarvis/projects/someexistingproject.md`

**Validation Commands**:
```bash
# Check registry
grep -A8 "someexistingproject:" paths-registry.yaml

# Check summary exists
ls -la projects/someexistingproject.md
```

---

### Test 2: Register from GitHub URL

**Scenario**: Register a project by cloning from GitHub.

**Input**:
```
/register-project https://github.com/example/sample-repo
```

**Expected Behavior**:
1. ✅ GitHub URL parsed for repo name (`sample-repo`)
2. ✅ Repository cloned to `/Users/nathanielcannon/Claude/sample-repo/`
3. ✅ Project properties auto-detected
4. ✅ Entry added to `paths-registry.yaml`
5. ✅ Summary created at `Jarvis/projects/sample-repo.md`

**Validation Commands**:
```bash
# Check clone location
ls -la /Users/nathanielcannon/Claude/sample-repo/

# Check registry
grep -A8 "sample-repo:" paths-registry.yaml

# Check summary
ls -la projects/sample-repo.md
```

---

### Test 3: Create New Project

**Scenario**: Create a brand new project from scratch.

**Input**:
```
/create-project test-api --type api --language python
```

**Expected Behavior**:
1. ✅ Directory created at `/Users/nathanielcannon/Claude/test-api/`
2. ✅ Git initialized
3. ✅ `.claude/CLAUDE.md` created in project
4. ✅ README.md created
5. ✅ Type-appropriate structure created (src/, tests/ for api)
6. ✅ Entry added to `paths-registry.yaml`
7. ✅ Summary created at `Jarvis/projects/test-api.md`

**Validation Commands**:
```bash
# Check project structure
ls -la /Users/nathanielcannon/Claude/test-api/
ls -la /Users/nathanielcannon/Claude/test-api/.claude/
cat /Users/nathanielcannon/Claude/test-api/.claude/CLAUDE.md

# Check registry
grep -A8 "test-api:" paths-registry.yaml

# Check summary
ls -la projects/test-api.md
```

---

### Test 4: Path Policy Compliance

**Scenario**: Verify all paths comply with workspace-path-policy.

**Checks**:

| Item | Expected Location | Validation |
|------|-------------------|------------|
| Project code | `/Users/nathanielcannon/Claude/<name>/` | `ls -d /Users/nathanielcannon/Claude/<name>` |
| Project summary | `Jarvis/projects/<name>.md` | `ls projects/<name>.md` |
| Registry entry | `paths-registry.yaml` | `grep "<name>:" paths-registry.yaml` |
| Projects root | `/Users/nathanielcannon/Claude` | `grep "projects_root" paths-registry.yaml` |
| Summaries path | `Jarvis/projects` | `grep "summaries_path" paths-registry.yaml` |

---

### Test 5: AIfred Baseline Exclusion

**Scenario**: AIfred baseline should NOT be registered as a normal project.

**Input**:
```
/register-project /Users/nathanielcannon/Claude/AIfred
```

**Expected Behavior**:
- ⚠️ Warning: "AIfred baseline is tracked separately as read-only reference"
- ❌ NOT added to `development.projects`
- ✅ Already tracked in `aifred_baseline` section of paths-registry.yaml

**Validation**:
```bash
# Should NOT appear under development.projects
grep -A2 "projects:" paths-registry.yaml | grep -v "aifred"

# Should appear under aifred_baseline
grep -A5 "aifred_baseline:" paths-registry.yaml
```

---

## Current State Validation

### paths-registry.yaml Structure

```bash
# Verify key sections exist
grep "projects_root:" paths-registry.yaml
grep "summaries_path:" paths-registry.yaml
grep "aifred_baseline:" paths-registry.yaml
grep "jarvis:" paths-registry.yaml
```

**Expected Output**:
```
  projects_root: "/Users/nathanielcannon/Claude"
  summaries_path: "/Users/nathanielcannon/Claude/Jarvis/projects"
aifred_baseline:
jarvis:
```

### Template Existence

```bash
# Verify templates exist
ls -la knowledge/templates/project-summary.md
ls -la knowledge/templates/project-context.md
```

### Command Documentation

```bash
# Verify command docs exist and are updated
ls -la commands/register-project.md
ls -la commands/create-project.md
```

---

## Smoke Test Summary

| Test | Description | Status |
|------|-------------|--------|
| 1 | Register local project | 📋 Ready to test |
| 2 | Register from GitHub | 📋 Ready to test |
| 3 | Create new project | 📋 Ready to test |
| 4 | Path policy compliance | ✅ Verified in config |
| 5 | AIfred baseline exclusion | ✅ Documented |

---

## Notes

- These are **specification tests** — they document expected behavior
- Actual implementation of /register-project and /create-project commands is handled by Jarvis at runtime based on the command documentation
- Full automation of these tests would require PR-13 (Benchmark Demos)

---

*PR-2 Validation — Project Registration Smoke Tests*

# Gospel Synopsis — Pipeline v2 Test Project (v4)

**Purpose**: Lightweight test suite for Pulse-Nexus Pipeline v2 decomposition and execution.
**Scope**: Synoptic comparison of **Mark 1** and **Luke 4** (KJV) — two chapters only.
**Source data**: 2 files in `sources/` (extracted from KJV public domain text)
**Expected pipeline behavior**: Single master task → evaluator decomposes into ordered subtasks → orchestrator chains → executors produce deliverables → reviewer validates

---

## Source Files

| File | Content | Verses |
|------|---------|--------|
| `sources/mark-1.txt` | Mark Chapter 1 (KJV) | 45 verses |
| `sources/luke-4.txt` | Luke Chapter 4 (KJV) | 44 verses |

### Overlapping Content (synoptic parallels)

These chapters share several events from Jesus's early Galilean ministry:
- Healing the man with an unclean spirit (Mark 1:21-28 / Luke 4:31-37)
- Healing Simon's mother-in-law (Mark 1:29-31 / Luke 4:38-39)
- Healing many sick (Mark 1:32-34 / Luke 4:40-41)
- Departing Capernaum to preach elsewhere (Mark 1:35-39 / Luke 4:42-44)

Each chapter also has unique material (Mark: baptism, calling disciples; Luke: temptation, rejection at Nazareth).

---

## Master Task

A **single** master task is posted to the Pulse board. The pipeline should:

1. **Decompose** it into ordered subtasks (evaluator responsibility)
2. **Chain** the subtasks with dependency ordering (orchestrator responsibility)
3. **Execute** each subtask via headless Claude Code agents
4. **Review** each deliverable before closing

### Expected Subtasks (approximate — evaluator may vary)

| Step | Description | Output |
|------|-------------|--------|
| 1 | Identify parallel passages between Mark 1 and Luke 4 | `mark1-luke4-parallels.md` |
| 2 | Create synopsis for each parallel scene | `<scene-slug>-synopsis.md` files |
| 3 | Create synopsis for unique scenes | Additional synopsis files |
| 4 | Merge all synopses into master document | `mark1-luke4-master.md` |
| 5 | Convert master to Word document | `mark1-luke4-synopsis.docx` |
| 6 | Validate all deliverables | `validation-report.md` |

---

## Pipeline Features Tested

| Feature | How Tested |
|---------|------------|
| Task decomposition | Single master → multiple subtasks with ordering |
| Dependency chaining | Each step depends on prior step's output |
| Ordered execution | Steps must run sequentially (evaluator stamps `suggested_order`) |
| Persona assignment | Evaluator assigns from available test personas |
| Depth limit | Subtasks should NOT be further decomposed (depth=1 cap) |
| Deliverable creation | Real file outputs verified by reviewer |
| .docx generation | python-docx installation and document creation |
| Review quality | Verbatim text verification, file existence checks |
| Max-retry cap | Tasks failing review 3x get parked as `blocked:max-retries` |

---

## Personas

| Persona | Role |
|---------|------|
| `test-researcher` | Research/analysis — reads files, produces structured docs |
| `test-writer` | Document creation — copies text verbatim, creates .docx |
| `test-reviewer` | Verification — pass/fail checks, spot-checks content |

All personas in `.claude/jobs/personas/test-*/prompt.md`.

---

## How to Run

```bash
# 1. Clean the board
docker exec aifred-dev-postgres psql -U pulse_dev -d pulse_dev -c "TRUNCATE tasks CASCADE;"

# 2. Import the master task
cd /Users/nathanielcannon/Claude/AIFred-Pro-Dev
python3 .claude/jobs/test-suites/import-suite.py gospel-synopsis.yaml

# 3. Start the pipeline watcher
PULSE_PORT=8800 python3 .claude/jobs/pipeline-watcher.py &

# 4. Monitor
open http://localhost:8701/     # Dashboard
tail -f .claude/logs/headless/service-*.log  # Service logs

# 5. Cleanup after
docker exec aifred-dev-postgres psql -U pulse_dev -d pulse_dev -c "TRUNCATE tasks CASCADE;"
rm -f tests/gospel-synopsis/{mark1-luke4-parallels,*-synopsis,mark1-luke4-master,validation-report}.md
rm -f tests/gospel-synopsis/mark1-luke4-synopsis.docx
```

---

## File Locations

| What | Path |
|------|------|
| Master task YAML | `.claude/jobs/test-suites/gospel-synopsis.yaml` |
| Import script | `.claude/jobs/test-suites/import-suite.py` |
| Source texts (2 files) | `tests/gospel-synopsis/sources/` |
| Pipeline services | `.claude/jobs/services/*.py` |
| Pipeline watcher | `.claude/jobs/pipeline-watcher.py` |
| Test personas | `.claude/jobs/personas/test-{researcher,writer,reviewer}/prompt.md` |
| Executor logs | `.claude/logs/headless/executions/v2-executor-*.log` |
| This document | `tests/gospel-synopsis/PROJECT.md` |

---

## Constraints

- ALL text must be copied **VERBATIM** from the source `.txt` files — no paraphrasing
- Each step depends on the previous step's output
- The parallels reference table is the foundation for all downstream work
- Only 2 source chapters: Mark 1 and Luke 4 (no other Gospel texts)

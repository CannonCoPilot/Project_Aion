# Structured Requirements Pattern

**Created**: 2026-03-10
**Status**: Active
**Related**: `code-before-prompts-pattern.md` (G-T4)

---

## Overview

Prefer structured formats (YAML, JSON) over natural language when capturing requirements, rules, and logic within systems. Structured data produces more predictable outcomes because it eliminates ambiguity in parsing and interpretation.

**This is guidance, not a hard rule.** Use structured formats where they improve predictability; don't force them where prose communicates better.

---

## When to Use Structured Formats

| Context | Format | Why |
|---------|--------|-----|
| Task definitions | YAML/JSON | Fields are unambiguous, machine-parseable |
| Routing rules | YAML | Conditions + actions map cleanly to key-value |
| Persona configs | YAML | Permissions, thresholds, labels are discrete values |
| Validation rules | JSON Schema | Self-documenting, tooling support |
| Feature requirements (complex) | YAML alongside prose | Structured copy as reference for implementation |
| Workflow definitions | YAML | Steps, dependencies, conditions are inherently structured |
| Config and thresholds | YAML/JSON | No room for misinterpretation |

## When Prose Is Better

| Context | Why |
|---------|-----|
| Design rationale | Nuance, trade-offs, "why not" reasoning |
| Creative briefs | Intent and tone don't reduce to fields |
| User-facing docs | Readability matters more than parseability |
| Simple instructions | One-liner prose beats a YAML block |

---

## Application

### Primary: Machine-consumed contexts

Anything that Claude, scripts, or automation will parse and act on should be structured. This includes:

- Persona rules and permissions
- Task metadata and labels
- Routing and dispatch logic
- Validation criteria
- Threshold definitions

### Secondary: Complex logic reference

For complicated requirements that are hard to express unambiguously in prose, maintain a structured representation as a reference copy — even if a prose version also exists for human readability.

```yaml
# Example: approval routing (structured is unambiguous)
approval_rules:
  - condition: priority >= 1
    action: require_human_approval
  - condition: labels contains "destructive"
    action: require_human_approval
  - condition: confidence >= 0.85
    action: auto_approve
  - condition: confidence < 0.85
    action: escalate
```

vs the prose version: "High priority tasks and destructive actions need human approval. Auto-approve if confidence is 85% or higher, otherwise escalate."

Both say the same thing — but the structured version leaves no room for interpretation when a system needs to act on it.

---

## Practical Guidelines

1. **Start structured when building** — easier to add prose commentary than to extract structure from prose later
2. **Use YAML over JSON for human-edited files** — comments, readability, less syntax noise
3. **Use JSON for machine-generated/consumed data** — better tooling, stricter parsing
4. **Don't convert existing prose that works** — apply going forward, not retroactively
5. **Dual format for complex specs** — prose for humans, structured for machines, kept in sync
6. **Add JSON Schema for registries consumed by automation** — schema is the machine-readable contract. When a registry has automated consumers (scripts, hooks, dashboards), a JSON Schema validates structure on every edit, catching errors before they cascade. See `schema-validated-registries-pattern.md` and `registry-manifest-pattern.md`

# Schema-Validated Registries Pattern

**Created**: 2026-03-18
**Status**: Active
**Related**: `registry-manifest-pattern.md`, `structured-requirements-pattern.md`

---

## Problem

Registry structure is convention-only. A misspelled label passes yamllint because YAML syntax is valid — but the watchdog catches it at runtime only after a task gets stuck. There's no structural validation at edit time.

## Solution

JSON Schema files for the 4 most critical registries, validated by extending `yaml-validator.js`.

## How It Works

1. You edit a YAML registry file (Edit/Write)
2. `yaml-validator.js` PostToolUse hook fires
3. After yamllint syntax checks pass, the hook:
   - Parses YAML to JSON via Python (`yaml.safe_load`)
   - Looks up the file in `manifest.yaml` to find the registry ID
   - Checks for a matching schema at `.claude/registries/schemas/<id>.schema.json`
   - If schema exists, validates with lightweight checker (`Scripts/lib/schema-validator.js`)
4. Schema violations are reported as errors alongside yamllint findings

## Schemas

| Registry | Schema | Validates |
|----------|--------|-----------|
| label-taxonomy | `label-taxonomy.schema.json` | Required sections (label_functions, groups), position labels have `stage:` prefix |
| job-registry | `job-registry.schema.json` | Job entries have description + persona, schedule type is valid enum, numeric bounds |
| service-registry | `service-registry.schema.json` | Services have name + type, health endpoints have valid URLs, type is valid enum |
| paths-registry | `paths-registry.schema.json` | Hosts have hostname + role + status, status matches valid pattern |

## Schema Validator

`Scripts/lib/schema-validator.js` is a zero-dependency JSON Schema validator supporting:
- `type` (string, number, integer, boolean, array, object, null)
- `required`, `properties`, `additionalProperties`
- `enum`, `pattern`, `minimum`, `maximum`
- `minLength`, `minItems`, `minProperties`
- Recursive validation of nested objects and arrays

NOT supported (intentionally): `$ref`, `allOf/anyOf/oneOf`, conditionals, `format`. For full JSON Schema validation, use `ajv` — this is intentionally minimal to avoid npm dependencies.

## Adding a Schema for a New Registry

1. Create `.claude/registries/schemas/<registry-id>.schema.json`
2. The `<registry-id>` must match the key in `manifest.yaml`
3. The schema is automatically discovered — no code changes needed
4. Test: edit the registry file, verify the hook catches intentional violations

## Files

| File | Role |
|------|------|
| `.claude/registries/schemas/*.schema.json` | Schema definitions (4 files) |
| `Scripts/lib/schema-validator.js` | Lightweight validator module |
| `.claude/hooks/yaml-validator.js` | Hook that calls schema validation after yamllint |
| `.claude/registries/manifest.yaml` | Maps file paths to registry IDs (schema lookup) |

## Related

- @.claude/registries/manifest.yaml — Registry-to-schema mapping
- @.claude/context/patterns/registry-manifest-pattern.md — Manifest design
- @.claude/context/patterns/structured-requirements-pattern.md — Guideline #6 references this pattern

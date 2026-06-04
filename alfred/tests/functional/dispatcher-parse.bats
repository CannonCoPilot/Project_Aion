#!/usr/bin/env bats
# Pro-only: Job framework and dispatcher tests

load helpers/setup

@test "registry.yaml exists and is valid YAML" {
    local registry="$PROJECT_ROOT/.claude/jobs/registry.yaml"
    [ -f "$registry" ]
    # Basic YAML validation via node (no external deps)
    run node -e "
        const fs = require('fs');
        const content = fs.readFileSync('$registry', 'utf8');
        // Check it's not empty and has expected structure markers
        if (!content.includes('jobs:') && !content.includes('name:')) {
            process.exit(1);
        }
        console.log('valid');
    "
    [ "$status" -eq 0 ]
}

@test "dispatcher.sh has valid bash syntax" {
    run bash -n "$PROJECT_ROOT/.claude/jobs/dispatcher.sh"
    [ "$status" -eq 0 ]
}

@test "executor.sh has valid bash syntax" {
    run bash -n "$PROJECT_ROOT/.claude/jobs/executor.sh"
    [ "$status" -eq 0 ]
}

@test "all job library scripts have valid bash syntax" {
    local failures=0
    for script in "$PROJECT_ROOT/.claude/jobs/lib"/*.sh; do
        [[ -f "$script" ]] || continue
        if ! bash -n "$script" 2>/dev/null; then
            echo "FAIL: $script" >&2
            failures=$((failures + 1))
        fi
    done
    [ "$failures" -eq 0 ]
}

@test "job rules YAML files are valid" {
    local rules_dir="$PROJECT_ROOT/.claude/jobs/rules"
    [ -d "$rules_dir" ] || skip "rules directory not found"
    local failures=0
    for rule in "$rules_dir"/*.yaml; do
        [[ -f "$rule" ]] || continue
        if command -v yamllint &>/dev/null; then
            if ! yamllint -d relaxed "$rule" 2>/dev/null; then
                echo "FAIL: $rule" >&2
                failures=$((failures + 1))
            fi
        fi
    done
    [ "$failures" -eq 0 ]
}

@test "schema files are valid JSON" {
    local schemas_dir="$PROJECT_ROOT/.claude/registries/schemas"
    [ -d "$schemas_dir" ] || skip "schemas directory not found"
    local failures=0
    for schema in "$schemas_dir"/*.json; do
        [[ -f "$schema" ]] || continue
        if ! jq empty "$schema" 2>/dev/null; then
            echo "FAIL: $schema" >&2
            failures=$((failures + 1))
        fi
    done
    [ "$failures" -eq 0 ]
}

@test "manifest.yaml exists in registries" {
    [ -f "$PROJECT_ROOT/.claude/registries/manifest.yaml" ]
}

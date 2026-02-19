# Bash Gotchas — LLM Coding Reference

Reference for bash pitfalls commonly encountered when an LLM generates shell
commands. macOS ships bash 3.2 (2007) which lacks many bash 4+ features.

## macOS Bash 3.2 vs Linux Bash 4+

### `local` keyword — ONLY valid inside functions
```bash
# WRONG — causes "local: can only be used in a function" error
local my_var="hello"

# RIGHT — wrap in a function
my_func() {
    local my_var="hello"
}
```

### Associative arrays — NOT available in bash 3.2
```bash
# WRONG — bash 3.2 has no associative arrays
declare -A my_map

# RIGHT — use separate variables or a case statement
case "$key" in
    foo) value="bar" ;;
    baz) value="qux" ;;
esac
```

### `readarray` / `mapfile` — NOT available in bash 3.2
```bash
# WRONG
readarray -t lines < file.txt

# RIGHT
lines=()
while IFS= read -r line; do
    lines+=("$line")
done < file.txt
```

### `set -euo pipefail` — DANGEROUS with grep pipelines
```bash
# WRONG — grep returns exit 1 when no match, killing the script
set -euo pipefail
result=$(some_command | grep "pattern" | head -1)

# RIGHT — omit pipefail, or use `|| true` after grep
set -eu
result=$(some_command | grep "pattern" | head -1 || true)
```
**Critical**: NEVER use `set -euo pipefail` in hooks or scripts that use grep
in pipelines. This has caused multiple silent crash bugs in Jarvis hooks.

### `[[ =~ ]]` regex — capture groups differ
```bash
# bash 3.2: regex must NOT be quoted
[[ "$str" =~ ^foo(.*)bar$ ]]  # RIGHT
[[ "$str" =~ "^foo(.*)bar$" ]]  # WRONG in 3.2 — treated as literal

# BASH_REMATCH works in both, but avoid quoting the regex
```

### `;&` and `;;&` in case — NOT available in bash 3.2
```bash
# WRONG — fall-through not supported
case "$x" in
    a) echo "a" ;&
    b) echo "b" ;;
esac

# RIGHT — duplicate the logic
case "$x" in
    a) echo "a"; echo "b" ;;
    b) echo "b" ;;
esac
```

## tmux Interaction

### `$HOME/bin/tmux` piping in zsh — BREAKS
```bash
# WRONG — zsh fails when piping from $HOME/bin/tmux
$HOME/bin/tmux capture-pane -t jarvis:0 -p | grep "pattern"

# RIGHT — use absolute path
/Users/nathanielcannon/bin/tmux capture-pane -t jarvis:0 -p | grep "pattern"

# OR — use dev scripts which run in bash internally
bash .claude/scripts/dev/capture-jarvis.sh --tail 20
```

### Multi-line strings with `send-keys -l` — INPUT CORRUPTION
```bash
# WRONG — multi-line causes TUI input buffer corruption
$TMUX_BIN send-keys -t jarvis:0 -l "line one
line two"

# RIGHT — single line only, split text and Enter
$TMUX_BIN send-keys -t jarvis:0 -l "single line text"
sleep 0.3
$TMUX_BIN send-keys -t jarvis:0 C-m
```

### Combining text + Enter in one send-keys — FAILS
```bash
# WRONG — Enter gets embedded as literal character
$TMUX_BIN send-keys -t jarvis:0 -l "text" C-m

# RIGHT — separate calls
$TMUX_BIN send-keys -t jarvis:0 -l "text"
sleep 0.1
$TMUX_BIN send-keys -t jarvis:0 C-m
```

## Heredocs and Quoting

### Heredoc variable expansion — watch the quotes
```bash
# Variables EXPAND (no quotes around EOF)
cat << EOF
Hello $USER
EOF

# Variables DO NOT expand (quotes around EOF)
cat << 'EOF'
Hello $USER  # literally prints $USER
EOF
```

### Command substitution in heredocs
```bash
# WRONG — backticks inside heredoc can break
cat << EOF
Result: `some_command`
EOF

# RIGHT — use $() syntax
cat << EOF
Result: $(some_command)
EOF
```

## head/tail Pipeline Behavior

### SIGPIPE with head — NOT an error
```bash
# When piping to head, the upstream command gets SIGPIPE (exit 141)
# when head closes its input. This is NORMAL pipe behavior.
# set -o pipefail makes this look like an error

some_long_output | head -5  # exit 141 from upstream = NORMAL

# If using pipefail, suppress:
some_long_output | head -5 || true
```

## jq Patterns

### `.foo // "default"` — null coalescing
```bash
# WRONG — fails if .foo doesn't exist
jq -r '.foo' file.json

# RIGHT — provide default
jq -r '.foo // "unknown"' file.json
```

### Selecting from arrays safely
```bash
# WRONG — crashes on empty array
jq -r '.[0].name' file.json

# RIGHT — handle empty
jq -r '(.[0].name // "none")' file.json
```

## Git on macOS

### GH007 email privacy — checks BOTH author AND committer
```bash
# WRONG — only overrides author
git commit --author="Name <email>"

# RIGHT — override both author AND committer
GIT_COMMITTER_NAME="Name" GIT_COMMITTER_EMAIL="email" \
  git commit --author="Name <email>"
```

## Process Management

### `$(...)` subshell — must return 0 in bash 3.2
```bash
# If a function is called via $(), bash 3.2 with set -e will
# exit the script if the function returns non-zero

# WRONG — may kill script
result=$(my_func)

# RIGHT — ensure function always returns 0
my_func() {
    local val
    val=$(some_command) || val="default"
    echo "$val"
    return 0  # explicit return 0
}
```

### pgrep patterns — be specific
```bash
# WRONG — matches too broadly
pgrep -f "watcher"

# RIGHT — match the specific script
pgrep -f "jicm-watcher.sh"
```

---

*Bash Gotchas Reference v1.0 — Compiled from Jarvis session learnings*

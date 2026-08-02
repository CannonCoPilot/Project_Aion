# Insights Archive — 2026-06-25
# Rotated: 2026-06-26T02:03:09Z (1 entries)

### 2026-06-13 [0fa6e69215e6]

The three UI fixes follow a common pattern in data-driven apps: **analysis-then-display pipelines need bidirectional feedback**. When analysis runs asynchronously, the display layer must know when to refresh. The `prevRunningRef` approach (tracking which tracks were running last render, detecting newly-completed tracks via set difference) is a React-idiomatic way to detect state transitions without polling the project store separately. This is the same pattern genome browsers use — IGV and JBrowse both reload tracks when background computation completes.


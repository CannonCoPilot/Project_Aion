# Compare AIProjects components against sync-manifest.yaml for drift

Run ~/AIProjects/Scripts/sync-discovery.sh and analyze the output.
If new untracked components are found, list them and recommend sync
policies (always/prompt/never) based on whether they are generic
(always), require user config (prompt), or personal (never).
If changed components are found, recommend running sync-apply.sh.
Output a brief summary. Do not modify any files.

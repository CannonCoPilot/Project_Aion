#!/usr/bin/env node
/**
 * relevance-retrieval.js — L5→L2 Autonomic Retrieval (Phase 2B, Task 2)
 *
 * UserPromptSubmit hook that detects domain-shift signals in the user prompt
 * and injects relevant procedural knowledge (patterns, references) as
 * additionalContext. The "rattlesnake reflex" for memory recall.
 *
 * Memory System role:
 *   Layer: L5 (Long-Term Procedural) → L2 (Working Memory)
 *   Process: Retrieve (autonomic recall triggered by environmental signal)
 *   Anti-Hyperthymesia: session-tracking prevents re-injection; threshold gating
 *
 * Design constraints:
 *   - Latency budget: <500ms (no network calls in v1; file reads only)
 *   - Selective: only triggers on domain-shift + uncertainty signals
 *   - Capped: max 1 injection per prompt, max 800 chars
 *   - Tracked: won't re-inject same pattern within a session
 */

const fs = require("fs");
const path = require("path");

const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || path.join(process.env.HOME, "Claude", "Jarvis");
const STATE_FILE = path.join(PROJECT_DIR, ".claude/context/.retrieval-state.json");
const CAP_MAP = path.join(PROJECT_DIR, ".claude/context/psyche/capability-map.yaml");
const MAX_INJECT_CHARS = 800;
const MAX_MCP_INJECT_CHARS = 200;

// Keyword → file mapping extracted from capability-map.yaml patterns section
// (Statically defined for speed; update when capability-map changes)
const PATTERN_TRIGGERS = {
  "agent selection|tool selection|skill selection|which agent|which tool": {
    file: ".claude/context/patterns/agent-selection-pattern.md",
    label: "Agent Selection Pattern"
  },
  "parallel|sequential|concurrent|batch": {
    file: ".claude/context/patterns/parallelization-strategy.md",
    label: "Parallelization Strategy"
  },
  "milestone|pr review|completion review|ac-03": {
    file: ".claude/context/patterns/milestone-review-pattern.md",
    label: "Milestone Review Pattern"
  },
  "jicm|context threshold|compression|context budget|token budget": {
    file: ".claude/context/patterns/jicm-pattern.md",
    label: "JICM Pattern"
  },
  "mcp|mcp loading|mcp server|mcp tier": {
    file: ".claude/context/patterns/mcp-loading-strategy.md",
    label: "MCP Loading Strategy"
  },
  "two-stage|validation gate|pre-deploy|stage verdict": {
    file: ".claude/context/patterns/two-stage-validation-gating.md",
    label: "Two-Stage Validation Gating"
  },
  "observation mask|large output|tool output|80%": {
    file: ".claude/context/patterns/observation-masking-pattern.md",
    label: "Observation Masking Pattern"
  },
  "wiggum|iterative|execute check review": {
    file: ".claude/context/patterns/wiggum-loop-pattern.md",
    label: "Wiggum Loop Pattern"
  },
  "context budget|token cost|force-load|context optimization": {
    file: ".claude/context/patterns/context-budget-management.md",
    label: "Context Budget Management"
  },
  "bash|bash gotcha|macos bash|bash 3.2": {
    file: ".claude/context/reference/bash-gotchas.md",
    label: "Bash Gotchas Reference"
  },
  "subagent|agent hallucin|tool_uses|agent output": {
    file: ".claude/context/patterns/subagent-output-fidelity.md",
    label: "Subagent Output Fidelity"
  },
  "persist|obstacle|stuck|fail|escalat|root cause": {
    file: ".claude/context/patterns/persistence-protocol.md",
    label: "Persistence Protocol"
  }
};

// Question/uncertainty signals that amplify keyword matches
const QUESTION_SIGNALS = [
  /\bhow (do|should|can|would) (i|we)\b/i,
  /\bwhat('s| is) the (best|right|correct)\b/i,
  /\bshould (i|we)\b/i,
  /\bwhen (do|should|to)\b/i,
  /\?$/m,
  /\bnot sure\b/i,
  /\bremind me\b/i,
  /\bwhat pattern\b/i,
  /\bhow does .* work\b/i,
];

// T4: MCP search signals — trigger RAG/Graphiti searches via instruction injection
const MCP_SEARCH_SIGNALS = {
  domain_shift: {
    projects: ["chronicler", "aifred", "pulse", "nexus", "jarvis-dev", "dwarf", "dwarfcron", "dashboard", "reo"],
    detect(prompt, state) {
      const mentioned = this.projects.filter(p => prompt.toLowerCase().includes(p));
      const recent = state.recent_projects || [];
      const novel = mentioned.filter(p => !recent.includes(p));
      return novel.length > 0 ? novel[0] : null;
    },
    inject(topic) {
      return `[MEMORY RETRIEVAL: Call mcp__jarvis-rag__search query="${topic}" collection="sessions" limit=2. Apply context from results.]`;
    }
  },
  recall: {
    patterns: [/what did we .{3,30}(about|for|with)/i, /how did we .{3,30}/i, /remember when/i, /last time we/i, /what was the .{3,30}(we|you)/i],
    detect(prompt) {
      for (const re of this.patterns) {
        const m = prompt.match(re);
        if (m) return m[0].substring(0, 60);
      }
      return null;
    },
    inject(topic) {
      return `[MEMORY RETRIEVAL: Call mcp__jarvis-rag__search query="${topic}" collection="sessions" limit=3 AND mcp__jarvis-graphiti__search query="${topic}". Synthesize findings.]`;
    }
  },
  methodology: {
    patterns: [/\bpattern\b.{0,20}(for|to|when)/i, /best practice/i, /how should (I|we) approach/i, /what.s the (right|correct) way/i],
    detect(prompt) {
      for (const re of this.patterns) {
        const m = prompt.match(re);
        if (m) return m[0].substring(0, 60);
      }
      return null;
    },
    inject(topic) {
      return `[MEMORY RETRIEVAL: Call mcp__jarvis-graphiti__search query="${topic} methodology". Apply if relevant.]`;
    }
  },
  error_debug: {
    patterns: [/(error|fail|broke|crash|exception).{0,50}(\/Users|\.claude|\.\/)/i],
    detect(prompt) {
      for (const re of this.patterns) {
        const m = prompt.match(re);
        if (m) return m[0].substring(0, 80);
      }
      return null;
    },
    inject(topic) {
      return `[MEMORY RETRIEVAL: Call mcp__jarvis-rag__search query="${topic}" collection="codebase". Check for prior solutions.]`;
    }
  },
  reference_lookup: {
    patterns: [/where is .{3,40}(defined|located|stored|configured)/i, /which file .{3,40}(has|contains|defines)/i, /find the .{3,40}(file|config|setting)/i],
    detect(prompt) {
      for (const re of this.patterns) {
        const m = prompt.match(re);
        if (m) return m[0].substring(0, 60);
      }
      return null;
    },
    inject(topic) {
      return `[MEMORY RETRIEVAL: Call mcp__jarvis-graphiti__search query="${topic}". Apply entity info.]`;
    }
  }
};

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    return { injected: [], mcp_injected: [], recent_projects: [], session_start: Date.now() };
  }
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function scoreMatch(prompt, pattern) {
  const keywords = pattern.split("|");
  let hits = 0;
  for (const kw of keywords) {
    if (prompt.toLowerCase().includes(kw.toLowerCase())) {
      hits++;
    }
  }
  return hits;
}

function hasQuestionSignal(prompt) {
  return QUESTION_SIGNALS.some(re => re.test(prompt));
}

function getExcerpt(filePath) {
  try {
    const full = path.join(PROJECT_DIR, filePath);
    if (!fs.existsSync(full)) return null;
    const content = fs.readFileSync(full, "utf8");
    // Skip frontmatter/header, get first meaningful content
    const lines = content.split("\n");
    let start = 0;
    // Skip past any --- frontmatter
    if (lines[0] === "---") {
      start = lines.indexOf("---", 1) + 1;
    }
    // Skip past # header line
    while (start < lines.length && (lines[start].startsWith("#") || lines[start].trim() === "")) {
      start++;
    }
    const body = lines.slice(start).join("\n").trim();
    if (body.length <= MAX_INJECT_CHARS) return body;
    // Truncate at sentence boundary near cap
    const truncated = body.substring(0, MAX_INJECT_CHARS);
    const lastPeriod = truncated.lastIndexOf(". ");
    if (lastPeriod > MAX_INJECT_CHARS * 0.6) {
      return truncated.substring(0, lastPeriod + 1);
    }
    return truncated + "...";
  } catch {
    return null;
  }
}

function main() {
  let input = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", chunk => input += chunk);
  process.stdin.on("end", () => {
    try {
      const hookData = JSON.parse(input);
      const prompt = hookData.prompt || hookData.message || "";

      if (!prompt || prompt.length < 10) {
        output({});
        return;
      }

      const state = loadState();
      const hasQuestion = hasQuestionSignal(prompt);
      const threshold = hasQuestion ? 1 : 2; // Lower bar if question detected

      let bestMatch = null;
      let bestScore = 0;

      for (const [pattern, meta] of Object.entries(PATTERN_TRIGGERS)) {
        // Skip if already injected this session
        if (state.injected.includes(meta.file)) continue;

        const score = scoreMatch(prompt, pattern);
        if (score >= threshold && score > bestScore) {
          bestScore = score;
          bestMatch = meta;
        }
      }

      // T3: File-excerpt injection (existing)
      let additionalParts = [];

      if (bestMatch) {
        const excerpt = getExcerpt(bestMatch.file);
        if (excerpt) {
          state.injected.push(bestMatch.file);
          additionalParts.push(`[Memory L5→L2 retrieval: ${bestMatch.label}]\n${excerpt}`);
        }
      }

      // T4: MCP search signal injection (Phase 2C)
      // Max 1 MCP instruction per prompt; session dedup prevents re-injection
      if (!state.mcp_injected) state.mcp_injected = [];
      if (!state.recent_projects) state.recent_projects = [];

      let mcpInstruction = null;
      let mcpSignalName = null;
      let mcpTopic = null;

      for (const [name, signal] of Object.entries(MCP_SEARCH_SIGNALS)) {
        const topic = signal.detect(prompt, state);
        if (!topic) continue;

        const dedupKey = `${name}:${topic.substring(0, 30)}`;
        if (state.mcp_injected.includes(dedupKey)) continue;

        mcpInstruction = signal.inject(topic);
        mcpSignalName = name;
        mcpTopic = topic;
        state.mcp_injected.push(dedupKey);

        // Track project mentions for domain_shift detection
        if (name === "domain_shift") {
          if (!state.recent_projects.includes(topic)) {
            state.recent_projects.push(topic);
            if (state.recent_projects.length > 10) state.recent_projects.shift();
          }
        }
        break;
      }

      if (mcpInstruction) {
        const capped = mcpInstruction.length > MAX_MCP_INJECT_CHARS
          ? mcpInstruction.substring(0, MAX_MCP_INJECT_CHARS)
          : mcpInstruction;
        additionalParts.push(`[Memory L4/L5→L0 retrieval signal: ${mcpSignalName}]\n${capped}`);
      }

      saveState(state);

      if (additionalParts.length > 0) {
        output({ additionalContext: additionalParts.join("\n\n") });
        return;
      }

      output({});
    } catch (e) {
      output({});
    }
  });
}

function output(data) {
  console.log(JSON.stringify({ continue: true, ...data }));
}

main();

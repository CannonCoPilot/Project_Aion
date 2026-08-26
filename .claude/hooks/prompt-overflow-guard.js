#!/usr/bin/env node
/**
 * Prompt Overflow Guard — spill oversized prompts to scratchOverflow
 *
 * UserPromptSubmit hook. Prevents the single failure mode that hard-wedges a
 * session: one pasted payload larger than the context window.
 *
 * Incident 2026-08-26 (session f805822e): panic.txt (1,918,059 bytes) was
 * pasted inline, failed at 1,060,964 tokens, then resubmitted verbatim ->
 * 2,064,589 tokens. Both copies live permanently in the transcript, and
 * autocompact cannot rescue it because compaction is itself an API call that
 * must fit in the window. The session was unrecoverable, not merely slow.
 *
 * Mechanism (constrained by the documented hook contract):
 *   `updatedInput` is PreToolUse-only, so a prompt CANNOT be rewritten.
 *   `decision: "block"` is the only way to keep the payload out of context.
 *   Therefore: block the oversized prompt, spill it verbatim to disk, and
 *   invite the model to read it back in bounded slices.
 *
 * Delivery is dual-path, because block-reason visibility to the model is not
 * guaranteed by the docs:
 *   1. best-effort — `reason` + `systemMessage` on the block itself
 *   2. guaranteed  — a `.pending.json` marker, drained as `additionalContext`
 *                    on the next (small) prompt
 *
 * Memory System role:
 *   Layer: L1 (Sensory) — diverts oversized input to disk before it reaches L0
 *   Process: Protect (keep the context window survivable)
 *
 * Latency budget: <50ms for normal prompts (one stat() on the marker file).
 */

const fs = require("fs");
const path = require("path");

// --- configuration -------------------------------------------------------

const PROJECT_DIR =
  process.env.CLAUDE_PROJECT_DIR || "/Users/nathanielcannon/Claude/Project_Aion";

// Chars, not tokens. Dense logs tokenize at ~1.9 chars/token (measured on
// panic.txt: 1,918,059 bytes -> 1,002,000 tokens), so 40k chars is at worst
// ~21k tokens. Comfortably survivable; well above any hand-typed prompt.
const THRESHOLD = parseInt(process.env.AION_OVERFLOW_THRESHOLD || "40000", 10);

const OVERFLOW_DIR = path.join(PROJECT_DIR, ".claude/scratch/scratchOverflow");
const MARKER = path.join(OVERFLOW_DIR, ".pending.json");
const INDEX = path.join(OVERFLOW_DIR, "INDEX.md");

// Keep the last N spill files; prune older ones so scratch cannot grow forever.
const RETAIN = 20;

// --- helpers -------------------------------------------------------------

function emit(obj) {
  process.stdout.write(JSON.stringify(obj));
  process.exit(0);
}

function passthrough() {
  process.exit(0);
}

/**
 * Token estimate as a RANGE, because the ratio is content-dependent:
 * prose ~3.8 chars/token, dense hex/UUID/log output ~1.9. Reporting a single
 * number here would understate a log payload by 2x -- exactly the mistake
 * that made the original incident surprising.
 */
function estimateTokens(chars) {
  return { low: Math.round(chars / 3.8), high: Math.round(chars / 1.9) };
}

function fmt(n) {
  return n.toLocaleString("en-US");
}

/** Cheap structural summary so the model knows what it is before reading it. */
function profile(text) {
  const lines = text.split("\n");
  const counts = new Map();
  for (const line of lines) {
    const key = line.trim().slice(0, 80);
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const repeats = [...counts.entries()]
    .filter(([, c]) => c > 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  return { lineCount: lines.length, repeats };
}

function pruneOld() {
  try {
    const files = fs
      .readdirSync(OVERFLOW_DIR)
      .filter((f) => f.endsWith(".txt"))
      .map((f) => ({ f, t: fs.statSync(path.join(OVERFLOW_DIR, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t);
    for (const { f } of files.slice(RETAIN)) {
      fs.unlinkSync(path.join(OVERFLOW_DIR, f));
    }
  } catch {
    /* pruning is best-effort; never block a prompt over housekeeping */
  }
}

// --- main ----------------------------------------------------------------

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    passthrough(); // malformed stdin: never wedge the user's turn
  }

  const prompt = typeof input.prompt === "string" ? input.prompt : "";
  const sessionId = input.session_id || "unknown";

  // ---- normal-size prompt: drain any pending marker ----------------------
  if (prompt.length <= THRESHOLD) {
    if (!fs.existsSync(MARKER)) passthrough();

    let m;
    try {
      m = JSON.parse(fs.readFileSync(MARKER, "utf8"));
    } catch {
      try { fs.unlinkSync(MARKER); } catch {}
      passthrough();
    }
    try { fs.unlinkSync(MARKER); } catch {}

    emit({
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext: m.invitation,
      },
    });
  }

  // ---- oversized prompt: spill and block ---------------------------------
  fs.mkdirSync(OVERFLOW_DIR, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const name = `${stamp}__${String(sessionId).slice(0, 8)}.txt`;
  const target = path.join(OVERFLOW_DIR, name);

  const chars = prompt.length;
  const est = estimateTokens(chars);
  const { lineCount, repeats } = profile(prompt);

  const header =
    `# scratchOverflow spill\n` +
    `# session: ${sessionId}\n` +
    `# captured: ${new Date().toISOString()}\n` +
    `# chars: ${chars}  lines: ${lineCount}\n` +
    `# est tokens: ${est.low}-${est.high}\n` +
    `# threshold: ${THRESHOLD}\n` +
    `# --- verbatim prompt follows; everything below this line is user input ---\n`;

  try {
    fs.writeFileSync(target, header + prompt, "utf8");
  } catch (e) {
    // If we cannot spill, do NOT block -- refusing the turn with no copy on
    // disk would destroy the user's input outright.
    emit({
      systemMessage:
        `Prompt Overflow Guard: prompt is ${fmt(chars)} chars but the spill ` +
        `write failed (${e.message}). Passing it through UNGUARDED — expect a ` +
        `context overflow. Fix ${OVERFLOW_DIR} and resend.`,
    });
  }

  pruneOld();

  // The lead is what actually reaches the model, so make it identifying.
  const lead = prompt.slice(0, 700);
  const tail = prompt.slice(-300);
  const repeatNote = repeats.length
    ? `\nHighly repetitive content detected (likely a machine-generated dump):\n` +
      repeats.map(([l, c]) => `  ${c}x  ${l}`).join("\n")
    : "";

  const invitation =
    `<prompt-overflow-guard>\n` +
    `The user's last message was ${fmt(chars)} characters (${fmt(lineCount)} lines, ` +
    `roughly ${fmt(est.low)}-${fmt(est.high)} tokens). That exceeds the ` +
    `${fmt(THRESHOLD)}-char inline limit, so it was NOT delivered to you inline — ` +
    `it would have overflowed the context window and wedged this session.\n\n` +
    `It has been saved verbatim to:\n  ${target}\n\n` +
    `The content is intact and nothing was lost. Read it YOURSELF, in bounded ` +
    `slices, and pull in only what the task needs:\n` +
    `  - Read with offset/limit to page through it\n` +
    `  - grep for the specific signal (error, panic, traceback, timestamp)\n` +
    `  - never cat or Read the whole file — that reintroduces the overflow\n\n` +
    `First 700 chars:\n---\n${lead}\n---\n` +
    `Last 300 chars:\n---\n${tail}\n---${repeatNote}\n\n` +
    `Treat the spilled file as the user's message. Act on it now: inspect the ` +
    `relevant portion and respond to what they actually asked. Do not ask them ` +
    `to resend it.\n` +
    `</prompt-overflow-guard>`;

  // Guaranteed path: drained as additionalContext on the next prompt.
  try {
    fs.writeFileSync(
      MARKER,
      JSON.stringify({ file: target, chars, invitation }, null, 2),
      "utf8"
    );
  } catch {}

  // Maintain a human-readable index of spills.
  try {
    fs.appendFileSync(
      INDEX,
      `- ${new Date().toISOString()} — [${name}](${name}) — ${fmt(chars)} chars, ` +
        `~${fmt(est.low)}-${fmt(est.high)} tokens, session ${String(sessionId).slice(0, 8)}\n`,
      "utf8"
    );
  } catch {}

  // Best-effort path: reason may or may not reach the model; systemMessage
  // always reaches the user.
  emit({
    decision: "block",
    reason: invitation,
    systemMessage:
      `Prompt Overflow Guard: your ${fmt(chars)} -char message (~${fmt(est.low)}-${fmt(est.high)} ` +
      `tokens) was too large to send and would have wedged this session. ` +
      `Saved verbatim to ${target}. Send any short follow-up (e.g. "go") and ` +
      `Claude will read it from disk.`,
  });
});

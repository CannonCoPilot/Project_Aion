import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../config.js';
import {
  parseExecutionLogs,
  parseNexusDbEvents,
  parseAiDavidDecisions,
  type NexusEvent,
} from './event-correlator.js';
import { parseRegistry } from './registry.js';

// --- Types ---

export interface AnalyticsResponse {
  cost: {
    today: number;
    weekTotal: number;
    trend: { date: string; cost: number; execution: number; nexus: number }[];
    byJob: { job: string; cost: number; runs: number }[];
    byPersona: { persona: string; cost: number }[];
  };
  performance: {
    byJob: {
      job: string;
      avgDuration: number;
      successRate: number;
      totalRuns: number;
      totalCost: number;
    }[];
  };
  approvalSLA: {
    avgTimeToFeedback: number;
    staleProposals: number;
    feedbackBreakdown: { agreed: number; wrong: number; adjust: number };
  };
  taskReviewerAccuracy: {
    trend: { date: string; accuracy: number; total: number }[];
    byAction: { action: string; accuracy: number; count: number }[];
  };
}

// --- Feedback file reading ---

interface FeedbackEntry {
  timestamp: string;
  task_id?: string;
  decision_timestamp?: string;
  verdict: 'agreed' | 'wrong' | 'adjust';
  note?: string;
  adjustments?: Record<string, unknown>;
}

function readFeedbackFile(): FeedbackEntry[] {
  const filePath = join(config.taskReviewerResultsDir, 'feedback.jsonl');
  try {
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);
    return lines.map((line) => JSON.parse(line) as FeedbackEntry);
  } catch {
    return [];
  }
}

// --- Helpers ---

function toDateStr(ts: string): string {
  return new Date(ts).toLocaleDateString('en-CA', { timeZone: config.timezone });
}

function nowISO(): string {
  return new Date().toISOString();
}

function daysAgoISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function todayStr(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: config.timezone });
}

// --- Main analytics function ---

export function getAnalytics(from?: string, to?: string): AnalyticsResponse {
  const rangeFrom = from || daysAgoISO(7);
  const rangeTo = to || nowISO();

  const cost = computeCost(rangeFrom, rangeTo);
  const performance = computePerformance(rangeFrom, rangeTo);
  const approvalSLA = computeApprovalSLA(rangeFrom, rangeTo);
  const taskReviewerAccuracy = computeAiDavidAccuracy(rangeFrom, rangeTo);

  return { cost, performance, approvalSLA, taskReviewerAccuracy };
}

// --- Cost ---

function computeCost(from: string, to: string): AnalyticsResponse['cost'] {
  // Primary source: execution logs
  let execEvents: NexusEvent[] = [];
  try {
    execEvents = parseExecutionLogs(from, to);
  } catch {
    execEvents = [];
  }

  // Fallback source: nexus_db job_completed events
  let dbEvents: NexusEvent[] = [];
  try {
    dbEvents = parseNexusDbEvents(from, to).filter(
      (e) => e.type === 'job_completed' && e.cost != null,
    );
  } catch {
    dbEvents = [];
  }

  // Merge: execution logs are primary. For jobs/timestamps not in exec logs, use db events.
  const execKeys = new Set(execEvents.map((e) => `${e.job}|${toDateStr(e.timestamp)}`));
  const mergedEvents = [
    ...execEvents,
    ...dbEvents.filter((e) => !execKeys.has(`${e.job}|${toDateStr(e.timestamp)}`)),
  ];

  // Today
  const todayDate = todayStr();
  const today = mergedEvents
    .filter((e) => toDateStr(e.timestamp) === todayDate)
    .reduce((sum, e) => sum + (e.cost ?? 0), 0);

  // Week total (last 7 days)
  const weekAgo = daysAgoISO(7).slice(0, 10);
  const weekTotal = mergedEvents
    .filter((e) => toDateStr(e.timestamp) >= weekAgo)
    .reduce((sum, e) => sum + (e.cost ?? 0), 0);

  // Trend: daily costs with per-source breakdown
  const dailyCosts = new Map<string, { total: number; execution: number; nexus: number }>();
  for (const e of mergedEvents) {
    const date = toDateStr(e.timestamp);
    const day = dailyCosts.get(date) ?? { total: 0, execution: 0, nexus: 0 };
    const cost = e.cost ?? 0;
    day.total += cost;
    if (e.source === 'execution') day.execution += cost;
    else day.nexus += cost;
    dailyCosts.set(date, day);
  }
  const trend = [...dailyCosts.entries()]
    .map(([date, d]) => ({ date, cost: d.total, execution: d.execution, nexus: d.nexus }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // By job
  const jobMap = new Map<string, { cost: number; runs: number }>();
  for (const e of mergedEvents) {
    const job = e.job || 'unknown';
    const entry = jobMap.get(job) || { cost: 0, runs: 0 };
    entry.cost += e.cost ?? 0;
    entry.runs += 1;
    jobMap.set(job, entry);
  }
  const byJob = [...jobMap.entries()]
    .map(([job, data]) => ({ job, ...data }))
    .sort((a, b) => b.cost - a.cost);

  // By persona: map job->persona via registry
  const byPersona: { persona: string; cost: number }[] = [];
  try {
    const { jobs } = parseRegistry();
    const jobToPersona = new Map<string, string>();
    for (const j of jobs) {
      jobToPersona.set(j.name, j.persona || 'unknown');
    }

    const personaCosts = new Map<string, number>();
    for (const e of mergedEvents) {
      const persona = jobToPersona.get(e.job || '') || e.persona || 'unknown';
      personaCosts.set(persona, (personaCosts.get(persona) ?? 0) + (e.cost ?? 0));
    }
    for (const [persona, cost] of personaCosts) {
      byPersona.push({ persona, cost });
    }
    byPersona.sort((a, b) => b.cost - a.cost);
  } catch {
    // Registry unavailable — skip persona breakdown
  }

  return { today, weekTotal, trend, byJob, byPersona };
}

// --- Performance ---

function computePerformance(from: string, to: string): AnalyticsResponse['performance'] {
  let execEvents: NexusEvent[] = [];
  try {
    execEvents = parseExecutionLogs(from, to);
  } catch {
    execEvents = [];
  }

  const jobMap = new Map<
    string,
    {
      totalRuns: number;
      successes: number;
      totalDuration: number;
      durationCount: number;
      totalCost: number;
    }
  >();

  for (const e of execEvents) {
    const job = e.job || 'unknown';
    const entry = jobMap.get(job) || {
      totalRuns: 0,
      successes: 0,
      totalDuration: 0,
      durationCount: 0,
      totalCost: 0,
    };
    entry.totalRuns += 1;
    if (e.type === 'execution_success') entry.successes += 1;
    if (e.duration != null) {
      entry.totalDuration += e.duration;
      entry.durationCount += 1;
    }
    entry.totalCost += e.cost ?? 0;
    jobMap.set(job, entry);
  }

  const byJob = [...jobMap.entries()]
    .map(([job, data]) => ({
      job,
      avgDuration: data.durationCount > 0 ? Math.round(data.totalDuration / data.durationCount) : 0,
      successRate: data.totalRuns > 0 ? data.successes / data.totalRuns : 0,
      totalRuns: data.totalRuns,
      totalCost: data.totalCost,
    }))
    .sort((a, b) => b.totalRuns - a.totalRuns);

  return { byJob };
}

// --- Approval SLA ---

function computeApprovalSLA(from: string, to: string): AnalyticsResponse['approvalSLA'] {
  // Get proposals from AI David decisions
  let decisions: NexusEvent[] = [];
  try {
    decisions = parseAiDavidDecisions(from, to);
  } catch {
    decisions = [];
  }
  const proposals = decisions.filter((e) => e.type === 'ai_propose');

  // Read all feedback
  const allFeedback = readFeedbackFile();

  // Filter feedback to time window
  const feedbackInRange = allFeedback.filter((f) => {
    if (from && f.timestamp < from) return false;
    if (to && f.timestamp > to) return false;
    return true;
  });

  // Feedback breakdown
  const feedbackBreakdown = { agreed: 0, wrong: 0, adjust: 0 };
  for (const f of feedbackInRange) {
    if (f.verdict === 'agreed') feedbackBreakdown.agreed++;
    else if (f.verdict === 'wrong') feedbackBreakdown.wrong++;
    else if (f.verdict === 'adjust') feedbackBreakdown.adjust++;
  }

  // Match proposals to feedback by task_id for SLA computation
  const feedbackByTaskId = new Map<string, FeedbackEntry>();
  for (const f of allFeedback) {
    if (f.task_id) feedbackByTaskId.set(f.task_id, f);
  }

  const feedbackTimes: number[] = [];
  let staleProposals = 0;
  const now = Date.now();
  const twentyFourHoursMs = 24 * 60 * 60 * 1000;

  for (const p of proposals) {
    const taskId = p.task_id;
    if (!taskId) continue;

    const feedback = feedbackByTaskId.get(taskId);
    if (feedback) {
      const proposalTime = new Date(p.timestamp).getTime();
      const feedbackTime = new Date(feedback.timestamp).getTime();
      const deltaSeconds = Math.max(0, (feedbackTime - proposalTime) / 1000);
      feedbackTimes.push(deltaSeconds);
    } else {
      // No feedback — check if stale (>24h old)
      const proposalAge = now - new Date(p.timestamp).getTime();
      if (proposalAge > twentyFourHoursMs) {
        staleProposals++;
      }
    }
  }

  const avgTimeToFeedback =
    feedbackTimes.length > 0
      ? Math.round(feedbackTimes.reduce((s, t) => s + t, 0) / feedbackTimes.length)
      : 0;

  return { avgTimeToFeedback, staleProposals, feedbackBreakdown };
}

// --- AI David Accuracy ---

function computeAiDavidAccuracy(from: string, to: string): AnalyticsResponse['taskReviewerAccuracy'] {
  const allFeedback = readFeedbackFile();

  // Filter feedback to time window
  const feedbackInRange = allFeedback.filter((f) => {
    if (from && f.timestamp < from) return false;
    if (to && f.timestamp > to) return false;
    return true;
  });

  // Trend: daily accuracy
  const dailyStats = new Map<string, { agreed: number; wrong: number; adjust: number }>();
  for (const f of feedbackInRange) {
    const date = toDateStr(f.timestamp);
    const stats = dailyStats.get(date) || { agreed: 0, wrong: 0, adjust: 0 };
    if (f.verdict === 'agreed') stats.agreed++;
    else if (f.verdict === 'wrong') stats.wrong++;
    else if (f.verdict === 'adjust') stats.adjust++;
    dailyStats.set(date, stats);
  }

  const trend = [...dailyStats.entries()]
    .map(([date, stats]) => {
      const denom = stats.agreed + stats.wrong;
      const accuracy = denom > 0 ? stats.agreed / denom : 1;
      const total = stats.agreed + stats.wrong + stats.adjust;
      return { date, accuracy, total };
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  // By action: cross-reference decisions with feedback
  let decisions: NexusEvent[] = [];
  try {
    decisions = parseAiDavidDecisions(from, to);
  } catch {
    decisions = [];
  }

  // Build feedback lookup by task_id
  const feedbackByTaskId = new Map<string, FeedbackEntry>();
  for (const f of allFeedback) {
    if (f.task_id) feedbackByTaskId.set(f.task_id, f);
  }

  // Group decisions by action and count accuracy
  const actionStats = new Map<string, { agreed: number; wrong: number; total: number }>();
  for (const d of decisions) {
    const action = d.type.replace(/^ai_/, '');
    const stats = actionStats.get(action) || { agreed: 0, wrong: 0, total: 0 };
    stats.total++;

    if (d.task_id) {
      const feedback = feedbackByTaskId.get(d.task_id);
      if (feedback) {
        if (feedback.verdict === 'agreed') stats.agreed++;
        else if (feedback.verdict === 'wrong') stats.wrong++;
      }
    }
    actionStats.set(action, stats);
  }

  const byAction = [...actionStats.entries()]
    .map(([action, stats]) => {
      const denom = stats.agreed + stats.wrong;
      const accuracy = denom > 0 ? stats.agreed / denom : 1;
      return { action, accuracy, count: stats.total };
    })
    .sort((a, b) => b.count - a.count);

  return { trend, byAction };
}

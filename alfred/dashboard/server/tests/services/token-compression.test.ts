import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';

import {
  readMetricsFile,
  aggregateStats,
  computeTrends,
  getPhaseDetails,
  type SessionMetric,
} from '../../services/token-compression.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BASE_TIMESTAMP = '2026-04-29T23:00:00.000Z';

function makeMetrics(): SessionMetric[] {
  return [
    {
      timestamp: BASE_TIMESTAMP,
      session_id: 'session-1',
      task_id: 'TASK-001',
      task_title: 'Test task',
      phase: 'execute',
      event: 'review_start',
      reviewer: 'pipeline-reviewer',
      project: 'token-compression',
    },
    {
      timestamp: BASE_TIMESTAMP,
      session_id: 'session-1',
      task_id: 'TASK-001',
      phase: 'execute',
      event: 'pipeline_health_check',
      pipeline_health_log_exists: false,
      watchdog_data_available: false,
      watchdog_data_period_hours: 12,
    },
    {
      timestamp: BASE_TIMESTAMP,
      session_id: 'session-1',
      task_id: 'TASK-001',
      phase: 'execute',
      event: 'compression_test',
      strategies_tested: 3,
      strategies_available: 4,
      strategies_planned: 6,
      implementation_complete: false,
      baseline_tokens_estimated: 10000,
      compression_ratio_measured: 0.65,
      compression_ratio_target: 0.5,
    },
    {
      timestamp: BASE_TIMESTAMP,
      session_id: 'session-1',
      task_id: 'TASK-001',
      phase: 'review',
      event: 'quality_validation',
      pipeline_routing: 'PASS',
      compression_quality: 'PASS',
      label_integrity: 'WARN',
      health_score: 72,
      issues_found: 2,
      issues_critical: 0,
      issues_high: 1,
      issues_medium: 1,
    },
    {
      timestamp: BASE_TIMESTAMP,
      session_id: 'session-1',
      task_id: 'TASK-001',
      phase: 'review',
      event: 'review_complete',
      result: 'VALIDATED',
      report_path: '.claude/reports/test.md',
      recommendation: 'Ship it',
    },
  ];
}

// ---------------------------------------------------------------------------
// readMetricsFile
// ---------------------------------------------------------------------------

describe('readMetricsFile', () => {
  it('parses a valid JSONL file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tc-test-'));
    const file = join(dir, 'metrics.jsonl');
    const metrics = makeMetrics();
    writeFileSync(file, metrics.map((m) => JSON.stringify(m)).join('\n'));

    const result = readMetricsFile(file);
    assert.equal(result.length, metrics.length);
    assert.equal(result[0].event, 'review_start');
    assert.equal(result[0].session_id, 'session-1');
  });

  it('returns empty array for a missing file', () => {
    const result = readMetricsFile('/tmp/does-not-exist-xyz.jsonl');
    assert.deepEqual(result, []);
  });

  it('skips malformed lines and returns the rest', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tc-test-'));
    const file = join(dir, 'metrics.jsonl');
    const good = JSON.stringify({ timestamp: BASE_TIMESTAMP, event: 'review_start' });
    writeFileSync(file, `${good}\nnot-valid-json\n${good}`);

    const result = readMetricsFile(file);
    assert.equal(result.length, 2);
  });

  it('returns empty array for an empty file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tc-test-'));
    const file = join(dir, 'metrics.jsonl');
    writeFileSync(file, '');
    const result = readMetricsFile(file);
    assert.deepEqual(result, []);
  });
});

// ---------------------------------------------------------------------------
// aggregateStats
// ---------------------------------------------------------------------------

describe('aggregateStats', () => {
  it('counts total events and unique sessions', () => {
    const metrics = makeMetrics();
    const stats = aggregateStats(metrics);
    assert.equal(stats.totalEvents, 5);
    assert.equal(stats.totalSessions, 1);
  });

  it('extracts project names', () => {
    const stats = aggregateStats(makeMetrics());
    assert.deepEqual(stats.projects, ['token-compression']);
  });

  it('computes avgHealthScore from quality_validation events', () => {
    const stats = aggregateStats(makeMetrics());
    assert.equal(stats.avgHealthScore, 72);
  });

  it('computes avgCompressionRatio from compression_test events', () => {
    const stats = aggregateStats(makeMetrics());
    assert.equal(stats.avgCompressionRatio, 0.65);
  });

  it('returns null avgCompressionRatio when no measured values', () => {
    const metrics = makeMetrics().map((m) => {
      if (m.event === 'compression_test') {
        return { ...m, compression_ratio_measured: null };
      }
      return m;
    });
    const stats = aggregateStats(metrics);
    assert.equal(stats.avgCompressionRatio, null);
  });

  it('aggregates issue counts by level', () => {
    const stats = aggregateStats(makeMetrics());
    assert.equal(stats.totalIssuesFound, 2);
    assert.equal(stats.issuesByLevel.critical, 0);
    assert.equal(stats.issuesByLevel.high, 1);
    assert.equal(stats.issuesByLevel.medium, 1);
  });

  it('sums strategies_tested and strategies_available', () => {
    const stats = aggregateStats(makeMetrics());
    assert.equal(stats.strategiesTestedTotal, 3);
    assert.equal(stats.strategiesAvailableTotal, 4);
  });

  it('counts review results by result value', () => {
    const stats = aggregateStats(makeMetrics());
    assert.deepEqual(stats.reviewResults, { VALIDATED: 1 });
  });

  it('handles empty metrics gracefully', () => {
    const stats = aggregateStats([]);
    assert.equal(stats.totalEvents, 0);
    assert.equal(stats.totalSessions, 0);
    assert.equal(stats.avgHealthScore, 0);
    assert.equal(stats.avgCompressionRatio, null);
    assert.deepEqual(stats.projects, []);
    assert.deepEqual(stats.reviewResults, {});
  });

  it('handles multiple sessions', () => {
    const m1 = makeMetrics();
    const m2 = makeMetrics().map((m) => ({ ...m, session_id: 'session-2', task_id: 'TASK-002' }));
    const stats = aggregateStats([...m1, ...m2]);
    assert.equal(stats.totalSessions, 2);
    assert.equal(stats.totalEvents, 10);
  });
});

// ---------------------------------------------------------------------------
// computeTrends
// ---------------------------------------------------------------------------

describe('computeTrends', () => {
  it('returns one trend point per unique date', () => {
    const trends = computeTrends(30, makeMetrics());
    assert.equal(trends.length, 1);
    assert.equal(trends[0].date, '2026-04-29');
  });

  it('trend point has correct sessions count from review_start events', () => {
    const trends = computeTrends(30, makeMetrics());
    assert.equal(trends[0].sessions, 1);
  });

  it('trend point reflects avgHealthScore from quality_validation', () => {
    const trends = computeTrends(30, makeMetrics());
    assert.equal(trends[0].avgHealthScore, 72);
  });

  it('trend point includes issuesFound count', () => {
    const trends = computeTrends(30, makeMetrics());
    assert.equal(trends[0].issuesFound, 2);
  });

  it('trend point includes compressionRatio', () => {
    const trends = computeTrends(30, makeMetrics());
    assert.equal(trends[0].compressionRatio, 0.65);
  });

  it('excludes events outside the day window', () => {
    // Give all events an old timestamp (40 days ago)
    const old = makeMetrics().map((m) => ({
      ...m,
      timestamp: new Date(Date.now() - 40 * 24 * 3600 * 1000).toISOString(),
    }));
    const trends = computeTrends(30, old);
    assert.equal(trends.length, 0);
  });

  it('returns empty array for empty metrics', () => {
    const trends = computeTrends(30, []);
    assert.deepEqual(trends, []);
  });

  it('returns trend points sorted by date ascending', () => {
    const day1 = makeMetrics().map((m) => ({
      ...m,
      timestamp: '2026-04-27T10:00:00.000Z',
      session_id: 's1',
    }));
    const day2 = makeMetrics().map((m) => ({
      ...m,
      timestamp: '2026-04-29T10:00:00.000Z',
      session_id: 's2',
    }));
    const trends = computeTrends(30, [...day2, ...day1]);
    assert.equal(trends[0].date, '2026-04-27');
    assert.equal(trends[1].date, '2026-04-29');
  });
});

// ---------------------------------------------------------------------------
// getPhaseDetails
// ---------------------------------------------------------------------------

describe('getPhaseDetails', () => {
  it('groups events by phase', () => {
    const details = getPhaseDetails(makeMetrics());
    assert.ok('execute' in details.phases);
    assert.ok('review' in details.phases);
  });

  it('counts events per phase correctly', () => {
    const details = getPhaseDetails(makeMetrics());
    // execute phase: review_start, pipeline_health_check, compression_test = 3
    assert.equal(details.phases['execute'].eventCount, 3);
    // review phase: quality_validation, review_complete = 2
    assert.equal(details.phases['review'].eventCount, 2);
  });

  it('includes event type names per phase', () => {
    const details = getPhaseDetails(makeMetrics());
    assert.ok(details.phases['execute'].eventTypes.includes('review_start'));
    assert.ok(details.phases['execute'].eventTypes.includes('compression_test'));
  });

  it('parses compression_test events into compressionTests array', () => {
    const details = getPhaseDetails(makeMetrics());
    assert.equal(details.compressionTests.length, 1);
    const ct = details.compressionTests[0];
    assert.equal(ct.sessionId, 'session-1');
    assert.equal(ct.taskId, 'TASK-001');
    assert.equal(ct.strategiesTested, 3);
    assert.equal(ct.strategiesAvailable, 4);
    assert.equal(ct.strategiesPlanned, 6);
    assert.equal(ct.baselineTokensEstimated, 10000);
    assert.equal(ct.compressionRatioMeasured, 0.65);
    assert.equal(ct.compressionRatioTarget, 0.5);
    assert.equal(ct.implementationComplete, false);
  });

  it('parses quality_validation events into qualityValidations array', () => {
    const details = getPhaseDetails(makeMetrics());
    assert.equal(details.qualityValidations.length, 1);
    const qv = details.qualityValidations[0];
    assert.equal(qv.pipelineRouting, 'PASS');
    assert.equal(qv.compressionQuality, 'PASS');
    assert.equal(qv.labelIntegrity, 'WARN');
    assert.equal(qv.healthScore, 72);
    assert.equal(qv.issuesFound, 2);
    assert.equal(qv.issuesCritical, 0);
    assert.equal(qv.issuesHigh, 1);
    assert.equal(qv.issuesMedium, 1);
  });

  it('parses review_complete events into reviewCompletions array', () => {
    const details = getPhaseDetails(makeMetrics());
    assert.equal(details.reviewCompletions.length, 1);
    const rc = details.reviewCompletions[0];
    assert.equal(rc.result, 'VALIDATED');
    assert.equal(rc.reportPath, '.claude/reports/test.md');
    assert.equal(rc.recommendation, 'Ship it');
  });

  it('handles empty metrics gracefully', () => {
    const details = getPhaseDetails([]);
    assert.deepEqual(details.phases, {});
    assert.deepEqual(details.compressionTests, []);
    assert.deepEqual(details.qualityValidations, []);
    assert.deepEqual(details.reviewCompletions, []);
  });

  it('handles events with no phase field under "unknown"', () => {
    const metrics: SessionMetric[] = [
      { timestamp: BASE_TIMESTAMP, event: 'some_event' },
    ];
    const details = getPhaseDetails(metrics);
    assert.ok('unknown' in details.phases);
    assert.equal(details.phases['unknown'].eventCount, 1);
  });

  it('handles null compression_ratio_measured', () => {
    const metrics = makeMetrics().map((m) =>
      m.event === 'compression_test' ? { ...m, compression_ratio_measured: null } : m,
    );
    const details = getPhaseDetails(metrics);
    assert.equal(details.compressionTests[0].compressionRatioMeasured, null);
  });
});

import type { FastifyInstance } from 'fastify';
import { getAnalytics } from '../services/analytics.js';
import {
  getCompanies,
  getCompanyRegistry,
  resolveCompany,
  type CompanyBudget,
} from '../services/company-registry.js';

interface CompanyCost {
  slug: string;
  name: string;
  spend: number;
  budget: CompanyBudget;
  tier: 'ok' | 'warning' | 'throttled' | 'exceeded';
  jobBreakdown: { job: string; cost: number; runs: number }[];
}

function computeTier(spend: number, budget: CompanyBudget): CompanyCost['tier'] {
  if (budget.hard_limit_usd > 0 && spend >= budget.hard_limit_usd) return 'exceeded';
  if (budget.throttle_at_usd > 0 && spend >= budget.throttle_at_usd) return 'throttled';
  if (budget.soft_limit_usd > 0 && spend >= budget.soft_limit_usd) return 'warning';
  return 'ok';
}

export async function costRoutes(app: FastifyInstance) {
  // Per-company cost breakdown
  app.get('/api/costs/by-company', async (request) => {
    const query = request.query as { from?: string; to?: string };

    // Default to first of current month
    const now = new Date();
    const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const from = query.from || defaultFrom;
    const to = query.to || now.toISOString();

    // Get cost data — single computation
    const analytics = getAnalytics(from, to);
    const byJob = analytics.cost.byJob;

    // Get registry data
    const reg = getCompanyRegistry();
    const companies = getCompanies();

    // Aggregate jobs into companies
    const companyAccum = new Map<
      string,
      { spend: number; jobs: Map<string, { cost: number; runs: number }> }
    >();

    // Initialize all companies + platform
    for (const c of companies) {
      companyAccum.set(c.slug, { spend: 0, jobs: new Map() });
    }
    companyAccum.set('platform', { spend: 0, jobs: new Map() });

    for (const entry of byJob) {
      const companySlug = resolveCompany(entry.job);
      let acc = companyAccum.get(companySlug);
      if (!acc) {
        // Unknown company — bucket into platform
        acc = companyAccum.get('platform')!;
      }
      acc.spend += entry.cost;
      const existing = acc.jobs.get(entry.job);
      if (existing) {
        acc.jobs.set(entry.job, {
          cost: existing.cost + entry.cost,
          runs: existing.runs + entry.runs,
        });
      } else {
        acc.jobs.set(entry.job, { cost: entry.cost, runs: entry.runs });
      }
    }

    // Build response
    const result: CompanyCost[] = [];
    let totalSpend = 0;

    for (const c of companies) {
      const acc = companyAccum.get(c.slug)!;
      totalSpend += acc.spend;
      result.push({
        slug: c.slug,
        name: c.name,
        spend: Math.round(acc.spend * 100) / 100,
        budget: c.budget,
        tier: computeTier(acc.spend, c.budget),
        jobBreakdown: [...acc.jobs.entries()]
          .map(([job, data]) => ({ job, ...data }))
          .sort((a, b) => b.cost - a.cost),
      });
    }

    // Platform entry
    const platformAcc = companyAccum.get('platform')!;
    totalSpend += platformAcc.spend;
    result.push({
      slug: 'platform',
      name: 'Platform',
      spend: Math.round(platformAcc.spend * 100) / 100,
      budget: {
        soft_limit_usd: 0,
        throttle_at_usd: 0,
        hard_limit_usd: reg.org.global_budget.hard_limit_usd,
        period: reg.org.global_budget.period,
      },
      tier: 'ok',
      jobBreakdown: [...platformAcc.jobs.entries()]
        .map(([job, data]) => ({ job, ...data }))
        .sort((a, b) => b.cost - a.cost),
    });

    // Sort by spend descending
    result.sort((a, b) => b.spend - a.spend);

    return {
      companies: result,
      totalSpend: Math.round(totalSpend * 100) / 100,
      orgBudget: reg.org.global_budget,
      period: { from: from.slice(0, 10), to: to.slice(0, 10) },
    };
  });
}

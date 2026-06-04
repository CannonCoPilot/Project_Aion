import type { FastifyInstance } from 'fastify';
import {
  getCompanies,
  getCompany,
  getCompanyRegistry,
  type CompanyRegistry,
} from '../services/company-registry.js';

function makePlatformEntry(reg: CompanyRegistry) {
  return {
    slug: 'platform',
    name: 'Platform',
    mission: 'Org-level operations, pipeline agents, and general maintenance',
    tags: ['platform'],
    objectives: [],
    agents: reg.org.platform_agents,
    jobs: reg.org.org_jobs,
    projects: [],
    context_paths: [],
    budget: {
      soft_limit_usd: 0,
      throttle_at_usd: 0,
      hard_limit_usd: reg.org.global_budget.hard_limit_usd,
      period: reg.org.global_budget.period,
    },
  };
}

export async function companyRoutes(app: FastifyInstance) {
  // List all companies + synthetic "platform" entry
  app.get('/api/companies', async () => {
    const reg = getCompanyRegistry();
    const companies = getCompanies();

    return {
      companies: [...companies, makePlatformEntry(reg)],
      org: {
        name: reg.org.name,
        globalBudget: reg.org.global_budget,
      },
    };
  });

  // Single company detail
  app.get('/api/companies/:slug', async (request, reply) => {
    const { slug } = request.params as { slug: string };

    if (slug === 'platform') {
      return makePlatformEntry(getCompanyRegistry());
    }

    const company = getCompany(slug);
    if (!company) {
      return reply.status(404).send({ error: `Company '${slug}' not found` });
    }
    return company;
  });
}

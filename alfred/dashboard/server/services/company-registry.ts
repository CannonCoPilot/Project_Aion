import { readFileSync, statSync, existsSync } from 'node:fs';
import * as yaml from 'js-yaml';
import { config } from '../config.js';

// --- Types ---

export interface CompanyBudget {
  soft_limit_usd: number;
  throttle_at_usd: number;
  hard_limit_usd: number;
  period: string;
}

export interface CompanyObjective {
  id: string;
  description: string;
  quarter: string;
}

export interface Company {
  slug: string;
  name: string;
  mission: string;
  tags: string[];
  objectives: CompanyObjective[];
  agents: string[];
  jobs: string[];
  projects: string[];
  context_paths: string[];
  budget: CompanyBudget;
}

export interface OrgConfig {
  name: string;
  platform_agents: string[];
  org_jobs: string[];
  global_budget: { hard_limit_usd: number; period: string };
}

export interface CompanyRegistry {
  version: number;
  org: OrgConfig;
  companies: Record<string, Company>;
  jobCompanyMap: Record<string, string>;
}

// --- Cache ---

let cached: CompanyRegistry | null = null;
let cachedMtime = 0;

function loadRegistry(): CompanyRegistry {
  if (!existsSync(config.companyRegistryPath)) {
    // Return empty registry if file doesn't exist
    return (
      cached ?? {
        version: 1,
        org: {
          name: process.env.DEFAULT_WORKSPACE || 'MyProject',
          platform_agents: [],
          org_jobs: [],
          global_budget: { hard_limit_usd: 250, period: 'monthly' },
        },
        companies: {},
        jobCompanyMap: {},
      }
    );
  }

  const stat = statSync(config.companyRegistryPath, { throwIfNoEntry: false });
  const mtime = stat?.mtimeMs ?? 0;

  if (cached && mtime === cachedMtime) return cached;

  const content = readFileSync(config.companyRegistryPath, 'utf-8');
  const raw = yaml.load(content) as Record<string, unknown>;

  const orgRaw = raw.org as Record<string, unknown>;
  const companiesRaw = (raw.companies ?? {}) as Record<string, Record<string, unknown>>;
  const jobMapRaw = (raw.job_company_map ?? {}) as Record<string, string>;

  const org: OrgConfig = {
    name: (orgRaw?.name as string) ?? (process.env.DEFAULT_WORKSPACE || 'MyProject'),
    platform_agents: (orgRaw?.platform_agents as string[]) ?? [],
    org_jobs: (orgRaw?.org_jobs as string[]) ?? [],
    global_budget: (orgRaw?.global_budget as { hard_limit_usd: number; period: string }) ?? {
      hard_limit_usd: 250,
      period: 'monthly',
    },
  };

  const companies: Record<string, Company> = {};

  for (const [slug, c] of Object.entries(companiesRaw)) {
    const budgetRaw = (c.budget as Record<string, unknown>) ?? {};
    companies[slug] = {
      slug,
      name: (c.name as string) ?? slug,
      mission: (c.mission as string) ?? '',
      tags: (c.tags as string[]) ?? [],
      objectives: ((c.objectives as CompanyObjective[]) ?? []).map((o) => ({
        id: o.id ?? '',
        description: o.description ?? '',
        quarter: o.quarter ?? '',
      })),
      agents: (c.agents as string[]) ?? [],
      jobs: (c.jobs as string[]) ?? [],
      projects: (c.projects as string[]) ?? [],
      context_paths: (c.context_paths as string[]) ?? [],
      budget: {
        soft_limit_usd: (budgetRaw.soft_limit_usd as number) ?? 0,
        throttle_at_usd: (budgetRaw.throttle_at_usd as number) ?? 0,
        hard_limit_usd: (budgetRaw.hard_limit_usd as number) ?? 0,
        period: (budgetRaw.period as string) ?? 'monthly',
      },
    };
  }

  cached = { version: (raw.version as number) ?? 1, org, companies, jobCompanyMap: jobMapRaw };
  cachedMtime = mtime;
  return cached;
}

// --- Public API ---

export function getCompanyRegistry(): CompanyRegistry {
  return loadRegistry();
}

export function getJobCompanyMap(): Record<string, string> {
  return loadRegistry().jobCompanyMap;
}

export function getCompanies(): Company[] {
  const reg = loadRegistry();
  return Object.values(reg.companies);
}

export function getCompany(slug: string): Company | undefined {
  return loadRegistry().companies[slug];
}

export function resolveCompany(jobName: string): string {
  const map = getJobCompanyMap();
  return map[jobName] ?? 'platform';
}

export function getCompanyProjects(slug: string): string[] {
  if (slug === 'platform') return [];
  const company = getCompany(slug);
  return company?.projects ?? [];
}

export function getCompanyTags(slug: string): string[] {
  if (slug === 'platform') return [];
  const company = getCompany(slug);
  return company?.tags ?? [];
}

/** Reverse lookup: project name -> company slug, or null if not found */
export function getCompanyByProject(projectName: string): string | null {
  const reg = loadRegistry();
  for (const [slug, company] of Object.entries(reg.companies)) {
    if (company.projects.includes(projectName)) return slug;
  }
  return null;
}

/** Get all project names across all companies for "platform" exclusion filtering */
export function getAllCompanyProjects(): string[] {
  const reg = loadRegistry();
  const projects: string[] = [];
  for (const company of Object.values(reg.companies)) {
    projects.push(...company.projects);
  }
  return projects;
}

/** Get all domain tags across all companies for "platform" exclusion filtering */
export function getAllCompanyTags(): string[] {
  const reg = loadRegistry();
  const tags = new Set<string>();
  for (const company of Object.values(reg.companies)) {
    for (const tag of company.tags) tags.add(tag);
  }
  return [...tags];
}

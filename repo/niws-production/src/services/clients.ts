/**
 * Service Clients
 *
 * HTTP clients for communicating with other NIWS pipeline servers:
 * - niws-intake (8033): Articles, stories, outlets
 * - niws-analysis (8034): Bias analysis, framing comparison
 * - research-bus (8015): Perplexity research
 */

import type {
  Article,
  Story,
  Outlet,
  ArticleAnalysis,
  ComparativeAnalysis,
} from '../types.js';

// Service URLs from environment or defaults
const INTAKE_URL = process.env.NIWS_INTAKE_URL || 'http://localhost:8033';
const ANALYSIS_URL = process.env.NIWS_ANALYSIS_URL || 'http://localhost:8034';
const RESEARCH_URL = process.env.RESEARCH_BUS_URL || 'http://localhost:8015';
const TENETS_URL = process.env.TENETS_SERVER_URL || 'http://localhost:8027';

/**
 * HTTP fetch helper with timeout
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeout = 30000
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Generic API call helper
 */
async function apiCall<T>(
  baseUrl: string,
  endpoint: string,
  options: {
    method?: string;
    body?: unknown;
    timeout?: number;
  } = {}
): Promise<{ data: T | null; error: string | null }> {
  try {
    const response = await fetchWithTimeout(
      `${baseUrl}${endpoint}`,
      {
        method: options.method || 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
      },
      options.timeout || 30000
    );

    if (!response.ok) {
      const errorText = await response.text();
      return { data: null, error: `${response.status}: ${errorText}` };
    }

    const data = await response.json();
    return { data: data as T, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { data: null, error: message };
  }
}

// ============================================
// INTAKE CLIENT (niws-intake:8033)
// ============================================

export const intakeClient = {
  baseUrl: INTAKE_URL,

  /**
   * Get article by ID
   */
  async getArticle(articleId: string): Promise<Article | null> {
    const { data } = await apiCall<{ article: Article }>(INTAKE_URL, `/api/articles/${articleId}`);
    return data?.article || null;
  },

  /**
   * Get articles for a story
   */
  async getArticlesForStory(storyId: string): Promise<Article[]> {
    const { data } = await apiCall<{ articles: Article[] }>(INTAKE_URL, `/api/stories/${storyId}/articles`);
    return data?.articles || [];
  },

  /**
   * Get story by ID
   */
  async getStory(storyId: string): Promise<Story | null> {
    const { data } = await apiCall<{ story: Story }>(INTAKE_URL, `/api/stories/${storyId}`);
    return data?.story || null;
  },

  /**
   * List stories with optional filters
   */
  async listStories(options: {
    track?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<{ stories: Story[]; total: number }> {
    const params = new URLSearchParams();
    if (options.track) params.set('track', options.track);
    if (options.limit) params.set('limit', String(options.limit));
    if (options.offset) params.set('offset', String(options.offset));

    const { data } = await apiCall<{ stories: Story[]; total: number }>(
      INTAKE_URL,
      `/api/stories?${params}`
    );
    return data || { stories: [], total: 0 };
  },

  /**
   * Get outlet by ID
   */
  async getOutlet(outletId: string): Promise<Outlet | null> {
    const { data } = await apiCall<{ outlet: Outlet }>(INTAKE_URL, `/api/outlets/${outletId}`);
    return data?.outlet || null;
  },

  /**
   * List all outlets
   */
  async listOutlets(): Promise<Outlet[]> {
    const { data } = await apiCall<{ outlets: Outlet[] }>(INTAKE_URL, '/api/outlets');
    return data?.outlets || [];
  },

  /**
   * Health check
   */
  async health(): Promise<{ healthy: boolean; url: string }> {
    const { data, error } = await apiCall<{ status: string }>(INTAKE_URL, '/api/health', { timeout: 5000 });
    return { healthy: !error && (data?.status === 'ok' || data?.status === 'healthy'), url: INTAKE_URL };
  },
};

// ============================================
// ANALYSIS CLIENT (niws-analysis:8034)
// ============================================

export const analysisClient = {
  baseUrl: ANALYSIS_URL,

  /**
   * Get analysis for an article
   */
  async getArticleAnalysis(articleId: string): Promise<ArticleAnalysis | null> {
    const { data } = await apiCall<{ analysis: ArticleAnalysis }>(
      ANALYSIS_URL,
      `/api/articles/${articleId}/analysis`
    );
    return data?.analysis || null;
  },

  /**
   * Get comparative analysis for a story
   */
  async getComparativeAnalysis(storyId: string): Promise<ComparativeAnalysis | null> {
    const { data } = await apiCall<{ analysis: ComparativeAnalysis }>(
      ANALYSIS_URL,
      `/api/stories/${storyId}/comparative`
    );
    return data?.analysis || null;
  },

  /**
   * Request analysis for an article
   */
  async analyzeArticle(articleId: string): Promise<{ analysisId: string } | null> {
    const { data } = await apiCall<{ analysisId: string }>(
      ANALYSIS_URL,
      `/api/analyze/article`,
      { method: 'POST', body: { articleId } }
    );
    return data;
  },

  /**
   * Request comparative analysis for a story
   */
  async analyzeStory(storyId: string): Promise<{ analysisId: string } | null> {
    const { data } = await apiCall<{ analysisId: string }>(
      ANALYSIS_URL,
      `/api/analyze/story`,
      { method: 'POST', body: { storyId } }
    );
    return data;
  },

  /**
   * Health check
   */
  async health(): Promise<{ healthy: boolean; url: string }> {
    const { data, error } = await apiCall<{ status: string }>(ANALYSIS_URL, '/api/health', { timeout: 5000 });
    return { healthy: !error && (data?.status === 'ok' || data?.status === 'healthy' || data?.status === 'degraded'), url: ANALYSIS_URL };
  },
};

// ============================================
// RESEARCH CLIENT (research-bus:8015)
// ============================================

export const researchClient = {
  baseUrl: RESEARCH_URL,

  /**
   * Search using Perplexity (via research-bus)
   */
  async search(query: string, options: {
    mode?: 'fast' | 'deep';
    sources?: string[];
  } = {}): Promise<{ results: string; sources: string[] } | null> {
    const { data } = await apiCall<{ results: string; sources: string[] }>(
      RESEARCH_URL,
      '/api/search',
      {
        method: 'POST',
        body: { query, mode: options.mode || 'fast', sources: options.sources },
        timeout: 60000, // Longer timeout for research
      }
    );
    return data;
  },

  /**
   * Get coverage analysis for a topic across outlets
   */
  async getCoverageAnalysis(topic: string, timeframe: string = '7d'): Promise<{
    coverage: Record<string, unknown>;
    differences: string[];
  } | null> {
    const { data } = await apiCall<{ coverage: Record<string, unknown>; differences: string[] }>(
      RESEARCH_URL,
      '/api/coverage',
      {
        method: 'POST',
        body: { topic, timeframe },
        timeout: 60000,
      }
    );
    return data;
  },

  /**
   * Health check
   */
  async health(): Promise<{ healthy: boolean; url: string }> {
    const { data, error } = await apiCall<{ status: string }>(RESEARCH_URL, '/api/health', { timeout: 5000 });
    return { healthy: !error && (data?.status === 'ok' || data?.status === 'healthy'), url: RESEARCH_URL };
  },
};

// ============================================
// TENETS CLIENT (tenets-server:8027)
// ============================================

export interface TenetsEvaluation {
  evaluationId: string;
  overallAssessment: 'affirm' | 'caution' | 'reject';
  tenetScores: Record<number, number>;
  violations: Array<{
    tenetId: number;
    severity: string;
    description: string;
    counterfeitPattern?: string;
  }>;
  counterfeitsMatched: Array<{
    tenetId: number;
    tenetName: string;
    counterfeitPattern: string;
    confidence: number;
    explanation: string;
  }>;
  recommendations: string[];
}

export const tenetsClient = {
  baseUrl: TENETS_URL,

  /**
   * Evaluate a decision against tenets
   */
  async evaluate(
    decisionText: string,
    stakeholders: string[],
    depth: 'quick' | 'standard' | 'deep' = 'standard'
  ): Promise<TenetsEvaluation | null> {
    const { data } = await apiCall<TenetsEvaluation>(
      TENETS_URL,
      '/api/evaluate',
      {
        method: 'POST',
        body: { decision_text: decisionText, stakeholders, depth },
        timeout: 30000,
      }
    );
    return data;
  },

  /**
   * Get all tenets
   */
  async getTenets(): Promise<Array<{ id: number; name: string; definition: string }>> {
    const { data } = await apiCall<{ tenets: Array<{ id: number; name: string; definition: string }> }>(
      TENETS_URL,
      '/api/tenets'
    );
    return data?.tenets || [];
  },

  /**
   * Health check
   */
  async health(): Promise<{ healthy: boolean; url: string }> {
    const { data, error } = await apiCall<{ status: string }>(TENETS_URL, '/api/health', { timeout: 5000 });
    return { healthy: !error && (data?.status === 'ok' || data?.status === 'healthy'), url: TENETS_URL };
  },
};

// ============================================
// HEALTH CHECK ALL SERVICES
// ============================================

export interface ServiceHealth {
  healthy: boolean;
  url: string;
  responseTimeMs?: number;
  error?: string;
}

export interface AllServicesHealth {
  healthy: boolean;
  services: {
    intake: ServiceHealth;
    analysis: ServiceHealth;
    research: ServiceHealth;
    tenets: ServiceHealth;
  };
  summary: {
    totalServices: number;
    healthyCount: number;
    unhealthyCount: number;
  };
}

async function timedHealthCheck(
  healthFn: () => Promise<{ healthy: boolean; url: string }>
): Promise<ServiceHealth> {
  const start = Date.now();
  try {
    const result = await healthFn();
    return {
      ...result,
      responseTimeMs: Date.now() - start,
    };
  } catch (error) {
    return {
      healthy: false,
      url: '',
      responseTimeMs: Date.now() - start,
      error: error instanceof Error ? error.message : 'Health check failed',
    };
  }
}

export async function checkAllServices(): Promise<AllServicesHealth> {
  const [intake, analysis, research, tenets] = await Promise.all([
    timedHealthCheck(() => intakeClient.health()),
    timedHealthCheck(() => analysisClient.health()),
    timedHealthCheck(() => researchClient.health()),
    timedHealthCheck(() => tenetsClient.health()),
  ]);

  const services = { intake, analysis, research, tenets };
  const healthyCount = [intake, analysis, research, tenets].filter(s => s.healthy).length;

  return {
    healthy: healthyCount === 4,
    services,
    summary: {
      totalServices: 4,
      healthyCount,
      unhealthyCount: 4 - healthyCount,
    },
  };
}

/**
 * Quick check if critical services are available (tenets + intake)
 */
export async function checkCriticalServices(): Promise<{ healthy: boolean; details: Record<string, boolean> }> {
  const [intake, tenets] = await Promise.all([
    intakeClient.health(),
    tenetsClient.health(),
  ]);

  return {
    healthy: intake.healthy && tenets.healthy,
    details: {
      intake: intake.healthy,
      tenets: tenets.healthy,
    },
  };
}

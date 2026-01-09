import type { Article, Story, Outlet, ArticleAnalysis, ComparativeAnalysis, Script, StoryBrief } from '../types.js';

const INTAKE_URL = process.env.NIWS_INTAKE_URL || 'http://localhost:8033';
const ANALYSIS_URL = process.env.NIWS_ANALYSIS_URL || 'http://localhost:8034';
const PRODUCTION_URL = process.env.NIWS_PRODUCTION_URL || 'http://localhost:8035';

// Default timeout for fetch requests (30 seconds)
const DEFAULT_TIMEOUT_MS = 30000;

class BaseClient {
  constructor(protected baseUrl: string) {}

  protected async get<T>(path: string): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        signal: controller.signal
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return response.json() as Promise<T>;
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`Request to ${this.baseUrl}${path} timed out after ${DEFAULT_TIMEOUT_MS}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  protected async post<T>(path: string, body?: unknown): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return response.json() as Promise<T>;
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`Request to ${this.baseUrl}${path} timed out after ${DEFAULT_TIMEOUT_MS}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  async health(): Promise<{ status: string; timestamp: string }> {
    return this.get('/api/health');
  }
}

// === INTAKE CLIENT ===

export class IntakeClient extends BaseClient {
  constructor() {
    super(INTAKE_URL);
  }

  async getOutlets(options?: { lean?: string; limit?: number; offset?: number }): Promise<{ outlets: Outlet[]; total: number }> {
    const params = new URLSearchParams();
    if (options?.lean) params.set('lean', options.lean);
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.offset) params.set('offset', String(options.offset));
    const query = params.toString();
    return this.get(`/api/outlets${query ? `?${query}` : ''}`);
  }

  async getOutlet(id: string): Promise<Outlet> {
    return this.get(`/api/outlets/${id}`);
  }

  async getArticles(options?: { outletId?: string; storyId?: string; since?: string; limit?: number }): Promise<{ articles: Article[]; total: number }> {
    const params = new URLSearchParams();
    if (options?.outletId) params.set('outletId', options.outletId);
    if (options?.storyId) params.set('storyId', options.storyId);
    if (options?.since) params.set('since', options.since);
    if (options?.limit) params.set('limit', String(options.limit));
    const query = params.toString();
    return this.get(`/api/articles${query ? `?${query}` : ''}`);
  }

  async getArticle(id: string): Promise<Article> {
    return this.get(`/api/articles/${id}`);
  }

  async getStories(options?: { track?: string; since?: string; limit?: number }): Promise<{ stories: Story[]; total: number }> {
    const params = new URLSearchParams();
    if (options?.track) params.set('track', options.track);
    if (options?.since) params.set('since', options.since);
    if (options?.limit) params.set('limit', String(options.limit));
    const query = params.toString();
    return this.get(`/api/stories${query ? `?${query}` : ''}`);
  }

  async getStory(id: string): Promise<Story> {
    return this.get(`/api/stories/${id}`);
  }

  async getStoryArticles(storyId: string): Promise<{ articles: Article[] }> {
    return this.get(`/api/stories/${storyId}/articles`);
  }
}

// === ANALYSIS CLIENT ===

export class AnalysisClient extends BaseClient {
  constructor() {
    super(ANALYSIS_URL);
  }

  async getAnalyses(options?: { articleId?: string; storyId?: string; type?: string }): Promise<{ analyses: ArticleAnalysis[]; total: number }> {
    const params = new URLSearchParams();
    if (options?.articleId) params.set('articleId', options.articleId);
    if (options?.storyId) params.set('storyId', options.storyId);
    if (options?.type) params.set('type', options.type);
    const query = params.toString();
    return this.get(`/api/analyses${query ? `?${query}` : ''}`);
  }

  async getAnalysis(id: string): Promise<ArticleAnalysis> {
    return this.get(`/api/analyses/${id}`);
  }

  async getStoryAnalyses(storyId: string): Promise<{ analyses: ArticleAnalysis[]; comparative: ComparativeAnalysis }> {
    return this.get(`/api/analyses/story/${storyId}`);
  }

  async analyze(articleId: string, type: 'bias' | 'framing' | 'neutral'): Promise<{ analysisId: string; status: string; result?: unknown }> {
    return this.post('/api/analyze', { articleId, type });
  }

  async compare(storyId: string, articleIds: string[]): Promise<{ comparisonId: string; differences: unknown[] }> {
    return this.post('/api/compare', { storyId, articleIds });
  }
}

// === PRODUCTION CLIENT ===

export class ProductionClient extends BaseClient {
  constructor() {
    super(PRODUCTION_URL);
  }

  async getScripts(options?: { storyId?: string; status?: string; limit?: number }): Promise<{ scripts: Script[]; total: number }> {
    const params = new URLSearchParams();
    if (options?.storyId) params.set('storyId', options.storyId);
    if (options?.status) params.set('status', options.status);
    if (options?.limit) params.set('limit', String(options.limit));
    const query = params.toString();
    return this.get(`/api/scripts${query ? `?${query}` : ''}`);
  }

  async getScript(id: string): Promise<Script> {
    return this.get(`/api/scripts/${id}`);
  }

  async getScriptSections(scriptId: string): Promise<{ sections: unknown[] }> {
    return this.get(`/api/scripts/${scriptId}/sections`);
  }

  async generateScript(storyId: string, briefId?: string, options?: unknown): Promise<{ scriptId: string; status: string }> {
    return this.post('/api/scripts/generate', { storyId, briefId, options });
  }

  async getBriefs(options?: { storyId?: string; limit?: number }): Promise<{ briefs: StoryBrief[]; total: number }> {
    const params = new URLSearchParams();
    if (options?.storyId) params.set('storyId', options.storyId);
    if (options?.limit) params.set('limit', String(options.limit));
    const query = params.toString();
    return this.get(`/api/briefs${query ? `?${query}` : ''}`);
  }

  async getBrief(id: string): Promise<StoryBrief> {
    return this.get(`/api/briefs/${id}`);
  }

  async createBrief(storyId: string): Promise<{ briefId: string; brief: StoryBrief }> {
    return this.post('/api/briefs/create', { storyId });
  }
}

// Singleton instances
export const intakeClient = new IntakeClient();
export const analysisClient = new AnalysisClient();
export const productionClient = new ProductionClient();

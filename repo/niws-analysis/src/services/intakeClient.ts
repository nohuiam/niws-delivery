/**
 * Intake Client
 *
 * HTTP client for communicating with niws-intake server.
 * Fetches articles and outlet information for analysis.
 */

import type { Article, Outlet, Story } from '../types.js';

const INTAKE_BASE_URL = process.env.NIWS_INTAKE_URL || 'http://localhost:8033';
const DEFAULT_TIMEOUT_MS = 30000;

export class IntakeClient {
  private baseUrl: string;
  private timeoutMs: number;

  constructor(baseUrl?: string, timeoutMs?: number) {
    this.baseUrl = baseUrl || INTAKE_BASE_URL;
    this.timeoutMs = timeoutMs || DEFAULT_TIMEOUT_MS;
  }

  /**
   * Fetch with timeout and proper error handling
   */
  private async fetchWithTimeout(url: string): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, { signal: controller.signal });
      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Parse JSON response with proper error handling
   */
  private async parseJsonResponse<T>(response: Response, context: string): Promise<T> {
    try {
      return await response.json() as T;
    } catch (error) {
      throw new Error(`Failed to parse JSON response for ${context}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async getArticle(articleId: string): Promise<Article> {
    const response = await this.fetchWithTimeout(`${this.baseUrl}/api/articles/${articleId}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch article ${articleId}: ${response.status} ${response.statusText}`);
    }
    return this.parseJsonResponse<Article>(response, `article ${articleId}`);
  }

  async getArticles(options: {
    outletId?: string;
    storyId?: string;
    since?: string;
    limit?: number;
  } = {}): Promise<{ articles: Article[]; total: number }> {
    const params = new URLSearchParams();
    if (options.outletId) params.set('outletId', options.outletId);
    if (options.storyId) params.set('storyId', options.storyId);
    if (options.since) params.set('since', options.since);
    if (options.limit) params.set('limit', options.limit.toString());

    const response = await this.fetchWithTimeout(`${this.baseUrl}/api/articles?${params}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch articles: ${response.status} ${response.statusText}`);
    }
    return this.parseJsonResponse<{ articles: Article[]; total: number }>(response, 'articles list');
  }

  async getOutlet(outletId: string): Promise<Outlet> {
    const response = await this.fetchWithTimeout(`${this.baseUrl}/api/outlets/${outletId}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch outlet ${outletId}: ${response.status} ${response.statusText}`);
    }
    return this.parseJsonResponse<Outlet>(response, `outlet ${outletId}`);
  }

  async getOutlets(options: {
    lean?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<{ outlets: Outlet[]; total: number }> {
    const params = new URLSearchParams();
    if (options.lean) params.set('lean', options.lean);
    if (options.limit) params.set('limit', options.limit.toString());
    if (options.offset) params.set('offset', options.offset.toString());

    const response = await this.fetchWithTimeout(`${this.baseUrl}/api/outlets?${params}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch outlets: ${response.status} ${response.statusText}`);
    }
    return this.parseJsonResponse<{ outlets: Outlet[]; total: number }>(response, 'outlets list');
  }

  async getStory(storyId: string): Promise<Story> {
    const response = await this.fetchWithTimeout(`${this.baseUrl}/api/stories/${storyId}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch story ${storyId}: ${response.status} ${response.statusText}`);
    }
    return this.parseJsonResponse<Story>(response, `story ${storyId}`);
  }

  async getStoryArticles(storyId: string): Promise<{ articles: Article[] }> {
    const response = await this.fetchWithTimeout(`${this.baseUrl}/api/stories/${storyId}/articles`);
    if (!response.ok) {
      throw new Error(`Failed to fetch story articles ${storyId}: ${response.status} ${response.statusText}`);
    }
    return this.parseJsonResponse<{ articles: Article[] }>(response, `story ${storyId} articles`);
  }

  async checkHealth(): Promise<boolean> {
    try {
      const response = await this.fetchWithTimeout(`${this.baseUrl}/api/health`);
      return response.ok;
    } catch {
      return false;
    }
  }
}

// Singleton instance
let intakeClient: IntakeClient | null = null;
let intakeClientBaseUrl: string | undefined;

export function getIntakeClient(baseUrl?: string): IntakeClient {
  if (!intakeClient) {
    intakeClient = new IntakeClient(baseUrl);
    intakeClientBaseUrl = baseUrl;
  } else if (baseUrl !== undefined && baseUrl !== intakeClientBaseUrl) {
    console.warn(`[IntakeClient] Singleton already initialized with different baseUrl. Ignoring new baseUrl: ${baseUrl}`);
  }
  return intakeClient;
}

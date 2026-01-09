/**
 * Bias Analyzer
 *
 * Core analysis engine that uses Claude API to analyze articles for bias.
 * Supports individual article analysis and comparative analysis across outlets.
 */

import Anthropic from '@anthropic-ai/sdk';
import { v4 as uuidv4 } from 'uuid';
import { getAnalysisDatabase, AnalysisDatabase } from '../database/analysisDatabase.js';
import { getIntakeClient, IntakeClient } from './intakeClient.js';
import {
  validateBiasResult,
  validateAnalysisOutput,
  parseJsonResponse,
} from './outputValidator.js';
import { getWebSocketServer } from '../websocket/server.js';
import {
  BIAS_ANALYSIS_SYSTEM_PROMPT,
  COMPARATIVE_ANALYSIS_SYSTEM_PROMPT,
  FRAMING_DIFFERENCES_SYSTEM_PROMPT,
  NEUTRAL_ALTERNATIVE_SYSTEM_PROMPT,
  getBiasAnalysisPrompt,
  getComparativeAnalysisPrompt,
  getFramingDifferencesPrompt,
  getNeutralAlternativePrompt,
} from '../prompts/templates.js';
import { logger } from '../logging/index.js';
import { getApiKeyManager, ApiKeyManager } from './apiKeyManager.js';
import {
  claudeApiDuration,
  claudeApiTotal,
  analysisCounter,
  activeAnalyses,
} from '../metrics/index.js';
import type {
  Article,
  Outlet,
  BiasResult,
  ArticleAnalysis,
  ComparativeAnalysis,
  FramingDifference,
  ValidationResult,
  AnalysisType,
} from '../types.js';

const DEFAULT_MODEL = 'claude-sonnet-4-20250514';

// Security limits
const MAX_CONTENT_LENGTH = 100000; // ~100KB per article
const MAX_TITLE_LENGTH = 500;
const MAX_ARTICLES_FOR_COMPARISON = 10;

/**
 * Validate and truncate content to prevent DoS and prompt injection via length
 */
function validateContentLength(content: string, maxLength: number, fieldName: string): string {
  if (content.length > maxLength) {
    logger.warn(`${fieldName} exceeds ${maxLength} chars, truncating`, { fieldName, maxLength, actualLength: content.length });
    return content.slice(0, maxLength) + '... [TRUNCATED]';
  }
  return content;
}

export interface AnalyzerConfig {
  apiKey?: string;
  model?: string;
  validateOutput?: boolean;
  rejectOnViolation?: boolean;
  intakeBaseUrl?: string;
  dbPath?: string;
}

export class BiasAnalyzer {
  private client: Anthropic | null = null;
  private model: string;
  private db: AnalysisDatabase;
  private intakeClient: IntakeClient;
  private validateOutput: boolean;
  private rejectOnViolation: boolean;
  private keyManager: ApiKeyManager;
  private configApiKey?: string;
  private keyChangeHandler: ((newKey: string | null) => void) | null = null;

  constructor(config: AnalyzerConfig = {}) {
    this.keyManager = getApiKeyManager();
    this.configApiKey = config.apiKey;

    // Use config API key if provided, otherwise use key manager
    const apiKey = config.apiKey || this.keyManager.getKey();

    if (apiKey) {
      this.client = new Anthropic({ apiKey });
      logger.info('BiasAnalyzer initialized with API key', { source: config.apiKey ? 'config' : this.keyManager.getKeySource() });
    } else {
      logger.warn('No ANTHROPIC_API_KEY found. Analysis will use mock responses.');
    }

    this.model = config.model || DEFAULT_MODEL;
    this.db = getAnalysisDatabase(config.dbPath);
    this.intakeClient = getIntakeClient(config.intakeBaseUrl);
    this.validateOutput = config.validateOutput ?? true;
    this.rejectOnViolation = config.rejectOnViolation ?? false;

    // Listen for API key rotation (only if not using config-provided key)
    if (!config.apiKey) {
      this.keyChangeHandler = (newKey: string | null) => {
        logger.info('API key rotated, recreating Anthropic client');
        if (newKey) {
          this.client = new Anthropic({ apiKey: newKey });
        } else {
          this.client = null;
          logger.warn('API key removed, analysis will use mock responses');
        }
      };
      this.keyManager.on('keyChanged', this.keyChangeHandler);
    }
  }

  /**
   * Clean up resources (remove event listeners)
   */
  stop(): void {
    if (this.keyChangeHandler) {
      this.keyManager.removeListener('keyChanged', this.keyChangeHandler);
      this.keyChangeHandler = null;
    }
  }

  /**
   * Analyze a single article for bias
   */
  async analyzeArticle(
    articleId: string,
    analysisType: AnalysisType = 'bias'
  ): Promise<{ analysis: ArticleAnalysis; validation?: ValidationResult }> {
    // Create analysis record
    const analysis = this.db.createAnalysis(articleId, analysisType);
    const startTime = Date.now();

    // Track active analysis
    activeAnalyses.inc();

    // Emit WebSocket event
    const ws = getWebSocketServer();
    ws.emitAnalysisStarted(analysis.id, articleId);

    try {
      // Fetch article and outlet from intake
      const article = await this.intakeClient.getArticle(articleId);
      const outlet = await this.intakeClient.getOutlet(article.outletId);

      // Update status to processing
      this.db.updateAnalysisStatus(analysis.id, 'processing');

      // Validate content lengths to prevent DoS
      const safeTitle = validateContentLength(article.title, MAX_TITLE_LENGTH, 'title');
      const safeContent = validateContentLength(article.content, MAX_CONTENT_LENGTH, 'content');

      // Generate prompt
      const prompt = getBiasAnalysisPrompt({
        title: safeTitle,
        content: safeContent,
        outletName: outlet.name,
        outletLean: outlet.politicalLean,
        publishedAt: article.publishedAt,
      });

      // Call Claude API
      const result = await this.callClaude(BIAS_ANALYSIS_SYSTEM_PROMPT, prompt);
      const biasResult = parseJsonResponse<BiasResult>(result.content);

      // Validate result structure
      const structureValidation = validateBiasResult(biasResult);
      if (!structureValidation.valid) {
        throw new Error('Invalid result structure from LLM');
      }

      // Validate output content
      let validation: ValidationResult | undefined;
      if (this.validateOutput) {
        validation = validateAnalysisOutput(biasResult);
        if (this.rejectOnViolation && !validation.valid) {
          throw new Error('Analysis rejected: output failed neutrality validation');
        }
      }

      const processingTimeMs = Date.now() - startTime;

      // Complete analysis
      this.db.completeAnalysis(
        analysis.id,
        biasResult,
        this.model,
        processingTimeMs,
        result.promptTokens,
        result.completionTokens
      );

      const completedAnalysis = this.db.getAnalysisById(analysis.id)!;
      ws.emitAnalysisComplete(analysis.id, articleId, (completedAnalysis.result || {}) as Record<string, unknown>);

      // Track metrics
      activeAnalyses.dec();
      analysisCounter.inc({ type: analysisType, status: 'success' });

      return { analysis: completedAnalysis, validation };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.db.failAnalysis(analysis.id, errorMessage);
      const failedAnalysis = this.db.getAnalysisById(analysis.id)!;
      ws.emitAnalysisFailed(analysis.id, articleId, errorMessage);

      // Track metrics
      activeAnalyses.dec();
      analysisCounter.inc({ type: analysisType, status: 'failed' });

      return { analysis: failedAnalysis };
    }
  }

  /**
   * Analyze article with inline content (no intake fetch)
   */
  async analyzeArticleContent(params: {
    articleId: string;
    title: string;
    content: string;
    outletName: string;
    outletLean: string;
    publishedAt: string;
    analysisType?: AnalysisType;
  }): Promise<{ analysis: ArticleAnalysis; validation?: ValidationResult }> {
    const analysisType = params.analysisType || 'bias';
    const analysis = this.db.createAnalysis(params.articleId, analysisType);
    const startTime = Date.now();

    // Track active analysis
    activeAnalyses.inc();

    // Emit WebSocket event
    const ws = getWebSocketServer();
    ws.emitAnalysisStarted(analysis.id, params.articleId);

    try {
      this.db.updateAnalysisStatus(analysis.id, 'processing');

      // Validate content lengths to prevent DoS
      const safeTitle = validateContentLength(params.title, MAX_TITLE_LENGTH, 'title');
      const safeContent = validateContentLength(params.content, MAX_CONTENT_LENGTH, 'content');

      const prompt = getBiasAnalysisPrompt({
        title: safeTitle,
        content: safeContent,
        outletName: params.outletName,
        outletLean: params.outletLean,
        publishedAt: params.publishedAt,
      });

      const result = await this.callClaude(BIAS_ANALYSIS_SYSTEM_PROMPT, prompt);
      const biasResult = parseJsonResponse<BiasResult>(result.content);

      const structureValidation = validateBiasResult(biasResult);
      if (!structureValidation.valid) {
        throw new Error('Invalid result structure from LLM');
      }

      let validation: ValidationResult | undefined;
      if (this.validateOutput) {
        validation = validateAnalysisOutput(biasResult);
        if (this.rejectOnViolation && !validation.valid) {
          throw new Error('Analysis rejected: output failed neutrality validation');
        }
      }

      const processingTimeMs = Date.now() - startTime;

      this.db.completeAnalysis(
        analysis.id,
        biasResult,
        this.model,
        processingTimeMs,
        result.promptTokens,
        result.completionTokens
      );

      const completedAnalysis = this.db.getAnalysisById(analysis.id)!;
      ws.emitAnalysisComplete(analysis.id, params.articleId, (completedAnalysis.result || {}) as Record<string, unknown>);

      // Track metrics
      activeAnalyses.dec();
      analysisCounter.inc({ type: analysisType, status: 'success' });

      return { analysis: completedAnalysis, validation };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.db.failAnalysis(analysis.id, errorMessage);
      const failedAnalysis = this.db.getAnalysisById(analysis.id)!;
      ws.emitAnalysisFailed(analysis.id, params.articleId, errorMessage);

      // Track metrics
      activeAnalyses.dec();
      analysisCounter.inc({ type: analysisType, status: 'failed' });

      return { analysis: failedAnalysis };
    }
  }

  /**
   * Compare coverage across multiple articles
   */
  async compareCoverage(
    storyId: string,
    articleIds: string[]
  ): Promise<{ comparison: ComparativeAnalysis; analyses: ArticleAnalysis[] }> {
    if (articleIds.length < 2) {
      throw new Error('At least 2 articles required for comparison');
    }
    if (articleIds.length > MAX_ARTICLES_FOR_COMPARISON) {
      throw new Error(`Maximum ${MAX_ARTICLES_FOR_COMPARISON} articles allowed for comparison`);
    }

    const comparison = this.db.createComparison(storyId, articleIds);
    const startTime = Date.now();

    // Emit WebSocket event
    const ws = getWebSocketServer();
    ws.emitComparisonStarted(comparison.id, storyId);

    try {
      // Analyze each article first
      const analyses: ArticleAnalysis[] = [];
      const articleSummaries: Array<{
        outletName: string;
        outletLean: string;
        title: string;
        summary: string;
      }> = [];

      for (const articleId of articleIds) {
        // Check if already analyzed
        let analysis = this.db.getAnalysisByArticleId(articleId);
        if (!analysis || analysis.status !== 'complete') {
          const result = await this.analyzeArticle(articleId);
          analysis = result.analysis;
        }
        analyses.push(analysis);

        // Get article info for comparison
        const article = await this.intakeClient.getArticle(articleId);
        const outlet = await this.intakeClient.getOutlet(article.outletId);

        articleSummaries.push({
          outletName: outlet.name,
          outletLean: outlet.politicalLean,
          title: article.title,
          summary: analysis.result?.summary || 'No summary available',
        });
      }

      // Get story topic
      const story = await this.intakeClient.getStory(storyId);

      // Generate comparative analysis
      const prompt = getComparativeAnalysisPrompt({
        storyTopic: story.title,
        articles: articleSummaries,
      });

      const result = await this.callClaude(COMPARATIVE_ANALYSIS_SYSTEM_PROMPT, prompt);
      const comparisonResult = parseJsonResponse<{
        framingDifferences: FramingDifference[];
        overallAssessment: string;
      }>(result.content);

      const processingTimeMs = Date.now() - startTime;

      this.db.completeComparison(
        comparison.id,
        comparisonResult.framingDifferences,
        comparisonResult.overallAssessment,
        processingTimeMs
      );

      const completedComparison = this.db.getComparisonById(comparison.id)!;
      ws.emitComparisonComplete(comparison.id, storyId, completedComparison.framingDifferences || []);
      return { comparison: completedComparison, analyses };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.db.failComparison(comparison.id, errorMessage);
      const failedComparison = this.db.getComparisonById(comparison.id)!;
      // Note: No emitComparisonFailed method exists yet, could add later
      return { comparison: failedComparison, analyses: [] };
    }
  }

  /**
   * Compare coverage with inline article data
   */
  async compareArticles(params: {
    storyId: string;
    storyTopic: string;
    articles: Array<{
      articleId: string;
      title: string;
      content: string;
      outletName: string;
      outletLean: string;
      publishedAt: string;
    }>;
  }): Promise<{ comparison: ComparativeAnalysis; analyses: ArticleAnalysis[] }> {
    if (params.articles.length < 2) {
      throw new Error('At least 2 articles required for comparison');
    }
    if (params.articles.length > MAX_ARTICLES_FOR_COMPARISON) {
      throw new Error(`Maximum ${MAX_ARTICLES_FOR_COMPARISON} articles allowed for comparison`);
    }

    const articleIds = params.articles.map(a => a.articleId);
    const comparison = this.db.createComparison(params.storyId, articleIds);
    const startTime = Date.now();

    // Emit WebSocket event
    const ws = getWebSocketServer();
    ws.emitComparisonStarted(comparison.id, params.storyId);

    try {
      // Analyze each article
      const analyses: ArticleAnalysis[] = [];
      const articleSummaries: Array<{
        outletName: string;
        outletLean: string;
        title: string;
        summary: string;
      }> = [];

      for (const article of params.articles) {
        const result = await this.analyzeArticleContent(article);
        analyses.push(result.analysis);

        articleSummaries.push({
          outletName: article.outletName,
          outletLean: article.outletLean,
          title: article.title,
          summary: result.analysis.result?.summary || 'No summary available',
        });
      }

      // Generate comparative analysis
      const prompt = getComparativeAnalysisPrompt({
        storyTopic: params.storyTopic,
        articles: articleSummaries,
      });

      const result = await this.callClaude(COMPARATIVE_ANALYSIS_SYSTEM_PROMPT, prompt);
      const comparisonResult = parseJsonResponse<{
        framingDifferences: FramingDifference[];
        overallAssessment: string;
      }>(result.content);

      const processingTimeMs = Date.now() - startTime;

      this.db.completeComparison(
        comparison.id,
        comparisonResult.framingDifferences,
        comparisonResult.overallAssessment,
        processingTimeMs
      );

      const completedComparison = this.db.getComparisonById(comparison.id)!;
      ws.emitComparisonComplete(comparison.id, params.storyId, completedComparison.framingDifferences || []);
      return { comparison: completedComparison, analyses };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.db.failComparison(comparison.id, errorMessage);
      const failedComparison = this.db.getComparisonById(comparison.id)!;
      // Note: No emitComparisonFailed method exists yet, could add later
      return { comparison: failedComparison, analyses: [] };
    }
  }

  /**
   * Get framing differences for a concept
   */
  async getFramingDifferences(params: {
    concept: string;
    examples: Array<{
      outletName: string;
      outletLean: string;
      phrase: string;
    }>;
  }): Promise<FramingDifference[]> {
    const prompt = getFramingDifferencesPrompt(params);
    const result = await this.callClaude(FRAMING_DIFFERENCES_SYSTEM_PROMPT, prompt);
    return parseJsonResponse<FramingDifference[]>(result.content);
  }

  /**
   * Get neutral alternative for a term
   */
  async getNeutralAlternative(term: string, context?: string): Promise<{
    original: string;
    alternatives: string[];
    explanation: string;
  }> {
    const prompt = getNeutralAlternativePrompt({ term, context });
    const result = await this.callClaude(NEUTRAL_ALTERNATIVE_SYSTEM_PROMPT, prompt);
    return parseJsonResponse(result.content);
  }

  /**
   * Get analysis by ID
   */
  getAnalysisById(id: string): ArticleAnalysis | null {
    return this.db.getAnalysisById(id);
  }

  /**
   * Get analysis by article ID
   */
  getAnalysisByArticleId(articleId: string): ArticleAnalysis | null {
    return this.db.getAnalysisByArticleId(articleId);
  }

  /**
   * Get analyses by story ID
   */
  getAnalysesByStoryId(storyId: string) {
    return this.db.getAnalysesByStoryId(storyId);
  }

  /**
   * Get pending analyses
   */
  getPendingAnalyses(limit = 10): ArticleAnalysis[] {
    return this.db.getPendingAnalyses(limit);
  }

  /**
   * Retry a failed analysis (updates existing record instead of creating new)
   */
  async retryAnalysis(id: string): Promise<{ analysis: ArticleAnalysis; validation?: ValidationResult } | null> {
    const analysis = this.db.getAnalysisById(id);
    if (!analysis || analysis.status !== 'failed') {
      return null;
    }

    // Reset the existing record to pending
    const reset = this.db.resetAnalysisForRetry(id);
    if (!reset) {
      return null;
    }

    const startTime = Date.now();
    const ws = getWebSocketServer();
    ws.emitAnalysisStarted(id, analysis.articleId);

    try {
      // Fetch article and outlet from intake
      const article = await this.intakeClient.getArticle(analysis.articleId);
      const outlet = await this.intakeClient.getOutlet(article.outletId);

      // Update status to processing
      this.db.updateAnalysisStatus(id, 'processing');

      // Validate content lengths to prevent DoS
      const safeTitle = validateContentLength(article.title, MAX_TITLE_LENGTH, 'title');
      const safeContent = validateContentLength(article.content, MAX_CONTENT_LENGTH, 'content');

      // Generate prompt
      const prompt = getBiasAnalysisPrompt({
        title: safeTitle,
        content: safeContent,
        outletName: outlet.name,
        outletLean: outlet.politicalLean,
        publishedAt: article.publishedAt,
      });

      // Call Claude API
      const result = await this.callClaude(BIAS_ANALYSIS_SYSTEM_PROMPT, prompt);
      const biasResult = parseJsonResponse<BiasResult>(result.content);

      // Validate result structure
      const structureValidation = validateBiasResult(biasResult);
      if (!structureValidation.valid) {
        throw new Error('Invalid result structure from LLM');
      }

      // Validate output content
      let validation: ValidationResult | undefined;
      if (this.validateOutput) {
        validation = validateAnalysisOutput(biasResult);
        if (this.rejectOnViolation && !validation.valid) {
          throw new Error('Analysis rejected: output failed neutrality validation');
        }
      }

      const processingTimeMs = Date.now() - startTime;

      // Complete analysis
      this.db.completeAnalysis(
        id,
        biasResult,
        this.model,
        processingTimeMs,
        result.promptTokens,
        result.completionTokens
      );

      const completedAnalysis = this.db.getAnalysisById(id)!;
      ws.emitAnalysisComplete(id, analysis.articleId, (completedAnalysis.result || {}) as Record<string, unknown>);
      return { analysis: completedAnalysis, validation };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.db.failAnalysis(id, errorMessage);
      const failedAnalysis = this.db.getAnalysisById(id)!;
      ws.emitAnalysisFailed(id, analysis.articleId, errorMessage);
      return { analysis: failedAnalysis };
    }
  }

  /**
   * Get stats
   */
  getStats() {
    return this.db.getStats();
  }

  /**
   * Call Claude API
   */
  private async callClaude(
    systemPrompt: string,
    userPrompt: string
  ): Promise<{ content: string; promptTokens?: number; completionTokens?: number }> {
    if (!this.client) {
      // Return mock response when no API key
      claudeApiTotal.inc({ operation: 'analysis', status: 'mock' });
      return {
        content: JSON.stringify(this.getMockBiasResult()),
        promptTokens: 0,
        completionTokens: 0,
      };
    }

    const timer = claudeApiDuration.startTimer({ operation: 'analysis' });
    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      });

      timer(); // Record duration
      claudeApiTotal.inc({ operation: 'analysis', status: 'success' });

      const textContent = response.content.find(c => c.type === 'text');
      const content = textContent?.type === 'text' ? textContent.text : '';

      return {
        content,
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
      };
    } catch (error) {
      timer(); // Record duration even on failure
      claudeApiTotal.inc({ operation: 'analysis', status: 'error' });
      throw error;
    }
  }

  /**
   * Generate mock bias result for testing without API key
   */
  private getMockBiasResult(): BiasResult {
    return {
      biasScore: 0,
      framingIndicators: ['[Mock] Neutral framing observed'],
      loadedLanguage: [],
      neutralAlternatives: {},
      summary: '[Mock] This is a mock analysis. Set ANTHROPIC_API_KEY for real analysis.',
      confidence: 0.5,
    };
  }
}

// Singleton instance
let analyzerInstance: BiasAnalyzer | null = null;
let analyzerConfigUsed = false;

export function getBiasAnalyzer(config?: AnalyzerConfig): BiasAnalyzer {
  if (!analyzerInstance) {
    analyzerInstance = new BiasAnalyzer(config);
    analyzerConfigUsed = config !== undefined;
  } else if (config !== undefined && analyzerConfigUsed) {
    logger.warn('Singleton already initialized with config. Ignoring new config.');
  }
  return analyzerInstance;
}

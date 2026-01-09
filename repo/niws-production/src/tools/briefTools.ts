/**
 * Brief MCP Tools (8 tools)
 *
 * Tools for story briefs, quotes, legislation, and Christ-Oh-Meter ratings.
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getBriefDatabase, type BriefDatabase } from '../database/briefDatabase.js';
import { christOhMeter, ChristOhMeterService } from '../services/christOhMeter.js';
import { briefExtractor, BriefExtractorService, type ArticleForExtraction } from '../services/briefExtractor.js';
import { intakeClient } from '../services/clients.js';
import type { StoryBrief, ChristOhMeterResult } from '../types.js';
import {
  validate,
  createStoryBriefSchema,
  getBriefSchema,
  listBriefsSchema,
  updateBriefStatusSchema,
  rateActionSchema,
  compareQuotesSchema,
  analyzeLegislationSchema,
} from '../validation/schemas.js';

// ============================================
// TOOL DEFINITIONS
// ============================================

export const briefTools: Tool[] = [
  {
    name: 'create_story_brief',
    description: 'Create a story brief from a story cluster. Extracts quotes, analyzes legislation, and optionally rates with Christ-Oh-Meter.',
    inputSchema: {
      type: 'object',
      properties: {
        story_id: { type: 'string', description: 'Story ID to create brief from' },
        title: { type: 'string', description: 'Brief title' },
        extract_quotes: { type: 'boolean', description: 'Extract quotes from articles (default: true)' },
        analyze_legislation: { type: 'boolean', description: 'Analyze legislation if applicable (default: true)' },
        rate_morality: { type: 'boolean', description: 'Rate with Christ-Oh-Meter (default: false)' },
      },
      required: ['story_id', 'title'],
    },
  },
  {
    name: 'get_story_brief',
    description: 'Get a story brief by ID',
    inputSchema: {
      type: 'object',
      properties: {
        brief_id: { type: 'string', description: 'Brief ID' },
      },
      required: ['brief_id'],
    },
  },
  {
    name: 'list_story_briefs',
    description: 'List story briefs with optional filters',
    inputSchema: {
      type: 'object',
      properties: {
        story_id: { type: 'string', description: 'Filter by story ID' },
        status: { type: 'string', enum: ['draft', 'reviewed', 'approved', 'used'], description: 'Filter by status' },
        moral_alignment: { type: 'string', enum: ['christ', 'anti-christ', 'neutral', 'mixed'], description: 'Filter by moral alignment' },
        limit: { type: 'number', description: 'Maximum results (default: 20)' },
      },
    },
  },
  {
    name: 'update_brief_status',
    description: 'Update the workflow status of a story brief',
    inputSchema: {
      type: 'object',
      properties: {
        brief_id: { type: 'string', description: 'Brief ID' },
        status: { type: 'string', enum: ['draft', 'reviewed', 'approved', 'used'], description: 'New status' },
      },
      required: ['brief_id', 'status'],
    },
  },
  {
    name: 'rate_christ_oh_meter',
    description: 'Rate an action on the Christ-Evil moral spectrum using 25 Gospel tenets. Returns score from -1.0 (Evil) to +1.0 (Christ).',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'Description of the action/decision being rated' },
        subject: { type: 'string', description: 'Who performed the action (person, org, government)' },
        affected: { type: 'array', items: { type: 'string' }, description: 'List of parties affected by the action' },
        context: { type: 'string', description: 'Optional additional context' },
        brief_id: { type: 'string', description: 'Optional: attach rating to existing brief' },
      },
      required: ['action', 'subject', 'affected'],
    },
  },
  {
    name: 'compare_quotes',
    description: 'Find how different outlets reported quotes from the same speaker. Tracks variations and framing differences.',
    inputSchema: {
      type: 'object',
      properties: {
        speaker: { type: 'string', description: 'Name of the person who was quoted' },
        story_id: { type: 'string', description: 'Story ID to search within' },
      },
      required: ['speaker', 'story_id'],
    },
  },
  {
    name: 'analyze_legislation',
    description: 'Extract factual, non-opinionated effects of legislation from news coverage.',
    inputSchema: {
      type: 'object',
      properties: {
        bill_identifier: { type: 'string', description: 'Bill name/number or URL to official text' },
        story_id: { type: 'string', description: 'Story ID covering this legislation' },
        brief_id: { type: 'string', description: 'Optional: attach analysis to existing brief' },
      },
      required: ['bill_identifier', 'story_id'],
    },
  },
  {
    name: 'get_brief_stats',
    description: 'Get statistics about story briefs and Christ-Oh-Meter ratings',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

// ============================================
// TOOL HANDLERS
// ============================================

export class BriefToolHandlers {
  private db: BriefDatabase;
  private meter: ChristOhMeterService;
  private extractor: BriefExtractorService;

  constructor() {
    this.db = getBriefDatabase();
    this.meter = christOhMeter;
    this.extractor = briefExtractor;
  }

  async handleTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    switch (name) {
      case 'create_story_brief':
        return this.handleCreateStoryBrief(args);
      case 'get_story_brief':
        return this.handleGetStoryBrief(args);
      case 'list_story_briefs':
        return this.handleListStoryBriefs(args);
      case 'update_brief_status':
        return this.handleUpdateBriefStatus(args);
      case 'rate_christ_oh_meter':
        return this.handleRateChristOhMeter(args);
      case 'compare_quotes':
        return this.handleCompareQuotes(args);
      case 'analyze_legislation':
        return this.handleAnalyzeLegislation(args);
      case 'get_brief_stats':
        return this.handleGetBriefStats();
      default:
        throw new Error(`Unknown brief tool: ${name}`);
    }
  }

  // --- Handler Implementations ---

  private async handleCreateStoryBrief(args: Record<string, unknown>) {
    const validation = validate(createStoryBriefSchema, args);
    if (!validation.success) {
      return { success: false, error: validation.error };
    }
    const data = validation.data!;

    const storyId = data.story_id;
    const title = data.title;
    const extractQuotes = data.extract_quotes !== false;
    const analyzeLegislation = data.analyze_legislation !== false;
    const rateMorality = data.rate_morality === true;

    // Get articles for the story
    const articles = await intakeClient.getArticlesForStory(storyId);
    const articlesForExtraction: ArticleForExtraction[] = articles.map(a => ({
      outlet: a.outletId || 'Unknown',
      headline: a.title,
      content: a.content,
      url: a.url,
    }));

    // Extract key facts from headlines
    const keyFacts = articles.slice(0, 5).map(a => a.title);

    // Extract quotes if requested
    let quotes: Array<{ text: string; attribution: string; context: string }> = [];
    if (extractQuotes && articlesForExtraction.length > 0 && this.extractor.isAvailable()) {
      const quoteResult = await this.extractor.extractQuotes(articlesForExtraction);
      quotes = quoteResult.quotes.map(q => ({
        text: q.quote,
        attribution: q.speaker,
        context: q.context || '',
      }));
    }

    // Generate summary
    let summary = '';
    if (this.extractor.isAvailable()) {
      summary = (await this.extractor.generateSummary(articlesForExtraction)) || '';
    }

    // Create brief
    const brief = this.db.createBrief({
      storyId,
      title,
      summary,
      keyFacts,
      perspectives: [],
      christOhMeterScore: 0,
      moralAlignment: '',
    });

    // Add quotes
    for (const quote of quotes) {
      this.db.addQuote(brief.id, quote);
    }

    // Analyze legislation if requested
    let legislationFound = false;
    if (analyzeLegislation && articlesForExtraction.length > 0 && this.extractor.isAvailable()) {
      const legResult = await this.extractor.extractLegislation(articlesForExtraction);
      if (legResult.legislation) {
        this.db.addLegislation({
          briefId: brief.id,
          billNumber: legResult.legislation.billId,
          title: legResult.legislation.billName,
          summary: legResult.legislation.factualEffects.join('; '),
          status: legResult.legislation.status,
        });
        legislationFound = true;
      }
    }

    // Rate with Christ-Oh-Meter if requested
    if (rateMorality) {
      const rating = await this.meter.rateAction(
        title,
        'Government',
        ['citizens', 'taxpayers']
      );
      this.db.saveRating(rating, brief.id);
    }

    return {
      success: true,
      brief_id: brief.id,
      title: brief.title,
      quotes_extracted: quotes.length,
      legislation_found: legislationFound,
      morality_rated: rateMorality,
    };
  }

  private handleGetStoryBrief(args: Record<string, unknown>) {
    const validation = validate(getBriefSchema, args);
    if (!validation.success) {
      return { success: false, error: validation.error };
    }
    const data = validation.data!;

    const brief = this.db.getBrief(data.brief_id);
    if (!brief) {
      return { success: false, error: `Brief not found: ${data.brief_id}` };
    }

    // Get related data
    const quotes = this.db.getQuotes(brief.id);
    const legislation = this.db.getLegislationForBrief(brief.id);
    const ratings = this.db.getRatingsForBrief(brief.id);

    return {
      success: true,
      brief,
      quotes,
      legislation,
      ratings,
    };
  }

  private handleListStoryBriefs(args: Record<string, unknown>) {
    const validation = validate(listBriefsSchema, args);
    if (!validation.success) {
      return { success: false, error: validation.error };
    }
    const data = validation.data!;

    const result = this.db.listBriefs({
      storyId: data.story_id,
      status: data.status,
      moralAlignment: data.moral_alignment,
      limit: data.limit || 20,
    });

    return {
      success: true,
      briefs: result.briefs.map(b => ({
        id: b.id,
        story_id: b.storyId,
        title: b.title,
        christ_oh_meter_score: b.christOhMeterScore,
        moral_alignment: b.moralAlignment,
        created_at: b.createdAt,
      })),
      total: result.total,
    };
  }

  private handleUpdateBriefStatus(args: Record<string, unknown>) {
    const validation = validate(updateBriefStatusSchema, args);
    if (!validation.success) {
      return { success: false, error: validation.error };
    }
    const data = validation.data!;

    const success = this.db.updateBriefStatus(data.brief_id, data.status);

    return { success, brief_id: data.brief_id, status: data.status };
  }

  private async handleRateChristOhMeter(args: Record<string, unknown>) {
    const validation = validate(rateActionSchema, args);
    if (!validation.success) {
      return { success: false, error: validation.error };
    }
    const data = validation.data!;

    try {
      const rating = await this.meter.rateAction(data.action, data.subject, data.affected, data.context);

      // Save to database
      const ratingId = this.db.saveRating(rating, data.brief_id);

      return {
        success: true,
        rating_id: ratingId,
        spectrum_score: rating.spectrumScore,
        verdict: rating.verdict,
        moral_alignment: rating.spectrumScore >= 0.2 ? 'christ'
          : rating.spectrumScore <= -0.2 ? 'anti-christ'
          : 'neutral',
        strongest_christ_tenets: rating.strongestChristTenets,
        strongest_evil_tenets: rating.strongestEvilTenets,
        counterfeits_detected: rating.counterfeitsDetected?.length || 0,
        reasoning: rating.reasoning,
        evaluation_id: rating.tenetsEvaluationId,
        brief_updated: !!data.brief_id,
      };
    } catch (error) {
      console.error('[BriefTools] rateChristOhMeter failed:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Rating failed' };
    }
  }

  private async handleCompareQuotes(args: Record<string, unknown>) {
    const validation = validate(compareQuotesSchema, args);
    if (!validation.success) {
      return { success: false, error: validation.error };
    }
    const data = validation.data!;

    try {
      // Get articles
      const articles = await intakeClient.getArticlesForStory(data.story_id);
      if (articles.length === 0) {
        return { success: false, error: 'No articles found for story' };
      }

      const articlesForExtraction: ArticleForExtraction[] = articles.map(a => ({
        outlet: a.outletId || 'Unknown',
        headline: a.title,
        content: a.content,
        url: a.url,
      }));

      const quote = await this.extractor.compareQuotes(data.speaker, articlesForExtraction);

      if (!quote) {
        return {
          success: true,
          speaker: data.speaker,
          found: false,
          message: `No quotes found from "${data.speaker}" in these articles`,
        };
      }

      return {
        success: true,
        speaker: quote.speaker,
        found: true,
        quote: quote.quote,
        context: quote.context,
        found_in: quote.foundIn,
        variations: quote.variations,
        is_verbatim_consistent: quote.isVerbatimConsistent,
        variation_significance: quote.variationSignificance,
      };
    } catch (error) {
      console.error('[BriefTools] compareQuotes failed:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Quote comparison failed' };
    }
  }

  private async handleAnalyzeLegislation(args: Record<string, unknown>) {
    const validation = validate(analyzeLegislationSchema, args);
    if (!validation.success) {
      return { success: false, error: validation.error };
    }
    const data = validation.data!;

    try {
      // Get articles
      const articles = await intakeClient.getArticlesForStory(data.story_id);
      if (articles.length === 0) {
        return { success: false, error: 'No articles found for story' };
      }

      const articlesForExtraction: ArticleForExtraction[] = articles.map(a => ({
        outlet: a.outletId || 'Unknown',
        headline: a.title,
        content: a.content,
        url: a.url,
      }));

      const result = await this.extractor.extractLegislation(articlesForExtraction);

      if (!result.legislation) {
        return {
          success: true,
          bill_identifier: data.bill_identifier,
          found: false,
          message: 'No legislation details found in these articles',
        };
      }

      // Save to brief if specified
      if (data.brief_id) {
        this.db.addLegislation({
          briefId: data.brief_id,
          billNumber: result.legislation.billId,
          title: result.legislation.billName,
          summary: result.legislation.factualEffects.join('; '),
          status: result.legislation.status,
        });
      }

      return {
        success: true,
        found: true,
        bill_name: result.legislation.billName,
        bill_id: result.legislation.billId,
        status: result.legislation.status,
        factual_effects: result.legislation.factualEffects,
        affected_groups: result.legislation.affectedGroups,
        extraction_cost: result.cost,
        brief_updated: !!data.brief_id,
      };
    } catch (error) {
      console.error('[BriefTools] analyzeLegislation failed:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Legislation analysis failed' };
    }
  }

  private handleGetBriefStats() {
    const stats = this.db.getStats();
    return { success: true, stats };
  }
}

export function isBriefTool(name: string): boolean {
  return briefTools.some(t => t.name === name);
}

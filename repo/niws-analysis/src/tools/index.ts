/**
 * MCP Tool Definitions for niws-analysis
 *
 * 11 tools for article bias analysis, framing comparison, and neutral alternatives.
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getBiasAnalyzer, BiasAnalyzer } from '../services/biasAnalyzer.js';
import { validateText, getApprovedAlternative } from '../services/outputValidator.js';
import { getAnalysisDatabase } from '../database/analysisDatabase.js';
import type { AnalysisType } from '../types.js';

/**
 * MCP Tool Definitions
 */
export const analysisTools: Tool[] = [
  {
    name: 'analyze_article',
    description: 'Analyze a single news article for bias patterns. Documents emphasis, omissions, sources, and framing WITHOUT judging accuracy or bias.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        article_id: {
          type: 'string',
          description: 'Article ID to analyze (fetches from niws-intake)',
        },
        analysis_type: {
          type: 'string',
          enum: ['bias', 'framing', 'neutral', 'comprehensive'],
          description: 'Type of analysis to perform (default: bias)',
        },
        inline_content: {
          type: 'object',
          description: 'Optional inline article content (skip intake fetch)',
          properties: {
            title: { type: 'string' },
            content: { type: 'string' },
            outlet_name: { type: 'string' },
            outlet_lean: { type: 'string' },
            published_at: { type: 'string' },
          },
        },
      },
      required: ['article_id'],
    },
  },
  {
    name: 'analyze_bias_language',
    description: 'Analyze text for loaded/biased language and suggest neutral alternatives.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        text: {
          type: 'string',
          description: 'Text to analyze for loaded language',
        },
        context: {
          type: 'string',
          description: 'Optional context for the text',
        },
      },
      required: ['text'],
    },
  },
  {
    name: 'compare_coverage',
    description: 'Compare how multiple outlets cover the same story. Identifies framing differences across left/center/right.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        story_id: {
          type: 'string',
          description: 'Story ID to compare coverage for',
        },
        article_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Article IDs to compare (minimum 2)',
        },
        inline_articles: {
          type: 'array',
          description: 'Optional inline article data (skip intake fetch)',
          items: {
            type: 'object',
            properties: {
              article_id: { type: 'string' },
              title: { type: 'string' },
              content: { type: 'string' },
              outlet_name: { type: 'string' },
              outlet_lean: { type: 'string' },
              published_at: { type: 'string' },
            },
          },
        },
        story_topic: {
          type: 'string',
          description: 'Topic description (required if using inline_articles)',
        },
      },
      required: ['story_id', 'article_ids'],
    },
  },
  {
    name: 'get_framing_differences',
    description: 'Extract how different outlets frame the same concept using different language.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        concept: {
          type: 'string',
          description: 'The concept or event being framed differently',
        },
        examples: {
          type: 'array',
          description: 'Examples of how different outlets described this concept',
          items: {
            type: 'object',
            properties: {
              outlet_name: { type: 'string' },
              outlet_lean: { type: 'string' },
              phrase: { type: 'string' },
            },
            required: ['outlet_name', 'outlet_lean', 'phrase'],
          },
        },
      },
      required: ['concept', 'examples'],
    },
  },
  {
    name: 'get_neutral_alternative',
    description: 'Get neutral alternatives for a loaded or biased term.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        term: {
          type: 'string',
          description: 'The potentially loaded term',
        },
        context: {
          type: 'string',
          description: 'Optional context for the term',
        },
        use_llm: {
          type: 'boolean',
          description: 'Use LLM for suggestions (default: false, uses lexicon)',
        },
      },
      required: ['term'],
    },
  },
  {
    name: 'get_comparative_analysis',
    description: 'Get a comparative analysis by ID or story ID.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        comparison_id: {
          type: 'string',
          description: 'Comparison ID to retrieve',
        },
        story_id: {
          type: 'string',
          description: 'Story ID to get comparison for',
        },
      },
      required: [],
    },
  },
  {
    name: 'validate_analysis_text',
    description: 'Check text for bias violations before including in analysis output.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        text: {
          type: 'string',
          description: 'Text to validate for neutrality',
        },
      },
      required: ['text'],
    },
  },
  {
    name: 'get_analysis_by_id',
    description: 'Retrieve an article analysis by its ID.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        analysis_id: {
          type: 'string',
          description: 'The analysis ID to retrieve',
        },
      },
      required: ['analysis_id'],
    },
  },
  {
    name: 'get_analysis_by_story',
    description: 'Get all analyses for articles in a story, plus the comparative analysis.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        story_id: {
          type: 'string',
          description: 'The story ID to get analyses for',
        },
      },
      required: ['story_id'],
    },
  },
  {
    name: 'list_pending_analyses',
    description: 'List analyses that are pending processing.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number to return (default: 10)',
        },
      },
      required: [],
    },
  },
  {
    name: 'retry_failed_analysis',
    description: 'Retry a failed analysis.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        analysis_id: {
          type: 'string',
          description: 'The analysis ID to retry',
        },
      },
      required: ['analysis_id'],
    },
  },
];

/**
 * Tool Handler Class
 */
export class AnalysisToolHandler {
  private analyzer: BiasAnalyzer;

  constructor() {
    this.analyzer = getBiasAnalyzer();
  }

  async handleToolCall(name: string, args: Record<string, unknown>): Promise<unknown> {
    switch (name) {
      case 'analyze_article':
        return this.analyzeArticle(args);

      case 'analyze_bias_language':
        return this.analyzeBiasLanguage(args);

      case 'compare_coverage':
        return this.compareCoverage(args);

      case 'get_framing_differences':
        return this.getFramingDifferences(args);

      case 'get_neutral_alternative':
        return this.getNeutralAlternative(args);

      case 'get_comparative_analysis':
        return this.getComparativeAnalysis(args);

      case 'validate_analysis_text':
        return this.validateAnalysisText(args);

      case 'get_analysis_by_id':
        return this.getAnalysisById(args);

      case 'get_analysis_by_story':
        return this.getAnalysisByStory(args);

      case 'list_pending_analyses':
        return this.listPendingAnalyses(args);

      case 'retry_failed_analysis':
        return this.retryFailedAnalysis(args);

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  private async analyzeArticle(args: Record<string, unknown>) {
    const articleId = args.article_id as string;
    const analysisType = (args.analysis_type as AnalysisType) || 'bias';
    const inlineContent = args.inline_content as Record<string, string> | undefined;

    try {
      if (inlineContent) {
        const { analysis, validation } = await this.analyzer.analyzeArticleContent({
          articleId,
          title: inlineContent.title,
          content: inlineContent.content,
          outletName: inlineContent.outlet_name,
          outletLean: inlineContent.outlet_lean,
          publishedAt: inlineContent.published_at,
          analysisType,
        });

        return {
          success: true,
          analysis,
          validation: validation ? {
            valid: validation.valid,
            neutrality_score: validation.neutralityScore,
            violation_count: validation.violations.length,
            warning_count: validation.warnings.length,
          } : undefined,
        };
      }

      const { analysis, validation } = await this.analyzer.analyzeArticle(articleId, analysisType);

      return {
        success: analysis.status === 'complete',
        analysis,
        validation: validation ? {
          valid: validation.valid,
          neutrality_score: validation.neutralityScore,
          violation_count: validation.violations.length,
          warning_count: validation.warnings.length,
        } : undefined,
        error: analysis.status === 'failed' ? analysis.errorMessage : undefined,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async analyzeBiasLanguage(args: Record<string, unknown>) {
    const text = args.text as string;
    const db = getAnalysisDatabase();

    // Check text against lexicon
    const words = text.toLowerCase().split(/\W+/);
    const matches: Array<{
      word: string;
      category: string;
      severity: number;
      alternatives: string[];
    }> = [];

    for (const word of words) {
      const entry = db.getLexiconEntry(word);
      if (entry) {
        matches.push({
          word: entry.word,
          category: entry.category,
          severity: entry.severity,
          alternatives: entry.alternatives,
        });
      }
    }

    // Also validate for violations
    const validation = validateText(text);

    return {
      success: true,
      text_length: text.length,
      loaded_terms_found: matches.length,
      loaded_terms: matches,
      validation: {
        valid: validation.valid,
        violations: validation.violations,
      },
    };
  }

  private async compareCoverage(args: Record<string, unknown>) {
    const storyId = args.story_id as string;
    const articleIds = args.article_ids as string[];
    const inlineArticles = args.inline_articles as Array<Record<string, string>> | undefined;
    const storyTopic = args.story_topic as string | undefined;

    try {
      if (inlineArticles && storyTopic) {
        const { comparison, analyses } = await this.analyzer.compareArticles({
          storyId,
          storyTopic,
          articles: inlineArticles.map(a => ({
            articleId: a.article_id,
            title: a.title,
            content: a.content,
            outletName: a.outlet_name,
            outletLean: a.outlet_lean,
            publishedAt: a.published_at,
          })),
        });

        return {
          success: comparison.status === 'complete',
          comparison,
          analyses_count: analyses.length,
          error: comparison.status === 'failed' ? comparison.errorMessage : undefined,
        };
      }

      const { comparison, analyses } = await this.analyzer.compareCoverage(storyId, articleIds);

      return {
        success: comparison.status === 'complete',
        comparison,
        analyses_count: analyses.length,
        error: comparison.status === 'failed' ? comparison.errorMessage : undefined,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async getFramingDifferences(args: Record<string, unknown>) {
    const concept = args.concept as string;
    const examples = (args.examples as Array<Record<string, string>>).map(e => ({
      outletName: e.outlet_name,
      outletLean: e.outlet_lean,
      phrase: e.phrase,
    }));

    try {
      const differences = await this.analyzer.getFramingDifferences({ concept, examples });

      return {
        success: true,
        concept,
        framing_differences: differences,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async getNeutralAlternative(args: Record<string, unknown>) {
    const term = args.term as string;
    const context = args.context as string | undefined;
    const useLlm = args.use_llm as boolean | undefined;

    // First check lexicon
    const lexiconAlternative = getApprovedAlternative(term);

    if (lexiconAlternative && !useLlm) {
      return {
        success: true,
        term,
        source: 'lexicon',
        alternative: lexiconAlternative,
        alternatives: [lexiconAlternative],
      };
    }

    // Check database lexicon
    const db = getAnalysisDatabase();
    const entry = db.getLexiconEntry(term);

    if (entry && !useLlm) {
      return {
        success: true,
        term,
        source: 'database',
        alternative: entry.alternatives[0] || null,
        alternatives: entry.alternatives,
        category: entry.category,
        severity: entry.severity,
      };
    }

    // Use LLM if requested
    if (useLlm) {
      try {
        const result = await this.analyzer.getNeutralAlternative(term, context);

        return {
          success: true,
          term,
          source: 'llm',
          alternative: result.alternatives[0] || null,
          alternatives: result.alternatives,
          explanation: result.explanation,
        };
      } catch (error) {
        return {
          success: false,
          term,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }

    return {
      success: true,
      term,
      source: 'none',
      alternative: null,
      alternatives: [],
      message: 'No alternative found in lexicon. Use use_llm=true for LLM suggestions.',
    };
  }

  private getComparativeAnalysis(args: Record<string, unknown>) {
    const comparisonId = args.comparison_id as string | undefined;
    const storyId = args.story_id as string | undefined;

    if (!comparisonId && !storyId) {
      return {
        success: false,
        error: 'Either comparison_id or story_id is required',
      };
    }

    const db = getAnalysisDatabase();

    if (comparisonId) {
      const comparison = db.getComparisonById(comparisonId);
      if (!comparison) {
        return { success: false, error: `Comparison not found: ${comparisonId}` };
      }
      return { success: true, comparison };
    }

    const comparison = db.getComparisonByStoryId(storyId!);
    if (!comparison) {
      return { success: false, error: `No comparison found for story: ${storyId}` };
    }
    return { success: true, comparison };
  }

  private validateAnalysisText(args: Record<string, unknown>) {
    const text = args.text as string;
    const result = validateText(text);

    return {
      success: true,
      valid: result.valid,
      violation_count: result.violations.length,
      violations: result.violations,
    };
  }

  private getAnalysisById(args: Record<string, unknown>) {
    const analysisId = args.analysis_id as string;
    const analysis = this.analyzer.getAnalysisById(analysisId);

    if (!analysis) {
      return { success: false, error: `Analysis not found: ${analysisId}` };
    }

    return { success: true, analysis };
  }

  private getAnalysisByStory(args: Record<string, unknown>) {
    const storyId = args.story_id as string;
    const result = this.analyzer.getAnalysesByStoryId(storyId);

    return {
      success: true,
      story_id: storyId,
      analyses: result.analyses,
      comparative: result.comparative,
      analyses_count: result.analyses.length,
      has_comparative: !!result.comparative,
    };
  }

  private listPendingAnalyses(args: Record<string, unknown>) {
    const limit = (args.limit as number) || 10;
    const pending = this.analyzer.getPendingAnalyses(limit);

    return {
      success: true,
      count: pending.length,
      analyses: pending.map(a => ({
        id: a.id,
        article_id: a.articleId,
        analysis_type: a.analysisType,
        created_at: a.createdAt,
      })),
    };
  }

  private async retryFailedAnalysis(args: Record<string, unknown>) {
    const analysisId = args.analysis_id as string;

    try {
      const result = await this.analyzer.retryAnalysis(analysisId);

      if (!result) {
        return {
          success: false,
          error: `Analysis not found or not failed: ${analysisId}`,
        };
      }

      return {
        success: result.analysis.status === 'complete',
        analysis: result.analysis,
        validation: result.validation ? {
          valid: result.validation.valid,
          neutrality_score: result.validation.neutralityScore,
          violation_count: result.validation.violations.length,
          warning_count: result.validation.warnings.length,
        } : undefined,
        error: result.analysis.status === 'failed' ? result.analysis.errorMessage : undefined,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

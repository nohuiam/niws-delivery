/**
 * Brief Extractor Service
 *
 * Uses Claude LLM to extract:
 * - Direct quotes with speaker attribution
 * - Quote variations across outlets
 * - Legislation effects (factual, non-opinionated)
 */

import Anthropic from '@anthropic-ai/sdk';
import type { Quote, Legislation } from '../types.js';

// Dynamic Anthropic client - initialized lazily
let anthropicClient: Anthropic | null = null;

function getAnthropicClient(): Anthropic | null {
  if (anthropicClient !== null) return anthropicClient;

  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('[BriefExtractor] No ANTHROPIC_API_KEY found');
    return null;
  }

  anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return anthropicClient;
}

export interface ArticleForExtraction {
  outlet: string;
  headline: string;
  content: string;
  url: string;
  lean?: string;
}

export interface ExtractedQuote {
  speaker: string;
  quote: string;
  context?: string;
  foundIn: string[];
  variations?: Array<{
    outlet: string;
    quote: string;
    note?: string;
  }>;
  isVerbatimConsistent?: boolean;
  variationSignificance?: 'minor' | 'moderate' | 'significant';
}

export interface QuoteExtractionResult {
  quotes: ExtractedQuote[];
  cost: number;
}

export interface LegislationExtractionResult {
  legislation: {
    billName: string;
    billId?: string;
    status: 'proposed' | 'passed_house' | 'passed_senate' | 'signed' | 'vetoed';
    factualEffects: string[];
    affectedGroups?: Array<{ group: string; effect: string }>;
    sources?: Array<{ type: 'official' | 'wire' | 'outlet'; url?: string; outlet?: string }>;
  } | null;
  cost: number;
}

// JSON response types from LLM
interface QuoteJsonResponse {
  quotes: Array<{
    speaker: string;
    quote: string;
    context?: string;
    found_in?: string[];
    variations?: Array<{
      outlet: string;
      quote: string;
      note?: string;
    }>;
    is_verbatim_consistent?: boolean;
    variation_significance?: 'minor' | 'moderate' | 'significant';
  }>;
}

interface LegislationJsonResponse {
  legislation: {
    bill_name: string;
    bill_id?: string;
    status: 'proposed' | 'passed_house' | 'passed_senate' | 'signed' | 'vetoed';
    factual_effects?: string[];
    affected_groups?: Array<{ group: string; effect: string }>;
    sources?: Array<{ type: 'official' | 'wire' | 'outlet'; url?: string; outlet?: string }>;
  } | null;
}

export class BriefExtractorService {
  private model: string;

  constructor(model: string = 'claude-3-5-haiku-20241022') {
    this.model = model;
  }

  /**
   * Extract quotes from multiple articles about the same story
   */
  async extractQuotes(articles: ArticleForExtraction[]): Promise<QuoteExtractionResult> {
    const client = getAnthropicClient();
    if (!client) {
      console.warn('[BriefExtractor] Claude API not available');
      return { quotes: [], cost: 0 };
    }

    if (articles.length === 0) {
      return { quotes: [], cost: 0 };
    }

    const articlesText = articles.map((a, i) => `
=== ARTICLE ${i + 1} ===
OUTLET: ${a.outlet} (${a.lean || 'unknown'} lean)
HEADLINE: ${a.headline}
URL: ${a.url}

${a.content.substring(0, 5000)}
`).join('\n');

    const prompt = `You are an expert news analyst extracting direct quotes from news articles. Your task is to find quotes from named individuals and track how different outlets report them.

${articlesText}

Extract ALL direct quotes from named speakers. For each quote:
1. Identify the speaker (full name and title/role if given)
2. Extract the exact quote text
3. Note which outlets included this quote
4. Track any variations in how outlets reported the quote

CRITICAL: Be precise about quote variations. Note if:
- Words were added/removed
- Quote was paraphrased
- Context was changed
- Emphasis words differ

Respond in JSON format:
{
  "quotes": [
    {
      "speaker": "Full Name, Title/Role",
      "quote": "The verbatim quote text",
      "context": "Brief context of when/where said",
      "found_in": ["Outlet 1", "Outlet 2"],
      "variations": [
        {
          "outlet": "Outlet Name",
          "quote": "Their version of the quote",
          "note": "Description of what differs"
        }
      ],
      "is_verbatim_consistent": true|false,
      "variation_significance": "minor|moderate|significant"
    }
  ]
}

If no quotes found, return {"quotes": []}`;

    try {
      const response = await client.messages.create({
        model: this.model,
        max_tokens: 2000,
        temperature: 0.1,
        messages: [{ role: 'user', content: prompt }],
      });

      const text = response.content[0].type === 'text' ? response.content[0].text : '';
      const parsed = this.parseJsonResponse<QuoteJsonResponse>(text);

      // Estimate cost
      const inputTokens = response.usage?.input_tokens || 0;
      const outputTokens = response.usage?.output_tokens || 0;
      const cost = (inputTokens * 0.00025 + outputTokens * 0.00125) / 1000;

      // Transform to our format
      const quotes: ExtractedQuote[] = (parsed?.quotes || []).map(q => ({
        speaker: q.speaker,
        quote: q.quote,
        context: q.context,
        foundIn: q.found_in || [],
        variations: q.variations,
        isVerbatimConsistent: q.is_verbatim_consistent,
        variationSignificance: q.variation_significance,
      }));

      return { quotes, cost };
    } catch (error) {
      console.error('[BriefExtractor] Quote extraction failed:', error);
      return { quotes: [], cost: 0 };
    }
  }

  /**
   * Extract legislation effects from articles
   */
  async extractLegislation(articles: ArticleForExtraction[]): Promise<LegislationExtractionResult> {
    const client = getAnthropicClient();
    if (!client) {
      console.warn('[BriefExtractor] Claude API not available');
      return { legislation: null, cost: 0 };
    }

    if (articles.length === 0) {
      return { legislation: null, cost: 0 };
    }

    const articlesText = articles.map((a, i) => `
=== ARTICLE ${i + 1} ===
OUTLET: ${a.outlet}
HEADLINE: ${a.headline}

${a.content.substring(0, 5000)}
`).join('\n');

    const prompt = `You are an expert legislative analyst. Your task is to extract FACTUAL information about legislation from news articles.

${articlesText}

CRITICAL RULES:
1. Only extract if there is ACTUAL legislation mentioned (bills, laws, executive orders, etc.)
2. ONLY list FACTUAL effects - what the legislation actually does
3. NO opinions, NO predictions, NO speculation
4. NO partisan framing
5. Be specific: dollar amounts, percentages, dates, requirements

If there is legislation mentioned, respond in JSON format:
{
  "legislation": {
    "bill_name": "Full official name (e.g., 'HR 1234 - Official Title of Act')",
    "bill_id": "hr1234-119 or eo-12345 format if known",
    "status": "proposed|passed_house|passed_senate|signed|vetoed",
    "factual_effects": [
      "Specific, factual effect 1",
      "Specific, factual effect 2"
    ],
    "affected_groups": [
      {"group": "Who is affected", "effect": "How they are affected"}
    ],
    "sources": [
      {"type": "official|wire|outlet", "url": "source url if available", "outlet": "outlet name"}
    ]
  }
}

If NO legislation is mentioned, respond: {"legislation": null}

EXAMPLES OF GOOD FACTUAL EFFECTS:
- "Increases the federal minimum wage from $7.25 to $15 per hour"
- "Requires companies with 100+ employees to provide 12 weeks paid family leave"
- "Allocates $50 billion to infrastructure projects over 5 years"

EXAMPLES OF BAD (OPINIONATED) EFFECTS - DO NOT USE:
- "Will hurt small businesses" (speculation)
- "Protects American workers" (partisan framing)
- "Is expected to create jobs" (prediction)`;

    try {
      const response = await client.messages.create({
        model: this.model,
        max_tokens: 1500,
        temperature: 0.1,
        messages: [{ role: 'user', content: prompt }],
      });

      const text = response.content[0].type === 'text' ? response.content[0].text : '';
      const parsed = this.parseJsonResponse<LegislationJsonResponse>(text);

      // Estimate cost
      const inputTokens = response.usage?.input_tokens || 0;
      const outputTokens = response.usage?.output_tokens || 0;
      const cost = (inputTokens * 0.00025 + outputTokens * 0.00125) / 1000;

      if (!parsed?.legislation) {
        return { legislation: null, cost };
      }

      const leg = parsed.legislation;
      return {
        legislation: {
          billName: leg.bill_name,
          billId: leg.bill_id,
          status: leg.status,
          factualEffects: leg.factual_effects || [],
          affectedGroups: leg.affected_groups,
          sources: leg.sources,
        },
        cost,
      };
    } catch (error) {
      console.error('[BriefExtractor] Legislation extraction failed:', error);
      return { legislation: null, cost: 0 };
    }
  }

  /**
   * Compare quotes across outlets to find variations
   */
  async compareQuotes(
    speaker: string,
    articles: ArticleForExtraction[]
  ): Promise<ExtractedQuote | null> {
    const result = await this.extractQuotes(articles);

    // Filter to quotes from the specified speaker
    const speakerQuotes = result.quotes.filter(q =>
      q.speaker.toLowerCase().includes(speaker.toLowerCase())
    );

    if (speakerQuotes.length === 0) return null;

    // Take the most complete version as base
    const sorted = [...speakerQuotes].sort((a, b) =>
      (b.foundIn?.length || 0) - (a.foundIn?.length || 0)
    );

    return sorted[0] || null;
  }

  /**
   * Generate a story summary from multiple articles
   */
  async generateSummary(articles: ArticleForExtraction[]): Promise<string | null> {
    if (articles.length === 0) {
      return null;
    }

    const client = getAnthropicClient();
    if (!client) {
      return null;
    }

    const headlines = articles.map(a => `- ${a.outlet}: ${a.headline}`).join('\n');

    const prompt = `Based on these headlines from different news outlets covering the same story:

${headlines}

Write a 2-3 sentence NEUTRAL summary of what happened. Do not favor any outlet's framing. Focus only on verified facts that appear across multiple sources.`;

    try {
      const response = await client.messages.create({
        model: this.model,
        max_tokens: 200,
        temperature: 0.3,
        messages: [{ role: 'user', content: prompt }],
      });

      return response.content[0].type === 'text' ? response.content[0].text : null;
    } catch (error) {
      console.error('[BriefExtractor] Summary generation failed:', error);
      return null;
    }
  }

  /**
   * Parse JSON from LLM response
   */
  private parseJsonResponse<T>(text: string): T | null {
    try {
      // Try to extract JSON from code block
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[1].trim());
      }

      // Try direct parse
      const directMatch = text.match(/\{[\s\S]*\}/);
      if (directMatch) {
        return JSON.parse(directMatch[0]);
      }

      return null;
    } catch (error) {
      console.error('[BriefExtractor] Failed to parse JSON:', error);
      return null;
    }
  }

  /**
   * Check if Claude API is available
   */
  isAvailable(): boolean {
    return !!process.env.ANTHROPIC_API_KEY;
  }
}

// Export singleton instance
export const briefExtractor = new BriefExtractorService();

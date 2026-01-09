/**
 * Script Generator Service
 *
 * Transforms structured analysis into "Warnings with Loring" scripts.
 * Maintains Cronkite-style voice and strict editorial standards.
 */

import Anthropic from '@anthropic-ai/sdk';
import { randomUUID } from 'crypto';
import { getScriptDatabase, ScriptDatabase } from '../database/scriptDatabase.js';
import {
  SCRIPT_SYSTEM_PROMPT,
  SIGNATURE_CLOSING,
  getOpeningPrompt,
  getVerifiedFactsPrompt,
  getOutletAnalysisPrompt,
  getCriticalQuestionsPrompt,
  getClosingPrompt,
  estimateWordCount,
  estimateDuration,
} from '../config/sectionTemplates.js';
import { checkProhibitedPatterns } from '../config/prohibitedPatterns.js';
import { analysisClient, intakeClient } from './clients.js';
import type { Script, ScriptSection, ScriptRevision, ComparativeAnalysis } from '../types.js';

// Dynamic Anthropic client
let anthropicClient: Anthropic | null = null;

function getAnthropicClient(): Anthropic | null {
  if (anthropicClient !== null) return anthropicClient;

  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('[ScriptGenerator] No ANTHROPIC_API_KEY found');
    return null;
  }

  anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return anthropicClient;
}

export interface ScriptInput {
  storyTopic: string;
  storyId: string;
  briefId?: string;
  comparativeAnalysis?: ComparativeAnalysis;
  preferences?: {
    targetDurationSeconds?: number;
    outletSelection?: string[];
    emphasis?: string;
  };
}

export interface ScriptGenerateResult {
  script: Script;
  qa: QAResult;
}

export interface QAResult {
  passed: boolean;
  score: number;
  issues: Array<{
    type: string;
    message: string;
    severity: 'error' | 'warning';
  }>;
}

// Interface for outlet analysis prompt data
export interface OutletAnalysisData {
  outlets: Array<{
    name: string;
    lean: string;
    headline: string;
    emphasis: string[];
    sources: string[];
    omissions: string[];
    emotionalLanguage: string[];
  }>;
  selectiveFacts: Array<{
    fact: string;
    reportedBy: string[];
    omittedBy: string[];
  }>;
  languageDivergence: Array<{
    concept: string;
    leftFraming: string;
    centerFraming: string;
    rightFraming: string;
  }>;
}

export class ScriptGeneratorService {
  private db: ScriptDatabase;
  private model: string;

  constructor(dbPath?: string, model = 'claude-sonnet-4-20250514') {
    // For in-memory databases (testing), create a new instance directly
    // to avoid singleton conflicts between test files
    if (dbPath === ':memory:') {
      this.db = new ScriptDatabase(':memory:');
    } else {
      this.db = getScriptDatabase(dbPath);
    }
    this.model = model;
  }

  /**
   * Generate a full script from story analysis
   */
  async generateScript(input: ScriptInput): Promise<ScriptGenerateResult> {
    const client = getAnthropicClient();

    // Get comparative analysis if not provided
    let analysis = input.comparativeAnalysis;
    if (!analysis) {
      analysis = await analysisClient.getComparativeAnalysis(input.storyId) || undefined;
    }

    // Generate sections
    const sections: ScriptSection[] = [];
    let position = 0;

    // Helper to create section with placeholder ID
    const makeSection = (
      data: Omit<ScriptSection, 'id' | 'scriptId' | 'position' | 'createdAt'>,
      pos: number
    ): ScriptSection => ({
      id: `temp_${randomUUID().slice(0, 8)}`, // Placeholder, will be replaced by DB
      scriptId: '', // Will be set by DB
      position: pos,
      createdAt: new Date().toISOString(),
      ...data,
    });

    // Opening
    const opening = await this.generateSection('opening', {
      storyTopic: input.storyTopic,
      context: `A story being covered differently across the political spectrum`,
      stakes: `How this story is framed affects public understanding`,
    }, client);
    sections.push(makeSection(opening, position++));

    // Verified Facts (mock data if no analysis)
    const universalFacts = analysis?.framingDifferences?.map(fd => fd.topic) || [
      'The event occurred as reported',
      'Official statements were made',
      'Coverage varied across outlets',
    ];
    const verifiedFacts = await this.generateSection('verified_facts', { universalFacts }, client);
    sections.push(makeSection(verifiedFacts, position++));

    // Outlet Analysis
    const outletData = {
      outlets: analysis?.framingDifferences?.slice(0, 3).map((fd, i) => ({
        name: `Outlet ${i + 1}`,
        lean: i === 0 ? 'left' : i === 1 ? 'center' : 'right',
        headline: fd.topic,
        emphasis: [fd.leftFraming, fd.rightFraming].filter(Boolean),
        sources: ['Official sources'],
        omissions: [],
        emotionalLanguage: [],
      })) || [],
      selectiveFacts: [],
      languageDivergence: analysis?.framingDifferences?.map(fd => ({
        concept: fd.topic,
        leftFraming: fd.leftFraming,
        centerFraming: fd.neutralFraming,
        rightFraming: fd.rightFraming,
      })) || [],
    };
    const outletAnalysis = await this.generateSection('outlet_analysis', outletData, client);
    sections.push(makeSection(outletAnalysis, position++));

    // Critical Questions
    const criticalQuestions = await this.generateSection('critical_questions', {
      coverageQuestions: [
        'Why do outlets cite different experts and sources?',
        'What determines which facts lead the coverage?',
        'How does headline selection shape perception?',
      ],
    }, client);
    sections.push(makeSection(criticalQuestions, position++));

    // Closing
    const closing = await this.generateSection('closing', {
      storyTopic: input.storyTopic,
      keyDifferences: analysis?.framingDifferences?.slice(0, 2).map(fd => fd.topic) || ['Coverage emphasis varies', 'Language choices differ'],
    }, client);
    sections.push(makeSection(closing, position++));

    // Combine into full script content
    const fullContent = sections.map(s => `## ${s.sectionType.toUpperCase()}\n\n${s.content}`).join('\n\n---\n\n');
    const totalWordCount = estimateWordCount(fullContent);
    const totalDuration = estimateDuration(totalWordCount);

    // Create script
    const script = this.db.createScript({
      storyId: input.storyId,
      briefId: input.briefId || '',
      title: input.storyTopic,
      status: 'draft',
      content: fullContent,
      sections,
      wordCount: totalWordCount,
      estimatedDurationSeconds: totalDuration,
      generationParams: {
        model: this.model,
        preferences: input.preferences,
      },
    });

    // Run QA validation
    const qa = this.validateScript(script);

    // Update script with QA results
    if (!qa.passed) {
      this.db.updateScript(script.id, { status: 'draft' });
    }

    return { script, qa };
  }

  /**
   * Generate a single section
   */
  private async generateSection(
    type: 'opening' | 'verified_facts' | 'outlet_analysis' | 'critical_questions' | 'closing',
    data: Record<string, unknown>,
    client: Anthropic | null
  ): Promise<Omit<ScriptSection, 'id' | 'scriptId' | 'position' | 'createdAt'>> {
    let prompt: string;

    switch (type) {
      case 'opening':
        prompt = getOpeningPrompt(
          data.storyTopic as string,
          data.context as string,
          data.stakes as string
        );
        break;
      case 'verified_facts':
        prompt = getVerifiedFactsPrompt(data.universalFacts as string[]);
        break;
      case 'outlet_analysis':
        prompt = getOutletAnalysisPrompt(data as unknown as OutletAnalysisData);
        break;
      case 'critical_questions':
        prompt = getCriticalQuestionsPrompt({
          coverageQuestions: data.coverageQuestions as string[],
        });
        break;
      case 'closing':
        prompt = getClosingPrompt(
          data.storyTopic as string,
          data.keyDifferences as string[]
        );
        break;
    }

    let content: string;

    if (client) {
      const response = await client.messages.create({
        model: this.model,
        max_tokens: 2048,
        system: SCRIPT_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }],
      });
      content = response.content[0].type === 'text' ? response.content[0].text : '';
    } else {
      // Mock content when no API
      content = this.getMockContent(type);
    }

    // Ensure closing has signature
    if (type === 'closing' && !content.includes(SIGNATURE_CLOSING)) {
      content = content.trim() + '\n\n' + SIGNATURE_CLOSING;
    }

    // Check for violations
    const violations = checkProhibitedPatterns(content);
    const errors = violations.filter(v => v.severity === 'error');
    if (errors.length > 0) {
      console.warn(`[ScriptGenerator] Section ${type} has ${errors.length} violations`);
    }

    const wordCount = estimateWordCount(content);

    // Map section type
    const sectionTypeMap: Record<string, ScriptSection['sectionType']> = {
      opening: 'intro',
      verified_facts: 'story',
      outlet_analysis: 'analysis',
      critical_questions: 'opinion',
      closing: 'close',
    };

    return {
      sectionType: sectionTypeMap[type] || 'story',
      content,
      wordCount,
      notes: errors.length > 0 ? `${errors.length} violations detected` : undefined,
    };
  }

  /**
   * Get mock content for when no API is available
   */
  private getMockContent(type: string): string {
    const mocks: Record<string, string> = {
      opening: `Good morning. This is "Warnings with Loring," where we examine how news shapes your understanding of current events.

Today we examine how America's news outlets are covering this story. The coverage reveals significant differences in how outlets present the same underlying facts.

Let's look at what you're being told—and what you're not.`,
      verified_facts: `First, what we know for certain—facts reported across all outlets:

• The event occurred as reported
• Official statements have been made
• Coverage has varied significantly

These points appear in coverage from left to right. Everything else? That's where the story diverges.`,
      outlet_analysis: `Right-leaning outlets emphasize certain aspects of the story, while left-leaning outlets focus on different elements.

Moving to the center of the political spectrum, centrist outlets provide a more balanced perspective.

Here's what's different:

• The same event is described very differently across outlets
• Selective facts appear in some coverage but not others
• Language choices diverge significantly`,
      critical_questions: `The differences in coverage raise some important questions:

• Why do outlets cite different experts and sources?
• What determines which facts lead the coverage?
• How does headline selection shape perception?

These aren't accusations—they're observations. When we see patterns like this, it's worth asking why.`,
      closing: `We've seen how this story looks different depending on where you get your news.

The question isn't which outlet is right—it's whether you're seeing the full picture.

${SIGNATURE_CLOSING}`,
    };

    return mocks[type] || '[Mock section content]';
  }

  /**
   * Validate a script against QA rules
   */
  validateScript(script: Script): QAResult {
    const issues: QAResult['issues'] = [];
    let score = 100;

    // Check for signature closing
    if (!script.content.includes(SIGNATURE_CLOSING)) {
      issues.push({
        type: 'missing_signature',
        message: 'Script missing required signature closing',
        severity: 'error',
      });
      score -= 20;
    }

    // Check word count
    if (script.wordCount < 750) {
      issues.push({
        type: 'word_count',
        message: `Script too short: ${script.wordCount} words (min: 750)`,
        severity: 'warning',
      });
      score -= 10;
    } else if (script.wordCount > 1200) {
      issues.push({
        type: 'word_count',
        message: `Script too long: ${script.wordCount} words (max: 1200)`,
        severity: 'warning',
      });
      score -= 10;
    }

    // Check for prohibited patterns
    const violations = checkProhibitedPatterns(script.content);
    const errors = violations.filter(v => v.severity === 'error');
    const warnings = violations.filter(v => v.severity === 'warning');

    if (errors.length > 0) {
      issues.push({
        type: 'prohibited_patterns',
        message: `Found ${errors.length} prohibited pattern violations`,
        severity: 'error',
      });
      score -= errors.length * 5;
    }

    if (warnings.length > 0) {
      issues.push({
        type: 'language_warnings',
        message: `Found ${warnings.length} language warnings`,
        severity: 'warning',
      });
      score -= warnings.length * 2;
    }

    // Check sections
    if (script.sections.length < 5) {
      issues.push({
        type: 'missing_sections',
        message: `Script has only ${script.sections.length} sections (expected 5)`,
        severity: 'warning',
      });
      score -= 10;
    }

    return {
      passed: !issues.some(i => i.severity === 'error'),
      score: Math.max(0, score),
      issues,
    };
  }

  /**
   * Revise a section with feedback
   */
  async reviseSection(
    scriptId: string,
    sectionIndex: number,
    feedback: string,
    preserveFacts = true
  ): Promise<Script | null> {
    const script = this.db.getScript(scriptId);
    if (!script || sectionIndex >= script.sections.length) return null;

    const section = script.sections[sectionIndex];
    const client = getAnthropicClient();

    const revisionPrompt = `Revise the following script section based on this feedback:

FEEDBACK: ${feedback}

${preserveFacts ? 'IMPORTANT: Preserve all factual content. Only adjust tone, style, or structure.' : ''}

CURRENT CONTENT:
${section.content}

Generate the revised section:`;

    let newContent: string;

    if (client) {
      const response = await client.messages.create({
        model: this.model,
        max_tokens: 2048,
        system: SCRIPT_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: revisionPrompt }],
      });
      newContent = response.content[0].type === 'text' ? response.content[0].text : section.content;
    } else {
      newContent = section.content; // No change without API
    }

    // Store revision
    const revisionNumber = this.db.getNextRevisionNumber(scriptId);
    this.db.createRevision({
      scriptId,
      revisionNumber,
      previousContent: section.content,
      newContent,
      reason: feedback,
      editedBy: 'ai',
    });

    // Update section
    this.db.updateSection(section.id, {
      content: newContent,
      wordCount: estimateWordCount(newContent),
    });

    // Rebuild full content
    const updatedScript = this.db.getScript(scriptId);
    if (updatedScript) {
      const fullContent = updatedScript.sections.map(s => `## ${s.sectionType.toUpperCase()}\n\n${s.content}`).join('\n\n---\n\n');
      this.db.updateScript(scriptId, {
        content: fullContent,
        wordCount: estimateWordCount(fullContent),
        estimatedDurationSeconds: estimateDuration(estimateWordCount(fullContent)),
      });
    }

    return this.db.getScript(scriptId);
  }

  /**
   * Export script in specified format
   */
  exportScript(scriptId: string, format: 'markdown' | 'plain_text' | 'json'): {
    content: string;
    format: string;
  } | null {
    const script = this.db.getScript(scriptId);
    if (!script) return null;

    switch (format) {
      case 'markdown':
        return { content: script.content, format: 'markdown' };

      case 'plain_text':
        const plainText = script.content
          .replace(/^#+\s*/gm, '')
          .replace(/\*\*/g, '')
          .replace(/\*/g, '')
          .replace(/---/g, '');
        return { content: plainText, format: 'plain_text' };

      case 'json':
        return { content: JSON.stringify(script, null, 2), format: 'json' };

      default:
        return null;
    }
  }

  // Database access methods
  getScript(scriptId: string) {
    return this.db.getScript(scriptId);
  }

  listScripts(options?: { storyId?: string; status?: string; limit?: number; offset?: number }) {
    return this.db.listScripts(options);
  }

  updateStatus(scriptId: string, status: Script['status']) {
    return this.db.updateScript(scriptId, { status });
  }

  getRevisions(scriptId: string) {
    return this.db.getRevisions(scriptId);
  }

  getStats() {
    return this.db.getStats();
  }
}

// Export singleton instance
let instance: ScriptGeneratorService | null = new ScriptGeneratorService();
export const scriptGenerator = instance;

/**
 * Reset the singleton instance (for testing only)
 */
export function resetScriptGeneratorInstance(): void {
  instance = new ScriptGeneratorService();
  // Update the exported reference
  Object.assign(scriptGenerator, instance);
}

/**
 * Get the current singleton instance
 */
export function getScriptGenerator(): ScriptGeneratorService {
  if (!instance) {
    instance = new ScriptGeneratorService();
  }
  return instance;
}

/**
 * Script MCP Tools (20 tools)
 *
 * Tools for script generation, editing, validation, and export.
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { scriptGenerator, ScriptGeneratorService } from '../services/scriptGenerator.js';
import { getScriptDatabase, type ScriptDatabase } from '../database/scriptDatabase.js';
import { checkProhibitedPatterns, getViolationSummary } from '../config/prohibitedPatterns.js';
import { validateNIWSElements, estimateWordCount, estimateDuration } from '../config/sectionTemplates.js';
import type { Script } from '../types.js';
import {
  validate,
  generateScriptSchema,
  generateSectionSchema,
  regenerateSectionSchema,
  getScriptSchema,
  listScriptsSchema,
  getScriptSectionSchema,
  updateScriptSchema,
  updateSectionSchema,
  reviseSectionSchema,
  deleteScriptSchema,
  validateScriptSchema,
  checkProhibitedPatternsSchema,
  validateNIWSElementsSchema,
  getRevisionsSchema,
  revertToRevisionSchema,
  exportScriptSchema,
  estimateDurationSchema,
  getLearnedPatternsSchema,
  addLearnedPatternSchema,
} from '../validation/schemas.js';

// ============================================
// TOOL DEFINITIONS
// ============================================

export const scriptTools: Tool[] = [
  // --- Generation Tools ---
  {
    name: 'generate_script',
    description: 'Generate a complete "Warnings with Loring" script from a story. Uses comparative analysis to create all sections.',
    inputSchema: {
      type: 'object',
      properties: {
        story_id: { type: 'string', description: 'Story ID to generate script for' },
        story_topic: { type: 'string', description: 'Topic/title of the story' },
        brief_id: { type: 'string', description: 'Optional brief ID to use' },
        target_duration_seconds: { type: 'number', description: 'Target duration in seconds (default: 360)' },
        outlet_selection: { type: 'array', items: { type: 'string' }, description: 'Specific outlets to feature' },
        emphasis: { type: 'string', description: 'Emphasis preference (e.g., "framing differences")' },
      },
      required: ['story_id', 'story_topic'],
    },
  },
  {
    name: 'generate_section',
    description: 'Generate a single script section (opening, verified_facts, outlet_analysis, critical_questions, closing)',
    inputSchema: {
      type: 'object',
      properties: {
        script_id: { type: 'string', description: 'Script ID to add section to' },
        section_type: {
          type: 'string',
          enum: ['opening', 'verified_facts', 'outlet_analysis', 'critical_questions', 'closing'],
          description: 'Type of section to generate',
        },
        data: { type: 'object', description: 'Data for section generation' },
      },
      required: ['script_id', 'section_type'],
    },
  },
  {
    name: 'regenerate_section',
    description: 'Regenerate a specific section of a script with new parameters',
    inputSchema: {
      type: 'object',
      properties: {
        script_id: { type: 'string', description: 'Script ID' },
        section_index: { type: 'number', description: 'Index of section to regenerate (0-based)' },
        guidance: { type: 'string', description: 'Guidance for regeneration' },
      },
      required: ['script_id', 'section_index'],
    },
  },

  // --- Retrieval Tools ---
  {
    name: 'get_script',
    description: 'Get a script by ID with all sections',
    inputSchema: {
      type: 'object',
      properties: {
        script_id: { type: 'string', description: 'Script ID' },
      },
      required: ['script_id'],
    },
  },
  {
    name: 'list_scripts',
    description: 'List scripts with optional filters',
    inputSchema: {
      type: 'object',
      properties: {
        story_id: { type: 'string', description: 'Filter by story ID' },
        status: { type: 'string', enum: ['draft', 'review', 'approved', 'archived'], description: 'Filter by status' },
        limit: { type: 'number', description: 'Maximum results (default: 20)' },
        offset: { type: 'number', description: 'Offset for pagination' },
      },
    },
  },
  {
    name: 'get_script_section',
    description: 'Get a specific section from a script',
    inputSchema: {
      type: 'object',
      properties: {
        script_id: { type: 'string', description: 'Script ID' },
        section_index: { type: 'number', description: 'Section index (0-based)' },
      },
      required: ['script_id', 'section_index'],
    },
  },

  // --- Editing Tools ---
  {
    name: 'update_script',
    description: 'Update script metadata (title, status)',
    inputSchema: {
      type: 'object',
      properties: {
        script_id: { type: 'string', description: 'Script ID' },
        title: { type: 'string', description: 'New title' },
        status: { type: 'string', enum: ['draft', 'review', 'approved', 'archived'], description: 'New status' },
      },
      required: ['script_id'],
    },
  },
  {
    name: 'update_section',
    description: 'Update section content directly',
    inputSchema: {
      type: 'object',
      properties: {
        script_id: { type: 'string', description: 'Script ID' },
        section_index: { type: 'number', description: 'Section index' },
        content: { type: 'string', description: 'New content' },
        notes: { type: 'string', description: 'Notes about the update' },
      },
      required: ['script_id', 'section_index', 'content'],
    },
  },
  {
    name: 'revise_section',
    description: 'Revise a section with AI assistance based on feedback',
    inputSchema: {
      type: 'object',
      properties: {
        script_id: { type: 'string', description: 'Script ID' },
        section_index: { type: 'number', description: 'Section index' },
        feedback: { type: 'string', description: 'Feedback for revision' },
        preserve_facts: { type: 'boolean', description: 'Preserve factual content (default: true)' },
      },
      required: ['script_id', 'section_index', 'feedback'],
    },
  },
  {
    name: 'delete_script',
    description: 'Delete a script',
    inputSchema: {
      type: 'object',
      properties: {
        script_id: { type: 'string', description: 'Script ID to delete' },
      },
      required: ['script_id'],
    },
  },

  // --- Validation Tools ---
  {
    name: 'validate_script',
    description: 'Validate a script against editorial standards and QA rules',
    inputSchema: {
      type: 'object',
      properties: {
        script_id: { type: 'string', description: 'Script ID to validate' },
      },
      required: ['script_id'],
    },
  },
  {
    name: 'check_prohibited_patterns',
    description: 'Check text for prohibited patterns (editorial, intent, truth claims, partisan)',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Text to check' },
      },
      required: ['text'],
    },
  },
  {
    name: 'validate_niws_elements',
    description: 'Check if script has required NIWS elements (opening, closing intro, signature)',
    inputSchema: {
      type: 'object',
      properties: {
        script_id: { type: 'string', description: 'Script ID to validate' },
      },
      required: ['script_id'],
    },
  },

  // --- Revision Tools ---
  {
    name: 'get_revisions',
    description: 'Get revision history for a script',
    inputSchema: {
      type: 'object',
      properties: {
        script_id: { type: 'string', description: 'Script ID' },
      },
      required: ['script_id'],
    },
  },
  {
    name: 'revert_to_revision',
    description: 'Revert a section to a previous revision',
    inputSchema: {
      type: 'object',
      properties: {
        script_id: { type: 'string', description: 'Script ID' },
        revision_id: { type: 'string', description: 'Revision ID to revert to' },
      },
      required: ['script_id', 'revision_id'],
    },
  },

  // --- Export Tools ---
  {
    name: 'export_script',
    description: 'Export script in specified format (markdown, plain_text, json)',
    inputSchema: {
      type: 'object',
      properties: {
        script_id: { type: 'string', description: 'Script ID' },
        format: { type: 'string', enum: ['markdown', 'plain_text', 'json'], description: 'Export format' },
      },
      required: ['script_id', 'format'],
    },
  },
  {
    name: 'estimate_duration',
    description: 'Estimate reading duration for text at standard speaking rate',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Text to estimate' },
      },
      required: ['text'],
    },
  },

  // --- Pattern Tools ---
  {
    name: 'get_learned_patterns',
    description: 'Get learned editing patterns for script improvement',
    inputSchema: {
      type: 'object',
      properties: {
        category: { type: 'string', description: 'Filter by pattern category' },
        min_frequency: { type: 'number', description: 'Minimum usage frequency' },
      },
    },
  },
  {
    name: 'add_learned_pattern',
    description: 'Add a new learned pattern from editing feedback',
    inputSchema: {
      type: 'object',
      properties: {
        pattern_type: { type: 'string', enum: ['phrase_replacement', 'structure', 'tone'], description: 'Type of pattern' },
        original: { type: 'string', description: 'Original text/pattern' },
        replacement: { type: 'string', description: 'Replacement text/pattern' },
        confidence: { type: 'number', description: 'Confidence score (0-1)' },
      },
      required: ['pattern_type', 'original', 'replacement'],
    },
  },

  // --- Statistics ---
  {
    name: 'get_script_stats',
    description: 'Get statistics about scripts and patterns',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

// ============================================
// TOOL HANDLERS
// ============================================

export class ScriptToolHandlers {
  private generator: ScriptGeneratorService;
  private db: ScriptDatabase;

  constructor() {
    this.generator = scriptGenerator;
    this.db = getScriptDatabase();
  }

  async handleTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    switch (name) {
      // Generation
      case 'generate_script':
        return this.handleGenerateScript(args);
      case 'generate_section':
        return this.handleGenerateSection(args);
      case 'regenerate_section':
        return this.handleRegenerateSection(args);

      // Retrieval
      case 'get_script':
        return this.handleGetScript(args);
      case 'list_scripts':
        return this.handleListScripts(args);
      case 'get_script_section':
        return this.handleGetScriptSection(args);

      // Editing
      case 'update_script':
        return this.handleUpdateScript(args);
      case 'update_section':
        return this.handleUpdateSection(args);
      case 'revise_section':
        return this.handleReviseSection(args);
      case 'delete_script':
        return this.handleDeleteScript(args);

      // Validation
      case 'validate_script':
        return this.handleValidateScript(args);
      case 'check_prohibited_patterns':
        return this.handleCheckProhibitedPatterns(args);
      case 'validate_niws_elements':
        return this.handleValidateNIWSElements(args);

      // Revisions
      case 'get_revisions':
        return this.handleGetRevisions(args);
      case 'revert_to_revision':
        return this.handleRevertToRevision(args);

      // Export
      case 'export_script':
        return this.handleExportScript(args);
      case 'estimate_duration':
        return this.handleEstimateDuration(args);

      // Patterns
      case 'get_learned_patterns':
        return this.handleGetLearnedPatterns(args);
      case 'add_learned_pattern':
        return this.handleAddLearnedPattern(args);

      // Statistics
      case 'get_script_stats':
        return this.handleGetScriptStats();

      default:
        throw new Error(`Unknown script tool: ${name}`);
    }
  }

  // --- Generation Handlers ---

  private async handleGenerateScript(args: Record<string, unknown>) {
    const validation = validate(generateScriptSchema, args);
    if (!validation.success) {
      return { success: false, error: validation.error };
    }
    const data = validation.data!;

    try {
      const result = await this.generator.generateScript({
        storyId: data.story_id,
        storyTopic: data.story_topic,
        briefId: data.brief_id,
        preferences: {
          targetDurationSeconds: data.target_duration_seconds,
          outletSelection: data.outlet_selection,
          emphasis: data.emphasis,
        },
      });

      return {
        success: true,
        script_id: result.script.id,
        title: result.script.title,
        word_count: result.script.wordCount,
        estimated_duration_seconds: result.script.estimatedDurationSeconds,
        sections_count: result.script.sections.length,
        qa_passed: result.qa.passed,
        qa_score: result.qa.score,
        qa_issues: result.qa.issues,
      };
    } catch (error) {
      console.error('[ScriptTools] generateScript failed:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Script generation failed' };
    }
  }

  private async handleGenerateSection(args: Record<string, unknown>) {
    const validation = validate(generateSectionSchema, args);
    if (!validation.success) {
      return { success: false, error: validation.error };
    }
    const data = validation.data!;

    const script = this.db.getScript(data.script_id);
    if (!script) {
      return { success: false, error: `Script not found: ${data.script_id}` };
    }

    // Section generation would require calling the generator with specific data
    return {
      success: false,
      error: 'Section generation requires full script context - use regenerate_section instead',
    };
  }

  private async handleRegenerateSection(args: Record<string, unknown>) {
    const validation = validate(regenerateSectionSchema, args);
    if (!validation.success) {
      return { success: false, error: validation.error };
    }
    const data = validation.data!;

    const guidance = data.guidance || 'Regenerate this section with improved clarity';

    try {
      const result = await this.generator.reviseSection(data.script_id, data.section_index, guidance);
      if (!result) {
        return { success: false, error: 'Failed to regenerate section' };
      }

      return {
        success: true,
        script_id: result.id,
        section_index: data.section_index,
        new_content: result.sections[data.section_index]?.content,
      };
    } catch (error) {
      console.error('[ScriptTools] regenerateSection failed:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Section regeneration failed' };
    }
  }

  // --- Retrieval Handlers ---

  private handleGetScript(args: Record<string, unknown>) {
    const validation = validate(getScriptSchema, args);
    if (!validation.success) {
      return { success: false, error: validation.error };
    }
    const data = validation.data!;

    const script = this.db.getScript(data.script_id);
    if (!script) {
      return { success: false, error: `Script not found: ${data.script_id}` };
    }
    return { success: true, script };
  }

  private handleListScripts(args: Record<string, unknown>) {
    const validation = validate(listScriptsSchema, args);
    if (!validation.success) {
      return { success: false, error: validation.error };
    }
    const data = validation.data!;

    const result = this.db.listScripts({
      storyId: data.story_id,
      status: data.status,
      limit: data.limit || 20,
      offset: data.offset,
    });

    return {
      success: true,
      scripts: result.scripts.map(s => ({
        id: s.id,
        title: s.title,
        status: s.status,
        word_count: s.wordCount,
        created_at: s.createdAt,
      })),
      total: result.total,
    };
  }

  private handleGetScriptSection(args: Record<string, unknown>) {
    const validation = validate(getScriptSectionSchema, args);
    if (!validation.success) {
      return { success: false, error: validation.error };
    }
    const data = validation.data!;

    const script = this.db.getScript(data.script_id);
    if (!script) {
      return { success: false, error: `Script not found: ${data.script_id}` };
    }

    if (data.section_index >= script.sections.length) {
      return { success: false, error: `Section index out of range: ${data.section_index}` };
    }

    return { success: true, section: script.sections[data.section_index] };
  }

  // --- Editing Handlers ---

  private handleUpdateScript(args: Record<string, unknown>) {
    const validation = validate(updateScriptSchema, args);
    if (!validation.success) {
      return { success: false, error: validation.error };
    }
    const data = validation.data!;

    const updates: Partial<Script> = {};
    if (data.title) updates.title = data.title;
    if (data.status) updates.status = data.status;

    const result = this.db.updateScript(data.script_id, updates);
    if (!result) {
      return { success: false, error: `Script not found: ${data.script_id}` };
    }

    return { success: true, script_id: result.id, updated: Object.keys(updates) };
  }

  private handleUpdateSection(args: Record<string, unknown>) {
    const validation = validate(updateSectionSchema, args);
    if (!validation.success) {
      return { success: false, error: validation.error };
    }
    const data = validation.data!;

    const script = this.db.getScript(data.script_id);
    if (!script) {
      return { success: false, error: `Script not found: ${data.script_id}` };
    }

    if (data.section_index >= script.sections.length) {
      return { success: false, error: `Section index out of range` };
    }

    const section = script.sections[data.section_index];
    const result = this.db.updateSection(section.id, {
      content: data.content,
      notes: data.notes,
      wordCount: estimateWordCount(data.content),
    });

    return { success: !!result, section_id: section.id };
  }

  private async handleReviseSection(args: Record<string, unknown>) {
    const validation = validate(reviseSectionSchema, args);
    if (!validation.success) {
      return { success: false, error: validation.error };
    }
    const data = validation.data!;

    try {
      const result = await this.generator.reviseSection(
        data.script_id,
        data.section_index,
        data.feedback,
        data.preserve_facts !== false
      );

      if (!result) {
        return { success: false, error: 'Failed to revise section' };
      }

      return {
        success: true,
        script_id: result.id,
        new_word_count: result.wordCount,
      };
    } catch (error) {
      console.error('[ScriptTools] reviseSection failed:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Section revision failed' };
    }
  }

  private handleDeleteScript(args: Record<string, unknown>) {
    const validation = validate(deleteScriptSchema, args);
    if (!validation.success) {
      return { success: false, error: validation.error };
    }
    const data = validation.data!;

    const success = this.db.deleteScript(data.script_id);
    return { success, script_id: data.script_id };
  }

  // --- Validation Handlers ---

  private handleValidateScript(args: Record<string, unknown>) {
    const validation = validate(validateScriptSchema, args);
    if (!validation.success) {
      return { success: false, error: validation.error };
    }
    const data = validation.data!;

    const script = this.db.getScript(data.script_id);
    if (!script) {
      return { success: false, error: `Script not found: ${data.script_id}` };
    }

    const qa = this.generator.validateScript(script);
    return { success: true, script_id: script.id, qa };
  }

  private handleCheckProhibitedPatterns(args: Record<string, unknown>) {
    const validation = validate(checkProhibitedPatternsSchema, args);
    if (!validation.success) {
      return { success: false, error: validation.error };
    }
    const data = validation.data!;

    const result = getViolationSummary(data.text);
    return { success: true, ...result };
  }

  private handleValidateNIWSElements(args: Record<string, unknown>) {
    const validation = validate(validateNIWSElementsSchema, args);
    if (!validation.success) {
      return { success: false, error: validation.error };
    }
    const data = validation.data!;

    const script = this.db.getScript(data.script_id);
    if (!script) {
      return { success: false, error: `Script not found: ${data.script_id}` };
    }

    const result = validateNIWSElements(script.content);
    return { success: true, script_id: script.id, ...result };
  }

  // --- Revision Handlers ---

  private handleGetRevisions(args: Record<string, unknown>) {
    const validation = validate(getRevisionsSchema, args);
    if (!validation.success) {
      return { success: false, error: validation.error };
    }
    const data = validation.data!;

    const revisions = this.db.getRevisions(data.script_id);
    return { success: true, revisions };
  }

  private handleRevertToRevision(args: Record<string, unknown>) {
    const validation = validate(revertToRevisionSchema, args);
    if (!validation.success) {
      return { success: false, error: validation.error };
    }
    const data = validation.data!;

    // Get the revision
    const revisions = this.db.getRevisions(data.script_id);
    const revision = revisions.find(r => r.id === data.revision_id);

    if (!revision) {
      return { success: false, error: `Revision not found: ${data.revision_id}` };
    }

    // This would need to restore the previous content
    return {
      success: false,
      error: 'Revert functionality requires implementation',
    };
  }

  // --- Export Handlers ---

  private handleExportScript(args: Record<string, unknown>) {
    const validation = validate(exportScriptSchema, args);
    if (!validation.success) {
      return { success: false, error: validation.error };
    }
    const data = validation.data!;

    const result = this.generator.exportScript(data.script_id, data.format);

    if (!result) {
      return { success: false, error: `Script not found: ${data.script_id}` };
    }

    return { success: true, ...result };
  }

  private handleEstimateDuration(args: Record<string, unknown>) {
    const validation = validate(estimateDurationSchema, args);
    if (!validation.success) {
      return { success: false, error: validation.error };
    }
    const data = validation.data!;

    const words = estimateWordCount(data.text);
    const seconds = estimateDuration(words);

    return {
      success: true,
      word_count: words,
      duration_seconds: seconds,
      duration_formatted: `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`,
    };
  }

  // --- Pattern Handlers ---

  private handleGetLearnedPatterns(args: Record<string, unknown>) {
    const validation = validate(getLearnedPatternsSchema, args);
    if (!validation.success) {
      return { success: false, error: validation.error };
    }
    const data = validation.data!;

    const patterns = this.db.getLearnedPatterns(
      data.category,
      data.min_frequency || 1
    );
    return { success: true, patterns };
  }

  private handleAddLearnedPattern(args: Record<string, unknown>) {
    const validation = validate(addLearnedPatternSchema, args);
    if (!validation.success) {
      return { success: false, error: validation.error };
    }
    const data = validation.data!;

    const pattern = this.db.addLearnedPattern({
      patternType: data.pattern_type,
      original: data.original,
      replacement: data.replacement,
      frequency: 1,
      confidence: data.confidence || 0.5,
      isActive: true,
    });

    return { success: true, pattern_id: pattern.id };
  }

  // --- Statistics ---

  private handleGetScriptStats() {
    const stats = this.db.getStats();
    return { success: true, stats };
  }
}

export function isScriptTool(name: string): boolean {
  return scriptTools.some(t => t.name === name);
}

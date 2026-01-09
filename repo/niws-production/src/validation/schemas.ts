/**
 * Zod Validation Schemas
 *
 * Input validation for all MCP tools and HTTP endpoints.
 */

import { z } from 'zod';

// ============================================
// COMMON SCHEMAS
// ============================================

export const idSchema = z.string().min(1).max(100);
export const scriptIdSchema = z.string().regex(/^script_[a-f0-9]+$/, 'Invalid script ID format');
export const briefIdSchema = z.string().regex(/^brief_[a-f0-9]+$/, 'Invalid brief ID format');
export const storyIdSchema = z.string().regex(/^story_[a-f0-9]+$/, 'Invalid story ID format');

export const paginationSchema = z.object({
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
});

// ============================================
// SCRIPT TOOL SCHEMAS
// ============================================

export const generateScriptSchema = z.object({
  story_id: z.string().min(1, 'story_id is required'),
  story_topic: z.string().min(1).max(500, 'story_topic must be 1-500 characters'),
  brief_id: z.string().optional(),
  target_duration_seconds: z.number().int().min(60).max(600).optional(),
  outlet_selection: z.array(z.string()).max(10).optional(),
  emphasis: z.string().max(200).optional(),
});

export const generateSectionSchema = z.object({
  script_id: z.string().min(1, 'script_id is required'),
  section_type: z.enum(['opening', 'verified_facts', 'outlet_analysis', 'critical_questions', 'closing']),
  data: z.record(z.string(), z.unknown()).optional(),
});

export const regenerateSectionSchema = z.object({
  script_id: z.string().min(1, 'script_id is required'),
  section_index: z.number().int().min(0).max(20),
  guidance: z.string().max(1000).optional(),
});

export const getScriptSchema = z.object({
  script_id: z.string().min(1, 'script_id is required'),
});

export const listScriptsSchema = z.object({
  story_id: z.string().optional(),
  status: z.enum(['draft', 'review', 'approved', 'archived']).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
});

export const getScriptSectionSchema = z.object({
  script_id: z.string().min(1, 'script_id is required'),
  section_index: z.number().int().min(0).max(20),
});

export const updateScriptSchema = z.object({
  script_id: z.string().min(1, 'script_id is required'),
  title: z.string().min(1).max(500).optional(),
  status: z.enum(['draft', 'review', 'approved', 'archived']).optional(),
});

export const updateSectionSchema = z.object({
  script_id: z.string().min(1, 'script_id is required'),
  section_index: z.number().int().min(0).max(20),
  content: z.string().min(1).max(50000, 'content must be 1-50000 characters'),
  notes: z.string().max(1000).optional(),
});

export const reviseSectionSchema = z.object({
  script_id: z.string().min(1, 'script_id is required'),
  section_index: z.number().int().min(0).max(20),
  feedback: z.string().min(1).max(2000, 'feedback must be 1-2000 characters'),
  preserve_facts: z.boolean().optional(),
});

export const deleteScriptSchema = z.object({
  script_id: z.string().min(1, 'script_id is required'),
});

export const validateScriptSchema = z.object({
  script_id: z.string().min(1, 'script_id is required'),
});

export const checkProhibitedPatternsSchema = z.object({
  text: z.string().min(1).max(100000, 'text must be 1-100000 characters'),
});

export const validateNIWSElementsSchema = z.object({
  script_id: z.string().min(1, 'script_id is required'),
});

export const getRevisionsSchema = z.object({
  script_id: z.string().min(1, 'script_id is required'),
});

export const revertToRevisionSchema = z.object({
  script_id: z.string().min(1, 'script_id is required'),
  revision_id: z.string().min(1, 'revision_id is required'),
});

export const exportScriptSchema = z.object({
  script_id: z.string().min(1, 'script_id is required'),
  format: z.enum(['markdown', 'plain_text', 'json']),
});

export const estimateDurationSchema = z.object({
  text: z.string().min(1).max(100000, 'text must be 1-100000 characters'),
});

export const getLearnedPatternsSchema = z.object({
  category: z.string().optional(),
  min_frequency: z.number().int().min(1).optional(),
});

export const addLearnedPatternSchema = z.object({
  pattern_type: z.enum(['phrase_replacement', 'structure', 'tone']),
  original: z.string().min(1).max(1000, 'original must be 1-1000 characters'),
  replacement: z.string().min(1).max(1000, 'replacement must be 1-1000 characters'),
  confidence: z.number().min(0).max(1).optional(),
});

// ============================================
// BRIEF TOOL SCHEMAS
// ============================================

export const createBriefSchema = z.object({
  story_id: z.string().min(1, 'story_id is required'),
  title: z.string().min(1).max(500, 'title must be 1-500 characters'),
  summary: z.string().max(10000).optional(),
  key_facts: z.array(z.string().max(1000)).max(50).optional(),
  perspectives: z.array(z.object({
    outlet_id: z.string(),
    outlet_name: z.string(),
    perspective: z.string(),
    quotes: z.array(z.object({
      text: z.string(),
      attribution: z.string(),
      context: z.string(),
    })).optional(),
  })).max(20).optional(),
});

export const getBriefSchema = z.object({
  brief_id: z.string().min(1, 'brief_id is required'),
});

export const listBriefsSchema = z.object({
  story_id: z.string().optional(),
  status: z.enum(['draft', 'reviewed', 'approved', 'used']).optional(),
  moral_alignment: z.enum(['christ', 'anti-christ', 'neutral', 'mixed']).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
});

export const updateBriefSchema = z.object({
  brief_id: z.string().min(1, 'brief_id is required'),
  title: z.string().min(1).max(500).optional(),
  summary: z.string().max(10000).optional(),
  key_facts: z.array(z.string().max(1000)).max(50).optional(),
});

export const addQuoteSchema = z.object({
  brief_id: z.string().min(1, 'brief_id is required'),
  text: z.string().min(1).max(5000, 'text must be 1-5000 characters'),
  attribution: z.string().min(1).max(500, 'attribution must be 1-500 characters'),
  context: z.string().max(1000).optional(),
  article_id: z.string().optional(),
  outlet_id: z.string().optional(),
  is_key_quote: z.boolean().optional(),
});

export const addLegislationSchema = z.object({
  brief_id: z.string().min(1, 'brief_id is required'),
  title: z.string().min(1).max(500, 'title must be 1-500 characters'),
  bill_number: z.string().max(100).optional(),
  summary: z.string().max(5000).optional(),
  status: z.string().max(100).optional(),
  sponsors: z.array(z.string().max(200)).max(50).optional(),
  impact_assessment: z.string().max(5000).optional(),
  moral_implications: z.string().max(5000).optional(),
});

export const rateActionSchema = z.object({
  action: z.string().min(1).max(1000, 'action must be 1-1000 characters'),
  subject: z.string().min(1).max(500, 'subject must be 1-500 characters'),
  affected: z.array(z.string().max(200)).min(1).max(20, 'affected must have 1-20 items'),
  context: z.string().max(2000).optional(),
  brief_id: z.string().optional(),
});

export const getRatingsSchema = z.object({
  brief_id: z.string().min(1, 'brief_id is required'),
});

// Additional tool-specific schemas
export const createStoryBriefSchema = z.object({
  story_id: z.string().min(1, 'story_id is required'),
  title: z.string().min(1).max(500, 'title must be 1-500 characters'),
  extract_quotes: z.boolean().optional(),
  analyze_legislation: z.boolean().optional(),
  rate_morality: z.boolean().optional(),
});

export const updateBriefStatusSchema = z.object({
  brief_id: z.string().min(1, 'brief_id is required'),
  status: z.enum(['draft', 'reviewed', 'approved', 'used']),
});

export const compareQuotesSchema = z.object({
  speaker: z.string().min(1).max(200, 'speaker must be 1-200 characters'),
  story_id: z.string().min(1, 'story_id is required'),
});

export const analyzeLegislationSchema = z.object({
  bill_identifier: z.string().min(1).max(500, 'bill_identifier must be 1-500 characters'),
  story_id: z.string().min(1, 'story_id is required'),
  brief_id: z.string().optional(),
});

// ============================================
// VALIDATION HELPERS
// ============================================

export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Validate input against a schema
 */
export function validate<T>(
  schema: z.ZodSchema<T>,
  input: unknown
): ValidationResult<T> {
  const result = schema.safeParse(input);

  if (result.success) {
    return { success: true, data: result.data };
  }

  // Format error message
  const errors = result.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`);
  return { success: false, error: `Validation failed: ${errors.join('; ')}` };
}

/**
 * Create a validated handler wrapper
 */
export function withValidation<T, R>(
  schema: z.ZodSchema<T>,
  handler: (data: T) => R | Promise<R>
): (input: unknown) => Promise<{ success: false; error: string } | R> {
  return async (input: unknown) => {
    const validation = validate(schema, input);
    if (!validation.success) {
      return { success: false, error: validation.error! };
    }
    return handler(validation.data!);
  };
}

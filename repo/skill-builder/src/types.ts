/**
 * Skill Builder Type Definitions
 * Based on Anthropic Claude Skills specification
 */

// =============================================================================
// Core Skill Types
// =============================================================================

/**
 * Layer 1 metadata - always loaded for matching (~100 tokens)
 */
export interface SkillMetadata {
  id: string;
  name: string;
  description: string;
  tags: string[];
  token_count_layer1: number;
  token_count_layer2: number;
  usage_count: number;
  success_rate: number;
  created_at: number;
  deprecated_at?: number;
}

/**
 * Full skill with Layer 1 + Layer 2 content
 */
export interface Skill extends SkillMetadata {
  full_content: string;
  file_path?: string;
  version: number;
  updated_at?: number;
  success_count: number;
  bundled_files: BundledFile[];
}

/**
 * Layer 3 - Bundled reference files
 */
export interface BundledFile {
  id: string;
  skill_id: string;
  file_name: string;
  file_path: string;
  file_type: string;
  token_count: number;
  created_at: number;
}

// =============================================================================
// SKILL.md Parsing
// =============================================================================

/**
 * Parsed SKILL.md structure following Anthropic spec
 */
export interface ParsedSkill {
  frontmatter: SkillFrontmatter;
  body: SkillBody;
  raw_content: string;
}

/**
 * YAML frontmatter in SKILL.md
 */
export interface SkillFrontmatter {
  name: string;
  description: string;
  tags?: string[];
}

/**
 * Markdown body sections in SKILL.md
 */
export interface SkillBody {
  overview?: string;
  prerequisites?: string[];
  steps?: string[];
  examples?: string[];
  error_handling?: string;
  limitations?: string;
  raw_body: string;
}

// =============================================================================
// Skill Matching & Discovery
// =============================================================================

/**
 * Result of matching a task to skills
 */
export interface SkillMatch {
  skill_id: string;
  name: string;
  description: string;
  confidence: number;
  triggered_by: string[];
}

/**
 * Skill usage record
 */
export interface SkillUsage {
  id: string;
  skill_id: string;
  outcome: 'success' | 'failure' | 'partial';
  context?: Record<string, unknown>;
  notes?: string;
  duration_ms?: number;
  created_at: number;
}

/**
 * Skill version for history/rollback
 */
export interface SkillVersion {
  id: string;
  skill_id: string;
  version: number;
  content: string;
  created_at: number;
}

// =============================================================================
// Validation
// =============================================================================

/**
 * Result of validating a SKILL.md file
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  token_counts: {
    layer1: number;
    layer2: number;
  };
  progressive_disclosure_ok: boolean;
  description_analysis?: DescriptionAnalysis;
}

/**
 * Analysis of description field effectiveness
 */
export interface DescriptionAnalysis {
  clarity_score: number;
  trigger_keywords: string[];
  suggestions: string[];
  too_broad: boolean;
  too_narrow: boolean;
}

// =============================================================================
// Tool Input/Output Types
// =============================================================================

// create_skill
export interface CreateSkillInput {
  name: string;
  description: string;
  overview: string;
  steps: string[];
  examples?: string[];
  prerequisites?: string[];
  error_handling?: string;
  limitations?: string;
  tags?: string[];
}

export interface SkillConflict {
  existing_skill_id: string;
  existing_skill_name: string;
  overlap_score: number;
  shared_keywords: string[];
  shared_tags: string[];
  recommendation: string;
}

export interface CreateSkillOutput {
  skill_id: string;
  path: string;
  created: true;
  token_count: {
    layer1: number;
    layer2: number;
  };
  conflicts?: SkillConflict[];
}

// validate_skill
export interface ValidateSkillInput {
  skill_id?: string;
  path?: string;
  content?: string;
}

// analyze_description
export interface AnalyzeDescriptionInput {
  description: string;
  intended_triggers?: string[];
}

// list_skills
export interface ListSkillsInput {
  tags?: string[];
  search?: string;
  include_deprecated?: boolean;
}

export interface ListSkillsOutput {
  skills: SkillMetadata[];
  count: number;
}

// get_skill
export interface GetSkillInput {
  skill_id?: string;
  name?: string;
}

export interface GetSkillOutput {
  skill_id: string;
  name: string;
  description: string;
  full_content: string;
  token_counts: {
    layer1: number;
    layer2: number;
  };
  usage_count: number;
  success_rate: number;
  bundled_files: string[];
}

// update_skill
export interface UpdateSkillInput {
  skill_id: string;
  updates: Partial<{
    name: string;
    description: string;
    overview: string;
    steps: string[];
    examples: string[];
    prerequisites: string[];
    error_handling: string;
    limitations: string;
    tags: string[];
  }>;
}

export interface UpdateSkillOutput {
  updated: true;
  skill_id: string;
  previous_version: number;
  new_version: number;
}

// match_skill
export interface MatchSkillInput {
  task_description: string;
  context?: Record<string, unknown>;
  min_confidence?: number;
}

export interface MatchSkillOutput {
  matches: SkillMatch[];
  best_match?: string;
}

// record_skill_usage
export interface RecordSkillUsageInput {
  skill_id: string;
  outcome: 'success' | 'failure' | 'partial';
  notes?: string;
  duration_ms?: number;
  context?: Record<string, unknown>;
}

export interface RecordSkillUsageOutput {
  recorded: true;
  skill_id: string;
  total_uses: number;
  success_rate: number;
}

// =============================================================================
// InterLock Signals
// =============================================================================

export const SignalTypes = {
  // Incoming signals
  EXPERIENCE_RECORDED: 0xF0,
  PATTERN_EMERGED: 0xF1,
  LESSON_EXTRACTED: 0xF2,
  OPERATION_COMPLETE: 0xFF,
  HEARTBEAT: 0x00,

  // Outgoing signals
  SKILL_CREATED: 0xA0,
  SKILL_MATCHED: 0xA1,
  SKILL_USED: 0xA2,
  SKILL_DEPRECATED: 0xA3,
  SKILL_VALIDATION_FAILED: 0xA4,
} as const;

export type SignalCode = typeof SignalTypes[keyof typeof SignalTypes];

export interface Signal {
  signalType: number;
  version: number;
  timestamp: number;
  payload: {
    sender: string;
    [key: string]: unknown;
  };
}

// =============================================================================
// Configuration
// =============================================================================

export const SKILL_CONFIG = {
  // Progressive disclosure limits
  LAYER1_MAX_TOKENS: 100,
  LAYER2_MAX_TOKENS: 5000,

  // Validation thresholds
  MIN_DESCRIPTION_LENGTH: 20,
  MAX_DESCRIPTION_LENGTH: 500,

  // Matching thresholds
  MIN_MATCH_CONFIDENCE: 0.3,
  HIGH_MATCH_CONFIDENCE: 0.7,

  // Skill directories to index
  SKILL_DIRECTORIES: [
    '/Users/macbook/Documents/claude_home/repo/claude-skills/',
    '/Users/macbook/Documents/claude_home/repo/bop/skills/'
  ]
} as const;

// =============================================================================
// Database Row Types (for SQLite)
// =============================================================================

export interface SkillRow {
  id: string;
  name: string;
  description: string;
  full_content: string;
  version: number;
  token_count_layer1: number;
  token_count_layer2: number;
  file_path: string | null;
  tags: string | null;  // JSON string
  created_at: number;
  updated_at: number | null;
  deprecated_at: number | null;
  usage_count: number;
  success_count: number;
}

export interface SkillFileRow {
  id: string;
  skill_id: string;
  file_name: string;
  file_path: string;
  file_type: string | null;
  token_count: number | null;
  created_at: number;
}

export interface SkillUsageRow {
  id: string;
  skill_id: string;
  outcome: string;
  context: string | null;  // JSON string
  notes: string | null;
  duration_ms: number | null;
  created_at: number;
}

export interface SkillVersionRow {
  id: string;
  skill_id: string;
  version: number;
  content: string;
  created_at: number;
}

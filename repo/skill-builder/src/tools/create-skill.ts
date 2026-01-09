/**
 * create_skill Tool
 * Generate a SKILL.md file following Anthropic's specification
 */

import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../database/schema.js';
import { generateSkillMd } from '../parser/skill-parser.js';
import { countLayer1Tokens, countLayer2Tokens } from '../services/token-counter.js';
import { detectSkillConflicts } from '../services/skill-matcher.js';
import {
  CreateSkillInput,
  CreateSkillOutput,
  SkillFrontmatter,
  SkillBody
} from '../types.js';

export function createSkill(input: CreateSkillInput): CreateSkillOutput {
  const db = getDatabase();

  // Validate skill name (alphanumeric, hyphens, underscores only, max 100 chars)
  const NAME_PATTERN = /^[a-zA-Z0-9_-]+$/;
  if (!input.name || input.name.length > 100 || !NAME_PATTERN.test(input.name)) {
    throw new Error(
      'Invalid skill name. Must be 1-100 characters, alphanumeric with hyphens and underscores only.'
    );
  }

  // Check for conflicts with existing skills before creation
  const existingSkills = db.getAllSkills();
  const conflicts = detectSkillConflicts(
    { name: input.name, description: input.description, tags: input.tags },
    existingSkills,
    0.8 // 80% overlap threshold
  );

  // Build frontmatter
  const frontmatter: SkillFrontmatter = {
    name: input.name,
    description: input.description,
    tags: input.tags
  };

  // Build body
  const body: SkillBody = {
    overview: input.overview,
    prerequisites: input.prerequisites,
    steps: input.steps,
    examples: input.examples,
    error_handling: input.error_handling,
    limitations: input.limitations,
    raw_body: ''
  };

  // Generate SKILL.md content
  const fullContent = generateSkillMd(frontmatter, body);

  // Calculate token counts
  const layer1Tokens = countLayer1Tokens(input.name, input.description);
  const layer2Tokens = countLayer2Tokens(fullContent);

  // Generate skill ID
  const skillId = uuidv4();

  // Insert into database
  db.insertSkill({
    id: skillId,
    name: input.name,
    description: input.description,
    full_content: fullContent,
    version: 1,
    token_count_layer1: layer1Tokens,
    token_count_layer2: layer2Tokens,
    tags: input.tags || [],
    created_at: Date.now(),
    usage_count: 0,
    success_count: 0
  });

  // Build result with optional conflict warnings
  const result: CreateSkillOutput = {
    skill_id: skillId,
    path: `skills/${input.name}/SKILL.md`,
    created: true,
    token_count: {
      layer1: layer1Tokens,
      layer2: layer2Tokens
    }
  };

  // Add conflict warnings if any detected
  if (conflicts.length > 0) {
    result.conflicts = conflicts;
  }

  return result;
}

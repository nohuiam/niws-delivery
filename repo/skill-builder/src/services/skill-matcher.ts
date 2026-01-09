/**
 * Skill Matcher Service
 * Semantic matching for skill discovery
 *
 * Uses simple text similarity and keyword matching.
 * For production, consider using embeddings or more sophisticated NLP.
 */

import { SkillMetadata, SkillMatch, SkillConflict, SKILL_CONFIG } from '../types.js';

/**
 * Match a task description to available skills
 */
export function matchSkills(
  taskDescription: string,
  skills: SkillMetadata[],
  minConfidence: number = SKILL_CONFIG.MIN_MATCH_CONFIDENCE
): SkillMatch[] {
  // Clamp confidence to valid range [0, 1]
  minConfidence = Math.max(0, Math.min(1, minConfidence));

  const matches: SkillMatch[] = [];

  const taskTokens = tokenize(taskDescription.toLowerCase());
  const taskKeywords = extractKeywords(taskDescription);

  for (const skill of skills) {
    // Skip deprecated skills
    if (skill.deprecated_at) continue;

    const confidence = calculateMatchConfidence(
      taskDescription,
      taskTokens,
      taskKeywords,
      skill
    );

    if (confidence >= minConfidence) {
      const triggeredBy = findTriggers(taskTokens, taskKeywords, skill);

      matches.push({
        skill_id: skill.id,
        name: skill.name,
        description: skill.description,
        confidence,
        triggered_by: triggeredBy
      });
    }
  }

  // Sort by confidence descending
  matches.sort((a, b) => b.confidence - a.confidence);

  return matches;
}

/**
 * Calculate match confidence between task and skill
 */
function calculateMatchConfidence(
  taskDescription: string,
  taskTokens: string[],
  taskKeywords: string[],
  skill: SkillMetadata
): number {
  const skillName = skill.name.toLowerCase();
  const skillDesc = skill.description.toLowerCase();
  const skillTags = (skill.tags || []).map(t => t.toLowerCase());

  let score = 0;

  // Exact name match (high weight)
  if (taskDescription.toLowerCase().includes(skillName)) {
    score += 0.4;
  }

  // Keyword overlap with description
  const skillDescTokens = tokenize(skillDesc);
  const descOverlap = calculateOverlap(taskTokens, skillDescTokens);
  score += descOverlap * 0.3;

  // Keyword matches
  const keywordScore = calculateKeywordMatch(taskKeywords, skillDesc, skillTags);
  score += keywordScore * 0.2;

  // Tag matches
  const tagScore = calculateTagMatch(taskTokens, skillTags);
  score += tagScore * 0.1;

  // Normalize to 0-1 range
  return Math.min(1, score);
}

/**
 * Find what triggered the match
 */
function findTriggers(
  taskTokens: string[],
  taskKeywords: string[],
  skill: SkillMetadata
): string[] {
  const triggers: string[] = [];
  const skillName = skill.name.toLowerCase();
  const skillDesc = skill.description.toLowerCase();
  const skillTags = (skill.tags || []).map(t => t.toLowerCase());

  // Check name match
  if (taskTokens.some(t => skillName.includes(t))) {
    triggers.push(`name: ${skill.name}`);
  }

  // Check description keywords
  for (const keyword of taskKeywords) {
    if (skillDesc.includes(keyword.toLowerCase())) {
      triggers.push(`keyword: ${keyword}`);
    }
  }

  // Check tag matches
  for (const tag of skillTags) {
    if (taskTokens.includes(tag)) {
      triggers.push(`tag: ${tag}`);
    }
  }

  return [...new Set(triggers)]; // Remove duplicates
}

/**
 * Tokenize text into words
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2); // Filter out very short words
}

/**
 * Extract keywords (important terms) from text
 */
function extractKeywords(text: string): string[] {
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
    'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
    'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'this',
    'that', 'these', 'those', 'it', 'its', 'i', 'me', 'my', 'we', 'our',
    'you', 'your', 'he', 'him', 'his', 'she', 'her', 'they', 'them', 'their',
    'what', 'which', 'who', 'when', 'where', 'why', 'how', 'all', 'each',
    'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no',
    'not', 'only', 'same', 'so', 'than', 'too', 'very', 'just', 'also'
  ]);

  const tokens = tokenize(text);
  return tokens.filter(t => !stopWords.has(t) && t.length > 3);
}

/**
 * Calculate token overlap between two token arrays
 */
function calculateOverlap(tokens1: string[], tokens2: string[]): number {
  if (tokens1.length === 0 || tokens2.length === 0) return 0;

  const set2 = new Set(tokens2);
  const overlap = tokens1.filter(t => set2.has(t)).length;

  // Jaccard similarity
  const union = new Set([...tokens1, ...tokens2]).size;
  return overlap / union;
}

/**
 * Calculate keyword match score
 */
function calculateKeywordMatch(
  keywords: string[],
  description: string,
  tags: string[]
): number {
  if (keywords.length === 0) return 0;

  let matches = 0;
  const descLower = description.toLowerCase();
  const tagsLower = tags.join(' ').toLowerCase();

  for (const keyword of keywords) {
    if (descLower.includes(keyword) || tagsLower.includes(keyword)) {
      matches++;
    }
  }

  return matches / keywords.length;
}

/**
 * Calculate tag match score
 */
function calculateTagMatch(taskTokens: string[], tags: string[]): number {
  if (tags.length === 0) return 0;

  let matches = 0;
  for (const tag of tags) {
    if (taskTokens.includes(tag)) {
      matches++;
    }
  }

  return matches / tags.length;
}

/**
 * Detect conflicts between a new skill and existing skills
 * Flags when overlap exceeds threshold (default 80%)
 */
export function detectSkillConflicts(
  newSkill: { name: string; description: string; tags?: string[] },
  existingSkills: SkillMetadata[],
  overlapThreshold: number = 0.8
): SkillConflict[] {
  const conflicts: SkillConflict[] = [];

  const newTokens = tokenize(newSkill.description.toLowerCase());
  const newKeywords = extractKeywords(newSkill.description);
  const newTags = (newSkill.tags || []).map(t => t.toLowerCase());
  const newNameTokens = tokenize(newSkill.name.toLowerCase());

  for (const existing of existingSkills) {
    // Skip deprecated skills
    if (existing.deprecated_at) continue;

    const existingTokens = tokenize(existing.description.toLowerCase());
    const existingKeywords = extractKeywords(existing.description);
    const existingTags = (existing.tags || []).map(t => t.toLowerCase());
    const existingNameTokens = tokenize(existing.name.toLowerCase());

    // Calculate multiple overlap dimensions
    const descOverlap = calculateOverlap(newTokens, existingTokens);
    const keywordOverlap = calculateOverlap(newKeywords, existingKeywords);
    const tagOverlap = newTags.length > 0 && existingTags.length > 0
      ? calculateOverlap(newTags, existingTags)
      : 0;
    const nameOverlap = calculateOverlap(newNameTokens, existingNameTokens);

    // Weighted composite score
    const overlapScore = (
      descOverlap * 0.4 +
      keywordOverlap * 0.3 +
      tagOverlap * 0.15 +
      nameOverlap * 0.15
    );

    if (overlapScore >= overlapThreshold) {
      // Find shared keywords and tags
      const sharedKeywords = newKeywords.filter(k => existingKeywords.includes(k));
      const sharedTags = newTags.filter(t => existingTags.includes(t));

      // Generate recommendation
      let recommendation: string;
      if (overlapScore >= 0.95) {
        recommendation = `Very high overlap (${Math.round(overlapScore * 100)}%). Consider updating existing skill "${existing.name}" instead of creating a new one.`;
      } else if (overlapScore >= 0.9) {
        recommendation = `High overlap (${Math.round(overlapScore * 100)}%). Consider merging with "${existing.name}" or differentiating the use cases more clearly.`;
      } else {
        recommendation = `Significant overlap (${Math.round(overlapScore * 100)}%). Ensure the skills have clearly distinct purposes to avoid matching ambiguity.`;
      }

      conflicts.push({
        existing_skill_id: existing.id,
        existing_skill_name: existing.name,
        overlap_score: Math.round(overlapScore * 100) / 100,
        shared_keywords: sharedKeywords,
        shared_tags: sharedTags,
        recommendation
      });
    }
  }

  // Sort by overlap score descending
  conflicts.sort((a, b) => b.overlap_score - a.overlap_score);

  return conflicts;
}

/**
 * Analyze description effectiveness for triggering
 */
export function analyzeDescription(
  description: string,
  intendedTriggers?: string[]
): {
  clarity_score: number;
  trigger_keywords: string[];
  suggestions: string[];
  too_broad: boolean;
  too_narrow: boolean;
} {
  const suggestions: string[] = [];
  const keywords = extractKeywords(description);

  // Calculate clarity score based on several factors
  let clarityScore = 0.5;

  // Length check
  if (description.length < SKILL_CONFIG.MIN_DESCRIPTION_LENGTH) {
    clarityScore -= 0.2;
    suggestions.push('Description is too short. Add more detail about when to use this skill.');
  } else if (description.length > SKILL_CONFIG.MAX_DESCRIPTION_LENGTH) {
    clarityScore -= 0.1;
    suggestions.push('Description is too long. Consider being more concise.');
  } else {
    clarityScore += 0.1;
  }

  // Keyword density
  if (keywords.length < 3) {
    clarityScore -= 0.1;
    suggestions.push('Add more specific keywords to improve discoverability.');
  } else if (keywords.length >= 5) {
    clarityScore += 0.2;
  }

  // Check for action words
  const actionWords = ['use', 'create', 'build', 'fix', 'help', 'manage', 'handle', 'process'];
  const hasActionWords = actionWords.some(w => description.toLowerCase().includes(w));
  if (hasActionWords) {
    clarityScore += 0.1;
  } else {
    suggestions.push('Consider adding action words (use, create, build, fix, etc.)');
  }

  // Check intended triggers coverage
  if (intendedTriggers && intendedTriggers.length > 0) {
    const descLower = description.toLowerCase();
    const coveredTriggers = intendedTriggers.filter(t => descLower.includes(t.toLowerCase()));
    const coverage = coveredTriggers.length / intendedTriggers.length;

    if (coverage < 0.5) {
      suggestions.push(`Only ${Math.round(coverage * 100)}% of intended triggers are in the description`);
    }
    clarityScore += coverage * 0.2;
  }

  // Determine if too broad or narrow
  const genericWords = ['anything', 'everything', 'all', 'any', 'general', 'various'];
  const tooBroad = genericWords.some(w => description.toLowerCase().includes(w));

  const tooNarrow = keywords.length < 3 && description.length < 50;

  if (tooBroad) {
    suggestions.push('Description may be too broad. Add specific use cases.');
  }
  if (tooNarrow) {
    suggestions.push('Description may be too narrow. Add related use cases.');
  }

  // Normalize clarity score
  clarityScore = Math.max(0, Math.min(1, clarityScore));

  return {
    clarity_score: clarityScore,
    trigger_keywords: keywords,
    suggestions,
    too_broad: tooBroad,
    too_narrow: tooNarrow
  };
}

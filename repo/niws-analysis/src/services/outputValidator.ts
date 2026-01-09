/**
 * Output Validator for Bias Analysis
 *
 * Validates LLM output to ensure it adheres to editorial guidelines:
 * - No truth claims about disputed facts
 * - No bias accusations
 * - No loaded language
 * - No assumed intent
 * - No editorializing
 */

import Ajv from 'ajv';
import type { BiasResult, ValidationResult, BiasViolation } from '../types.js';

const ajv = new Ajv({ allErrors: true });

// Schema for BiasResult
const biasResultSchema = {
  type: 'object',
  required: ['biasScore', 'framingIndicators', 'loadedLanguage', 'summary'],
  properties: {
    biasScore: { type: 'number', minimum: -1, maximum: 1 },
    framingIndicators: { type: 'array', items: { type: 'string' } },
    loadedLanguage: { type: 'array', items: { type: 'string' } },
    neutralAlternatives: { type: 'object', additionalProperties: { type: 'string' } },
    summary: { type: 'string' },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
  },
};

const validateBiasResultSchema = ajv.compile(biasResultSchema);

// Prohibited phrases and patterns
const PROHIBITED_PATTERNS: Record<string, RegExp[]> = {
  truth_claim: [
    /the truth is/i,
    /in reality/i,
    /actually,?\s+/i,
    /the fact is/i,
    /it's (clear|obvious) that/i,
    /we know that/i,
    /undeniably/i,
    /without question/i,
    /indisputably/i,
  ],
  bias_accusation: [
    /\bbias(ed)?\b/i,
    /\bslanted\b/i,
    /\bpropaganda\b/i,
    /\bmisinformation\b/i,
    /\bdisinformation\b/i,
    /\bfake news\b/i,
    /\blying\b/i,
    /\bdeceptive\b/i,
    /deliberately misleading/i,
  ],
  loaded_language: [
    /\bliberal media\b/i,
    /\bconservative media\b/i,
    /\bmainstream media\b/i,
    /\bMSM\b/,
    /\bleft-wing media\b/i,
    /\bright-wing media\b/i,
    /\bwoke\b/i,
    /\bfascist\b/i,
    /\bcommunist\b/i,
    /\bextremist\b/i,
    /\bradical\b/i,
    /\bfar-left\b/i,
    /\bfar-right\b/i,
    /\bregime\b/i,
  ],
  assumed_intent: [
    /clearly (trying|attempting) to/i,
    /obviously (want|intend)/i,
    /their (goal|agenda|purpose) is/i,
    /designed to/i,
    /meant to (deceive|mislead|manipulate)/i,
    /deliberately (omit|ignore|hide)/i,
    /intentionally/i,
  ],
  editorializing: [
    /should have/i,
    /ought to/i,
    /needs to/i,
    /must be noted that/i,
    /it's important to remember/i,
    /one must consider/i,
    /unfortunately/i,
    /thankfully/i,
    /sadly/i,
    /shockingly/i,
    /disturbingly/i,
  ],
};

// Approved neutral alternatives for loaded terms
const APPROVED_ALTERNATIVES: Record<string, string> = {
  'liberal media': 'left-leaning outlets',
  'conservative media': 'right-leaning outlets',
  'mainstream media': 'major outlets',
  'msm': 'major outlets',
  'left-wing media': 'left-leaning outlets',
  'right-wing media': 'right-leaning outlets',
  'biased': 'coverage patterns differ',
  'propaganda': 'messaging',
  'fake news': 'disputed reporting',
  'misinformation': 'contested claims',
  'far-left': 'left-leaning',
  'far-right': 'right-leaning',
  'radical': 'progressive',
  'extremist': 'ideologically committed',
  'regime': 'government',
  'woke': 'socially conscious',
};

/**
 * Check text for prohibited patterns
 */
function checkForViolations(text: string, field: string): BiasViolation[] {
  const violations: BiasViolation[] = [];

  for (const [type, patterns] of Object.entries(PROHIBITED_PATTERNS)) {
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        violations.push({
          type: type as BiasViolation['type'],
          text: match[0],
          field,
          severity: type === 'truth_claim' || type === 'bias_accusation' ? 'error' : 'warning',
          suggestion: getSuggestion(type, match[0]),
        });
      }
    }
  }

  return violations;
}

/**
 * Get a suggestion for fixing a violation
 */
function getSuggestion(type: string, text: string): string {
  switch (type) {
    case 'truth_claim':
      return `Remove truth claim "${text}". Instead, attribute to sources.`;
    case 'bias_accusation':
      return `Remove accusation "${text}". Document patterns without labeling.`;
    case 'loaded_language':
      return `Replace "${text}" with neutral term like "left-leaning outlet" or "right-leaning outlet".`;
    case 'assumed_intent':
      return `Remove intent assumption "${text}". Document what they did, not why.`;
    case 'editorializing':
      return `Remove editorial language "${text}". Stick to observations.`;
    default:
      return `Review usage of "${text}" for neutrality.`;
  }
}

/**
 * Calculate neutrality score based on violations
 */
function calculateNeutralityScore(violations: BiasViolation[], textLength: number): number {
  if (violations.length === 0) return 100;

  let penalty = 0;
  for (const v of violations) {
    penalty += v.severity === 'error' ? 15 : 5;
  }

  // Scale by text length (longer text gets some tolerance)
  const lengthFactor = Math.min(1, textLength / 1000);
  penalty = penalty * (1 - lengthFactor * 0.3);

  return Math.max(0, Math.round(100 - penalty));
}

/**
 * Validate BiasResult structure
 */
export function validateBiasResult(data: unknown): { valid: boolean; errors: string[] } {
  const valid = validateBiasResultSchema(data);
  if (!valid) {
    const errors = validateBiasResultSchema.errors?.map(e => `${e.instancePath} ${e.message}`) || [];
    return { valid: false, errors };
  }
  return { valid: true, errors: [] };
}

/**
 * Validate bias analysis output for content violations
 */
export function validateAnalysisOutput(result: BiasResult): ValidationResult {
  const violations: BiasViolation[] = [];
  const warnings: string[] = [];

  // Check summary
  violations.push(...checkForViolations(result.summary, 'summary'));

  // Check framing indicators
  for (const indicator of result.framingIndicators) {
    violations.push(...checkForViolations(indicator, 'framingIndicators'));
  }

  // Check loaded language items (less strict - these are documenting loaded language in the article)
  // We don't check these as strictly since they're identifying bias in the source

  // Check neutral alternatives
  for (const [original, alternative] of Object.entries(result.neutralAlternatives || {})) {
    violations.push(...checkForViolations(alternative, 'neutralAlternatives'));
  }

  // Warnings for potential issues
  if (result.framingIndicators.length === 0) {
    warnings.push('No framing indicators identified - analysis may be incomplete');
  }
  if (Math.abs(result.biasScore) > 0.8 && (result.confidence || 0) > 0.9) {
    warnings.push('High bias score with high confidence - verify analysis');
  }

  // Calculate combined text length for scoring
  const allText = JSON.stringify(result);
  const neutralityScore = calculateNeutralityScore(violations, allText.length);

  return {
    valid: violations.filter(v => v.severity === 'error').length === 0,
    violations,
    neutralityScore,
    warnings,
  };
}

/**
 * Quick text validation for any string
 */
export function validateText(text: string): { valid: boolean; violations: BiasViolation[] } {
  const violations = checkForViolations(text, 'text');
  return {
    valid: violations.filter(v => v.severity === 'error').length === 0,
    violations,
  };
}

/**
 * Get approved alternative for a loaded term
 */
export function getApprovedAlternative(term: string): string | null {
  const lower = term.toLowerCase();
  return APPROVED_ALTERNATIVES[lower] || null;
}

/**
 * Get all approved alternatives
 */
export function getAllApprovedAlternatives(): Record<string, string> {
  return { ...APPROVED_ALTERNATIVES };
}

/**
 * Parse JSON from LLM response (handles markdown code blocks)
 */
export function parseJsonResponse<T>(response: string): T {
  // Try direct parse first
  try {
    return JSON.parse(response);
  } catch {
    // Try to extract JSON from markdown code block
    const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1].trim());
    }

    // Try to find JSON object/array
    const objectMatch = response.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      return JSON.parse(objectMatch[0]);
    }

    const arrayMatch = response.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      return JSON.parse(arrayMatch[0]);
    }

    throw new Error(`Failed to parse JSON from response: ${response.substring(0, 200)}`);
  }
}

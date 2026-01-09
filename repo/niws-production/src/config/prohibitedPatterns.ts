/**
 * Prohibited Patterns for Script Generation
 *
 * Detects editorial commentary, intent attribution, truth claims,
 * and partisan language that violates Cronkite-style guidelines.
 */

export interface PatternViolation {
  type: 'editorial' | 'intent' | 'truth_claim' | 'partisan' | 'loaded_language';
  pattern: string;
  match: string;
  position: number;
  severity: 'error' | 'warning';
  suggestion: string;
}

// Editorial commentary patterns
const EDITORIAL_PATTERNS = [
  { pattern: /as we can see/gi, suggestion: 'Remove editorial commentary' },
  { pattern: /clearly (distorting|misleading|lying|biased)/gi, suggestion: 'Document without judgment' },
  { pattern: /predictably/gi, suggestion: 'Remove assumption of predictability' },
  { pattern: /as usual/gi, suggestion: 'Remove editorial phrase' },
  { pattern: /unsurprisingly/gi, suggestion: 'Remove editorial assumption' },
  { pattern: /of course/gi, suggestion: 'Remove presumptive phrase' },
  { pattern: /obviously/gi, suggestion: 'State facts without "obviously"' },
  { pattern: /it['']s (clear|obvious) that/gi, suggestion: 'Present facts directly' },
  { pattern: /we (all )?know that/gi, suggestion: 'Remove assumption of shared knowledge' },
  { pattern: /needless to say/gi, suggestion: 'If needless, remove entirely' },
];

// Intent attribution patterns
const INTENT_PATTERNS = [
  { pattern: /trying to (mislead|deceive|hide|manipulate|distract)/gi, suggestion: 'Document actions, not assumed intent' },
  { pattern: /wants you to (believe|think|ignore)/gi, suggestion: 'Remove intent attribution' },
  { pattern: /covering up/gi, suggestion: 'Say "did not report" instead' },
  { pattern: /deliberately (omit|ignore|hide|mislead)/gi, suggestion: 'Use "did not include" without intent claim' },
  { pattern: /intentionally/gi, suggestion: 'Remove intent assumption' },
  { pattern: /designed to/gi, suggestion: 'Describe effect, not assumed design' },
  { pattern: /their (goal|agenda|purpose) is/gi, suggestion: 'Document coverage, not assumed goals' },
  { pattern: /pushing (a |an |the )?(narrative|agenda)/gi, suggestion: 'Say "coverage emphasizes" instead' },
];

// Truth claim patterns
const TRUTH_CLAIM_PATTERNS = [
  { pattern: /the (accurate|correct|real|true) (version|story|facts|account)/gi, suggestion: 'Do not declare any version "correct"' },
  { pattern: /what really happened/gi, suggestion: 'Present different accounts without declaring truth' },
  { pattern: /the facts (prove|show|demonstrate) that/gi, suggestion: 'Say "reports indicate" instead' },
  { pattern: /in (actual )?reality/gi, suggestion: 'Remove truth claim' },
  { pattern: /the truth is/gi, suggestion: 'Present facts without declaring truth' },
  { pattern: /actually,? /gi, suggestion: 'Remove corrective implication' },
  { pattern: /contrary to (what .+ (says|claims|reports))/gi, suggestion: 'Present both accounts neutrally' },
  { pattern: /despite (what .+ (says|claims|reports))/gi, suggestion: 'Present accounts without hierarchy' },
];

// Partisan language patterns
const PARTISAN_PATTERNS = [
  { pattern: /mainstream media/gi, suggestion: 'Use "major outlets" or specific outlet names' },
  { pattern: /\bMSM\b/g, suggestion: 'Use "major outlets" or specific outlet names' },
  { pattern: /fake news/gi, suggestion: 'Use "disputed reporting" or specific concerns' },
  { pattern: /liberal media/gi, suggestion: 'Use "left-leaning outlets"' },
  { pattern: /conservative media/gi, suggestion: 'Use "right-leaning outlets"' },
  { pattern: /left-wing media/gi, suggestion: 'Use "left-leaning outlets"' },
  { pattern: /right-wing media/gi, suggestion: 'Use "right-leaning outlets"' },
  { pattern: /\bwoke\b/gi, suggestion: 'Use specific descriptive terms' },
  { pattern: /radical (left|right)/gi, suggestion: 'Use "left-leaning" or "right-leaning"' },
  { pattern: /far[- ](left|right)/gi, suggestion: 'Use "left-leaning" or "right-leaning"' },
  { pattern: /extremist/gi, suggestion: 'Use neutral descriptors' },
  { pattern: /propaganda/gi, suggestion: 'Use "messaging" or "coverage"' },
];

// Loaded language patterns
const LOADED_LANGUAGE_PATTERNS = [
  { pattern: /slammed/gi, suggestion: 'Use "criticized" or "responded to"' },
  { pattern: /blasted/gi, suggestion: 'Use "criticized" or "disagreed with"' },
  { pattern: /destroyed/gi, suggestion: 'Use "challenged" or "refuted"' },
  { pattern: /owned/gi, suggestion: 'Use neutral verb' },
  { pattern: /crushed/gi, suggestion: 'Use "defeated" or "won against"' },
  { pattern: /regime/gi, suggestion: 'Use "administration" or "government"' },
  { pattern: /cronies/gi, suggestion: 'Use "associates" or "allies"' },
  { pattern: /shockingly/gi, suggestion: 'Remove emotional intensifier' },
  { pattern: /disturbingly/gi, suggestion: 'Remove emotional intensifier' },
  { pattern: /frighteningly/gi, suggestion: 'Remove emotional intensifier' },
  { pattern: /thankfully/gi, suggestion: 'Remove emotional intensifier' },
  { pattern: /unfortunately/gi, suggestion: 'Remove editorial judgment' },
  { pattern: /sadly/gi, suggestion: 'Remove editorial judgment' },
];

/**
 * Check text for all prohibited patterns
 */
export function checkProhibitedPatterns(text: string): PatternViolation[] {
  const violations: PatternViolation[] = [];

  const checkPatterns = (
    patterns: Array<{ pattern: RegExp; suggestion: string }>,
    type: PatternViolation['type'],
    severity: 'error' | 'warning'
  ) => {
    for (const { pattern, suggestion } of patterns) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(text)) !== null) {
        violations.push({
          type,
          pattern: pattern.source,
          match: match[0],
          position: match.index,
          severity,
          suggestion,
        });
      }
    }
  };

  checkPatterns(EDITORIAL_PATTERNS, 'editorial', 'error');
  checkPatterns(INTENT_PATTERNS, 'intent', 'error');
  checkPatterns(TRUTH_CLAIM_PATTERNS, 'truth_claim', 'error');
  checkPatterns(PARTISAN_PATTERNS, 'partisan', 'error');
  checkPatterns(LOADED_LANGUAGE_PATTERNS, 'loaded_language', 'warning');

  return violations;
}

/**
 * Check if text passes all checks (no errors)
 */
export function passesProhibitedPatternCheck(text: string): boolean {
  const violations = checkProhibitedPatterns(text);
  return violations.filter(v => v.severity === 'error').length === 0;
}

/**
 * Get violation summary for a script
 */
export function getViolationSummary(text: string): {
  passed: boolean;
  errorCount: number;
  warningCount: number;
  byType: Record<string, number>;
  violations: PatternViolation[];
} {
  const violations = checkProhibitedPatterns(text);
  const errors = violations.filter(v => v.severity === 'error');
  const warnings = violations.filter(v => v.severity === 'warning');

  const byType: Record<string, number> = {};
  for (const v of violations) {
    byType[v.type] = (byType[v.type] || 0) + 1;
  }

  return {
    passed: errors.length === 0,
    errorCount: errors.length,
    warningCount: warnings.length,
    byType,
    violations,
  };
}

/**
 * Highlight violations in text for review
 */
export function highlightViolations(text: string): string {
  const violations = checkProhibitedPatterns(text);
  violations.sort((a, b) => b.position - a.position);

  let highlighted = text;
  for (const v of violations) {
    const marker = v.severity === 'error' ? '**[ERROR]**' : '*[WARN]*';
    highlighted =
      highlighted.slice(0, v.position) +
      `${marker}${v.match}${marker}` +
      highlighted.slice(v.position + v.match.length);
  }

  return highlighted;
}

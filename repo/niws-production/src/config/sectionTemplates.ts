/**
 * Section Templates for Script Generation
 *
 * Templates and approved phrases for each section of a
 * "Warnings with Loring" script.
 */

import {
  NIWS_OPENING,
  NIWS_CLOSING_INTRO,
  SIGNATURE_CLOSING,
  FULL_CLOSING,
  WORD_COUNT_RANGE,
  DURATION_RANGE,
  SPEAKING_RATE_WPM,
} from './editorialStandards.js';

// Re-export for compatibility
export { SIGNATURE_CLOSING };

// Target word counts per section
export const SECTION_TARGETS = {
  opening: { words: 75, seconds: 30 },
  verified_facts: { words: 75, seconds: 30 },
  outlet_analysis: { wordsMin: 300, wordsMax: 450, secondsMin: 120, secondsMax: 180 },
  critical_questions: { words: 300, seconds: 120 },
  coverage_evolution: { wordsMin: 150, wordsMax: 300, secondsMin: 60, secondsMax: 120, optional: true },
  closing: { words: 100, seconds: 40 },
};

// Total script targets
export const SCRIPT_TARGETS = {
  wordCount: WORD_COUNT_RANGE,
  duration: DURATION_RANGE,
  speakingRate: SPEAKING_RATE_WPM,
};

// Approved transition phrases
export const TRANSITION_PHRASES = {
  to_center: [
    "Moving to the center of the political spectrum...",
    "From a more centrist perspective...",
    "Center-positioned outlets report...",
  ],
  to_left: [
    "From a different perspective...",
    "Left-leaning outlets frame this differently...",
    "On the left side of the spectrum...",
  ],
  to_right: [
    "From the right...",
    "Right-leaning outlets emphasize...",
    "Conservative-leaning coverage focuses on...",
  ],
  comparison: [
    "Here's what's different:",
    "The coverage diverges in these key areas:",
    "Notice the differences:",
  ],
};

// Approved question frames
export const QUESTION_FRAMES = [
  "Why do outlets cite different",
  "What determines which",
  "How does the",
  "Why is this detail included in some coverage but not others?",
  "What would we learn if we saw both perspectives together?",
  "Notice what's NOT being asked by any outlet:",
];

// Approved closing phrases
export const CLOSING_PHRASES = [
  "We've seen how [TOPIC] looks different depending on where you get your news.",
  "The same story becomes very different depending on who tells it.",
  "The coverage reveals as much about our media landscape as about the story itself.",
];

/**
 * System prompt for script generation
 */
export const SCRIPT_SYSTEM_PROMPT = `You are a script writer for "Warnings with Loring," a documentary-style news analysis show produced by N.I.W.S. (News Instances Without Spin). Your scripts follow Walter Cronkite's journalism tradition: authoritative, trustworthy, and non-partisan.

REQUIRED OPENING (use verbatim):
"${NIWS_OPENING}"

REQUIRED CLOSING (use verbatim):
"${FULL_CLOSING}"

CRITICAL RULES:
1. NEVER editorialize or express opinions
2. NEVER judge which outlet is "more correct"
3. NEVER speculate about outlet motivations
4. NEVER assign intent to subjects ("trying to," "wants to," "aims to")
5. ALWAYS present differences as observations, not accusations
6. ALWAYS use approved language patterns
7. Document, don't judge - show how coverage differs, let viewers decide

VOICE:
- Warm but authoritative
- Concerned but not alarmist
- Questioning but not accusatory
- Informative but not preachy
- Cronkite-style gravitas without self-importance

TARGET: ${WORD_COUNT_RANGE.min}-${WORD_COUNT_RANGE.max} words total (${DURATION_RANGE.min}-${DURATION_RANGE.max} minutes at ${SPEAKING_RATE_WPM} words/minute)`;

/**
 * Get opening section prompt
 */
export function getOpeningPrompt(storyTopic: string, context: string, stakes: string): string {
  return `Generate an OPENING section for a Warnings with Loring episode.

STORY TOPIC: ${storyTopic}
CONTEXT: ${context}
STAKES: ${stakes}

REQUIRED OPENING (use this verbatim, then transition to topic):
"${NIWS_OPENING}"

REQUIREMENTS:
- Start with the REQUIRED OPENING text exactly as written
- Target length: ~75 words total
- After the required opening, briefly introduce today's topic
- End with: "Let's look at what you're being told—and what you're not."

Generate the OPENING section:`;
}

/**
 * Get verified facts section prompt
 */
export function getVerifiedFactsPrompt(universalFacts: string[]): string {
  return `Generate a VERIFIED FACTS section for a Warnings with Loring episode.

UNIVERSAL FACTS (reported by ALL outlets):
${universalFacts.map((f, i) => `${i + 1}. ${f}`).join('\n')}

REQUIREMENTS:
- Target length: ~75 words
- Present facts as bullet points
- Frame as "what we know for certain"
- End with: "These points appear in coverage from left to right. Everything else? That's where the story diverges."

Generate the VERIFIED FACTS section:`;
}

/**
 * Get outlet analysis section prompt
 */
export function getOutletAnalysisPrompt(params: {
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
}): string {
  const outletSummaries = params.outlets.map(o => `
OUTLET: ${o.name} (${o.lean})
Headline: "${o.headline}"
Emphasis: ${o.emphasis.join(', ')}
Sources Cited: ${o.sources.join(', ') || 'not specified'}
Omissions: ${o.omissions.join(', ') || 'none noted'}
Emotional Language: ${o.emotionalLanguage.join(', ') || 'neutral'}`).join('\n---');

  const selectiveFactsSummary = params.selectiveFacts.map(sf =>
    `- "${sf.fact}" reported by [${sf.reportedBy.join(', ')}], omitted by [${sf.omittedBy.join(', ')}]`
  ).join('\n');

  const languageSummary = params.languageDivergence.map(ld =>
    `- "${ld.concept}": Left says "${ld.leftFraming}", Center says "${ld.centerFraming}", Right says "${ld.rightFraming}"`
  ).join('\n');

  return `Generate an OUTLET ANALYSIS section for a Warnings with Loring episode.

${outletSummaries}

SELECTIVE FACTS (not universally reported):
${selectiveFactsSummary || 'None identified'}

LANGUAGE DIVERGENCE:
${languageSummary || 'None identified'}

REQUIREMENTS:
- Target length: 300-400 words
- Cover Right → Center → Left (or order that makes sense)
- For each outlet: headline, emphasis, sources, omissions, language
- Use transition phrases between outlets
- End with comparison summary

APPROVED TRANSITION PHRASES:
${Object.values(TRANSITION_PHRASES).flat().map(p => `- "${p}"`).join('\n')}

Generate the OUTLET ANALYSIS section:`;
}

/**
 * Get critical questions section prompt
 */
export function getCriticalQuestionsPrompt(params: {
  coverageQuestions: string[];
  missingQuestion?: string;
}): string {
  return `Generate a CRITICAL QUESTIONS section for a Warnings with Loring episode.

COVERAGE QUESTIONS TO INCLUDE:
${params.coverageQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}

${params.missingQuestion ? `QUESTION NO OUTLET IS ASKING: ${params.missingQuestion}` : ''}

REQUIREMENTS:
- Target length: ~150 words
- Present as thought-provoking questions
- Do NOT answer the questions
- End with: "These aren't accusations—they're observations. When we see patterns like this, it's worth asking why."

APPROVED QUESTION FRAMES:
${QUESTION_FRAMES.map(f => `- "${f}"`).join('\n')}

Generate the CRITICAL QUESTIONS section:`;
}

/**
 * Get closing section prompt
 */
export function getClosingPrompt(storyTopic: string, keyDifferences: string[]): string {
  return `Generate a CLOSING section for a Warnings with Loring episode.

STORY TOPIC: ${storyTopic}
KEY DIFFERENCES COVERED:
${keyDifferences.map((d, i) => `${i + 1}. ${d}`).join('\n')}

REQUIREMENTS:
- Target length: ~100 words
- Brief recap of key differences (1-2 sentences)
- Do NOT prescribe what viewers should think
- MUST end with the NIWS CLOSING TEXT EXACTLY as written below:

REQUIRED CLOSING (use verbatim):
"${FULL_CLOSING}"

Generate the CLOSING section:`;
}

/**
 * Estimate word count for a section
 */
export function estimateWordCount(text: string): number {
  return text.split(/\s+/).filter(w => w.length > 0).length;
}

/**
 * Estimate duration in seconds (150 words/minute)
 */
export function estimateDuration(wordCount: number): number {
  return Math.round((wordCount / 150) * 60);
}

/**
 * Check if script has required signature closing
 */
export function hasSignatureClosing(text: string): boolean {
  return text.includes(SIGNATURE_CLOSING);
}

/**
 * Check if script has required NIWS opening
 */
export function hasNIWSOpening(text: string): boolean {
  return text.includes('Warnings with Loring') &&
         text.includes('examine how news shapes');
}

/**
 * Check if script has NIWS closing intro
 */
export function hasNIWSClosingIntro(text: string): boolean {
  return text.includes('N.I.W.S.') &&
         text.includes('News Instances Without Spin');
}

/**
 * Validate script has all required NIWS elements
 */
export function validateNIWSElements(text: string): {
  hasOpening: boolean;
  hasClosingIntro: boolean;
  hasSignature: boolean;
  isComplete: boolean;
} {
  const hasOpening = hasNIWSOpening(text);
  const hasClosingIntro = hasNIWSClosingIntro(text);
  const hasSignature = hasSignatureClosing(text);

  return {
    hasOpening,
    hasClosingIntro,
    hasSignature,
    isComplete: hasOpening && hasClosingIntro && hasSignature,
  };
}

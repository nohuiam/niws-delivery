/**
 * NIWS Editorial Standards Configuration
 *
 * Centralized configuration for "News Instances Without Spin" (N.I.W.S.)
 * production standards used in "Warnings with Loring" segments.
 */

// ─────────────────────────────────────────────────────────────
// Core Outlets (Reference Only - Not Enforced)
// ─────────────────────────────────────────────────────────────

export const CORE_OUTLETS = {
  left: ['CNN', 'MSNBC', 'NPR'],
  center: ['Reuters', 'AP', 'Bloomberg'],
  right: ['Fox News', 'WSJ', 'New York Post'],
} as const;

export const ALL_CORE_OUTLETS = [
  ...CORE_OUTLETS.left,
  ...CORE_OUTLETS.center,
  ...CORE_OUTLETS.right,
] as const;

// ─────────────────────────────────────────────────────────────
// Script Text (Verbatim - Do Not Modify)
// ─────────────────────────────────────────────────────────────

export const NIWS_OPENING = `Good morning. This is "Warnings with Loring," where we examine how news shapes your understanding of current events.`;

export const NIWS_CLOSING_INTRO = `I'm Loring with N.I.W.S. - News Instances Without Spin, warning you that understanding news means recognizing not just what outlets tell you, but what they don't tell you. When outlets make claims without evidence, present opinions as facts, or ignore basic questions, you're not getting news - you're getting narrative.

Join us next time as we continue examining how America's major news outlets shape our understanding of current events.`;

export const SIGNATURE_CLOSING = `For democracy, and our Constitutional Republic's sake... this is Loring. Watchdog, signing off.`;

export const FULL_CLOSING = `${NIWS_CLOSING_INTRO}

${SIGNATURE_CLOSING}`;

// ─────────────────────────────────────────────────────────────
// Script Length Parameters
// ─────────────────────────────────────────────────────────────

export const WORD_COUNT_RANGE = {
  min: 750,
  max: 1200,
  target: 975,
} as const;

export const DURATION_RANGE = {
  min: 5,
  max: 8,
  target: 6.5,
} as const;

export const SPEAKING_RATE_WPM = 150;

// ─────────────────────────────────────────────────────────────
// Verification Hierarchy
// ─────────────────────────────────────────────────────────────

export enum VerificationLevel {
  OFFICIAL_RECORDS = 'official_records',
  WIRE_SERVICES = 'wire_services',
  NAMED_SOURCES = 'named_sources',
  CROSS_OUTLET = 'cross_outlet',
  SINGLE_OUTLET = 'single_outlet',
  ANONYMOUS = 'anonymous',
}

export const VERIFICATION_REQUIREMENTS = {
  [VerificationLevel.OFFICIAL_RECORDS]: {
    description: 'Official government data, court documents, SEC filings',
    canCite: true,
    needsAttribution: true,
    canStandAlone: true,
  },
  [VerificationLevel.WIRE_SERVICES]: {
    description: 'Wire services with multiple source confirmation',
    canCite: true,
    needsAttribution: true,
    canStandAlone: true,
  },
  [VerificationLevel.NAMED_SOURCES]: {
    description: 'Named sources with verifiable credentials',
    canCite: true,
    needsAttribution: true,
    canStandAlone: false,
  },
  [VerificationLevel.CROSS_OUTLET]: {
    description: 'Multiple outlets reporting same facts independently',
    canCite: true,
    needsAttribution: true,
    canStandAlone: true,
  },
  [VerificationLevel.SINGLE_OUTLET]: {
    description: 'Single outlet exclusive - requires verification note',
    canCite: true,
    needsAttribution: true,
    canStandAlone: false,
    flagForReview: true,
  },
  [VerificationLevel.ANONYMOUS]: {
    description: 'Anonymous sources - note limitations clearly',
    canCite: true,
    needsAttribution: true,
    canStandAlone: false,
    requiresDisclaimer: true,
  },
} as const;

// ─────────────────────────────────────────────────────────────
// Perplexity Query Template
// ─────────────────────────────────────────────────────────────

export const PERPLEXITY_QUERY_TEMPLATE = `Search the following news outlets for coverage of {TOPIC} in the past {TIMEFRAME}:

Left-leaning: CNN, MSNBC, NPR
Center: Reuters, AP, Bloomberg
Right-leaning: Fox News, WSJ, New York Post

For each outlet that covered this story, provide:
1. Their main headline or framing
2. Key facts they emphasized
3. Notable facts they omitted (if apparent from cross-reference)
4. Any editorializing language used
5. Sources cited (named vs anonymous)

Note any significant differences in how outlets presented the same underlying facts.`;

// ─────────────────────────────────────────────────────────────
// Red Lines (Never Do)
// ─────────────────────────────────────────────────────────────

export const RED_LINES = [
  'Never state personal opinions as facts',
  'Never assign motives or intent to subjects',
  'Never use emotional or loaded language',
  'Never present speculation as established fact',
  'Never omit relevant contradicting information',
  'Never rely on single anonymous source for major claims',
  'Never cite social media without verification',
  'Never present press releases as independent reporting',
  'Never use partisan labels unnecessarily',
  'Never frame questions to suggest answers',
  'Never imply conclusions the evidence does not support',
  'Never ignore significant coverage from opposing viewpoints',
  'Never present false equivalence as balance',
  'Never dismiss claims without examination',
] as const;

// ─────────────────────────────────────────────────────────────
// Script Section Structure
// ─────────────────────────────────────────────────────────────

export const SECTION_STRUCTURE = {
  opening: {
    name: 'Opening',
    durationSeconds: 30,
    wordCount: 75,
    content: NIWS_OPENING,
    required: true,
  },
  verifiedFacts: {
    name: 'Verified Facts',
    durationSeconds: 30,
    wordCount: 75,
    description: 'Undisputed facts agreed upon across outlets',
    required: true,
  },
  outletAnalysis: {
    name: 'Outlet Analysis',
    durationSecondsMin: 120,
    durationSecondsMax: 180,
    wordCountMin: 300,
    wordCountMax: 450,
    description: 'How each outlet covered the story differently',
    required: true,
  },
  criticalQuestions: {
    name: 'Critical Questions',
    durationSeconds: 120,
    wordCount: 300,
    description: 'What we still do not know, unanswered questions',
    required: true,
  },
  coverageEvolution: {
    name: 'Coverage Evolution',
    durationSecondsMin: 60,
    durationSecondsMax: 120,
    wordCountMin: 150,
    wordCountMax: 300,
    description: 'How coverage changed over time (if applicable)',
    required: false,
  },
  closing: {
    name: 'Closing',
    durationSeconds: 30,
    wordCount: 75,
    content: FULL_CLOSING,
    required: true,
  },
} as const;

// ─────────────────────────────────────────────────────────────
// Treatment Levels
// ─────────────────────────────────────────────────────────────

export const TREATMENT_LEVELS = {
  Major: {
    durationMinutes: 8,
    wordCount: 1200,
    includesEvolution: true,
    videoPackage: true,
    description: 'Full analysis with all sections and video package',
  },
  Medium: {
    durationMinutes: 6,
    wordCount: 900,
    includesEvolution: false,
    videoPackage: true,
    description: 'Standard analysis with video package',
  },
  Side: {
    durationMinutes: 5,
    wordCount: 750,
    includesEvolution: false,
    videoPackage: false,
    description: 'Brief analysis, teleprompter only',
  },
} as const;

// ─────────────────────────────────────────────────────────────
// Approved Language Patterns
// ─────────────────────────────────────────────────────────────

export const APPROVED_ATTRIBUTION = [
  'According to [outlet]',
  '[Outlet] reports that',
  '[Outlet] states',
  '[Outlet] claims',
  'Per [outlet]',
  '[Outlet] characterized this as',
  '[Outlet] described',
] as const;

export const APPROVED_OMISSION_NOTES = [
  '[Outlet] did not mention',
  '[Outlet] made no reference to',
  'This was not addressed by [outlet]',
  'Notably absent from [outlet] coverage',
  '[Outlet] coverage did not include',
] as const;

export const APPROVED_UNCERTAINTY = [
  'It remains unclear',
  'What we do not yet know',
  'Questions remain about',
  'This has not been independently verified',
  'Evidence on this point is limited',
] as const;

// ─────────────────────────────────────────────────────────────
// Export All
// ─────────────────────────────────────────────────────────────

export const NIWSConfig = {
  coreOutlets: CORE_OUTLETS,
  allCoreOutlets: ALL_CORE_OUTLETS,
  opening: NIWS_OPENING,
  closingIntro: NIWS_CLOSING_INTRO,
  signature: SIGNATURE_CLOSING,
  fullClosing: FULL_CLOSING,
  wordCount: WORD_COUNT_RANGE,
  duration: DURATION_RANGE,
  speakingRate: SPEAKING_RATE_WPM,
  verificationLevels: VerificationLevel,
  verificationRequirements: VERIFICATION_REQUIREMENTS,
  perplexityTemplate: PERPLEXITY_QUERY_TEMPLATE,
  redLines: RED_LINES,
  sections: SECTION_STRUCTURE,
  treatments: TREATMENT_LEVELS,
  language: {
    attribution: APPROVED_ATTRIBUTION,
    omissions: APPROVED_OMISSION_NOTES,
    uncertainty: APPROVED_UNCERTAINTY,
  },
} as const;

export default NIWSConfig;

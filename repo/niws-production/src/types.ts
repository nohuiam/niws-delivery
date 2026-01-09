/**
 * NIWS Production Types
 *
 * Shared types for script generation, story briefs, and Christ-Oh-Meter ratings.
 */

// ============================================
// SCRIPTS
// ============================================

export interface Script {
  id: string;
  storyId: string;
  briefId: string;
  title: string;
  status: 'draft' | 'review' | 'approved' | 'archived';
  content: string;
  sections: ScriptSection[];
  wordCount: number;
  estimatedDurationSeconds: number;
  generationParams?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ScriptSection {
  id: string;
  scriptId: string;
  sectionType: 'intro' | 'story' | 'analysis' | 'opinion' | 'transition' | 'close' | 'bumper';
  content: string;
  position: number;
  wordCount: number;
  notes?: string;
  createdAt: string;
}

export interface ScriptRevision {
  id: string;
  scriptId: string;
  revisionNumber: number;
  previousContent: string;
  newContent: string;
  diff?: string;
  reason?: string;
  editedBy: 'ai' | 'human';
  createdAt: string;
}

export interface LearnedPattern {
  id: string;
  patternType: 'phrase_replacement' | 'structure' | 'tone';
  original: string;
  replacement: string;
  frequency: number;
  confidence: number;
  isActive: boolean;
  createdAt: string;
  lastUsedAt?: string;
}

export interface ProhibitedPattern {
  id: string;
  pattern: string;
  patternType: 'word' | 'phrase' | 'regex';
  reason: string;
  severity: 'warning' | 'block';
  alternatives?: string[];
  isActive: boolean;
  createdAt: string;
}

// ============================================
// BRIEFS
// ============================================

export interface StoryBrief {
  id: string;
  storyId: string;
  title: string;
  summary: string;
  keyFacts: string[];
  perspectives: OutletPerspective[];
  christOhMeterScore: number;
  moralAlignment: string;
  status: 'draft' | 'reviewed' | 'approved' | 'used';
  createdAt: string;
  updatedAt: string;
}

export interface OutletPerspective {
  outletId: string;
  outletName: string;
  perspective: string;
  quotes: Quote[];
}

export interface Quote {
  text: string;
  attribution: string;
  context: string;
}

export interface BriefSource {
  id: string;
  briefId: string;
  articleId: string;
  outletId: string;
  relevanceScore: number;
  addedAt: string;
}

export interface Legislation {
  id: string;
  briefId: string;
  billNumber?: string;
  title: string;
  summary?: string;
  status?: string;
  sponsors?: string[];
  impactAssessment?: string;
  moralImplications?: string;
  createdAt: string;
}

// ============================================
// CHRIST-OH-METER
// ============================================

export type Verdict = 'strongly_christ' | 'leans_christ' | 'neutral' | 'leans_evil' | 'strongly_evil';
export type MoralAlignment = 'christ' | 'anti-christ' | 'neutral' | 'mixed';

export interface TenetScore {
  tenetId: number;
  christTenet: string;
  evilTenet: string;
  score: number;  // -1.0 (evil) to +1.0 (christ)
  evidence?: string;
  counterfeitDetected?: boolean;
  counterfeitPattern?: string;
}

export interface CounterfeitDetection {
  tenet: string;
  pattern: string;
  evidence: string;
}

export interface ChristOhMeterResult {
  action: string;
  subject: string;
  affected: string[];
  tenetScores: TenetScore[];
  spectrumScore: number;  // -1.0 to +1.0
  verdict: Verdict;
  strongestChristTenets: string[];
  strongestEvilTenets: string[];
  counterfeitsDetected?: CounterfeitDetection[];
  tenetsEvaluationId?: string;
  reasoning: string;
}

// ============================================
// API TYPES (from contracts)
// ============================================

export interface GenerateOptions {
  storyId: string;
  briefId?: string;
  targetDurationSeconds?: number;
  outletSelection?: string[];
  emphasis?: string;
}

export interface ScriptGenerateResult {
  scriptId: string;
  status: 'generating' | 'complete';
  script?: Script;
}

// ============================================
// SERVICE CLIENTS
// ============================================

export interface Article {
  id: string;
  outletId: string;
  feedId: string;
  title: string;
  url: string;
  content: string;
  publishedAt: string;
  fetchedAt: string;
  contentHash: string;
  storyId?: string;
}

export interface Story {
  id: string;
  title: string;
  track: string;
  articleIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Outlet {
  id: string;
  name: string;
  domain: string;
  politicalLean: 'left' | 'left-center' | 'center' | 'right-center' | 'right';
  biasRating: number;
  factualReporting: string;
  createdAt: string;
}

export interface ArticleAnalysis {
  id: string;
  articleId: string;
  analysisType: 'bias' | 'framing' | 'neutral';
  result: BiasResult;
  confidence: number;
  processingTimeMs: number;
  createdAt: string;
  modelUsed: string;
}

export interface BiasResult {
  biasScore: number;
  framingIndicators: string[];
  loadedLanguage: string[];
  neutralAlternatives: Record<string, string>;
  summary: string;
}

export interface ComparativeAnalysis {
  id: string;
  storyId: string;
  articleIds: string[];
  framingDifferences: FramingDifference[];
  overallAssessment: string;
  createdAt: string;
}

export interface FramingDifference {
  topic: string;
  leftFraming: string;
  rightFraming: string;
  neutralFraming: string;
}

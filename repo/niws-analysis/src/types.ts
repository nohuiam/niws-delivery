/**
 * NIWS Analysis Types
 *
 * Shared types for article bias analysis and comparison.
 */

// === Article & Outlet Types (from niws-intake) ===

export interface Outlet {
  id: string;
  name: string;
  domain: string;
  politicalLean: 'left' | 'left-center' | 'center' | 'right-center' | 'right';
  biasRating: number;
  factualReporting: string;
  createdAt: string;
}

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

// === Analysis Types ===

export type AnalysisType = 'bias' | 'framing' | 'neutral' | 'comprehensive';
export type AnalysisStatus = 'pending' | 'processing' | 'complete' | 'failed';

export interface BiasResult {
  biasScore: number;           // -1 (left) to 1 (right)
  framingIndicators: string[];
  loadedLanguage: string[];
  neutralAlternatives: Record<string, string>;
  summary: string;
  confidence?: number;
}

export interface ArticleAnalysis {
  id: string;
  articleId: string;
  analysisType: AnalysisType;
  status: AnalysisStatus;
  result?: BiasResult;
  confidence: number;
  processingTimeMs: number;
  createdAt: string;
  completedAt?: string;
  modelUsed: string;
  promptTokens?: number;
  completionTokens?: number;
  errorMessage?: string;
}

export interface FramingDifference {
  topic: string;
  leftFraming: string;
  rightFraming: string;
  neutralFraming: string;
}

export interface ComparativeAnalysis {
  id: string;
  storyId: string;
  articleIds: string[];
  status: AnalysisStatus;
  framingDifferences: FramingDifference[];
  overallAssessment: string;
  createdAt: string;
  completedAt?: string;
  processingTimeMs?: number;
  errorMessage?: string;
}

// === Coverage Analysis (detailed format from original) ===

export interface CoverageAnalysis {
  emphasis: string[];
  omissions: string[];
  languageTone: string;
  sourcesCited: Array<{
    name: string;
    role: string;
    quoteTopic: string;
  }>;
  missingPerspectives: string[];
  claims: {
    supported: string[];
    unsupported: string[];
  };
  emotionalLanguage: Array<{
    phrase: string;
    neutralAlternative: string;
  }>;
  context: {
    provided: string[];
    missing: string[];
  };
  headlineAlignment: 'aligned' | 'somewhat_aligned' | 'misaligned';
  headlineAlignmentNotes: string;
}

export interface DetailedArticleAnalysis {
  articleId: string;
  outletName: string;
  outletLean: 'left' | 'center-left' | 'center' | 'center-right' | 'right';
  analyzedAt: number;
  headline: string;
  publicationDate: string;
  author?: string;
  articleUrl: string;
  coverage: CoverageAnalysis;
}

export interface ComparativeResult {
  universalFacts: string[];
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
  sourcePatterns: {
    leftPrefers: string[];
    centerPrefers: string[];
    rightPrefers: string[];
  };
  coverageQuestions: string[];
}

// === Bias Lexicon ===

export interface BiasLexiconEntry {
  id: string;
  word: string;
  category: 'loaded' | 'partisan' | 'emotional' | 'absolutist';
  lean?: 'left' | 'right' | 'neutral';
  severity: number;
  alternatives: string[];
  createdAt: string;
}

// === Validation Types ===

export interface ValidationResult {
  valid: boolean;
  violations: BiasViolation[];
  neutralityScore: number;
  warnings: string[];
}

export interface BiasViolation {
  type: 'truth_claim' | 'bias_accusation' | 'loaded_language' | 'assumed_intent' | 'editorializing';
  text: string;
  field: string;
  severity: 'warning' | 'error';
  suggestion?: string;
}

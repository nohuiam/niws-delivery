// === SHARED TYPES FROM CONTRACTS ===

// === OUTLETS & ARTICLES (from niws-intake) ===

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

// === ANALYSES (from niws-analysis) ===

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

// === SCRIPTS & BRIEFS (from niws-production) ===

export interface Script {
  id: string;
  storyId: string;
  briefId: string;
  title: string;
  status: 'draft' | 'review' | 'approved' | 'archived';
  content: string;
  sections: ScriptSection[];
  createdAt: string;
  updatedAt: string;
}

export interface ScriptSection {
  id: string;
  scriptId: string;
  sectionType: 'intro' | 'story' | 'opinion' | 'transition' | 'close';
  content: string;
  position: number;
  wordCount: number;
}

export interface StoryBrief {
  id: string;
  storyId: string;
  title: string;
  summary: string;
  keyFacts: string[];
  perspectives: OutletPerspective[];
  christOhMeterScore: number;
  moralAlignment: string;
  createdAt: string;
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

// === DELIVERY TYPES ===

export interface ExportResult {
  id: string;
  scriptId: string;
  format: 'rtf' | 'html' | 'txt' | 'notion';
  filePath?: string;
  notionPageId?: string;
  createdAt: string;
}

export interface VideoJob {
  id: string;
  scriptId?: string;
  storyId?: string;
  status: 'queued' | 'processing' | 'complete' | 'failed';
  outputPath?: string;
  platforms?: string[];
  config?: Record<string, unknown>;
  createdAt: string;
  completedAt?: string;
  error?: string;
  progress?: number;
}

export interface WorkflowRun {
  id: string;
  workflowType: 'overnight' | 'morning';
  status: 'running' | 'paused' | 'complete' | 'failed' | 'cancelled';
  currentStep?: string;
  startedAt: string;
  completedAt?: string;
  error?: string;
  logs: WorkflowLog[];
}

export interface WorkflowLog {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  data?: unknown;
}

export interface WorkflowState {
  status: 'idle' | 'running' | 'paused' | 'complete' | 'failed';
  currentStep: string;
  startedAt?: string;
  logs: WorkflowLog[];
}

export interface ScheduleEntry {
  id: string;
  workflowType: 'overnight' | 'morning' | 'hourly_poll';
  cronExpr: string;
  enabled: boolean;
  lastRun?: string;
  nextRun?: string;
}

// === VIDEO TYPES ===

export interface VideoPipelineOptions {
  scriptId: string;
  platforms: string[];
  chromaKeySource?: string;
  motionGraphics?: MotionGraphicsOptions;
  resolution?: VideoResolution;
}

export interface VideoResolution {
  width: number;
  height: number;
  fps: number;
}

export interface MotionGraphicsOptions {
  template: string;
  colors?: Record<string, string>;
  text?: Record<string, string>;
}

export interface PlatformSpec {
  width: number;
  height: number;
  fps: number;
  codec: string;
  bitrate: string;
}

export const PLATFORM_SPECS: Record<string, PlatformSpec> = {
  youtube: { width: 1920, height: 1080, fps: 30, codec: 'h264', bitrate: '8M' },
  tiktok: { width: 1080, height: 1920, fps: 30, codec: 'h264', bitrate: '6M' },
  instagram: { width: 1080, height: 1080, fps: 30, codec: 'h264', bitrate: '5M' },
  twitter: { width: 1280, height: 720, fps: 30, codec: 'h264', bitrate: '4M' }
};

// === NOTION TYPES ===

export interface NotionPage {
  id: string;
  url: string;
  properties: Record<string, unknown>;
}

export interface ApprovedStory {
  notionPageId: string;
  storyId: string;
  title: string;
  approvedAt: string;
  notes?: string;
}

export interface AirDropResult {
  success: boolean;
  device?: string;
  error?: string;
}

// === FORMAT OPTIONS ===

export interface FormatOptions {
  fontSize: 'normal' | 'large' | 'xlarge';
  uppercase: boolean;
  sentenceBreaks: boolean;
  lineSpacing: number;
}

export const DEFAULT_FORMAT_OPTIONS: FormatOptions = {
  fontSize: 'large',
  uppercase: true,
  sentenceBreaks: true,
  lineSpacing: 2
};

// === WORKFLOW RESULT ===

export interface WorkflowResult {
  success: boolean;
  steps: WorkflowLog[];
  error?: string;
}

// === PENDING ACTION ===

export interface PendingAction {
  id: string;
  runId?: string;
  type: 'approval' | 'review' | 'export' | 'notification';
  storyId?: string;
  scriptId?: string;
  briefId?: string;
  description: string;
  status: 'pending' | 'approved' | 'rejected' | 'completed';
  createdAt: string;
  resolvedAt?: string;
  dueAt?: string;
}

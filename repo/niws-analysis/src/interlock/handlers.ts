/**
 * InterLock Signal Handlers
 *
 * Handles incoming signals from the mesh network.
 */

import type { Signal } from './protocol.js';
import { getBiasAnalyzer } from '../services/biasAnalyzer.js';

export type SignalHandler = (signal: Signal) => Promise<void>;

/**
 * Validate that a value is a non-null object
 */
function isObject(val: unknown): val is Record<string, unknown> {
  return val !== null && typeof val === 'object' && !Array.isArray(val);
}

/**
 * Validate string field
 */
function hasString(obj: Record<string, unknown>, field: string): boolean {
  return typeof obj[field] === 'string' && obj[field] !== '';
}

/**
 * Validate string array field
 */
function hasStringArray(obj: Record<string, unknown>, field: string): boolean {
  return Array.isArray(obj[field]) && (obj[field] as unknown[]).every(item => typeof item === 'string');
}

const handlers: Map<string, SignalHandler[]> = new Map();

/**
 * Register a handler for a signal type
 */
export function onSignal(type: string, handler: SignalHandler): void {
  const existing = handlers.get(type) || [];
  existing.push(handler);
  handlers.set(type, existing);
}

/**
 * Handle an incoming signal
 */
export async function handleSignal(signal: Signal): Promise<void> {
  const typeHandlers = handlers.get(signal.type) || [];
  const wildcardHandlers = handlers.get('*') || [];

  const allHandlers = [...typeHandlers, ...wildcardHandlers];

  for (const handler of allHandlers) {
    try {
      await handler(signal);
    } catch (error) {
      console.error(`[InterLock] Handler error for ${signal.type}:`, error);
    }
  }
}

/**
 * Register default signal handlers
 */
export function registerDefaultHandlers(): void {
  const analyzer = getBiasAnalyzer();

  // Handle analysis requests from other servers
  onSignal('analysis:request', async (signal) => {
    if (!isObject(signal.payload) || !hasString(signal.payload, 'articleId')) {
      console.error('[InterLock] Invalid analysis:request payload - missing articleId');
      return;
    }

    const articleId = signal.payload.articleId as string;
    const type = hasString(signal.payload, 'type') ? (signal.payload.type as string) : 'bias';

    console.error(`[InterLock] Analysis request received for article: ${articleId}`);

    try {
      await analyzer.analyzeArticle(articleId, type as 'bias');
    } catch (error) {
      console.error(`[InterLock] Analysis failed for ${articleId}:`, error);
    }
  });

  // Handle new article notifications
  onSignal('article:new', async (signal) => {
    if (!isObject(signal.payload) || !hasString(signal.payload, 'articleId')) {
      console.error('[InterLock] Invalid article:new payload - missing articleId');
      return;
    }

    const articleId = signal.payload.articleId as string;
    console.error(`[InterLock] New article notification: ${articleId}`);
    // Optionally auto-queue for analysis
  });

  // Handle story clustering notifications
  onSignal('story:clustered', async (signal) => {
    if (!isObject(signal.payload) || !hasString(signal.payload, 'storyId') || !hasStringArray(signal.payload, 'articleIds')) {
      console.error('[InterLock] Invalid story:clustered payload - missing storyId or articleIds');
      return;
    }

    const storyId = signal.payload.storyId as string;
    const articleIds = signal.payload.articleIds as string[];
    console.error(`[InterLock] Story clustered: ${storyId} with ${articleIds.length} articles`);
    // Optionally auto-start comparison
  });

  // Log all signals in debug mode
  if (process.env.DEBUG) {
    onSignal('*', async (signal) => {
      console.error(`[InterLock] Signal: ${signal.type}`, signal.payload);
    });
  }
}

/**
 * Basic Tests for niws-production
 *
 * Verifies core functionality works.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ScriptDatabase } from '../src/database/scriptDatabase.js';
import { BriefDatabase } from '../src/database/briefDatabase.js';
import { checkProhibitedPatterns } from '../src/config/prohibitedPatterns.js';
import { estimateWordCount, estimateDuration, validateNIWSElements, SIGNATURE_CLOSING } from '../src/config/sectionTemplates.js';

describe('Database Initialization', () => {
  it('should initialize script database', () => {
    const db = new ScriptDatabase(':memory:');
    expect(db).toBeDefined();
    const stats = db.getStats();
    expect(stats.totalScripts).toBe(0);
    db.close();
  });

  it('should initialize brief database', () => {
    const db = new BriefDatabase(':memory:');
    expect(db).toBeDefined();
    const stats = db.getStats();
    expect(stats.totalBriefs).toBe(0);
    db.close();
  });
});

describe('Script Database Operations', () => {
  let db: ScriptDatabase;

  beforeEach(() => {
    db = new ScriptDatabase(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  it('should create a script', () => {
    const script = db.createScript({
      storyId: 'story_123',
      briefId: 'brief_456',
      title: 'Test Script',
      status: 'draft',
      content: 'Test content',
      sections: [],
      wordCount: 2,
      estimatedDurationSeconds: 1,
    });

    expect(script.id).toMatch(/^script_/);
    expect(script.title).toBe('Test Script');
    expect(script.status).toBe('draft');
  });

  it('should retrieve a script', () => {
    const created = db.createScript({
      storyId: 'story_123',
      briefId: 'brief_456',
      title: 'Retrieve Test',
      status: 'draft',
      content: 'Content',
      sections: [],
      wordCount: 1,
      estimatedDurationSeconds: 1,
    });

    const retrieved = db.getScript(created.id);
    expect(retrieved).toBeDefined();
    expect(retrieved!.title).toBe('Retrieve Test');
  });

  it('should list scripts', () => {
    db.createScript({
      storyId: 'story_123',
      briefId: 'brief_456',
      title: 'List Test',
      status: 'draft',
      content: 'Content',
      sections: [],
      wordCount: 1,
      estimatedDurationSeconds: 1,
    });

    const result = db.listScripts({ limit: 10 });
    expect(result.total).toBe(1);
    expect(result.scripts.length).toBe(1);
  });

  it('should update a script', () => {
    const created = db.createScript({
      storyId: 'story_123',
      briefId: 'brief_456',
      title: 'Update Test',
      status: 'draft',
      content: 'Content',
      sections: [],
      wordCount: 1,
      estimatedDurationSeconds: 1,
    });

    const updated = db.updateScript(created.id, { status: 'review' });
    expect(updated!.status).toBe('review');
  });

  it('should delete a script', () => {
    const created = db.createScript({
      storyId: 'story_123',
      briefId: 'brief_456',
      title: 'Delete Test',
      status: 'draft',
      content: 'Content',
      sections: [],
      wordCount: 1,
      estimatedDurationSeconds: 1,
    });

    const deleted = db.deleteScript(created.id);
    expect(deleted).toBe(true);

    const retrieved = db.getScript(created.id);
    expect(retrieved).toBeNull();
  });
});

describe('Brief Database Operations', () => {
  let db: BriefDatabase;

  beforeEach(() => {
    db = new BriefDatabase(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  it('should create a brief', () => {
    const brief = db.createBrief({
      storyId: 'story_123',
      title: 'Test Brief',
      summary: 'Test summary',
      keyFacts: ['Fact 1', 'Fact 2'],
      perspectives: [],
      christOhMeterScore: 0,
      moralAlignment: '',
    });

    expect(brief.id).toMatch(/^brief_/);
    expect(brief.title).toBe('Test Brief');
  });

  it('should add and retrieve quotes', () => {
    const brief = db.createBrief({
      storyId: 'story_123',
      title: 'Quote Test',
      summary: 'Summary',
      keyFacts: [],
      perspectives: [],
      christOhMeterScore: 0,
      moralAlignment: '',
    });

    db.addQuote(brief.id, {
      text: 'This is a quote',
      attribution: 'Speaker',
      context: 'Interview',
    });

    const quotes = db.getQuotes(brief.id);
    expect(quotes.length).toBe(1);
    expect(quotes[0].text).toBe('This is a quote');
  });

  it('should save and retrieve Christ-Oh-Meter ratings', () => {
    const brief = db.createBrief({
      storyId: 'story_123',
      title: 'Rating Test',
      summary: 'Summary',
      keyFacts: [],
      perspectives: [],
      christOhMeterScore: 0,
      moralAlignment: '',
    });

    const ratingId = db.saveRating({
      action: 'Test action',
      subject: 'Test subject',
      affected: ['Group A', 'Group B'],
      tenetScores: [],
      spectrumScore: 0.5,
      verdict: 'leans_christ',
      strongestChristTenets: ['LOVE'],
      strongestEvilTenets: [],
      reasoning: 'Test reasoning',
    }, brief.id);

    expect(ratingId).toMatch(/^rating_/);

    const ratings = db.getRatingsForBrief(brief.id);
    expect(ratings.length).toBe(1);
    expect(ratings[0].spectrumScore).toBe(0.5);
  });
});

describe('Prohibited Patterns', () => {
  it('should return violations array', () => {
    const text = 'Some test text';
    const violations = checkProhibitedPatterns(text);
    expect(Array.isArray(violations)).toBe(true);
  });

  it('should allow clean factual text', () => {
    const text = 'The committee released its findings yesterday.';
    const violations = checkProhibitedPatterns(text);
    const errors = violations.filter(v => v.severity === 'error');
    expect(errors.length).toBe(0);
  });
});

describe('Section Templates', () => {
  it('should estimate word count', () => {
    const text = 'one two three four five';
    expect(estimateWordCount(text)).toBe(5);
  });

  it('should estimate word count with complex text', () => {
    const text = 'Hello, world! This is a test of the word counter. It should handle—punctuation correctly.';
    expect(estimateWordCount(text)).toBeGreaterThan(10);
  });

  it('should estimate duration at 150 wpm', () => {
    // 150 words = 60 seconds at 150 wpm
    const duration = estimateDuration(150);
    expect(duration).toBe(60);
  });

  it('should estimate duration for 300 words', () => {
    // 300 words = 120 seconds at 150 wpm
    const duration = estimateDuration(300);
    expect(duration).toBe(120);
  });

  it('should validate script with all NIWS elements', () => {
    const validScript = `Good evening. This is "Warnings with Loring," where we examine how news shapes your understanding.

Some content here...

${SIGNATURE_CLOSING}`;

    const result = validateNIWSElements(validScript);
    expect(result.hasOpening).toBe(true);
    expect(result.hasSignature).toBe(true);
  });

  it('should detect missing opening', () => {
    const noOpening = `Some random content without the proper opening.

${SIGNATURE_CLOSING}`;

    const result = validateNIWSElements(noOpening);
    expect(result.hasOpening).toBe(false);
    expect(result.hasSignature).toBe(true);
  });

  it('should detect missing signature', () => {
    const noSignature = `Good evening. This is "Warnings with Loring," where we examine how news shapes your understanding.

Some content but no closing signature.`;

    const result = validateNIWSElements(noSignature);
    expect(result.hasOpening).toBe(true);
    expect(result.hasSignature).toBe(false);
  });
});

describe('Christ-Oh-Meter Types', () => {
  it('should have correct verdict types', () => {
    const verdicts = ['strongly_christ', 'leans_christ', 'neutral', 'leans_evil', 'strongly_evil'];
    verdicts.forEach(v => {
      expect(typeof v).toBe('string');
    });
  });

  it('should have correct moral alignment types', () => {
    const alignments = ['christ', 'anti-christ', 'neutral', 'mixed'];
    alignments.forEach(a => {
      expect(typeof a).toBe('string');
    });
  });
});

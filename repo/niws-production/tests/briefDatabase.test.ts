/**
 * BriefDatabase Tests
 *
 * Comprehensive tests for brief database CRUD operations, quotes,
 * legislation, ratings, sources, and edge cases.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BriefDatabase } from '../src/database/briefDatabase.js';

describe('BriefDatabase', () => {
  let db: BriefDatabase;

  beforeEach(() => {
    db = new BriefDatabase(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  // ============================================
  // BRIEF CRUD OPERATIONS
  // ============================================

  describe('Brief CRUD', () => {
    it('should create a brief with all fields', () => {
      const brief = db.createBrief({
        storyId: 'story_123',
        title: 'Test Brief Title',
        summary: 'This is a test summary',
        keyFacts: ['Fact 1', 'Fact 2', 'Fact 3'],
        perspectives: [
          { outletId: 'outlet_1', outletName: 'CNN', perspective: 'Liberal perspective', quotes: [] },
          { outletId: 'outlet_2', outletName: 'Fox', perspective: 'Conservative perspective', quotes: [] },
        ],
        christOhMeterScore: 0.5,
        moralAlignment: 'neutral',
      });

      expect(brief.id).toMatch(/^brief_/);
      expect(brief.storyId).toBe('story_123');
      expect(brief.title).toBe('Test Brief Title');
      expect(brief.summary).toBe('This is a test summary');
      expect(brief.keyFacts).toEqual(['Fact 1', 'Fact 2', 'Fact 3']);
      expect(brief.perspectives.length).toBe(2);
      expect(brief.christOhMeterScore).toBe(0.5);
      expect(brief.moralAlignment).toBe('neutral');
      expect(brief.createdAt).toBeDefined();
      expect(brief.updatedAt).toBeDefined();
    });

    it('should create a brief with minimal fields', () => {
      const brief = db.createBrief({
        storyId: 'story_1',
        title: 'Minimal Brief',
        summary: '',
        keyFacts: [],
        perspectives: [],
        christOhMeterScore: 0,
        moralAlignment: '',
      });

      expect(brief.id).toMatch(/^brief_/);
      expect(brief.title).toBe('Minimal Brief');
      expect(brief.keyFacts).toEqual([]);
      expect(brief.perspectives).toEqual([]);
    });

    it('should retrieve a brief by id', () => {
      const created = db.createBrief({
        storyId: 'story_1',
        title: 'Retrieve Test',
        summary: 'Summary',
        keyFacts: [],
        perspectives: [],
        christOhMeterScore: 0,
        moralAlignment: '',
      });

      const retrieved = db.getBrief(created.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe(created.id);
      expect(retrieved!.title).toBe('Retrieve Test');
    });

    it('should return null for non-existent brief', () => {
      const brief = db.getBrief('brief_nonexistent');
      expect(brief).toBeNull();
    });

    it('should retrieve brief by storyId', () => {
      db.createBrief({
        storyId: 'story_target',
        title: 'First Brief',
        summary: '',
        keyFacts: [],
        perspectives: [],
        christOhMeterScore: 0,
        moralAlignment: '',
      });

      const retrieved = db.getBriefByStoryId('story_target');
      expect(retrieved).not.toBeNull();
      expect(retrieved!.title).toBe('First Brief');
    });

    it('should return most recent brief for storyId when multiple exist', () => {
      db.createBrief({
        storyId: 'story_multi',
        title: 'Older Brief',
        summary: '',
        keyFacts: [],
        perspectives: [],
        christOhMeterScore: 0,
        moralAlignment: '',
      });

      // Create second brief for same story
      db.createBrief({
        storyId: 'story_multi',
        title: 'Newer Brief',
        summary: '',
        keyFacts: [],
        perspectives: [],
        christOhMeterScore: 0,
        moralAlignment: '',
      });

      const retrieved = db.getBriefByStoryId('story_multi');
      expect(retrieved!.title).toBe('Newer Brief');
    });

    it('should update brief title', () => {
      const created = db.createBrief({
        storyId: 'story_1',
        title: 'Original Title',
        summary: '',
        keyFacts: [],
        perspectives: [],
        christOhMeterScore: 0,
        moralAlignment: '',
      });

      const updated = db.updateBrief(created.id, { title: 'Updated Title' });
      expect(updated!.title).toBe('Updated Title');
    });

    it('should update brief summary', () => {
      const created = db.createBrief({
        storyId: 'story_1',
        title: 'Title',
        summary: 'Old summary',
        keyFacts: [],
        perspectives: [],
        christOhMeterScore: 0,
        moralAlignment: '',
      });

      const updated = db.updateBrief(created.id, { summary: 'New summary' });
      expect(updated!.summary).toBe('New summary');
    });

    it('should update brief keyFacts', () => {
      const created = db.createBrief({
        storyId: 'story_1',
        title: 'Title',
        summary: '',
        keyFacts: ['Old fact'],
        perspectives: [],
        christOhMeterScore: 0,
        moralAlignment: '',
      });

      const updated = db.updateBrief(created.id, { keyFacts: ['New fact 1', 'New fact 2'] });
      expect(updated!.keyFacts).toEqual(['New fact 1', 'New fact 2']);
    });

    it('should update brief christOhMeterScore', () => {
      const created = db.createBrief({
        storyId: 'story_1',
        title: 'Title',
        summary: '',
        keyFacts: [],
        perspectives: [],
        christOhMeterScore: 0,
        moralAlignment: '',
      });

      const updated = db.updateBrief(created.id, { christOhMeterScore: 0.75 });
      expect(updated!.christOhMeterScore).toBe(0.75);
    });

    it('should update brief moralAlignment', () => {
      const created = db.createBrief({
        storyId: 'story_1',
        title: 'Title',
        summary: '',
        keyFacts: [],
        perspectives: [],
        christOhMeterScore: 0,
        moralAlignment: 'neutral',
      });

      const updated = db.updateBrief(created.id, { moralAlignment: 'christ' });
      expect(updated!.moralAlignment).toBe('christ');
    });

    it('should return null when updating non-existent brief', () => {
      const result = db.updateBrief('brief_fake', { title: 'test' });
      expect(result).toBeNull();
    });

    it('should update brief status', () => {
      const created = db.createBrief({
        storyId: 'story_1',
        title: 'Status Test',
        summary: '',
        keyFacts: [],
        perspectives: [],
        christOhMeterScore: 0,
        moralAlignment: '',
      });

      expect(db.updateBriefStatus(created.id, 'reviewed')).toBe(true);
      let brief = db.getBrief(created.id);
      // Status is not exposed in the StoryBrief type, but we can verify it via listBriefs

      expect(db.updateBriefStatus(created.id, 'approved')).toBe(true);
      expect(db.updateBriefStatus(created.id, 'used')).toBe(true);
    });

    it('should return false when updating status of non-existent brief', () => {
      const result = db.updateBriefStatus('brief_fake', 'approved');
      expect(result).toBe(false);
    });

    it('should delete a brief', () => {
      const created = db.createBrief({
        storyId: 'story_1',
        title: 'Delete Test',
        summary: '',
        keyFacts: [],
        perspectives: [],
        christOhMeterScore: 0,
        moralAlignment: '',
      });

      const deleted = db.deleteBrief(created.id);
      expect(deleted).toBe(true);

      const retrieved = db.getBrief(created.id);
      expect(retrieved).toBeNull();
    });

    it('should return false when deleting non-existent brief', () => {
      const result = db.deleteBrief('brief_nonexistent');
      expect(result).toBe(false);
    });

    it('should list briefs with no filters', () => {
      db.createBrief({ storyId: 'story_1', title: 'Brief 1', summary: '', keyFacts: [], perspectives: [], christOhMeterScore: 0, moralAlignment: '' });
      db.createBrief({ storyId: 'story_2', title: 'Brief 2', summary: '', keyFacts: [], perspectives: [], christOhMeterScore: 0, moralAlignment: '' });

      const result = db.listBriefs();
      expect(result.total).toBe(2);
      expect(result.briefs.length).toBe(2);
    });

    it('should list briefs filtered by storyId', () => {
      db.createBrief({ storyId: 'story_target', title: 'Target Brief', summary: '', keyFacts: [], perspectives: [], christOhMeterScore: 0, moralAlignment: '' });
      db.createBrief({ storyId: 'story_other', title: 'Other Brief', summary: '', keyFacts: [], perspectives: [], christOhMeterScore: 0, moralAlignment: '' });

      const result = db.listBriefs({ storyId: 'story_target' });
      expect(result.total).toBe(1);
      expect(result.briefs[0].title).toBe('Target Brief');
    });

    it('should list briefs filtered by status', () => {
      const brief1 = db.createBrief({ storyId: 'story_1', title: 'Draft Brief', summary: '', keyFacts: [], perspectives: [], christOhMeterScore: 0, moralAlignment: '' });
      const brief2 = db.createBrief({ storyId: 'story_2', title: 'Approved Brief', summary: '', keyFacts: [], perspectives: [], christOhMeterScore: 0, moralAlignment: '' });

      db.updateBriefStatus(brief2.id, 'approved');

      const draftResult = db.listBriefs({ status: 'draft' });
      expect(draftResult.total).toBe(1);

      const approvedResult = db.listBriefs({ status: 'approved' });
      expect(approvedResult.total).toBe(1);
    });

    it('should list briefs filtered by moralAlignment', () => {
      db.createBrief({ storyId: 'story_1', title: 'Christ Brief', summary: '', keyFacts: [], perspectives: [], christOhMeterScore: 0.8, moralAlignment: 'christ' });
      db.createBrief({ storyId: 'story_2', title: 'Neutral Brief', summary: '', keyFacts: [], perspectives: [], christOhMeterScore: 0, moralAlignment: 'neutral' });

      const christResult = db.listBriefs({ moralAlignment: 'christ' });
      expect(christResult.total).toBe(1);
      expect(christResult.briefs[0].title).toBe('Christ Brief');
    });

    it('should list briefs with pagination', () => {
      for (let i = 0; i < 10; i++) {
        db.createBrief({ storyId: `story_${i}`, title: `Brief ${i}`, summary: '', keyFacts: [], perspectives: [], christOhMeterScore: 0, moralAlignment: '' });
      }

      const page1 = db.listBriefs({ limit: 3, offset: 0 });
      expect(page1.total).toBe(10);
      expect(page1.briefs.length).toBe(3);

      const page2 = db.listBriefs({ limit: 3, offset: 3 });
      expect(page2.total).toBe(10);
      expect(page2.briefs.length).toBe(3);

      const lastPage = db.listBriefs({ limit: 3, offset: 9 });
      expect(lastPage.briefs.length).toBe(1);
    });
  });

  // ============================================
  // SOURCES OPERATIONS
  // ============================================

  describe('Sources Operations', () => {
    let briefId: string;

    beforeEach(() => {
      const brief = db.createBrief({
        storyId: 'story_1',
        title: 'Source Test',
        summary: '',
        keyFacts: [],
        perspectives: [],
        christOhMeterScore: 0,
        moralAlignment: '',
      });
      briefId = brief.id;
    });

    it('should add a source', () => {
      const source = db.addSource({
        briefId,
        articleId: 'article_123',
        outletId: 'outlet_456',
        relevanceScore: 0.85,
      });

      expect(source.id).toMatch(/^source_/);
      expect(source.briefId).toBe(briefId);
      expect(source.articleId).toBe('article_123');
      expect(source.outletId).toBe('outlet_456');
      expect(source.relevanceScore).toBe(0.85);
      expect(source.addedAt).toBeDefined();
    });

    it('should get sources for brief ordered by relevance', () => {
      db.addSource({ briefId, articleId: 'art_1', outletId: 'out_1', relevanceScore: 0.5 });
      db.addSource({ briefId, articleId: 'art_2', outletId: 'out_2', relevanceScore: 0.9 });
      db.addSource({ briefId, articleId: 'art_3', outletId: 'out_3', relevanceScore: 0.7 });

      const sources = db.getSources(briefId);
      expect(sources.length).toBe(3);
      expect(sources[0].relevanceScore).toBe(0.9);
      expect(sources[1].relevanceScore).toBe(0.7);
      expect(sources[2].relevanceScore).toBe(0.5);
    });

    it('should return empty array for brief with no sources', () => {
      const sources = db.getSources(briefId);
      expect(sources).toEqual([]);
    });
  });

  // ============================================
  // QUOTES OPERATIONS
  // ============================================

  describe('Quotes Operations', () => {
    let briefId: string;

    beforeEach(() => {
      const brief = db.createBrief({
        storyId: 'story_1',
        title: 'Quote Test',
        summary: '',
        keyFacts: [],
        perspectives: [],
        christOhMeterScore: 0,
        moralAlignment: '',
      });
      briefId = brief.id;
    });

    it('should add a quote', () => {
      const quoteId = db.addQuote(briefId, {
        text: 'This is an important quote.',
        attribution: 'John Doe, Senator',
        context: 'During press conference',
      });

      expect(quoteId).toMatch(/^quote_/);
    });

    it('should add a quote with all optional fields', () => {
      const quoteId = db.addQuote(briefId, {
        text: 'Full quote',
        attribution: 'Jane Smith',
        context: 'Interview',
        articleId: 'article_1',
        outletId: 'outlet_1',
        position: 5,
        isKeyQuote: true,
      });

      expect(quoteId).toMatch(/^quote_/);
    });

    it('should get quotes for brief ordered by position', () => {
      db.addQuote(briefId, { text: 'Third', attribution: '', context: '', position: 3 });
      db.addQuote(briefId, { text: 'First', attribution: '', context: '', position: 1 });
      db.addQuote(briefId, { text: 'Second', attribution: '', context: '', position: 2 });

      const quotes = db.getQuotes(briefId);
      expect(quotes.length).toBe(3);
      expect(quotes[0].text).toBe('First');
      expect(quotes[1].text).toBe('Second');
      expect(quotes[2].text).toBe('Third');
    });

    it('should return empty array for brief with no quotes', () => {
      const quotes = db.getQuotes(briefId);
      expect(quotes).toEqual([]);
    });

    it('should handle quotes with special characters', () => {
      db.addQuote(briefId, {
        text: 'Quote with "nested" quotes and \'apostrophes\'',
        attribution: 'Speaker\'s Name',
        context: 'Context with—em dash',
      });

      const quotes = db.getQuotes(briefId);
      expect(quotes[0].text).toBe('Quote with "nested" quotes and \'apostrophes\'');
    });
  });

  // ============================================
  // LEGISLATION OPERATIONS
  // ============================================

  describe('Legislation Operations', () => {
    let briefId: string;

    beforeEach(() => {
      const brief = db.createBrief({
        storyId: 'story_1',
        title: 'Legislation Test',
        summary: '',
        keyFacts: [],
        perspectives: [],
        christOhMeterScore: 0,
        moralAlignment: '',
      });
      briefId = brief.id;
    });

    it('should add legislation with all fields', () => {
      const leg = db.addLegislation({
        briefId,
        billNumber: 'HR-1234',
        title: 'Test Act of 2024',
        summary: 'A bill to do things',
        status: 'passed_house',
        sponsors: ['Sen. Smith', 'Rep. Jones'],
        impactAssessment: 'Significant impact on economy',
        moralImplications: 'Raises ethical concerns',
      });

      expect(leg.id).toMatch(/^leg_/);
      expect(leg.briefId).toBe(briefId);
      expect(leg.billNumber).toBe('HR-1234');
      expect(leg.title).toBe('Test Act of 2024');
      expect(leg.summary).toBe('A bill to do things');
      expect(leg.status).toBe('passed_house');
      expect(leg.sponsors).toEqual(['Sen. Smith', 'Rep. Jones']);
      expect(leg.impactAssessment).toBe('Significant impact on economy');
      expect(leg.moralImplications).toBe('Raises ethical concerns');
      expect(leg.createdAt).toBeDefined();
    });

    it('should add legislation with minimal fields', () => {
      const leg = db.addLegislation({
        briefId,
        title: 'Minimal Bill',
      });

      expect(leg.id).toMatch(/^leg_/);
      expect(leg.title).toBe('Minimal Bill');
      expect(leg.billNumber).toBeUndefined();
      expect(leg.summary).toBeUndefined();
    });

    it('should get legislation by id', () => {
      const created = db.addLegislation({
        briefId,
        title: 'Get Test',
      });

      const retrieved = db.getLegislation(created.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.title).toBe('Get Test');
    });

    it('should return null for non-existent legislation', () => {
      const leg = db.getLegislation('leg_fake');
      expect(leg).toBeNull();
    });

    it('should get all legislation for brief', () => {
      db.addLegislation({ briefId, title: 'Bill 1' });
      db.addLegislation({ briefId, title: 'Bill 2' });
      db.addLegislation({ briefId, title: 'Bill 3' });

      const legislation = db.getLegislationForBrief(briefId);
      expect(legislation.length).toBe(3);
    });

    it('should return empty array for brief with no legislation', () => {
      const legislation = db.getLegislationForBrief(briefId);
      expect(legislation).toEqual([]);
    });
  });

  // ============================================
  // CHRIST-OH-METER RATINGS
  // ============================================

  describe('Christ-Oh-Meter Ratings', () => {
    let briefId: string;

    beforeEach(() => {
      const brief = db.createBrief({
        storyId: 'story_1',
        title: 'Rating Test',
        summary: '',
        keyFacts: [],
        perspectives: [],
        christOhMeterScore: 0,
        moralAlignment: '',
      });
      briefId = brief.id;
    });

    it('should save a rating with all fields', () => {
      const ratingId = db.saveRating({
        action: 'Pass legislation',
        subject: 'Congress',
        affected: ['citizens', 'businesses'],
        tenetScores: [
          { tenetId: 1, christTenet: 'LOVE', evilTenet: 'HATRED', score: 0.5 },
          { tenetId: 2, christTenet: 'HEALING', evilTenet: 'WOUNDING', score: 0.3 },
        ],
        spectrumScore: 0.4,
        verdict: 'leans_christ',
        strongestChristTenets: ['LOVE', 'MERCY'],
        strongestEvilTenets: [],
        counterfeitsDetected: [{ tenet: 'JUSTICE', pattern: 'selective enforcement', evidence: 'Example' }],
        tenetsEvaluationId: 'eval_123',
        reasoning: 'The action demonstrates positive intent',
      }, briefId);

      expect(ratingId).toMatch(/^rating_/);
    });

    it('should save a rating without briefId', () => {
      const ratingId = db.saveRating({
        action: 'Independent action',
        subject: 'Actor',
        affected: ['group'],
        tenetScores: [],
        spectrumScore: 0,
        verdict: 'neutral',
        strongestChristTenets: [],
        strongestEvilTenets: [],
        reasoning: 'Neutral reasoning',
      });

      expect(ratingId).toMatch(/^rating_/);
    });

    it('should update brief score and alignment when saving rating', () => {
      db.saveRating({
        action: 'Good deed',
        subject: 'Helper',
        affected: ['people'],
        tenetScores: [],
        spectrumScore: 0.8,
        verdict: 'strongly_christ',
        strongestChristTenets: ['LOVE'],
        strongestEvilTenets: [],
        reasoning: 'Very positive action',
      }, briefId);

      const brief = db.getBrief(briefId);
      expect(brief!.christOhMeterScore).toBe(0.8);
      expect(brief!.moralAlignment).toBe('christ');
    });

    it('should set alignment to anti-christ for evil verdicts', () => {
      db.saveRating({
        action: 'Bad deed',
        subject: 'Villain',
        affected: ['victims'],
        tenetScores: [],
        spectrumScore: -0.7,
        verdict: 'strongly_evil',
        strongestChristTenets: [],
        strongestEvilTenets: ['HATRED'],
        reasoning: 'Harmful action',
      }, briefId);

      const brief = db.getBrief(briefId);
      expect(brief!.moralAlignment).toBe('anti-christ');
    });

    it('should get rating by id', () => {
      const ratingId = db.saveRating({
        action: 'Get test',
        subject: 'Subject',
        affected: ['group'],
        tenetScores: [],
        spectrumScore: 0.5,
        verdict: 'leans_christ',
        strongestChristTenets: [],
        strongestEvilTenets: [],
        reasoning: 'Test',
      }, briefId);

      const rating = db.getRating(ratingId);
      expect(rating).not.toBeNull();
      expect(rating!.action).toBe('Get test');
      expect(rating!.spectrumScore).toBe(0.5);
    });

    it('should return null for non-existent rating', () => {
      const rating = db.getRating('rating_fake');
      expect(rating).toBeNull();
    });

    it('should get ratings for brief ordered by created_at desc', () => {
      db.saveRating({
        action: 'First action',
        subject: 'S',
        affected: ['g'],
        tenetScores: [],
        spectrumScore: 0.1,
        verdict: 'neutral',
        strongestChristTenets: [],
        strongestEvilTenets: [],
        reasoning: 'R1',
      }, briefId);

      db.saveRating({
        action: 'Second action',
        subject: 'S',
        affected: ['g'],
        tenetScores: [],
        spectrumScore: 0.2,
        verdict: 'neutral',
        strongestChristTenets: [],
        strongestEvilTenets: [],
        reasoning: 'R2',
      }, briefId);

      const ratings = db.getRatingsForBrief(briefId);
      expect(ratings.length).toBe(2);
      // Most recent first
      expect(ratings[0].action).toBe('Second action');
    });

    it('should return empty array for brief with no ratings', () => {
      const ratings = db.getRatingsForBrief(briefId);
      expect(ratings).toEqual([]);
    });

    it('should handle all verdict types correctly', () => {
      const verdicts: Array<{ verdict: 'strongly_christ' | 'leans_christ' | 'neutral' | 'leans_evil' | 'strongly_evil'; expectedAlignment: string }> = [
        { verdict: 'strongly_christ', expectedAlignment: 'christ' },
        { verdict: 'leans_christ', expectedAlignment: 'christ' },
        { verdict: 'neutral', expectedAlignment: 'neutral' },
        { verdict: 'leans_evil', expectedAlignment: 'anti-christ' },
        { verdict: 'strongly_evil', expectedAlignment: 'anti-christ' },
      ];

      for (const { verdict, expectedAlignment } of verdicts) {
        const testBrief = db.createBrief({
          storyId: `story_${verdict}`,
          title: verdict,
          summary: '',
          keyFacts: [],
          perspectives: [],
          christOhMeterScore: 0,
          moralAlignment: '',
        });

        db.saveRating({
          action: `Action ${verdict}`,
          subject: 'S',
          affected: ['g'],
          tenetScores: [],
          spectrumScore: 0,
          verdict,
          strongestChristTenets: [],
          strongestEvilTenets: [],
          reasoning: 'R',
        }, testBrief.id);

        const updated = db.getBrief(testBrief.id);
        expect(updated!.moralAlignment).toBe(expectedAlignment);
      }
    });
  });

  // ============================================
  // STATISTICS
  // ============================================

  describe('Statistics', () => {
    it('should return correct stats for empty database', () => {
      const stats = db.getStats();
      expect(stats.totalBriefs).toBe(0);
      expect(stats.byStatus).toEqual({});
      expect(stats.byMoralAlignment).toEqual({});
      expect(stats.totalRatings).toBe(0);
      expect(stats.averageScore).toBeNull();
    });

    it('should count briefs by status', () => {
      const brief1 = db.createBrief({ storyId: '1', title: 'Draft 1', summary: '', keyFacts: [], perspectives: [], christOhMeterScore: 0, moralAlignment: '' });
      const brief2 = db.createBrief({ storyId: '2', title: 'Draft 2', summary: '', keyFacts: [], perspectives: [], christOhMeterScore: 0, moralAlignment: '' });
      const brief3 = db.createBrief({ storyId: '3', title: 'Approved', summary: '', keyFacts: [], perspectives: [], christOhMeterScore: 0, moralAlignment: '' });

      db.updateBriefStatus(brief3.id, 'approved');

      const stats = db.getStats();
      expect(stats.totalBriefs).toBe(3);
      expect(stats.byStatus['draft']).toBe(2);
      expect(stats.byStatus['approved']).toBe(1);
    });

    it('should count briefs by moral alignment', () => {
      db.createBrief({ storyId: '1', title: 'Christ 1', summary: '', keyFacts: [], perspectives: [], christOhMeterScore: 0.8, moralAlignment: 'christ' });
      db.createBrief({ storyId: '2', title: 'Christ 2', summary: '', keyFacts: [], perspectives: [], christOhMeterScore: 0.6, moralAlignment: 'christ' });
      db.createBrief({ storyId: '3', title: 'Neutral', summary: '', keyFacts: [], perspectives: [], christOhMeterScore: 0, moralAlignment: 'neutral' });
      db.createBrief({ storyId: '4', title: 'No alignment', summary: '', keyFacts: [], perspectives: [], christOhMeterScore: 0, moralAlignment: '' });

      const stats = db.getStats();
      expect(stats.byMoralAlignment['christ']).toBe(2);
      expect(stats.byMoralAlignment['neutral']).toBe(1);
    });

    it('should count and average ratings', () => {
      const brief = db.createBrief({ storyId: '1', title: 'Rating Stats', summary: '', keyFacts: [], perspectives: [], christOhMeterScore: 0, moralAlignment: '' });

      db.saveRating({ action: 'A1', subject: 'S', affected: ['g'], tenetScores: [], spectrumScore: 0.5, verdict: 'neutral', strongestChristTenets: [], strongestEvilTenets: [], reasoning: 'R' }, brief.id);
      db.saveRating({ action: 'A2', subject: 'S', affected: ['g'], tenetScores: [], spectrumScore: 0.7, verdict: 'leans_christ', strongestChristTenets: [], strongestEvilTenets: [], reasoning: 'R' }, brief.id);
      db.saveRating({ action: 'A3', subject: 'S', affected: ['g'], tenetScores: [], spectrumScore: -0.2, verdict: 'neutral', strongestChristTenets: [], strongestEvilTenets: [], reasoning: 'R' });

      const stats = db.getStats();
      expect(stats.totalRatings).toBe(3);
      // Average of 0.5, 0.7, -0.2 = 1.0/3 ≈ 0.33
      expect(stats.averageScore).toBeCloseTo(0.33, 1);
    });
  });

  // ============================================
  // EDGE CASES
  // ============================================

  describe('Edge Cases', () => {
    it('should handle empty summary', () => {
      const brief = db.createBrief({
        storyId: 'story_1',
        title: 'Empty Summary',
        summary: '',
        keyFacts: [],
        perspectives: [],
        christOhMeterScore: 0,
        moralAlignment: '',
      });

      expect(brief.summary).toBe('');
    });

    it('should handle very long keyFacts arrays', () => {
      const keyFacts = Array(100).fill(0).map((_, i) => `Fact ${i}`);

      const brief = db.createBrief({
        storyId: 'story_1',
        title: 'Many Facts',
        summary: '',
        keyFacts,
        perspectives: [],
        christOhMeterScore: 0,
        moralAlignment: '',
      });

      expect(brief.keyFacts.length).toBe(100);
    });

    it('should handle complex perspectives', () => {
      const perspectives = [
        {
          outletId: 'outlet_1',
          outletName: 'CNN',
          perspective: 'Long perspective text with details',
          quotes: [
            { text: 'Quote 1', attribution: 'Person 1', context: 'Context 1' },
            { text: 'Quote 2', attribution: 'Person 2', context: 'Context 2' },
          ],
        },
      ];

      const brief = db.createBrief({
        storyId: 'story_1',
        title: 'Complex Perspectives',
        summary: '',
        keyFacts: [],
        perspectives,
        christOhMeterScore: 0,
        moralAlignment: '',
      });

      expect(brief.perspectives).toEqual(perspectives);
    });

    it('should handle special characters in text fields', () => {
      const brief = db.createBrief({
        storyId: 'story_1',
        title: 'Title with "quotes" and \'apostrophes\'',
        summary: 'Summary with\nnewlines\tand tabs',
        keyFacts: ['Fact with emoji 🚀'],
        perspectives: [],
        christOhMeterScore: 0,
        moralAlignment: '',
      });

      expect(brief.title).toContain('"quotes"');
      expect(brief.summary).toContain('\n');
      expect(brief.keyFacts[0]).toContain('🚀');
    });

    it('should handle unicode in all fields', () => {
      const brief = db.createBrief({
        storyId: 'story_1',
        title: '日本語タイトル',
        summary: 'العربية summary',
        keyFacts: ['한국어 fact'],
        perspectives: [],
        christOhMeterScore: 0,
        moralAlignment: '',
      });

      expect(brief.title).toBe('日本語タイトル');
      expect(brief.summary).toBe('العربية summary');
    });

    it('should cascade delete quotes when brief is deleted', () => {
      const brief = db.createBrief({
        storyId: 'story_1',
        title: 'Cascade Test',
        summary: '',
        keyFacts: [],
        perspectives: [],
        christOhMeterScore: 0,
        moralAlignment: '',
      });

      db.addQuote(brief.id, { text: 'Quote 1', attribution: '', context: '' });
      db.addQuote(brief.id, { text: 'Quote 2', attribution: '', context: '' });

      expect(db.getQuotes(brief.id).length).toBe(2);

      db.deleteBrief(brief.id);

      expect(db.getQuotes(brief.id).length).toBe(0);
    });

    it('should cascade delete sources when brief is deleted', () => {
      const brief = db.createBrief({
        storyId: 'story_1',
        title: 'Source Cascade',
        summary: '',
        keyFacts: [],
        perspectives: [],
        christOhMeterScore: 0,
        moralAlignment: '',
      });

      db.addSource({ briefId: brief.id, articleId: 'a1', outletId: 'o1', relevanceScore: 0.5 });

      expect(db.getSources(brief.id).length).toBe(1);

      db.deleteBrief(brief.id);

      expect(db.getSources(brief.id).length).toBe(0);
    });

    it('should cascade delete legislation when brief is deleted', () => {
      const brief = db.createBrief({
        storyId: 'story_1',
        title: 'Legislation Cascade',
        summary: '',
        keyFacts: [],
        perspectives: [],
        christOhMeterScore: 0,
        moralAlignment: '',
      });

      db.addLegislation({ briefId: brief.id, title: 'Bill 1' });

      expect(db.getLegislationForBrief(brief.id).length).toBe(1);

      db.deleteBrief(brief.id);

      expect(db.getLegislationForBrief(brief.id).length).toBe(0);
    });

    it('should set rating briefId to null when brief is deleted', () => {
      const brief = db.createBrief({
        storyId: 'story_1',
        title: 'Rating Orphan Test',
        summary: '',
        keyFacts: [],
        perspectives: [],
        christOhMeterScore: 0,
        moralAlignment: '',
      });

      const ratingId = db.saveRating({
        action: 'Action',
        subject: 'Subject',
        affected: ['group'],
        tenetScores: [],
        spectrumScore: 0.5,
        verdict: 'neutral',
        strongestChristTenets: [],
        strongestEvilTenets: [],
        reasoning: 'Reasoning',
      }, brief.id);

      expect(db.getRatingsForBrief(brief.id).length).toBe(1);

      db.deleteBrief(brief.id);

      // Rating should still exist but not be linked to brief
      const rating = db.getRating(ratingId);
      expect(rating).not.toBeNull();
      expect(db.getRatingsForBrief(brief.id).length).toBe(0);
    });
  });
});

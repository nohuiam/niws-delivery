/**
 * Integration Tests
 *
 * Tests for full pipeline workflows from brief creation to script approval.
 * These tests verify that all components work together correctly.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ScriptGeneratorService } from '../src/services/scriptGenerator.js';
import { ChristOhMeterService } from '../src/services/christOhMeter.js';
import { BriefDatabase, resetBriefDatabaseInstance } from '../src/database/briefDatabase.js';
import { resetScriptDatabaseInstance } from '../src/database/scriptDatabase.js';

describe('Integration Tests', () => {
  let scriptGenerator: ScriptGeneratorService;
  let christOhMeter: ChristOhMeterService;
  let briefDb: BriefDatabase;

  beforeEach(() => {
    resetScriptDatabaseInstance();
    resetBriefDatabaseInstance();
    scriptGenerator = new ScriptGeneratorService(':memory:');
    christOhMeter = new ChristOhMeterService();
    briefDb = new BriefDatabase(':memory:');
  });

  afterEach(() => {
    resetScriptDatabaseInstance();
    resetBriefDatabaseInstance();
  });

  // ============================================
  // BRIEF TO SCRIPT PIPELINE
  // ============================================

  describe('Brief to Script Pipeline', () => {
    it('should create brief, generate script, and validate', async () => {
      // Step 1: Create a brief
      const brief = briefDb.createBrief({
        storyId: 'story_pipeline_1',
        title: 'Test Pipeline Story',
        summary: 'A test story about testing.',
        keyFacts: ['Fact 1', 'Fact 2', 'Fact 3'],
        perspectives: [
          { outlet: 'CNN', lean: 'left', emphasis: 'Environmental impact' },
          { outlet: 'Fox', lean: 'right', emphasis: 'Economic impact' },
        ],
        christOhMeterScore: 0,
        moralAlignment: '',
      });

      expect(brief.id).toMatch(/^brief_/);

      // Step 2: Generate script from brief
      const scriptResult = await scriptGenerator.generateScript({
        storyId: brief.storyId,
        storyTopic: brief.title,
        briefId: brief.id,
      });

      expect(scriptResult.script.id).toMatch(/^script_/);
      expect(scriptResult.script.briefId).toBe(brief.id);

      // Step 3: Validate script
      const qa = scriptGenerator.validateScript(scriptResult.script);

      expect(qa).toBeDefined();
      expect(typeof qa.passed).toBe('boolean');
      expect(qa.score).toBeGreaterThanOrEqual(0);
    });

    it('should track script revisions through workflow', async () => {
      // Create initial script
      const result = await scriptGenerator.generateScript({
        storyId: 'story_revision_test',
        storyTopic: 'Revision Workflow Test',
      });

      // Revise multiple times
      await scriptGenerator.reviseSection(result.script.id, 0, 'Make it more engaging');
      await scriptGenerator.reviseSection(result.script.id, 1, 'Add more facts');
      await scriptGenerator.reviseSection(result.script.id, 2, 'Clarify analysis');

      // Check revision history
      const revisions = scriptGenerator.getRevisions(result.script.id);

      expect(revisions.length).toBe(3);
      expect(revisions[0].revisionNumber).toBe(1);
      expect(revisions[1].revisionNumber).toBe(2);
      expect(revisions[2].revisionNumber).toBe(3);
    });

    it('should transition script through status workflow', async () => {
      const result = await scriptGenerator.generateScript({
        storyId: 'story_status_test',
        storyTopic: 'Status Workflow Test',
      });

      // Initial status should be draft
      expect(result.script.status).toBe('draft');

      // Move to review
      let script = scriptGenerator.updateStatus(result.script.id, 'review');
      expect(script!.status).toBe('review');

      // Move to approved
      script = scriptGenerator.updateStatus(result.script.id, 'approved');
      expect(script!.status).toBe('approved');
    });
  });

  // ============================================
  // CHRIST-OH-METER INTEGRATION
  // ============================================

  describe('Christ-Oh-Meter Integration', () => {
    it('should rate brief and store rating', async () => {
      // Create a brief
      const brief = briefDb.createBrief({
        storyId: 'story_rating_test',
        title: 'Moral Rating Test',
        summary: 'Testing moral alignment.',
        keyFacts: [],
        perspectives: [],
        christOhMeterScore: 0,
        moralAlignment: '',
      });

      // Rate an action related to the story
      const rating = await christOhMeter.rateAction(
        'Help distribute food to homeless',
        'Local charity',
        ['Homeless population', 'Community'],
        'During winter storm'
      );

      // Save rating to brief
      const ratingId = briefDb.saveRating(rating, brief.id);

      expect(ratingId).toBeDefined();

      // Retrieve ratings
      const ratings = briefDb.getRatingsForBrief(brief.id);

      expect(ratings.length).toBe(1);
      expect(ratings[0].action).toBe('Help distribute food to homeless');
    });

    it('should accumulate multiple ratings for a brief', async () => {
      const brief = briefDb.createBrief({
        storyId: 'story_multi_rating',
        title: 'Multiple Ratings Test',
        summary: 'Testing multiple ratings.',
        keyFacts: [],
        perspectives: [],
        christOhMeterScore: 0,
        moralAlignment: '',
      });

      // Rate multiple actions
      const action1 = await christOhMeter.rateAction(
        'Donate supplies',
        'Organization',
        ['Recipients']
      );
      briefDb.saveRating(action1, brief.id);

      const action2 = await christOhMeter.rateAction(
        'Volunteer time',
        'Individuals',
        ['Community']
      );
      briefDb.saveRating(action2, brief.id);

      const action3 = await christOhMeter.rateAction(
        'Spread awareness',
        'Media',
        ['Public']
      );
      briefDb.saveRating(action3, brief.id);

      // Check all ratings are stored
      const ratings = briefDb.getRatingsForBrief(brief.id);

      expect(ratings.length).toBe(3);
    });
  });

  // ============================================
  // BRIEF LIFECYCLE
  // ============================================

  describe('Brief Lifecycle', () => {
    it('should track brief status through workflow', () => {
      const brief = briefDb.createBrief({
        storyId: 'story_lifecycle',
        title: 'Lifecycle Test',
        summary: 'Testing brief lifecycle.',
        keyFacts: [],
        perspectives: [],
        christOhMeterScore: 0,
        moralAlignment: '',
      });

      // Initial status should be draft
      expect(brief.status).toBe('draft');

      // Move through statuses
      briefDb.updateBriefStatus(brief.id, 'reviewed');
      let updated = briefDb.getBrief(brief.id);
      expect(updated!.status).toBe('reviewed');

      briefDb.updateBriefStatus(brief.id, 'approved');
      updated = briefDb.getBrief(brief.id);
      expect(updated!.status).toBe('approved');

      briefDb.updateBriefStatus(brief.id, 'used');
      updated = briefDb.getBrief(brief.id);
      expect(updated!.status).toBe('used');
    });

    it('should add sources to brief', () => {
      const brief = briefDb.createBrief({
        storyId: 'story_sources',
        title: 'Sources Test',
        summary: 'Testing sources.',
        keyFacts: [],
        perspectives: [],
        christOhMeterScore: 0,
        moralAlignment: '',
      });

      // Add multiple sources (using actual API: briefId, articleId, outletId, relevanceScore)
      briefDb.addSource({
        briefId: brief.id,
        articleId: 'article_cnn',
        outletId: 'outlet_cnn',
        relevanceScore: 0.9,
      });

      briefDb.addSource({
        briefId: brief.id,
        articleId: 'article_fox',
        outletId: 'outlet_fox',
        relevanceScore: 0.8,
      });

      briefDb.addSource({
        briefId: brief.id,
        articleId: 'article_npr',
        outletId: 'outlet_npr',
        relevanceScore: 0.85,
      });

      const sources = briefDb.getSources(brief.id);

      expect(sources.length).toBe(3);
      expect(sources.map(s => s.outletId)).toContain('outlet_cnn');
      expect(sources.map(s => s.outletId)).toContain('outlet_fox');
      expect(sources.map(s => s.outletId)).toContain('outlet_npr');
    });

    it('should add quotes to brief', () => {
      const brief = briefDb.createBrief({
        storyId: 'story_quotes',
        title: 'Quotes Test',
        summary: 'Testing quotes.',
        keyFacts: [],
        perspectives: [],
        christOhMeterScore: 0,
        moralAlignment: '',
      });

      // Add quotes (using actual API: text, attribution, context)
      briefDb.addQuote(brief.id, {
        text: 'This is an important issue.',
        attribution: 'Senator John Smith',
        context: 'Press conference',
      });

      briefDb.addQuote(brief.id, {
        text: 'The data shows clear trends.',
        attribution: 'Expert Jane Doe',
        context: 'Interview',
      });

      const quotes = briefDb.getQuotes(brief.id);

      expect(quotes.length).toBe(2);
      expect(quotes.map(q => q.attribution)).toContain('Senator John Smith');
      expect(quotes.map(q => q.attribution)).toContain('Expert Jane Doe');
    });
  });

  // ============================================
  // FULL PIPELINE
  // ============================================

  describe('Full Pipeline', () => {
    it('should complete full pipeline from brief to approved script', async () => {
      // 1. Create brief with content
      const brief = briefDb.createBrief({
        storyId: 'story_full_pipeline',
        title: 'Full Pipeline Integration Test',
        summary: 'A comprehensive test of the full news production pipeline.',
        keyFacts: [
          'Testing is important for quality',
          'Integration tests catch system-level issues',
          'Coverage matters',
        ],
        perspectives: [
          { outlet: 'CNN', lean: 'left', emphasis: 'Quality focus' },
          { outlet: 'Fox', lean: 'right', emphasis: 'Efficiency focus' },
        ],
        christOhMeterScore: 0,
        moralAlignment: '',
      });

      // 2. Add sources (using actual API)
      briefDb.addSource({
        briefId: brief.id,
        articleId: 'article_tech',
        outletId: 'outlet_tech',
        relevanceScore: 0.95,
      });

      // 3. Add quotes (using actual API)
      briefDb.addQuote(brief.id, {
        text: 'Tests are the foundation of reliable software.',
        attribution: 'Development Lead',
        context: 'Conference talk',
      });

      // 4. Rate moral alignment
      const rating = await christOhMeter.rateAction(
        'Build quality software',
        'Development team',
        ['Users', 'Business'],
        'Product development'
      );
      briefDb.saveRating(rating, brief.id);

      // 5. Move brief to reviewed
      briefDb.updateBriefStatus(brief.id, 'reviewed');

      // 6. Generate script
      const scriptResult = await scriptGenerator.generateScript({
        storyId: brief.storyId,
        storyTopic: brief.title,
        briefId: brief.id,
        preferences: {
          targetDurationSeconds: 300,
          emphasis: 'factual',
        },
      });

      // 7. Validate script
      const qa = scriptGenerator.validateScript(scriptResult.script);

      // 8. If passed, approve
      if (qa.passed) {
        scriptGenerator.updateStatus(scriptResult.script.id, 'approved');
      }

      // 9. Mark brief as used
      briefDb.updateBriefStatus(brief.id, 'used');

      // Verify final state
      const finalBrief = briefDb.getBrief(brief.id);
      const finalScript = scriptGenerator.getScript(scriptResult.script.id);

      expect(finalBrief!.status).toBe('used');
      expect(finalScript).toBeDefined();
      expect(finalScript!.briefId).toBe(brief.id);
    });
  });

  // ============================================
  // EXPORT WORKFLOWS
  // ============================================

  describe('Export Workflows', () => {
    it('should export script in multiple formats', async () => {
      const result = await scriptGenerator.generateScript({
        storyId: 'story_export',
        storyTopic: 'Export Test',
      });

      // Export as markdown
      const markdown = scriptGenerator.exportScript(result.script.id, 'markdown');
      expect(markdown).not.toBeNull();
      expect(markdown!.format).toBe('markdown');

      // Export as plain text
      const plainText = scriptGenerator.exportScript(result.script.id, 'plain_text');
      expect(plainText).not.toBeNull();
      expect(plainText!.format).toBe('plain_text');

      // Export as JSON
      const json = scriptGenerator.exportScript(result.script.id, 'json');
      expect(json).not.toBeNull();
      expect(json!.format).toBe('json');

      // Parse JSON export and verify structure
      const parsed = JSON.parse(json!.content);
      expect(parsed.id).toBe(result.script.id);
      expect(parsed.title).toBe('Export Test');
    });
  });

  // ============================================
  // STATISTICS
  // ============================================

  describe('Statistics', () => {
    it('should track script statistics across workflow', async () => {
      // Generate multiple scripts
      const scripts = [];
      for (let i = 0; i < 5; i++) {
        const result = await scriptGenerator.generateScript({
          storyId: `story_stats_${i}`,
          storyTopic: `Stats Test ${i}`,
        });
        scripts.push(result.script);
      }

      // Update some statuses
      scriptGenerator.updateStatus(scripts[0].id, 'review');
      scriptGenerator.updateStatus(scripts[1].id, 'review');
      scriptGenerator.updateStatus(scripts[2].id, 'approved');

      // Check stats
      const stats = scriptGenerator.getStats();

      expect(stats.totalScripts).toBe(5);
      expect(stats.byStatus['draft']).toBe(2);
      expect(stats.byStatus['review']).toBe(2);
      expect(stats.byStatus['approved']).toBe(1);
    });

    it('should track brief statistics', () => {
      // Create multiple briefs
      for (let i = 0; i < 3; i++) {
        briefDb.createBrief({
          storyId: `story_brief_stats_${i}`,
          title: `Brief Stats ${i}`,
          summary: 'Test',
          keyFacts: [],
          perspectives: [],
          christOhMeterScore: 0,
          moralAlignment: '',
        });
      }

      const stats = briefDb.getStats();

      expect(stats.totalBriefs).toBe(3);
      expect(stats.byStatus['draft']).toBe(3);
    });
  });

  // ============================================
  // ERROR RECOVERY
  // ============================================

  describe('Error Recovery', () => {
    it('should handle missing brief gracefully', async () => {
      const result = await scriptGenerator.generateScript({
        storyId: 'story_missing_brief',
        storyTopic: 'Missing Brief Test',
        briefId: 'brief_nonexistent',
      });

      // Should still generate script even with invalid brief reference
      expect(result.script).toBeDefined();
      expect(result.script.briefId).toBe('brief_nonexistent');
    });

    it('should handle empty data gracefully', async () => {
      const brief = briefDb.createBrief({
        storyId: 'story_empty',
        title: '',
        summary: '',
        keyFacts: [],
        perspectives: [],
        christOhMeterScore: 0,
        moralAlignment: '',
      });

      expect(brief.id).toBeDefined();

      const result = await scriptGenerator.generateScript({
        storyId: brief.storyId,
        storyTopic: '',
        briefId: brief.id,
      });

      expect(result.script).toBeDefined();
    });
  });
});

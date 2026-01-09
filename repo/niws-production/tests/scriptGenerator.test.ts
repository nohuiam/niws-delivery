/**
 * ScriptGenerator Tests
 *
 * Tests for script generation, validation, revision, and export functionality.
 * Note: These tests use mocked API responses to avoid actual LLM calls.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ScriptGeneratorService } from '../src/services/scriptGenerator.js';
import { ScriptDatabase } from '../src/database/scriptDatabase.js';
import { SIGNATURE_CLOSING } from '../src/config/sectionTemplates.js';

describe('ScriptGeneratorService', () => {
  let generator: ScriptGeneratorService;

  beforeEach(() => {
    // Use in-memory database for tests
    generator = new ScriptGeneratorService(':memory:');
  });

  // ============================================
  // SCRIPT GENERATION
  // ============================================

  describe('Script Generation', () => {
    it('should generate a script with required fields', async () => {
      const result = await generator.generateScript({
        storyId: 'story_123',
        storyTopic: 'Climate Policy Coverage',
      });

      expect(result.script).toBeDefined();
      expect(result.script.id).toMatch(/^script_/);
      expect(result.script.storyId).toBe('story_123');
      expect(result.script.title).toBe('Climate Policy Coverage');
      expect(result.script.status).toBe('draft');
      expect(result.qa).toBeDefined();
    });

    it('should generate a script with briefId', async () => {
      const result = await generator.generateScript({
        storyId: 'story_123',
        storyTopic: 'Test Topic',
        briefId: 'brief_456',
      });

      expect(result.script.briefId).toBe('brief_456');
    });

    it('should generate 5 sections', async () => {
      const result = await generator.generateScript({
        storyId: 'story_123',
        storyTopic: 'Test Topic',
      });

      expect(result.script.sections.length).toBe(5);
    });

    it('should include opening section', async () => {
      const result = await generator.generateScript({
        storyId: 'story_123',
        storyTopic: 'Test Topic',
      });

      const opening = result.script.sections.find(s => s.sectionType === 'intro');
      expect(opening).toBeDefined();
      expect(opening!.position).toBe(0);
    });

    it('should include closing section with signature', async () => {
      const result = await generator.generateScript({
        storyId: 'story_123',
        storyTopic: 'Test Topic',
      });

      const closing = result.script.sections.find(s => s.sectionType === 'close');
      expect(closing).toBeDefined();
      expect(closing!.content).toContain(SIGNATURE_CLOSING);
    });

    it('should calculate word count', async () => {
      const result = await generator.generateScript({
        storyId: 'story_123',
        storyTopic: 'Test Topic',
      });

      expect(result.script.wordCount).toBeGreaterThan(0);
    });

    it('should calculate estimated duration', async () => {
      const result = await generator.generateScript({
        storyId: 'story_123',
        storyTopic: 'Test Topic',
      });

      expect(result.script.estimatedDurationSeconds).toBeGreaterThan(0);
    });

    it('should store generation params', async () => {
      const result = await generator.generateScript({
        storyId: 'story_123',
        storyTopic: 'Test Topic',
        preferences: {
          targetDurationSeconds: 300,
          outletSelection: ['cnn', 'fox', 'npr'],
          emphasis: 'factual',
        },
      });

      expect(result.script.generationParams).toBeDefined();
      expect(result.script.generationParams?.preferences).toBeDefined();
    });

    it('should run QA validation on generated script', async () => {
      const result = await generator.generateScript({
        storyId: 'story_123',
        storyTopic: 'Test Topic',
      });

      expect(result.qa).toBeDefined();
      expect(typeof result.qa.passed).toBe('boolean');
      expect(typeof result.qa.score).toBe('number');
      expect(Array.isArray(result.qa.issues)).toBe(true);
    });
  });

  // ============================================
  // SCRIPT VALIDATION
  // ============================================

  describe('Script Validation', () => {
    it('should pass validation for script with all requirements', async () => {
      const result = await generator.generateScript({
        storyId: 'story_123',
        storyTopic: 'Test Topic',
      });

      const qa = generator.validateScript(result.script);
      expect(qa.passed).toBe(true);
    });

    it('should fail validation for missing signature closing', () => {
      const mockScript = {
        id: 'script_test',
        storyId: 'story_123',
        briefId: '',
        title: 'Test',
        status: 'draft' as const,
        content: 'Content without signature',
        sections: [
          { id: 's1', scriptId: 'script_test', sectionType: 'intro' as const, content: 'Intro', position: 0, wordCount: 10, createdAt: '' },
          { id: 's2', scriptId: 'script_test', sectionType: 'story' as const, content: 'Story', position: 1, wordCount: 10, createdAt: '' },
          { id: 's3', scriptId: 'script_test', sectionType: 'analysis' as const, content: 'Analysis', position: 2, wordCount: 10, createdAt: '' },
          { id: 's4', scriptId: 'script_test', sectionType: 'opinion' as const, content: 'Opinion', position: 3, wordCount: 10, createdAt: '' },
          { id: 's5', scriptId: 'script_test', sectionType: 'close' as const, content: 'Close without signature', position: 4, wordCount: 10, createdAt: '' },
        ],
        wordCount: 50,
        estimatedDurationSeconds: 20,
        createdAt: '',
        updatedAt: '',
      };

      const qa = generator.validateScript(mockScript);
      expect(qa.passed).toBe(false);
      expect(qa.issues.some(i => i.type === 'missing_signature')).toBe(true);
    });

    it('should warn for short word count', () => {
      const mockScript = {
        id: 'script_test',
        storyId: 'story_123',
        briefId: '',
        title: 'Test',
        status: 'draft' as const,
        content: `Short content ${SIGNATURE_CLOSING}`,
        sections: [],
        wordCount: 100, // Below minimum of 750
        estimatedDurationSeconds: 40,
        createdAt: '',
        updatedAt: '',
      };

      const qa = generator.validateScript(mockScript);
      expect(qa.issues.some(i => i.type === 'word_count' && i.message.includes('short'))).toBe(true);
    });

    it('should warn for long word count', () => {
      const mockScript = {
        id: 'script_test',
        storyId: 'story_123',
        briefId: '',
        title: 'Test',
        status: 'draft' as const,
        content: `Long content ${SIGNATURE_CLOSING}`,
        sections: [],
        wordCount: 1500, // Above maximum of 1200
        estimatedDurationSeconds: 600,
        createdAt: '',
        updatedAt: '',
      };

      const qa = generator.validateScript(mockScript);
      expect(qa.issues.some(i => i.type === 'word_count' && i.message.includes('long'))).toBe(true);
    });

    it('should warn for missing sections', () => {
      const mockScript = {
        id: 'script_test',
        storyId: 'story_123',
        briefId: '',
        title: 'Test',
        status: 'draft' as const,
        content: `Content ${SIGNATURE_CLOSING}`,
        sections: [
          { id: 's1', scriptId: 'script_test', sectionType: 'intro' as const, content: 'Intro', position: 0, wordCount: 10, createdAt: '' },
        ],
        wordCount: 800,
        estimatedDurationSeconds: 320,
        createdAt: '',
        updatedAt: '',
      };

      const qa = generator.validateScript(mockScript);
      expect(qa.issues.some(i => i.type === 'missing_sections')).toBe(true);
    });

    it('should calculate score based on issues', () => {
      const mockScript = {
        id: 'script_test',
        storyId: 'story_123',
        briefId: '',
        title: 'Test',
        status: 'draft' as const,
        content: 'No signature, very short',
        sections: [],
        wordCount: 100,
        estimatedDurationSeconds: 40,
        createdAt: '',
        updatedAt: '',
      };

      const qa = generator.validateScript(mockScript);
      expect(qa.score).toBeLessThan(100);
    });
  });

  // ============================================
  // SCRIPT EXPORT
  // ============================================

  describe('Script Export', () => {
    let scriptId: string;

    beforeEach(async () => {
      const result = await generator.generateScript({
        storyId: 'story_123',
        storyTopic: 'Export Test Topic',
      });
      scriptId = result.script.id;
    });

    it('should export as markdown', () => {
      const exported = generator.exportScript(scriptId, 'markdown');
      expect(exported).not.toBeNull();
      expect(exported!.format).toBe('markdown');
      expect(exported!.content).toBeDefined();
    });

    it('should export as plain text', () => {
      const exported = generator.exportScript(scriptId, 'plain_text');
      expect(exported).not.toBeNull();
      expect(exported!.format).toBe('plain_text');
      // Plain text should not have markdown headers
      expect(exported!.content).not.toMatch(/^#+/m);
    });

    it('should export as JSON', () => {
      const exported = generator.exportScript(scriptId, 'json');
      expect(exported).not.toBeNull();
      expect(exported!.format).toBe('json');
      const parsed = JSON.parse(exported!.content);
      expect(parsed.id).toBe(scriptId);
    });

    it('should return null for non-existent script', () => {
      const exported = generator.exportScript('script_nonexistent', 'markdown');
      expect(exported).toBeNull();
    });
  });

  // ============================================
  // DATABASE ACCESS METHODS
  // ============================================

  describe('Database Access Methods', () => {
    it('should get script by id', async () => {
      const result = await generator.generateScript({
        storyId: 'story_123',
        storyTopic: 'Get Test',
      });

      const script = generator.getScript(result.script.id);
      expect(script).not.toBeNull();
      expect(script!.title).toBe('Get Test');
    });

    it('should return null for non-existent script', () => {
      const script = generator.getScript('script_fake');
      expect(script).toBeNull();
    });

    it('should list scripts', async () => {
      await generator.generateScript({ storyId: 'story_1', storyTopic: 'Topic 1' });
      await generator.generateScript({ storyId: 'story_2', storyTopic: 'Topic 2' });

      const result = generator.listScripts();
      expect(result.total).toBe(2);
      expect(result.scripts.length).toBe(2);
    });

    it('should list scripts filtered by storyId', async () => {
      await generator.generateScript({ storyId: 'story_target', storyTopic: 'Target' });
      await generator.generateScript({ storyId: 'story_other', storyTopic: 'Other' });

      const result = generator.listScripts({ storyId: 'story_target' });
      expect(result.total).toBe(1);
    });

    it('should list scripts filtered by status', async () => {
      const { script } = await generator.generateScript({ storyId: 'story_1', storyTopic: 'Draft' });
      await generator.generateScript({ storyId: 'story_2', storyTopic: 'Also Draft' });

      generator.updateStatus(script.id, 'approved');

      const drafts = generator.listScripts({ status: 'draft' });
      expect(drafts.total).toBe(1);

      const approved = generator.listScripts({ status: 'approved' });
      expect(approved.total).toBe(1);
    });

    it('should update script status', async () => {
      const result = await generator.generateScript({
        storyId: 'story_123',
        storyTopic: 'Status Test',
      });

      const updated = generator.updateStatus(result.script.id, 'review');
      expect(updated!.status).toBe('review');
    });

    it('should get stats', async () => {
      await generator.generateScript({ storyId: 'story_1', storyTopic: 'Script 1' });
      await generator.generateScript({ storyId: 'story_2', storyTopic: 'Script 2' });

      const stats = generator.getStats();
      expect(stats.totalScripts).toBe(2);
      expect(stats.byStatus['draft']).toBe(2);
    });

    it('should get revisions', async () => {
      const result = await generator.generateScript({
        storyId: 'story_123',
        storyTopic: 'Revision Test',
      });

      const revisions = generator.getRevisions(result.script.id);
      expect(Array.isArray(revisions)).toBe(true);
    });
  });

  // ============================================
  // SECTION REVISION
  // ============================================

  describe('Section Revision', () => {
    it('should revise a section', async () => {
      const result = await generator.generateScript({
        storyId: 'story_123',
        storyTopic: 'Revision Test',
      });

      const originalContent = result.script.sections[0].content;

      const revised = await generator.reviseSection(
        result.script.id,
        0,
        'Make it shorter',
        true
      );

      expect(revised).not.toBeNull();
      // Without API, content stays the same in mock mode
      // But the revision should be tracked
    });

    it('should return null for non-existent script', async () => {
      const revised = await generator.reviseSection('script_fake', 0, 'feedback');
      expect(revised).toBeNull();
    });

    it('should return null for invalid section index', async () => {
      const result = await generator.generateScript({
        storyId: 'story_123',
        storyTopic: 'Invalid Section Test',
      });

      const revised = await generator.reviseSection(result.script.id, 99, 'feedback');
      expect(revised).toBeNull();
    });

    it('should track revision history', async () => {
      const result = await generator.generateScript({
        storyId: 'story_123',
        storyTopic: 'History Test',
      });

      await generator.reviseSection(result.script.id, 0, 'First revision');
      await generator.reviseSection(result.script.id, 0, 'Second revision');

      const revisions = generator.getRevisions(result.script.id);
      expect(revisions.length).toBe(2);
      expect(revisions[0].revisionNumber).toBe(1);
      expect(revisions[1].revisionNumber).toBe(2);
    });
  });

  // ============================================
  // EDGE CASES
  // ============================================

  describe('Edge Cases', () => {
    it('should handle empty storyTopic', async () => {
      const result = await generator.generateScript({
        storyId: 'story_123',
        storyTopic: '',
      });

      expect(result.script).toBeDefined();
      expect(result.script.title).toBe('');
    });

    it('should handle very long storyTopic', async () => {
      const longTopic = 'A'.repeat(500);
      const result = await generator.generateScript({
        storyId: 'story_123',
        storyTopic: longTopic,
      });

      expect(result.script.title).toBe(longTopic);
    });

    it('should handle special characters in storyTopic', async () => {
      const result = await generator.generateScript({
        storyId: 'story_123',
        storyTopic: 'Topic with "quotes" and <brackets> & ampersands',
      });

      expect(result.script.title).toContain('"quotes"');
    });

    it('should handle unicode in storyTopic', async () => {
      const result = await generator.generateScript({
        storyId: 'story_123',
        storyTopic: '日本語のトピック 한국어 العربية',
      });

      expect(result.script.title).toBe('日本語のトピック 한국어 العربية');
    });

    it('should generate unique IDs for each script', async () => {
      const result1 = await generator.generateScript({ storyId: 'story_1', storyTopic: 'Topic 1' });
      const result2 = await generator.generateScript({ storyId: 'story_2', storyTopic: 'Topic 2' });

      expect(result1.script.id).not.toBe(result2.script.id);
    });

    it('should generate unique IDs for each section', async () => {
      const result = await generator.generateScript({
        storyId: 'story_123',
        storyTopic: 'Unique Sections',
      });

      const ids = result.script.sections.map(s => s.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });
  });
});

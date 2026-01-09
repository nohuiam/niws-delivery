/**
 * ScriptDatabase Tests
 *
 * Comprehensive tests for script database CRUD operations, sections,
 * revisions, patterns, and edge cases.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ScriptDatabase } from '../src/database/scriptDatabase.js';

describe('ScriptDatabase', () => {
  let db: ScriptDatabase;

  beforeEach(() => {
    db = new ScriptDatabase(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  // ============================================
  // SCRIPT CRUD OPERATIONS
  // ============================================

  describe('Script CRUD', () => {
    it('should create a script with all fields', () => {
      const script = db.createScript({
        storyId: 'story_123',
        briefId: 'brief_456',
        title: 'Test Script Title',
        status: 'draft',
        content: 'Full script content here',
        sections: [],
        wordCount: 100,
        estimatedDurationSeconds: 60,
        generationParams: { model: 'test-model', temperature: 0.7 },
      });

      expect(script.id).toMatch(/^script_/);
      expect(script.storyId).toBe('story_123');
      expect(script.briefId).toBe('brief_456');
      expect(script.title).toBe('Test Script Title');
      expect(script.status).toBe('draft');
      expect(script.content).toBe('Full script content here');
      expect(script.wordCount).toBe(100);
      expect(script.estimatedDurationSeconds).toBe(60);
      expect(script.generationParams).toEqual({ model: 'test-model', temperature: 0.7 });
      expect(script.createdAt).toBeDefined();
      expect(script.updatedAt).toBeDefined();
    });

    it('should create a script with minimal fields', () => {
      const script = db.createScript({
        storyId: 'story_1',
        briefId: '',
        title: 'Minimal Script',
        status: 'draft',
        content: '',
        sections: [],
        wordCount: 0,
        estimatedDurationSeconds: 0,
      });

      expect(script.id).toMatch(/^script_/);
      expect(script.title).toBe('Minimal Script');
    });

    it('should create a script with null storyId and briefId', () => {
      const script = db.createScript({
        storyId: '',
        briefId: '',
        title: 'Orphan Script',
        status: 'draft',
        content: 'Content',
        sections: [],
        wordCount: 1,
        estimatedDurationSeconds: 1,
      });

      expect(script.storyId).toBe('');
    });

    it('should retrieve a script by id', () => {
      const created = db.createScript({
        storyId: 'story_1',
        briefId: 'brief_1',
        title: 'Retrieve Test',
        status: 'draft',
        content: 'Content',
        sections: [],
        wordCount: 1,
        estimatedDurationSeconds: 1,
      });

      const retrieved = db.getScript(created.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe(created.id);
      expect(retrieved!.title).toBe('Retrieve Test');
    });

    it('should return null for non-existent script', () => {
      const script = db.getScript('script_nonexistent');
      expect(script).toBeNull();
    });

    it('should update script title', () => {
      const created = db.createScript({
        storyId: 'story_1',
        briefId: 'brief_1',
        title: 'Original Title',
        status: 'draft',
        content: 'Content',
        sections: [],
        wordCount: 1,
        estimatedDurationSeconds: 1,
      });

      const updated = db.updateScript(created.id, { title: 'Updated Title' });
      expect(updated!.title).toBe('Updated Title');
    });

    it('should update script status', () => {
      const created = db.createScript({
        storyId: 'story_1',
        briefId: 'brief_1',
        title: 'Status Test',
        status: 'draft',
        content: 'Content',
        sections: [],
        wordCount: 1,
        estimatedDurationSeconds: 1,
      });

      const updated = db.updateScript(created.id, { status: 'review' });
      expect(updated!.status).toBe('review');

      const approved = db.updateScript(created.id, { status: 'approved' });
      expect(approved!.status).toBe('approved');

      const archived = db.updateScript(created.id, { status: 'archived' });
      expect(archived!.status).toBe('archived');
    });

    it('should update multiple fields at once', () => {
      const created = db.createScript({
        storyId: 'story_1',
        briefId: 'brief_1',
        title: 'Multi Update Test',
        status: 'draft',
        content: 'Old content',
        sections: [],
        wordCount: 10,
        estimatedDurationSeconds: 5,
      });

      const updated = db.updateScript(created.id, {
        title: 'New Title',
        status: 'review',
        content: 'New content',
        wordCount: 200,
        estimatedDurationSeconds: 120,
      });

      expect(updated!.title).toBe('New Title');
      expect(updated!.status).toBe('review');
      expect(updated!.content).toBe('New content');
      expect(updated!.wordCount).toBe(200);
      expect(updated!.estimatedDurationSeconds).toBe(120);
    });

    it('should return null when updating non-existent script', () => {
      const result = db.updateScript('script_fake', { title: 'test' });
      expect(result).toBeNull();
    });

    it('should delete a script', () => {
      const created = db.createScript({
        storyId: 'story_1',
        briefId: 'brief_1',
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

    it('should return false when deleting non-existent script', () => {
      const result = db.deleteScript('script_nonexistent');
      expect(result).toBe(false);
    });

    it('should list scripts with no filters', () => {
      db.createScript({
        storyId: 'story_1',
        briefId: '',
        title: 'Script 1',
        status: 'draft',
        content: '',
        sections: [],
        wordCount: 0,
        estimatedDurationSeconds: 0,
      });
      db.createScript({
        storyId: 'story_2',
        briefId: '',
        title: 'Script 2',
        status: 'review',
        content: '',
        sections: [],
        wordCount: 0,
        estimatedDurationSeconds: 0,
      });

      const result = db.listScripts();
      expect(result.total).toBe(2);
      expect(result.scripts.length).toBe(2);
    });

    it('should list scripts filtered by storyId', () => {
      db.createScript({
        storyId: 'story_target',
        briefId: '',
        title: 'Target Script',
        status: 'draft',
        content: '',
        sections: [],
        wordCount: 0,
        estimatedDurationSeconds: 0,
      });
      db.createScript({
        storyId: 'story_other',
        briefId: '',
        title: 'Other Script',
        status: 'draft',
        content: '',
        sections: [],
        wordCount: 0,
        estimatedDurationSeconds: 0,
      });

      const result = db.listScripts({ storyId: 'story_target' });
      expect(result.total).toBe(1);
      expect(result.scripts[0].title).toBe('Target Script');
    });

    it('should list scripts filtered by status', () => {
      db.createScript({
        storyId: 'story_1',
        briefId: '',
        title: 'Draft Script',
        status: 'draft',
        content: '',
        sections: [],
        wordCount: 0,
        estimatedDurationSeconds: 0,
      });
      db.createScript({
        storyId: 'story_2',
        briefId: '',
        title: 'Approved Script',
        status: 'approved',
        content: '',
        sections: [],
        wordCount: 0,
        estimatedDurationSeconds: 0,
      });

      const draftResult = db.listScripts({ status: 'draft' });
      expect(draftResult.total).toBe(1);
      expect(draftResult.scripts[0].status).toBe('draft');

      const approvedResult = db.listScripts({ status: 'approved' });
      expect(approvedResult.total).toBe(1);
      expect(approvedResult.scripts[0].status).toBe('approved');
    });

    it('should list scripts with pagination', () => {
      for (let i = 0; i < 10; i++) {
        db.createScript({
          storyId: `story_${i}`,
          briefId: '',
          title: `Script ${i}`,
          status: 'draft',
          content: '',
          sections: [],
          wordCount: 0,
          estimatedDurationSeconds: 0,
        });
      }

      const page1 = db.listScripts({ limit: 3, offset: 0 });
      expect(page1.total).toBe(10);
      expect(page1.scripts.length).toBe(3);

      const page2 = db.listScripts({ limit: 3, offset: 3 });
      expect(page2.total).toBe(10);
      expect(page2.scripts.length).toBe(3);

      const lastPage = db.listScripts({ limit: 3, offset: 9 });
      expect(lastPage.scripts.length).toBe(1);
    });
  });

  // ============================================
  // SECTION OPERATIONS
  // ============================================

  describe('Section Operations', () => {
    let scriptId: string;

    beforeEach(() => {
      const script = db.createScript({
        storyId: 'story_1',
        briefId: '',
        title: 'Section Test Script',
        status: 'draft',
        content: '',
        sections: [],
        wordCount: 0,
        estimatedDurationSeconds: 0,
      });
      scriptId = script.id;
    });

    it('should create a section', () => {
      const section = db.createSection({
        scriptId,
        sectionType: 'intro',
        content: 'Introduction content',
        position: 0,
        wordCount: 10,
      });

      expect(section.id).toMatch(/^section_/);
      expect(section.scriptId).toBe(scriptId);
      expect(section.sectionType).toBe('intro');
      expect(section.content).toBe('Introduction content');
      expect(section.position).toBe(0);
      expect(section.wordCount).toBe(10);
    });

    it('should create sections with all types', () => {
      const types: Array<'intro' | 'story' | 'analysis' | 'opinion' | 'transition' | 'close' | 'bumper'> = [
        'intro', 'story', 'analysis', 'opinion', 'transition', 'close', 'bumper'
      ];

      for (let i = 0; i < types.length; i++) {
        const section = db.createSection({
          scriptId,
          sectionType: types[i],
          content: `Content for ${types[i]}`,
          position: i,
          wordCount: 10,
        });
        expect(section.sectionType).toBe(types[i]);
      }
    });

    it('should get section by id', () => {
      const created = db.createSection({
        scriptId,
        sectionType: 'story',
        content: 'Test content',
        position: 0,
        wordCount: 5,
      });

      const retrieved = db.getSection(created.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.content).toBe('Test content');
    });

    it('should return null for non-existent section', () => {
      const section = db.getSection('section_fake');
      expect(section).toBeNull();
    });

    it('should get all sections for a script ordered by position', () => {
      db.createSection({ scriptId, sectionType: 'close', content: 'Third', position: 2, wordCount: 1 });
      db.createSection({ scriptId, sectionType: 'intro', content: 'First', position: 0, wordCount: 1 });
      db.createSection({ scriptId, sectionType: 'story', content: 'Second', position: 1, wordCount: 1 });

      const sections = db.getSections(scriptId);
      expect(sections.length).toBe(3);
      expect(sections[0].content).toBe('First');
      expect(sections[1].content).toBe('Second');
      expect(sections[2].content).toBe('Third');
    });

    it('should update section content', () => {
      const created = db.createSection({
        scriptId,
        sectionType: 'intro',
        content: 'Original',
        position: 0,
        wordCount: 1,
      });

      const updated = db.updateSection(created.id, { content: 'Updated content' });
      expect(updated!.content).toBe('Updated content');
    });

    it('should update section position', () => {
      const created = db.createSection({
        scriptId,
        sectionType: 'intro',
        content: 'Content',
        position: 0,
        wordCount: 1,
      });

      const updated = db.updateSection(created.id, { position: 5 });
      expect(updated!.position).toBe(5);
    });

    it('should update section notes', () => {
      const created = db.createSection({
        scriptId,
        sectionType: 'intro',
        content: 'Content',
        position: 0,
        wordCount: 1,
      });

      const updated = db.updateSection(created.id, { notes: 'Editor feedback' });
      expect(updated!.notes).toBe('Editor feedback');
    });

    it('should return null when updating non-existent section', () => {
      const result = db.updateSection('section_fake', { content: 'test' });
      expect(result).toBeNull();
    });

    it('should return section unchanged if no updates provided', () => {
      const created = db.createSection({
        scriptId,
        sectionType: 'intro',
        content: 'Original',
        position: 0,
        wordCount: 1,
      });

      const result = db.updateSection(created.id, {});
      expect(result!.content).toBe('Original');
    });

    it('should create script with inline sections', () => {
      const script = db.createScript({
        storyId: 'story_inline',
        briefId: '',
        title: 'Inline Sections Test',
        status: 'draft',
        content: '',
        sections: [
          { id: 'temp_1', scriptId: '', sectionType: 'intro', content: 'Intro', position: 0, wordCount: 1, createdAt: '' },
          { id: 'temp_2', scriptId: '', sectionType: 'close', content: 'Close', position: 1, wordCount: 1, createdAt: '' },
        ],
        wordCount: 2,
        estimatedDurationSeconds: 1,
      });

      expect(script.sections.length).toBe(2);
      expect(script.sections[0].sectionType).toBe('intro');
      expect(script.sections[1].sectionType).toBe('close');
    });
  });

  // ============================================
  // REVISION OPERATIONS
  // ============================================

  describe('Revision Operations', () => {
    let scriptId: string;

    beforeEach(() => {
      const script = db.createScript({
        storyId: 'story_1',
        briefId: '',
        title: 'Revision Test',
        status: 'draft',
        content: 'Original content',
        sections: [],
        wordCount: 2,
        estimatedDurationSeconds: 1,
      });
      scriptId = script.id;
    });

    it('should create a revision', () => {
      const revision = db.createRevision({
        scriptId,
        revisionNumber: 1,
        previousContent: 'Old content',
        newContent: 'New content',
        reason: 'Editorial feedback',
        editedBy: 'human',
      });

      expect(revision.id).toMatch(/^rev_/);
      expect(revision.scriptId).toBe(scriptId);
      expect(revision.revisionNumber).toBe(1);
      expect(revision.previousContent).toBe('Old content');
      expect(revision.newContent).toBe('New content');
      expect(revision.reason).toBe('Editorial feedback');
      expect(revision.editedBy).toBe('human');
    });

    it('should create AI revision', () => {
      const revision = db.createRevision({
        scriptId,
        revisionNumber: 1,
        previousContent: 'Before',
        newContent: 'After',
        editedBy: 'ai',
      });

      expect(revision.editedBy).toBe('ai');
    });

    it('should get revision by id', () => {
      const created = db.createRevision({
        scriptId,
        revisionNumber: 1,
        previousContent: 'Old',
        newContent: 'New',
        editedBy: 'human',
      });

      const retrieved = db.getRevision(created.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.revisionNumber).toBe(1);
    });

    it('should return null for non-existent revision', () => {
      const revision = db.getRevision('rev_fake');
      expect(revision).toBeNull();
    });

    it('should get all revisions for script ordered by number', () => {
      db.createRevision({ scriptId, revisionNumber: 3, previousContent: '', newContent: 'v3', editedBy: 'ai' });
      db.createRevision({ scriptId, revisionNumber: 1, previousContent: '', newContent: 'v1', editedBy: 'ai' });
      db.createRevision({ scriptId, revisionNumber: 2, previousContent: '', newContent: 'v2', editedBy: 'ai' });

      const revisions = db.getRevisions(scriptId);
      expect(revisions.length).toBe(3);
      expect(revisions[0].revisionNumber).toBe(1);
      expect(revisions[1].revisionNumber).toBe(2);
      expect(revisions[2].revisionNumber).toBe(3);
    });

    it('should get next revision number', () => {
      expect(db.getNextRevisionNumber(scriptId)).toBe(1);

      db.createRevision({ scriptId, revisionNumber: 1, previousContent: '', newContent: '', editedBy: 'ai' });
      expect(db.getNextRevisionNumber(scriptId)).toBe(2);

      db.createRevision({ scriptId, revisionNumber: 2, previousContent: '', newContent: '', editedBy: 'ai' });
      expect(db.getNextRevisionNumber(scriptId)).toBe(3);
    });

    it('should store diff if provided', () => {
      const revision = db.createRevision({
        scriptId,
        revisionNumber: 1,
        previousContent: 'Old',
        newContent: 'New',
        diff: '@@ -1 +1 @@\n-Old\n+New',
        editedBy: 'human',
      });

      expect(revision.diff).toBe('@@ -1 +1 @@\n-Old\n+New');
    });
  });

  // ============================================
  // PATTERN OPERATIONS
  // ============================================

  describe('Learned Pattern Operations', () => {
    it('should add a learned pattern', () => {
      const pattern = db.addLearnedPattern({
        patternType: 'phrase_replacement',
        original: 'going forward',
        replacement: 'in the future',
        frequency: 5,
        confidence: 0.8,
        isActive: true,
      });

      expect(pattern.id).toMatch(/^pattern_/);
      expect(pattern.patternType).toBe('phrase_replacement');
      expect(pattern.original).toBe('going forward');
      expect(pattern.replacement).toBe('in the future');
      expect(pattern.frequency).toBe(5);
      expect(pattern.confidence).toBe(0.8);
      expect(pattern.isActive).toBe(true);
    });

    it('should get learned pattern by id', () => {
      const created = db.addLearnedPattern({
        patternType: 'tone',
        original: 'claims',
        replacement: 'states',
        frequency: 3,
        confidence: 0.7,
        isActive: true,
      });

      const retrieved = db.getLearnedPattern(created.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.original).toBe('claims');
    });

    it('should return null for non-existent pattern', () => {
      const pattern = db.getLearnedPattern('pattern_fake');
      expect(pattern).toBeNull();
    });

    it('should get learned patterns filtered by category', () => {
      db.addLearnedPattern({ patternType: 'phrase_replacement', original: 'a', replacement: 'b', frequency: 1, confidence: 0.5, isActive: true });
      db.addLearnedPattern({ patternType: 'tone', original: 'c', replacement: 'd', frequency: 1, confidence: 0.5, isActive: true });
      db.addLearnedPattern({ patternType: 'phrase_replacement', original: 'e', replacement: 'f', frequency: 1, confidence: 0.5, isActive: true });

      const phrasePatterns = db.getLearnedPatterns('phrase_replacement');
      expect(phrasePatterns.length).toBe(2);

      const tonePatterns = db.getLearnedPatterns('tone');
      expect(tonePatterns.length).toBe(1);
    });

    it('should get learned patterns filtered by minimum frequency', () => {
      db.addLearnedPattern({ patternType: 'phrase_replacement', original: 'low', replacement: 'b', frequency: 1, confidence: 0.5, isActive: true });
      db.addLearnedPattern({ patternType: 'phrase_replacement', original: 'high', replacement: 'd', frequency: 10, confidence: 0.5, isActive: true });

      const highFreq = db.getLearnedPatterns(undefined, 5);
      expect(highFreq.length).toBe(1);
      expect(highFreq[0].original).toBe('high');
    });

    it('should only return active patterns', () => {
      db.addLearnedPattern({ patternType: 'phrase_replacement', original: 'active', replacement: 'b', frequency: 1, confidence: 0.5, isActive: true });
      db.addLearnedPattern({ patternType: 'phrase_replacement', original: 'inactive', replacement: 'd', frequency: 1, confidence: 0.5, isActive: false });

      const patterns = db.getLearnedPatterns();
      expect(patterns.length).toBe(1);
      expect(patterns[0].original).toBe('active');
    });
  });

  describe('Prohibited Pattern Operations', () => {
    it('should add a prohibited pattern', () => {
      const pattern = db.addProhibitedPattern({
        pattern: 'bombshell',
        patternType: 'word',
        reason: 'Sensationalist language',
        severity: 'warning',
        alternatives: ['significant development', 'notable finding'],
        isActive: true,
      });

      expect(pattern.id).toMatch(/^prohibited_/);
      expect(pattern.pattern).toBe('bombshell');
      expect(pattern.patternType).toBe('word');
      expect(pattern.reason).toBe('Sensationalist language');
      expect(pattern.severity).toBe('warning');
      expect(pattern.alternatives).toEqual(['significant development', 'notable finding']);
      expect(pattern.isActive).toBe(true);
    });

    it('should get prohibited pattern by id', () => {
      const created = db.addProhibitedPattern({
        pattern: 'slam',
        patternType: 'word',
        reason: 'Biased language',
        severity: 'block',
        isActive: true,
      });

      const retrieved = db.getProhibitedPattern(created.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.pattern).toBe('slam');
    });

    it('should return null for non-existent prohibited pattern', () => {
      const pattern = db.getProhibitedPattern('prohibited_fake');
      expect(pattern).toBeNull();
    });

    it('should get only active prohibited patterns by default', () => {
      db.addProhibitedPattern({ pattern: 'active', patternType: 'word', reason: 'test', severity: 'warning', isActive: true });
      db.addProhibitedPattern({ pattern: 'inactive', patternType: 'word', reason: 'test', severity: 'warning', isActive: false });

      const activePatterns = db.getProhibitedPatterns();
      expect(activePatterns.length).toBe(1);
      expect(activePatterns[0].pattern).toBe('active');
    });

    it('should get all prohibited patterns when active=false', () => {
      db.addProhibitedPattern({ pattern: 'active', patternType: 'word', reason: 'test', severity: 'warning', isActive: true });
      db.addProhibitedPattern({ pattern: 'inactive', patternType: 'word', reason: 'test', severity: 'warning', isActive: false });

      const allPatterns = db.getProhibitedPatterns(false);
      expect(allPatterns.length).toBe(2);
    });
  });

  // ============================================
  // STATISTICS
  // ============================================

  describe('Statistics', () => {
    it('should return correct stats for empty database', () => {
      const stats = db.getStats();
      expect(stats.totalScripts).toBe(0);
      expect(stats.byStatus).toEqual({});
      expect(stats.totalRevisions).toBe(0);
      expect(stats.learnedPatterns).toBe(0);
      expect(stats.prohibitedPatterns).toBe(0);
    });

    it('should count scripts by status', () => {
      db.createScript({ storyId: '', briefId: '', title: 'Draft 1', status: 'draft', content: '', sections: [], wordCount: 0, estimatedDurationSeconds: 0 });
      db.createScript({ storyId: '', briefId: '', title: 'Draft 2', status: 'draft', content: '', sections: [], wordCount: 0, estimatedDurationSeconds: 0 });
      db.createScript({ storyId: '', briefId: '', title: 'Review 1', status: 'review', content: '', sections: [], wordCount: 0, estimatedDurationSeconds: 0 });
      db.createScript({ storyId: '', briefId: '', title: 'Approved 1', status: 'approved', content: '', sections: [], wordCount: 0, estimatedDurationSeconds: 0 });

      const stats = db.getStats();
      expect(stats.totalScripts).toBe(4);
      expect(stats.byStatus['draft']).toBe(2);
      expect(stats.byStatus['review']).toBe(1);
      expect(stats.byStatus['approved']).toBe(1);
    });

    it('should count revisions', () => {
      const script = db.createScript({ storyId: '', briefId: '', title: 'Test', status: 'draft', content: '', sections: [], wordCount: 0, estimatedDurationSeconds: 0 });

      db.createRevision({ scriptId: script.id, revisionNumber: 1, previousContent: '', newContent: '', editedBy: 'ai' });
      db.createRevision({ scriptId: script.id, revisionNumber: 2, previousContent: '', newContent: '', editedBy: 'ai' });
      db.createRevision({ scriptId: script.id, revisionNumber: 3, previousContent: '', newContent: '', editedBy: 'human' });

      const stats = db.getStats();
      expect(stats.totalRevisions).toBe(3);
    });

    it('should count patterns', () => {
      db.addLearnedPattern({ patternType: 'phrase_replacement', original: 'a', replacement: 'b', frequency: 1, confidence: 0.5, isActive: true });
      db.addLearnedPattern({ patternType: 'phrase_replacement', original: 'c', replacement: 'd', frequency: 1, confidence: 0.5, isActive: true });
      db.addLearnedPattern({ patternType: 'phrase_replacement', original: 'e', replacement: 'f', frequency: 1, confidence: 0.5, isActive: false }); // inactive

      db.addProhibitedPattern({ pattern: 'x', patternType: 'word', reason: 'test', severity: 'warning', isActive: true });
      db.addProhibitedPattern({ pattern: 'y', patternType: 'word', reason: 'test', severity: 'warning', isActive: false }); // inactive

      const stats = db.getStats();
      expect(stats.learnedPatterns).toBe(2); // only active
      expect(stats.prohibitedPatterns).toBe(1); // only active
    });
  });

  // ============================================
  // EDGE CASES
  // ============================================

  describe('Edge Cases', () => {
    it('should handle empty content', () => {
      const script = db.createScript({
        storyId: '',
        briefId: '',
        title: 'Empty Content',
        status: 'draft',
        content: '',
        sections: [],
        wordCount: 0,
        estimatedDurationSeconds: 0,
      });

      expect(script.content).toBe('');
    });

    it('should handle very long content', () => {
      const longContent = 'x'.repeat(100000);
      const script = db.createScript({
        storyId: '',
        briefId: '',
        title: 'Long Content',
        status: 'draft',
        content: longContent,
        sections: [],
        wordCount: 100000,
        estimatedDurationSeconds: 40000,
      });

      const retrieved = db.getScript(script.id);
      expect(retrieved!.content.length).toBe(100000);
    });

    it('should handle special characters in content', () => {
      const specialContent = 'Test with "quotes" and \'apostrophes\' and \n newlines \t tabs 🚀 emoji';
      const script = db.createScript({
        storyId: '',
        briefId: '',
        title: 'Special Characters',
        status: 'draft',
        content: specialContent,
        sections: [],
        wordCount: 10,
        estimatedDurationSeconds: 5,
      });

      const retrieved = db.getScript(script.id);
      expect(retrieved!.content).toBe(specialContent);
    });

    it('should handle unicode in titles', () => {
      const script = db.createScript({
        storyId: '',
        briefId: '',
        title: '日本語タイトル 한국어 العربية',
        status: 'draft',
        content: '',
        sections: [],
        wordCount: 0,
        estimatedDurationSeconds: 0,
      });

      expect(script.title).toBe('日本語タイトル 한국어 العربية');
    });

    it('should handle complex JSON in generationParams', () => {
      const complexParams = {
        model: 'test',
        nested: {
          deep: {
            value: [1, 2, { key: 'value' }],
          },
        },
        array: [true, false, null, 'string'],
      };

      const script = db.createScript({
        storyId: '',
        briefId: '',
        title: 'Complex Params',
        status: 'draft',
        content: '',
        sections: [],
        wordCount: 0,
        estimatedDurationSeconds: 0,
        generationParams: complexParams,
      });

      expect(script.generationParams).toEqual(complexParams);
    });

    it('should cascade delete sections when script is deleted', () => {
      const script = db.createScript({
        storyId: '',
        briefId: '',
        title: 'Cascade Test',
        status: 'draft',
        content: '',
        sections: [],
        wordCount: 0,
        estimatedDurationSeconds: 0,
      });

      db.createSection({ scriptId: script.id, sectionType: 'intro', content: 'Intro', position: 0, wordCount: 1 });
      db.createSection({ scriptId: script.id, sectionType: 'close', content: 'Close', position: 1, wordCount: 1 });

      expect(db.getSections(script.id).length).toBe(2);

      db.deleteScript(script.id);

      expect(db.getSections(script.id).length).toBe(0);
    });

    it('should cascade delete revisions when script is deleted', () => {
      const script = db.createScript({
        storyId: '',
        briefId: '',
        title: 'Revision Cascade Test',
        status: 'draft',
        content: '',
        sections: [],
        wordCount: 0,
        estimatedDurationSeconds: 0,
      });

      db.createRevision({ scriptId: script.id, revisionNumber: 1, previousContent: '', newContent: '', editedBy: 'ai' });
      db.createRevision({ scriptId: script.id, revisionNumber: 2, previousContent: '', newContent: '', editedBy: 'ai' });

      expect(db.getRevisions(script.id).length).toBe(2);

      db.deleteScript(script.id);

      expect(db.getRevisions(script.id).length).toBe(0);
    });
  });
});

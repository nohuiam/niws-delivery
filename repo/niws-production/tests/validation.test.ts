/**
 * Validation Schema Tests
 *
 * Tests for Zod validation schemas.
 */

import { describe, it, expect } from 'vitest';
import {
  validate,
  generateScriptSchema,
  generateSectionSchema,
  getScriptSchema,
  listScriptsSchema,
  updateScriptSchema,
  createBriefSchema,
  rateActionSchema,
  exportScriptSchema,
} from '../src/validation/schemas.js';

describe('Script Validation Schemas', () => {
  describe('generateScriptSchema', () => {
    it('should accept valid input', () => {
      const input = {
        story_id: 'story_123',
        story_topic: 'Climate Change Policy',
        brief_id: 'brief_456',
        target_duration_seconds: 300,
      };

      const result = validate(generateScriptSchema, input);
      expect(result.success).toBe(true);
      expect(result.data?.story_id).toBe('story_123');
      expect(result.data?.story_topic).toBe('Climate Change Policy');
    });

    it('should reject missing story_id', () => {
      const input = { story_topic: 'Climate Change Policy' };
      const result = validate(generateScriptSchema, input);
      expect(result.success).toBe(false);
      expect(result.error).toContain('story_id');
    });

    it('should reject missing story_topic', () => {
      const input = { story_id: 'story_123' };
      const result = validate(generateScriptSchema, input);
      expect(result.success).toBe(false);
      expect(result.error).toContain('story_topic');
    });

    it('should reject story_topic over 500 characters', () => {
      const input = {
        story_id: 'story_123',
        story_topic: 'x'.repeat(501),
      };
      const result = validate(generateScriptSchema, input);
      expect(result.success).toBe(false);
      expect(result.error).toContain('500');
    });

    it('should accept optional outlet_selection array', () => {
      const input = {
        story_id: 'story_123',
        story_topic: 'Topic',
        outlet_selection: ['fox_news', 'cnn', 'npr'],
      };
      const result = validate(generateScriptSchema, input);
      expect(result.success).toBe(true);
      expect(result.data?.outlet_selection).toEqual(['fox_news', 'cnn', 'npr']);
    });
  });

  describe('generateSectionSchema', () => {
    it('should accept valid section types', () => {
      const types = ['opening', 'verified_facts', 'outlet_analysis', 'critical_questions', 'closing'];

      for (const sectionType of types) {
        const result = validate(generateSectionSchema, {
          script_id: 'script_abc',
          section_type: sectionType,
        });
        expect(result.success).toBe(true);
      }
    });

    it('should reject invalid section type', () => {
      const result = validate(generateSectionSchema, {
        script_id: 'script_abc',
        section_type: 'invalid_type',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('getScriptSchema', () => {
    it('should accept valid script_id', () => {
      const result = validate(getScriptSchema, { script_id: 'script_abc' });
      expect(result.success).toBe(true);
    });

    it('should reject empty script_id', () => {
      const result = validate(getScriptSchema, { script_id: '' });
      expect(result.success).toBe(false);
    });
  });

  describe('listScriptsSchema', () => {
    it('should accept empty input', () => {
      const result = validate(listScriptsSchema, {});
      expect(result.success).toBe(true);
    });

    it('should accept valid status filter', () => {
      const result = validate(listScriptsSchema, { status: 'draft' });
      expect(result.success).toBe(true);
    });

    it('should reject invalid status', () => {
      const result = validate(listScriptsSchema, { status: 'invalid' });
      expect(result.success).toBe(false);
    });

    it('should accept pagination params', () => {
      const result = validate(listScriptsSchema, { limit: 50, offset: 10 });
      expect(result.success).toBe(true);
    });

    it('should reject limit over 100', () => {
      const result = validate(listScriptsSchema, { limit: 150 });
      expect(result.success).toBe(false);
    });
  });

  describe('updateScriptSchema', () => {
    it('should accept script_id with optional fields', () => {
      const result = validate(updateScriptSchema, {
        script_id: 'script_abc',
        title: 'New Title',
        status: 'review',
      });
      expect(result.success).toBe(true);
    });

    it('should allow only script_id', () => {
      const result = validate(updateScriptSchema, { script_id: 'script_abc' });
      expect(result.success).toBe(true);
    });
  });

  describe('exportScriptSchema', () => {
    it('should accept valid formats', () => {
      const formats = ['markdown', 'plain_text', 'json'];

      for (const format of formats) {
        const result = validate(exportScriptSchema, {
          script_id: 'script_abc',
          format,
        });
        expect(result.success).toBe(true);
      }
    });

    it('should reject invalid format', () => {
      const result = validate(exportScriptSchema, {
        script_id: 'script_abc',
        format: 'pdf',
      });
      expect(result.success).toBe(false);
    });
  });
});

describe('Brief Validation Schemas', () => {
  describe('createBriefSchema', () => {
    it('should accept valid input', () => {
      const input = {
        story_id: 'story_123',
        title: 'Test Brief',
        summary: 'A test summary',
      };

      const result = validate(createBriefSchema, input);
      expect(result.success).toBe(true);
    });

    it('should reject missing story_id', () => {
      const result = validate(createBriefSchema, { title: 'Test' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('story_id');
    });

    it('should reject missing title', () => {
      const result = validate(createBriefSchema, { story_id: 'story_123' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('title');
    });

    it('should accept optional key_facts array', () => {
      const input = {
        story_id: 'story_123',
        title: 'Test Brief',
        key_facts: ['Fact 1', 'Fact 2', 'Fact 3'],
      };

      const result = validate(createBriefSchema, input);
      expect(result.success).toBe(true);
      expect(result.data?.key_facts).toEqual(['Fact 1', 'Fact 2', 'Fact 3']);
    });
  });

  describe('rateActionSchema', () => {
    it('should accept valid input', () => {
      const input = {
        action: 'Pass legislation restricting voting access',
        subject: 'State Legislature',
        affected: ['voters', 'minority communities', 'elderly'],
        context: 'Passed as part of election reform bill',
      };

      const result = validate(rateActionSchema, input);
      expect(result.success).toBe(true);
    });

    it('should reject missing action', () => {
      const result = validate(rateActionSchema, {
        subject: 'Subject',
        affected: ['group1'],
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('action');
    });

    it('should reject empty affected array', () => {
      const result = validate(rateActionSchema, {
        action: 'Action',
        subject: 'Subject',
        affected: [],
      });
      expect(result.success).toBe(false);
    });

    it('should reject affected array over 20 items', () => {
      const result = validate(rateActionSchema, {
        action: 'Action',
        subject: 'Subject',
        affected: Array(21).fill('group'),
      });
      expect(result.success).toBe(false);
    });

    it('should accept optional brief_id', () => {
      const result = validate(rateActionSchema, {
        action: 'Action',
        subject: 'Subject',
        affected: ['group1'],
        brief_id: 'brief_123',
      });
      expect(result.success).toBe(true);
    });
  });
});

describe('Validation Helper', () => {
  it('should return formatted error messages', () => {
    const result = validate(generateScriptSchema, {
      story_id: '',
      story_topic: '',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Validation failed');
    expect(result.error).toContain('story_id');
  });

  it('should handle completely invalid input', () => {
    const result = validate(generateScriptSchema, null);
    expect(result.success).toBe(false);
  });

  it('should handle undefined input', () => {
    const result = validate(generateScriptSchema, undefined);
    expect(result.success).toBe(false);
  });
});

/**
 * Output Validator Tests
 */

import { describe, it, expect } from 'vitest';
import {
  validateBiasResult,
  validateAnalysisOutput,
  validateText,
  getApprovedAlternative,
  parseJsonResponse,
} from '../src/services/outputValidator.js';

describe('OutputValidator', () => {
  describe('validateBiasResult', () => {
    it('should validate correct bias result', () => {
      const result = {
        biasScore: 0.3,
        framingIndicators: ['emphasis on economy'],
        loadedLanguage: ['radical'],
        neutralAlternatives: { radical: 'progressive' },
        summary: 'Article shows moderate lean',
        confidence: 0.85,
      };

      const validation = validateBiasResult(result);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should reject invalid bias score', () => {
      const result = {
        biasScore: 5, // Out of range
        framingIndicators: [],
        loadedLanguage: [],
        summary: 'Test',
      };

      const validation = validateBiasResult(result);
      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });

    it('should reject missing required fields', () => {
      const result = {
        biasScore: 0.5,
        // Missing framingIndicators, loadedLanguage, summary
      };

      const validation = validateBiasResult(result);
      expect(validation.valid).toBe(false);
    });
  });

  describe('validateAnalysisOutput', () => {
    it('should pass clean output', () => {
      const result = {
        biasScore: 0,
        framingIndicators: ['Left-leaning outlets emphasized policy details'],
        loadedLanguage: [],
        neutralAlternatives: {},
        summary: 'Coverage patterns differ between outlets',
        confidence: 0.9,
      };

      const validation = validateAnalysisOutput(result);
      expect(validation.valid).toBe(true);
      expect(validation.violations).toHaveLength(0);
    });

    it('should detect truth claims', () => {
      const result = {
        biasScore: 0,
        framingIndicators: ['The truth is this article is misleading'],
        loadedLanguage: [],
        neutralAlternatives: {},
        summary: 'Normal summary',
        confidence: 0.9,
      };

      const validation = validateAnalysisOutput(result);
      expect(validation.valid).toBe(false);
      expect(validation.violations.some(v => v.type === 'truth_claim')).toBe(true);
    });

    it('should detect bias accusations', () => {
      const result = {
        biasScore: 0.5,
        framingIndicators: ['This outlet is clearly biased'],
        loadedLanguage: [],
        neutralAlternatives: {},
        summary: 'Contains propaganda elements',
        confidence: 0.9,
      };

      const validation = validateAnalysisOutput(result);
      expect(validation.violations.some(v => v.type === 'bias_accusation')).toBe(true);
    });

    it('should detect loaded language', () => {
      const result = {
        biasScore: 0,
        framingIndicators: [],
        loadedLanguage: [],
        neutralAlternatives: {},
        summary: 'The liberal media consistently frames this issue',
        confidence: 0.9,
      };

      const validation = validateAnalysisOutput(result);
      expect(validation.violations.some(v => v.type === 'loaded_language')).toBe(true);
    });

    it('should detect assumed intent', () => {
      const result = {
        biasScore: 0,
        framingIndicators: ['The outlet is clearly trying to manipulate readers'],
        loadedLanguage: [],
        neutralAlternatives: {},
        summary: 'Normal summary',
        confidence: 0.9,
      };

      const validation = validateAnalysisOutput(result);
      expect(validation.violations.some(v => v.type === 'assumed_intent')).toBe(true);
    });

    it('should detect editorializing', () => {
      const result = {
        biasScore: 0,
        framingIndicators: [],
        loadedLanguage: [],
        neutralAlternatives: {},
        summary: 'Unfortunately, this outlet should have included more context',
        confidence: 0.9,
      };

      const validation = validateAnalysisOutput(result);
      expect(validation.violations.some(v => v.type === 'editorializing')).toBe(true);
    });
  });

  describe('validateText', () => {
    it('should pass neutral text', () => {
      const result = validateText('Left-leaning outlets emphasized different aspects of the story');
      expect(result.valid).toBe(true);
    });

    it('should fail biased text', () => {
      const result = validateText('The mainstream media is spreading misinformation');
      expect(result.valid).toBe(false);
    });
  });

  describe('getApprovedAlternative', () => {
    it('should return alternative for known terms', () => {
      expect(getApprovedAlternative('liberal media')).toBe('left-leaning outlets');
      expect(getApprovedAlternative('conservative media')).toBe('right-leaning outlets');
      expect(getApprovedAlternative('mainstream media')).toBe('major outlets');
    });

    it('should return null for unknown terms', () => {
      expect(getApprovedAlternative('random term')).toBeNull();
    });
  });

  describe('parseJsonResponse', () => {
    it('should parse plain JSON', () => {
      const json = '{"key": "value"}';
      expect(parseJsonResponse(json)).toEqual({ key: 'value' });
    });

    it('should parse JSON in markdown code block', () => {
      const response = '```json\n{"key": "value"}\n```';
      expect(parseJsonResponse(response)).toEqual({ key: 'value' });
    });

    it('should extract JSON object from text', () => {
      const response = 'Here is the result: {"key": "value"} that is the end';
      expect(parseJsonResponse(response)).toEqual({ key: 'value' });
    });

    it('should extract JSON array from text', () => {
      const response = 'Results: [1, 2, 3]';
      expect(parseJsonResponse(response)).toEqual([1, 2, 3]);
    });
  });
});

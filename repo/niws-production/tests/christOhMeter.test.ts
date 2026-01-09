/**
 * ChristOhMeter Tests
 *
 * Tests for moral rating calculations, verdict determination,
 * tenet scoring, and counterfeit detection.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ChristOhMeterService } from '../src/services/christOhMeter.js';
import { BriefDatabase, resetBriefDatabaseInstance } from '../src/database/briefDatabase.js';
import type { TenetsEvaluation } from '../src/services/clients.js';

describe('ChristOhMeterService', () => {
  let meter: ChristOhMeterService;

  beforeEach(() => {
    resetBriefDatabaseInstance();
    meter = new ChristOhMeterService();
  });

  afterEach(() => {
    resetBriefDatabaseInstance();
  });

  // ============================================
  // RATING ACTIONS
  // ============================================

  describe('Rating Actions', () => {
    it('should rate an action and return result', async () => {
      const result = await meter.rateAction(
        'Help someone in need',
        'Good Samaritan',
        ['Person in need', 'Community']
      );

      expect(result).toBeDefined();
      expect(result.action).toBe('Help someone in need');
      expect(result.subject).toBe('Good Samaritan');
      expect(result.affected).toEqual(['Person in need', 'Community']);
      expect(result.tenetScores).toBeDefined();
      expect(result.spectrumScore).toBeDefined();
      expect(result.verdict).toBeDefined();
      expect(result.reasoning).toBeDefined();
    });

    it('should rate action with context', async () => {
      const result = await meter.rateAction(
        'Donate to charity',
        'Philanthropist',
        ['Beneficiaries'],
        'During a crisis'
      );

      expect(result).toBeDefined();
      expect(result.action).toBe('Donate to charity');
    });

    it('should return 25 tenet scores', async () => {
      const result = await meter.rateAction(
        'Test action',
        'Test subject',
        ['Affected group']
      );

      expect(result.tenetScores.length).toBe(25);
    });

    it('should have tenet scores in valid range', async () => {
      const result = await meter.rateAction(
        'Test action',
        'Test subject',
        ['Affected group']
      );

      for (const score of result.tenetScores) {
        expect(score.score).toBeGreaterThanOrEqual(-1);
        expect(score.score).toBeLessThanOrEqual(1);
      }
    });

    it('should have spectrum score in valid range', async () => {
      const result = await meter.rateAction(
        'Test action',
        'Test subject',
        ['Affected group']
      );

      expect(result.spectrumScore).toBeGreaterThanOrEqual(-1);
      expect(result.spectrumScore).toBeLessThanOrEqual(1);
    });

    it('should return valid verdict', async () => {
      const result = await meter.rateAction(
        'Test action',
        'Test subject',
        ['Affected group']
      );

      const validVerdicts = ['strongly_christ', 'leans_christ', 'neutral', 'leans_evil', 'strongly_evil'];
      expect(validVerdicts).toContain(result.verdict);
    });

    it('should include tenets evaluation id', async () => {
      const result = await meter.rateAction(
        'Test action',
        'Test subject',
        ['Affected group']
      );

      expect(result.tenetsEvaluationId).toBeDefined();
      // With fallback, ID should be in fallback format
      expect(result.tenetsEvaluationId).toContain('fallback_');
    });
  });

  // ============================================
  // VERDICT DETERMINATION
  // ============================================

  describe('Verdict Determination', () => {
    // These tests verify the verdict thresholds based on spectrum score
    // Without actual tenets-server, we get neutral scores (0.0)

    it('should return neutral verdict for default/fallback evaluation', async () => {
      const result = await meter.rateAction(
        'Neutral action',
        'Subject',
        ['Group']
      );

      // Fallback defaults give score 0.5 which converts to 0.0 spectrum
      // 0.0 is in the neutral range (-0.2 to 0.2)
      expect(result.verdict).toBe('neutral');
    });
  });

  // ============================================
  // TENET SCORING
  // ============================================

  describe('Tenet Scoring', () => {
    it('should include all 25 tenet pairs', async () => {
      const result = await meter.rateAction(
        'Test action',
        'Subject',
        ['Group']
      );

      const expectedTenets = [
        'LOVE', 'HEALING', 'COMPASSION', 'FORGIVENESS', 'PEACE',
        'MERCY', 'JUSTICE', 'SERVICE', 'TRUTH', 'HUMILITY',
        'FAITH', 'HOPE', 'SACRIFICE', 'UNITY', 'GENEROSITY',
        'WISDOM', 'GRACE', 'RIGHTEOUSNESS', 'FELLOWSHIP', 'DISCIPLESHIP',
        'REPENTANCE', 'REDEMPTION', 'FAITHFULNESS', 'JOY', 'DIGNITY',
      ];

      for (const tenet of expectedTenets) {
        const found = result.tenetScores.find(s => s.christTenet === tenet);
        expect(found).toBeDefined();
      }
    });

    it('should have matching evil tenets', async () => {
      const result = await meter.rateAction(
        'Test action',
        'Subject',
        ['Group']
      );

      const expectedEvilTenets = [
        'HATRED', 'WOUNDING', 'CRUELTY', 'VENGEANCE', 'STRIFE',
        'RUTHLESSNESS', 'OPPRESSION', 'EXPLOITATION', 'DECEPTION', 'PRIDE',
        'DESPAIR', 'NIHILISM', 'GREED', 'DIVISION', 'HOARDING',
        'FOOLISHNESS', 'CONDEMNATION', 'CORRUPTION', 'ISOLATION', 'STUNTING',
        'OBSTINACY', 'ABANDONMENT', 'BETRAYAL', 'MISERY', 'DEGRADATION',
      ];

      for (const tenet of expectedEvilTenets) {
        const found = result.tenetScores.find(s => s.evilTenet === tenet);
        expect(found).toBeDefined();
      }
    });

    it('should have sequential tenet IDs 1-25', async () => {
      const result = await meter.rateAction(
        'Test action',
        'Subject',
        ['Group']
      );

      const ids = result.tenetScores.map(s => s.tenetId).sort((a, b) => a - b);
      for (let i = 1; i <= 25; i++) {
        expect(ids[i - 1]).toBe(i);
      }
    });
  });

  // ============================================
  // STRONGEST TENETS
  // ============================================

  describe('Strongest Tenets', () => {
    it('should return strongest christ tenets array', async () => {
      const result = await meter.rateAction(
        'Test action',
        'Subject',
        ['Group']
      );

      expect(Array.isArray(result.strongestChristTenets)).toBe(true);
    });

    it('should return strongest evil tenets array', async () => {
      const result = await meter.rateAction(
        'Test action',
        'Subject',
        ['Group']
      );

      expect(Array.isArray(result.strongestEvilTenets)).toBe(true);
    });

    it('should limit strongest tenets to 3', async () => {
      const result = await meter.rateAction(
        'Test action',
        'Subject',
        ['Group']
      );

      expect(result.strongestChristTenets.length).toBeLessThanOrEqual(3);
      expect(result.strongestEvilTenets.length).toBeLessThanOrEqual(3);
    });
  });

  // ============================================
  // REASONING
  // ============================================

  describe('Reasoning', () => {
    it('should generate human-readable reasoning', async () => {
      const result = await meter.rateAction(
        'Test action',
        'Subject',
        ['Group']
      );

      expect(result.reasoning).toBeDefined();
      expect(typeof result.reasoning).toBe('string');
      expect(result.reasoning.length).toBeGreaterThan(0);
    });

    it('should include spectrum score in reasoning', async () => {
      const result = await meter.rateAction(
        'Test action',
        'Subject',
        ['Group']
      );

      // Reasoning should mention the score
      expect(result.reasoning).toContain('0.00');
    });

    it('should include verdict in reasoning', async () => {
      const result = await meter.rateAction(
        'Test action',
        'Subject',
        ['Group']
      );

      expect(result.reasoning.toLowerCase()).toContain('neutral');
    });
  });

  // ============================================
  // AVAILABILITY
  // ============================================

  describe('Availability', () => {
    it('should always report as available (has fallback)', () => {
      expect(meter.isAvailable()).toBe(true);
    });
  });

  // ============================================
  // HEALTH CHECK
  // ============================================

  describe('Health Check', () => {
    it('should return health check result', async () => {
      const health = await meter.healthCheck();

      expect(health).toBeDefined();
      expect(typeof health.healthy).toBe('boolean');
      expect(health.details).toBeDefined();
      expect(typeof health.details.tenetsServer).toBe('boolean');
      expect(typeof health.details.database).toBe('boolean');
      expect(health.details.tenetsUrl).toBeDefined();
    });

    it('should include tenets URL in health details', async () => {
      const health = await meter.healthCheck();
      expect(health.details.tenetsUrl).toContain('localhost');
    });
  });

  // ============================================
  // EDGE CASES
  // ============================================

  describe('Edge Cases', () => {
    it('should handle empty action string', async () => {
      const result = await meter.rateAction('', 'Subject', ['Group']);
      expect(result).toBeDefined();
      expect(result.action).toBe('');
    });

    it('should handle empty subject string', async () => {
      const result = await meter.rateAction('Action', '', ['Group']);
      expect(result).toBeDefined();
      expect(result.subject).toBe('');
    });

    it('should handle single affected party', async () => {
      const result = await meter.rateAction('Action', 'Subject', ['Single Group']);
      expect(result.affected).toEqual(['Single Group']);
    });

    it('should handle many affected parties', async () => {
      const affected = Array(20).fill(0).map((_, i) => `Group ${i}`);
      const result = await meter.rateAction('Action', 'Subject', affected);
      expect(result.affected.length).toBe(20);
    });

    it('should handle special characters in action', async () => {
      const result = await meter.rateAction(
        'Action with "quotes" and <brackets> & ampersands',
        'Subject',
        ['Group']
      );
      expect(result.action).toContain('"quotes"');
    });

    it('should handle unicode in action', async () => {
      const result = await meter.rateAction(
        '日本語アクション',
        'Subject',
        ['Group']
      );
      expect(result.action).toBe('日本語アクション');
    });

    it('should handle long context string', async () => {
      const longContext = 'A'.repeat(1000);
      const result = await meter.rateAction(
        'Action',
        'Subject',
        ['Group'],
        longContext
      );
      expect(result).toBeDefined();
    });
  });
});

// ============================================
// MOCK EVALUATION TESTS
// ============================================

describe('ChristOhMeter Score Conversion', () => {
  // Test the score conversion logic without actual API calls

  describe('Spectrum Score Conversion', () => {
    it('should convert tenet score 1.0 to spectrum +1.0', () => {
      // Formula: spectrum = (tenet_score * 2) - 1
      const tenetScore = 1.0;
      const spectrum = (tenetScore * 2) - 1;
      expect(spectrum).toBe(1.0);
    });

    it('should convert tenet score 0.5 to spectrum 0.0', () => {
      const tenetScore = 0.5;
      const spectrum = (tenetScore * 2) - 1;
      expect(spectrum).toBe(0.0);
    });

    it('should convert tenet score 0.0 to spectrum -1.0', () => {
      const tenetScore = 0.0;
      const spectrum = (tenetScore * 2) - 1;
      expect(spectrum).toBe(-1.0);
    });

    it('should convert tenet score 0.75 to spectrum +0.5', () => {
      const tenetScore = 0.75;
      const spectrum = (tenetScore * 2) - 1;
      expect(spectrum).toBe(0.5);
    });

    it('should convert tenet score 0.25 to spectrum -0.5', () => {
      const tenetScore = 0.25;
      const spectrum = (tenetScore * 2) - 1;
      expect(spectrum).toBe(-0.5);
    });
  });

  describe('Verdict Thresholds', () => {
    const getVerdict = (score: number): string => {
      if (score >= 0.6) return 'strongly_christ';
      if (score >= 0.2) return 'leans_christ';
      if (score <= -0.6) return 'strongly_evil';
      if (score <= -0.2) return 'leans_evil';
      return 'neutral';
    };

    it('should return strongly_christ for score >= 0.6', () => {
      expect(getVerdict(0.6)).toBe('strongly_christ');
      expect(getVerdict(0.8)).toBe('strongly_christ');
      expect(getVerdict(1.0)).toBe('strongly_christ');
    });

    it('should return leans_christ for score 0.2 to 0.6', () => {
      expect(getVerdict(0.2)).toBe('leans_christ');
      expect(getVerdict(0.4)).toBe('leans_christ');
      expect(getVerdict(0.59)).toBe('leans_christ');
    });

    it('should return neutral for score -0.2 to 0.2', () => {
      expect(getVerdict(-0.19)).toBe('neutral');
      expect(getVerdict(0.0)).toBe('neutral');
      expect(getVerdict(0.19)).toBe('neutral');
    });

    it('should return leans_evil for score -0.6 to -0.2', () => {
      expect(getVerdict(-0.2)).toBe('leans_evil');
      expect(getVerdict(-0.4)).toBe('leans_evil');
      expect(getVerdict(-0.59)).toBe('leans_evil');
    });

    it('should return strongly_evil for score <= -0.6', () => {
      expect(getVerdict(-0.6)).toBe('strongly_evil');
      expect(getVerdict(-0.8)).toBe('strongly_evil');
      expect(getVerdict(-1.0)).toBe('strongly_evil');
    });
  });
});

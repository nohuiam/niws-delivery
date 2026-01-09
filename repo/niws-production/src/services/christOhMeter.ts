/**
 * Christ-Oh-Meter Service
 *
 * Rates actions on a moral spectrum using the 25 Gospel tenets:
 * TENETS OF EVIL (-1.0) <------- 0 -------> TENETS OF CHRIST (+1.0)
 */

import { tenetsClient, type TenetsEvaluation } from './clients.js';
import { getBriefDatabase } from '../database/briefDatabase.js';
import type {
  ChristOhMeterResult,
  TenetScore,
  CounterfeitDetection,
  Verdict
} from '../types.js';

// The 25 tenet pairs (Christ tenet + Evil opposite)
const TENET_PAIRS: Array<{ id: number; christ: string; evil: string }> = [
  { id: 1, christ: 'LOVE', evil: 'HATRED' },
  { id: 2, christ: 'HEALING', evil: 'WOUNDING' },
  { id: 3, christ: 'COMPASSION', evil: 'CRUELTY' },
  { id: 4, christ: 'FORGIVENESS', evil: 'VENGEANCE' },
  { id: 5, christ: 'PEACE', evil: 'STRIFE' },
  { id: 6, christ: 'MERCY', evil: 'RUTHLESSNESS' },
  { id: 7, christ: 'JUSTICE', evil: 'OPPRESSION' },
  { id: 8, christ: 'SERVICE', evil: 'EXPLOITATION' },
  { id: 9, christ: 'TRUTH', evil: 'DECEPTION' },
  { id: 10, christ: 'HUMILITY', evil: 'PRIDE' },
  { id: 11, christ: 'FAITH', evil: 'DESPAIR' },
  { id: 12, christ: 'HOPE', evil: 'NIHILISM' },
  { id: 13, christ: 'SACRIFICE', evil: 'GREED' },
  { id: 14, christ: 'UNITY', evil: 'DIVISION' },
  { id: 15, christ: 'GENEROSITY', evil: 'HOARDING' },
  { id: 16, christ: 'WISDOM', evil: 'FOOLISHNESS' },
  { id: 17, christ: 'GRACE', evil: 'CONDEMNATION' },
  { id: 18, christ: 'RIGHTEOUSNESS', evil: 'CORRUPTION' },
  { id: 19, christ: 'FELLOWSHIP', evil: 'ISOLATION' },
  { id: 20, christ: 'DISCIPLESHIP', evil: 'STUNTING' },
  { id: 21, christ: 'REPENTANCE', evil: 'OBSTINACY' },
  { id: 22, christ: 'REDEMPTION', evil: 'ABANDONMENT' },
  { id: 23, christ: 'FAITHFULNESS', evil: 'BETRAYAL' },
  { id: 24, christ: 'JOY', evil: 'MISERY' },
  { id: 25, christ: 'DIGNITY', evil: 'DEGRADATION' },
];

export class ChristOhMeterService {
  /**
   * Rate an action on the Christ-Evil spectrum
   */
  async rateAction(
    action: string,
    subject: string,
    affected: string[],
    context?: string
  ): Promise<ChristOhMeterResult> {
    // Build decision text for tenets-server
    const decisionText = this.buildDecisionText(action, subject, affected, context);

    // Get evaluation from tenets-server
    const evaluation = await tenetsClient.evaluate(decisionText, affected, 'deep');

    // If tenets server unavailable or returns malformed data, use fallback
    // Check for both null and missing required fields
    const finalEvaluation = (evaluation && evaluation.tenetScores)
      ? evaluation
      : this.getDefaultEvaluation();

    // Convert tenets-server scores to spectrum scores
    const tenetScores = this.convertToSpectrumScores(finalEvaluation);

    // Calculate overall spectrum score
    const spectrumScore = this.calculateSpectrumScore(tenetScores);

    // Determine verdict
    const verdict = this.determineVerdict(spectrumScore);

    // Find strongest alignments
    const sortedScores = [...tenetScores].sort((a, b) => b.score - a.score);
    const strongestChrist = sortedScores
      .filter(s => s.score > 0.2)
      .slice(0, 3)
      .map(s => s.christTenet);
    const strongestEvil = sortedScores
      .filter(s => s.score < -0.2)
      .slice(0, 3)
      .map(s => s.evilTenet);

    // Map counterfeits
    const counterfeitsDetected: CounterfeitDetection[] = finalEvaluation.counterfeitsMatched.map(c => ({
      tenet: c.tenetName,
      pattern: c.counterfeitPattern,
      evidence: c.explanation,
    }));

    // Build reasoning
    const reasoning = this.buildReasoning(
      spectrumScore,
      verdict,
      strongestChrist,
      strongestEvil,
      counterfeitsDetected
    );

    return {
      action,
      subject,
      affected,
      tenetScores,
      spectrumScore,
      verdict,
      strongestChristTenets: strongestChrist,
      strongestEvilTenets: strongestEvil,
      counterfeitsDetected: counterfeitsDetected.length > 0 ? counterfeitsDetected : undefined,
      tenetsEvaluationId: finalEvaluation.evaluationId,
      reasoning,
    };
  }

  /**
   * Build decision text for tenets-server evaluation
   */
  private buildDecisionText(
    action: string,
    subject: string,
    affected: string[],
    context?: string
  ): string {
    let text = `ACTION: ${action}\n`;
    text += `ACTOR: ${subject}\n`;
    text += `AFFECTED PARTIES: ${affected.join(', ')}\n`;
    if (context) {
      text += `CONTEXT: ${context}\n`;
    }
    return text;
  }

  /**
   * Convert tenets-server scores (0-1) to spectrum scores (-1 to +1)
   *
   * Transformation: spectrum_score = (tenet_score * 2) - 1
   * - tenet_score 1.0 -> spectrum +1.0 (Christ)
   * - tenet_score 0.5 -> spectrum  0.0 (Neutral)
   * - tenet_score 0.0 -> spectrum -1.0 (Evil)
   */
  private convertToSpectrumScores(evaluation: TenetsEvaluation): TenetScore[] {
    const scores: TenetScore[] = [];

    for (const pair of TENET_PAIRS) {
      const tenetScore = evaluation.tenetScores[pair.id] ?? 0.5;

      // Convert 0-1 to -1 to +1
      const spectrumScore = (tenetScore * 2) - 1;

      // Find any violations or counterfeits for this tenet
      const violation = evaluation.violations.find(v => v.tenetId === pair.id);
      const counterfeit = evaluation.counterfeitsMatched.find(c => c.tenetId === pair.id);

      // If there's a violation or counterfeit, adjust score toward evil
      let adjustedScore = spectrumScore;
      if (violation) {
        adjustedScore = Math.min(adjustedScore, -0.3);
      }

      scores.push({
        tenetId: pair.id,
        christTenet: pair.christ,
        evilTenet: pair.evil,
        score: Math.round(adjustedScore * 100) / 100,
        evidence: violation?.description,
        counterfeitDetected: !!counterfeit,
        counterfeitPattern: counterfeit?.counterfeitPattern,
      });
    }

    return scores;
  }

  /**
   * Calculate overall spectrum score from individual tenet scores
   */
  private calculateSpectrumScore(tenetScores: TenetScore[]): number {
    if (tenetScores.length === 0) return 0;

    const sum = tenetScores.reduce((acc, s) => acc + s.score, 0);
    const avg = sum / tenetScores.length;

    return Math.round(avg * 100) / 100;
  }

  /**
   * Determine verdict based on spectrum score
   *
   * Thresholds:
   * - strongly_christ: >= 0.6
   * - leans_christ: 0.2 to 0.6
   * - neutral: -0.2 to 0.2
   * - leans_evil: -0.6 to -0.2
   * - strongly_evil: <= -0.6
   */
  private determineVerdict(spectrumScore: number): Verdict {
    if (spectrumScore >= 0.6) return 'strongly_christ';
    if (spectrumScore >= 0.2) return 'leans_christ';
    if (spectrumScore <= -0.6) return 'strongly_evil';
    if (spectrumScore <= -0.2) return 'leans_evil';
    return 'neutral';
  }

  /**
   * Build human-readable reasoning summary
   */
  private buildReasoning(
    spectrumScore: number,
    verdict: Verdict,
    strongestChrist: string[],
    strongestEvil: string[],
    counterfeits: CounterfeitDetection[]
  ): string {
    const scorePercent = Math.round(Math.abs(spectrumScore) * 100);
    const direction = spectrumScore >= 0 ? 'Christ' : 'Evil';

    let reasoning = `This action scores ${spectrumScore >= 0 ? '+' : ''}${spectrumScore.toFixed(2)} on the Christ-Oh-Meter, placing it ${scorePercent}% toward ${direction} on the moral spectrum (${verdict.replace('_', ' ')}).`;

    if (strongestChrist.length > 0) {
      reasoning += ` It strongly aligns with ${strongestChrist.join(', ')}.`;
    }

    if (strongestEvil.length > 0) {
      reasoning += ` It shows concerning alignment with ${strongestEvil.join(', ')}.`;
    }

    if (counterfeits.length > 0) {
      const patterns = counterfeits.map(c => `"${c.pattern}"`).join(', ');
      reasoning += ` WARNING: Counterfeit patterns detected: ${patterns}.`;
    }

    return reasoning;
  }

  /**
   * Get default evaluation when tenets-server is unavailable
   */
  private getDefaultEvaluation(): TenetsEvaluation {
    const defaultScores: Record<number, number> = {};
    for (let i = 1; i <= 25; i++) {
      defaultScores[i] = 0.5;  // Neutral
    }

    return {
      evaluationId: `fallback_${Date.now()}`,
      overallAssessment: 'caution',
      tenetScores: defaultScores,
      violations: [],
      counterfeitsMatched: [],
      recommendations: ['Unable to reach tenets-server - using neutral defaults'],
    };
  }

  /**
   * Comprehensive health check
   */
  async healthCheck(): Promise<{
    healthy: boolean;
    details: {
      tenetsServer: boolean;
      database: boolean;
      tenetsUrl: string;
    };
  }> {
    const details = {
      tenetsServer: false,
      database: false,
      tenetsUrl: tenetsClient.baseUrl,
    };

    // Check tenets-server
    try {
      const tenetsHealth = await tenetsClient.health();
      details.tenetsServer = tenetsHealth.healthy;
    } catch {
      details.tenetsServer = false;
    }

    // Check database
    try {
      const db = getBriefDatabase();
      db.getStats(); // Simple query to verify database works
      details.database = true;
    } catch {
      details.database = false;
    }

    return {
      healthy: details.tenetsServer && details.database,
      details,
    };
  }

  /**
   * Check if tenets-server is available
   */
  isAvailable(): boolean {
    return true; // Always returns true since we have fallback defaults
  }
}

// Export singleton instance
export const christOhMeter = new ChristOhMeterService();

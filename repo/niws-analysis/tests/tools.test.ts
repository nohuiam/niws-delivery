/**
 * MCP Tools Tests
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { AnalysisToolHandler, analysisTools } from '../src/tools/index.js';

describe('MCP Tools', () => {
  let handler: AnalysisToolHandler;

  beforeAll(() => {
    // Use test database
    process.env.DB_PATH = ':memory:';
    handler = new AnalysisToolHandler();
  });

  describe('Tool Definitions', () => {
    it('should have 11 tools defined', () => {
      expect(analysisTools.length).toBe(11);
    });

    it('should have required tool names', () => {
      const toolNames = analysisTools.map(t => t.name);
      expect(toolNames).toContain('analyze_article');
      expect(toolNames).toContain('analyze_bias_language');
      expect(toolNames).toContain('compare_coverage');
      expect(toolNames).toContain('get_framing_differences');
      expect(toolNames).toContain('get_neutral_alternative');
      expect(toolNames).toContain('get_comparative_analysis');
      expect(toolNames).toContain('validate_analysis_text');
      expect(toolNames).toContain('get_analysis_by_id');
      expect(toolNames).toContain('get_analysis_by_story');
      expect(toolNames).toContain('list_pending_analyses');
      expect(toolNames).toContain('retry_failed_analysis');
    });

    it('should have input schemas for all tools', () => {
      for (const tool of analysisTools) {
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe('object');
      }
    });
  });

  describe('validate_analysis_text', () => {
    it('should validate neutral text', async () => {
      const result = await handler.handleToolCall('validate_analysis_text', {
        text: 'Left-leaning outlets emphasized policy details',
      });

      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('valid', true);
      expect((result as { violation_count: number }).violation_count).toBe(0);
    });

    it('should detect violations in biased text', async () => {
      const result = await handler.handleToolCall('validate_analysis_text', {
        text: 'The truth is the mainstream media is spreading propaganda',
      });

      expect(result).toHaveProperty('success', true);
      expect((result as { violation_count: number }).violation_count).toBeGreaterThan(0);
    });
  });

  describe('get_neutral_alternative', () => {
    it('should return lexicon alternative', async () => {
      const result = await handler.handleToolCall('get_neutral_alternative', {
        term: 'liberal media',
      }) as Record<string, unknown>;

      expect(result.success).toBe(true);
      expect(result.alternative).toBe('left-leaning outlets');
      expect(result.source).toBe('lexicon');
    });

    it('should return database alternative', async () => {
      const result = await handler.handleToolCall('get_neutral_alternative', {
        term: 'radical',
      }) as Record<string, unknown>;

      expect(result.success).toBe(true);
      expect(result.alternatives).toBeDefined();
      expect((result.alternatives as string[]).length).toBeGreaterThan(0);
    });

    it('should return null for unknown terms', async () => {
      const result = await handler.handleToolCall('get_neutral_alternative', {
        term: 'randomnonexistentterm123',
      }) as Record<string, unknown>;

      expect(result.success).toBe(true);
      expect(result.alternative).toBeNull();
    });
  });

  describe('analyze_bias_language', () => {
    it('should detect loaded terms', async () => {
      const result = await handler.handleToolCall('analyze_bias_language', {
        text: 'The radical socialist regime slammed critics',
      }) as Record<string, unknown>;

      expect(result.success).toBe(true);
      expect((result.loaded_terms_found as number)).toBeGreaterThan(0);
    });

    it('should return empty for clean text', async () => {
      const result = await handler.handleToolCall('analyze_bias_language', {
        text: 'The government announced new policies',
      }) as Record<string, unknown>;

      expect(result.success).toBe(true);
      expect(result.loaded_terms_found).toBe(0);
    });
  });

  describe('list_pending_analyses', () => {
    it('should return pending list', async () => {
      const result = await handler.handleToolCall('list_pending_analyses', {}) as Record<string, unknown>;

      expect(result.success).toBe(true);
      expect(result.analyses).toBeDefined();
      expect(Array.isArray(result.analyses)).toBe(true);
    });
  });

  describe('get_analysis_by_id', () => {
    it('should return error for non-existent analysis', async () => {
      const result = await handler.handleToolCall('get_analysis_by_id', {
        analysis_id: 'non-existent-id',
      }) as Record<string, unknown>;

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('get_comparative_analysis', () => {
    it('should require comparison_id or story_id', async () => {
      const result = await handler.handleToolCall('get_comparative_analysis', {}) as Record<string, unknown>;

      expect(result.success).toBe(false);
      expect(result.error).toContain('required');
    });
  });
});

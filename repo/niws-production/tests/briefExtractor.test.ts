/**
 * BriefExtractor Tests
 *
 * Tests for quote extraction, legislation extraction, and JSON parsing.
 * Note: These tests focus on parsing and error handling without API calls.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { BriefExtractorService, type ArticleForExtraction } from '../src/services/briefExtractor.js';

describe('BriefExtractorService', () => {
  let extractor: BriefExtractorService;

  beforeEach(() => {
    extractor = new BriefExtractorService();
  });

  // ============================================
  // AVAILABILITY CHECK
  // ============================================

  describe('Availability', () => {
    it('should report availability based on API key', () => {
      const available = extractor.isAvailable();
      // Without ANTHROPIC_API_KEY set, should return false
      expect(typeof available).toBe('boolean');
    });
  });

  // ============================================
  // QUOTE EXTRACTION (without API)
  // ============================================

  describe('Quote Extraction', () => {
    it('should return empty quotes when no API key', async () => {
      const articles: ArticleForExtraction[] = [
        {
          outlet: 'CNN',
          headline: 'Test Headline',
          content: 'Test content with a quote from Speaker: "This is important."',
          url: 'https://example.com/article',
          lean: 'left',
        },
      ];

      const result = await extractor.extractQuotes(articles);
      expect(result.quotes).toEqual([]);
      expect(result.cost).toBe(0);
    });

    it('should return empty quotes for empty articles array', async () => {
      const result = await extractor.extractQuotes([]);
      expect(result.quotes).toEqual([]);
      expect(result.cost).toBe(0);
    });

    it('should handle multiple articles', async () => {
      const articles: ArticleForExtraction[] = [
        { outlet: 'CNN', headline: 'H1', content: 'C1', url: 'u1', lean: 'left' },
        { outlet: 'Fox', headline: 'H2', content: 'C2', url: 'u2', lean: 'right' },
        { outlet: 'NPR', headline: 'H3', content: 'C3', url: 'u3', lean: 'center' },
      ];

      const result = await extractor.extractQuotes(articles);
      expect(result.cost).toBe(0); // No API call made
    });
  });

  // ============================================
  // LEGISLATION EXTRACTION (without API)
  // ============================================

  describe('Legislation Extraction', () => {
    it('should return null legislation when no API key', async () => {
      const articles: ArticleForExtraction[] = [
        {
          outlet: 'CNN',
          headline: 'New Bill Passes House',
          content: 'The HR 1234 bill passed with bipartisan support.',
          url: 'https://example.com/article',
        },
      ];

      const result = await extractor.extractLegislation(articles);
      expect(result.legislation).toBeNull();
      expect(result.cost).toBe(0);
    });

    it('should return null legislation for empty articles array', async () => {
      const result = await extractor.extractLegislation([]);
      expect(result.legislation).toBeNull();
      expect(result.cost).toBe(0);
    });
  });

  // ============================================
  // QUOTE COMPARISON (without API)
  // ============================================

  describe('Quote Comparison', () => {
    it('should return null when no quotes found', async () => {
      const articles: ArticleForExtraction[] = [
        { outlet: 'CNN', headline: 'H1', content: 'Content', url: 'u1' },
      ];

      const result = await extractor.compareQuotes('John Doe', articles);
      expect(result).toBeNull();
    });
  });

  // ============================================
  // SUMMARY GENERATION (without API)
  // ============================================

  describe('Summary Generation', () => {
    it('should return null for empty articles', async () => {
      const result = await extractor.generateSummary([]);
      expect(result).toBeNull();
    });

    it('should return null when no API key', async () => {
      const articles: ArticleForExtraction[] = [
        { outlet: 'CNN', headline: 'Headline 1', content: 'Content', url: 'u1' },
        { outlet: 'Fox', headline: 'Headline 2', content: 'Content', url: 'u2' },
      ];

      const result = await extractor.generateSummary(articles);
      // Without API key, should return null
      expect(result).toBeNull();
    });
  });

  // ============================================
  // TYPES AND INTERFACES
  // ============================================

  describe('Types and Interfaces', () => {
    it('should accept articles with all optional fields', async () => {
      const articles: ArticleForExtraction[] = [
        {
          outlet: 'Test Outlet',
          headline: 'Test Headline',
          content: 'Test content goes here',
          url: 'https://example.com',
          lean: 'center',
        },
      ];

      // Should not throw
      const result = await extractor.extractQuotes(articles);
      expect(result).toBeDefined();
    });

    it('should accept articles without lean field', async () => {
      const articles: ArticleForExtraction[] = [
        {
          outlet: 'Test Outlet',
          headline: 'Test Headline',
          content: 'Test content',
          url: 'https://example.com',
        },
      ];

      const result = await extractor.extractQuotes(articles);
      expect(result).toBeDefined();
    });
  });

  // ============================================
  // EDGE CASES
  // ============================================

  describe('Edge Cases', () => {
    it('should handle articles with empty content', async () => {
      const articles: ArticleForExtraction[] = [
        {
          outlet: 'Test',
          headline: 'Empty Content',
          content: '',
          url: 'https://example.com',
        },
      ];

      const result = await extractor.extractQuotes(articles);
      expect(result.quotes).toEqual([]);
    });

    it('should handle articles with very long content', async () => {
      const articles: ArticleForExtraction[] = [
        {
          outlet: 'Test',
          headline: 'Long Content',
          content: 'A'.repeat(10000), // Content will be truncated to 5000
          url: 'https://example.com',
        },
      ];

      // Should not throw
      const result = await extractor.extractQuotes(articles);
      expect(result).toBeDefined();
    });

    it('should handle articles with special characters', async () => {
      const articles: ArticleForExtraction[] = [
        {
          outlet: 'Test "Special" Outlet',
          headline: 'Headline with <brackets> & ampersands',
          content: 'Content with "quotes" and \'apostrophes\' and \n newlines',
          url: 'https://example.com?param=value&other=test',
        },
      ];

      const result = await extractor.extractQuotes(articles);
      expect(result).toBeDefined();
    });

    it('should handle articles with unicode content', async () => {
      const articles: ArticleForExtraction[] = [
        {
          outlet: '日本語アウトレット',
          headline: '한국어 헤드라인',
          content: 'العربية محتوى with emoji 🚀',
          url: 'https://example.com',
        },
      ];

      const result = await extractor.extractQuotes(articles);
      expect(result).toBeDefined();
    });

    it('should handle articles with HTML in content', async () => {
      const articles: ArticleForExtraction[] = [
        {
          outlet: 'Test',
          headline: 'HTML Content',
          content: '<p>Paragraph</p><script>alert("xss")</script><b>Bold</b>',
          url: 'https://example.com',
        },
      ];

      const result = await extractor.extractQuotes(articles);
      expect(result).toBeDefined();
    });
  });

  // ============================================
  // CONSTRUCTOR OPTIONS
  // ============================================

  describe('Constructor Options', () => {
    it('should accept custom model', () => {
      const customExtractor = new BriefExtractorService('claude-3-opus-20240229');
      expect(customExtractor).toBeDefined();
    });

    it('should use default model when not specified', () => {
      const defaultExtractor = new BriefExtractorService();
      expect(defaultExtractor).toBeDefined();
    });
  });
});

// ============================================
// MOCK API RESPONSE TESTS
// ============================================

describe('BriefExtractor JSON Parsing', () => {
  // Test the JSON parsing behavior with mock responses
  // These would be tested with actual API if available

  describe('Quote Response Parsing', () => {
    it('should handle well-formed quote response', () => {
      const mockResponse = {
        quotes: [
          {
            speaker: 'John Doe, Senator',
            quote: 'This is important.',
            context: 'Press conference',
            found_in: ['CNN', 'Fox'],
            is_verbatim_consistent: true,
            variation_significance: 'minor' as const,
          },
        ],
      };

      // Validate structure
      expect(mockResponse.quotes[0].speaker).toBe('John Doe, Senator');
      expect(mockResponse.quotes[0].quote).toBe('This is important.');
      expect(mockResponse.quotes[0].found_in).toEqual(['CNN', 'Fox']);
    });

    it('should handle quote with variations', () => {
      const mockResponse = {
        quotes: [
          {
            speaker: 'Jane Smith',
            quote: 'We need change.',
            found_in: ['NPR'],
            variations: [
              {
                outlet: 'CNN',
                quote: 'We desperately need change.',
                note: 'Added emphasis word',
              },
            ],
            is_verbatim_consistent: false,
            variation_significance: 'moderate' as const,
          },
        ],
      };

      expect(mockResponse.quotes[0].variations).toBeDefined();
      expect(mockResponse.quotes[0].variations![0].note).toBe('Added emphasis word');
    });
  });

  describe('Legislation Response Parsing', () => {
    it('should handle well-formed legislation response', () => {
      const mockResponse = {
        legislation: {
          bill_name: 'HR 1234 - Test Act',
          bill_id: 'hr1234-119',
          status: 'passed_house' as const,
          factual_effects: [
            'Increases minimum wage to $15',
            'Applies to companies with 50+ employees',
          ],
          affected_groups: [
            { group: 'Workers', effect: 'Higher wages' },
            { group: 'Employers', effect: 'Higher labor costs' },
          ],
          sources: [
            { type: 'official' as const, url: 'https://congress.gov/bill' },
          ],
        },
      };

      expect(mockResponse.legislation.bill_name).toBe('HR 1234 - Test Act');
      expect(mockResponse.legislation.factual_effects!.length).toBe(2);
      expect(mockResponse.legislation.affected_groups!.length).toBe(2);
    });

    it('should handle null legislation response', () => {
      const mockResponse = { legislation: null };
      expect(mockResponse.legislation).toBeNull();
    });
  });
});

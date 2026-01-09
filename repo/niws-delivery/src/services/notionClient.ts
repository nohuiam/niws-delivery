import { Client, APIErrorCode, isNotionClientError } from '@notionhq/client';
import type { Story, StoryBrief, Script, NotionPage, ApprovedStory } from '../types.js';
import { withRetry, RateLimitError, RetryError } from '../utils/retry.js';

const NOTION_TOKEN = process.env.NOTION_TOKEN || '';
const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID || '';

// Retry configuration for Notion API (3 req/sec limit)
const NOTION_RETRY_OPTIONS = {
  retries: 3,
  baseDelay: 1000,
  maxDelay: 30000,
  backoffFactor: 2,
  onRetry: (attempt: number, delay: number, error: Error) => {
    console.warn(`[NotionClient] Retry ${attempt}, waiting ${delay}ms: ${error.message}`);
  }
};

/**
 * Custom error for Notion operations that hides internal details
 * but preserves cause for debugging
 */
export class NotionOperationError extends Error {
  public readonly cause?: unknown;

  constructor(operation: string, cause?: unknown) {
    const safeMessage = `Notion ${operation} failed`;
    super(safeMessage);
    this.name = 'NotionOperationError';
    this.cause = cause;

    // Log internal details but don't expose them in message
    if (cause) {
      console.error(`[NotionClient] ${operation} error:`, cause);
    }
  }

  /**
   * Get detailed error string including cause (for logging)
   */
  toString(): string {
    if (this.cause instanceof Error) {
      return `${this.message}: ${this.cause.message}`;
    }
    return this.message;
  }
}

export class NotionClient {
  private client: Client;
  private databaseId: string;

  constructor() {
    this.client = new Client({
      auth: NOTION_TOKEN,
      timeoutMs: 30000 // 30 second timeout
    });
    this.databaseId = NOTION_DATABASE_ID;
  }

  /**
   * Wrap Notion API calls with retry logic.
   * Handles rate limiting (429) and transient errors.
   */
  private async withNotionRetry<T>(operation: string, fn: () => Promise<T>): Promise<T> {
    try {
      return await withRetry(async () => {
        try {
          return await fn();
        } catch (error) {
          // Convert Notion rate limit errors to our RateLimitError
          if (isNotionClientError(error) && error.code === APIErrorCode.RateLimited) {
            throw new RateLimitError('Notion rate limited', 1000);
          }
          // Re-throw with status for retry logic
          if (isNotionClientError(error)) {
            const status = (error as { status?: number }).status;
            if (status && status >= 500) {
              throw new Error(`HTTP status ${status}`);
            }
          }
          throw error;
        }
      }, NOTION_RETRY_OPTIONS);
    } catch (error) {
      // Convert all errors to safe NotionOperationError
      if (error instanceof RetryError) {
        throw new NotionOperationError(operation, error.lastError);
      }
      throw new NotionOperationError(operation, error);
    }
  }

  async pushStory(story: Story, brief: StoryBrief, script?: Script): Promise<NotionPage> {
    return this.withNotionRetry('pushStory', async () => {
      const page = await this.client.pages.create({
        parent: { database_id: this.databaseId },
        properties: {
          'Title': { title: [{ text: { content: story.title } }] },
          'Status': { select: { name: 'Ready for Review' } },
          'Track': { select: { name: story.track } },
          'Christ-Oh-Meter': { number: brief.christOhMeterScore },
          'Story ID': { rich_text: [{ text: { content: story.id } }] },
          'Brief ID': { rich_text: [{ text: { content: brief.id } }] },
          'Created': { date: { start: new Date().toISOString() } }
        },
        children: this.buildPageContent(story, brief, script) as never[]
      });

      const pageAny = page as unknown as { id: string; properties: Record<string, unknown> };
      return {
        id: page.id,
        url: `https://notion.so/${page.id.replace(/-/g, '')}`,
        properties: pageAny.properties || {}
      };
    });
  }

  private buildPageContent(story: Story, brief: StoryBrief, script?: Script): unknown[] {
    const blocks: unknown[] = [];

    // Summary section
    blocks.push({
      object: 'block',
      type: 'heading_2',
      heading_2: { rich_text: [{ text: { content: 'Summary' } }] }
    });
    blocks.push({
      object: 'block',
      type: 'paragraph',
      paragraph: { rich_text: [{ text: { content: brief.summary } }] }
    });

    // Key Facts section
    blocks.push({
      object: 'block',
      type: 'heading_2',
      heading_2: { rich_text: [{ text: { content: 'Key Facts' } }] }
    });
    for (const fact of brief.keyFacts) {
      blocks.push({
        object: 'block',
        type: 'bulleted_list_item',
        bulleted_list_item: { rich_text: [{ text: { content: fact } }] }
      });
    }

    // Perspectives section
    blocks.push({
      object: 'block',
      type: 'heading_2',
      heading_2: { rich_text: [{ text: { content: 'Perspectives' } }] }
    });
    for (const perspective of brief.perspectives) {
      blocks.push({
        object: 'block',
        type: 'heading_3',
        heading_3: { rich_text: [{ text: { content: perspective.outletName } }] }
      });
      blocks.push({
        object: 'block',
        type: 'paragraph',
        paragraph: { rich_text: [{ text: { content: perspective.perspective } }] }
      });
    }

    // Moral Alignment section
    blocks.push({
      object: 'block',
      type: 'heading_2',
      heading_2: { rich_text: [{ text: { content: 'Moral Alignment' } }] }
    });
    blocks.push({
      object: 'block',
      type: 'callout',
      callout: {
        icon: { emoji: '⚖️' },
        rich_text: [{ text: { content: `Christ-Oh-Meter: ${brief.christOhMeterScore}/10\n\n${brief.moralAlignment}` } }]
      }
    });

    // Script section (if provided)
    if (script) {
      blocks.push({
        object: 'block',
        type: 'heading_2',
        heading_2: { rich_text: [{ text: { content: 'Script' } }] }
      });
      blocks.push({
        object: 'block',
        type: 'code',
        code: {
          language: 'plain text',
          rich_text: [{ text: { content: script.content.slice(0, 2000) } }]
        }
      });
    }

    return blocks;
  }

  async pollApprovals(): Promise<ApprovedStory[]> {
    return this.withNotionRetry('pollApprovals', async () => {
      const response = await this.client.databases.query({
        database_id: this.databaseId,
        filter: {
          property: 'Status',
          select: { equals: 'Approved' }
        }
      });

      return response.results.map(page => this.parseApprovedStory(page as unknown));
    });
  }

  private parseApprovedStory(page: unknown): ApprovedStory {
    const p = page as { id: string; properties: Record<string, unknown>; last_edited_time: string };
    const props = p.properties;

    const getTitleText = (prop: unknown): string => {
      const titleProp = prop as { title?: Array<{ text: { content: string } }> };
      return titleProp?.title?.[0]?.text?.content || '';
    };

    const getRichText = (prop: unknown): string => {
      const rtProp = prop as { rich_text?: Array<{ text: { content: string } }> };
      return rtProp?.rich_text?.[0]?.text?.content || '';
    };

    return {
      notionPageId: p.id,
      storyId: getRichText(props['Story ID']),
      title: getTitleText(props['Title']),
      approvedAt: p.last_edited_time,
      notes: getRichText(props['Notes'])
    };
  }

  async markStorySent(pageId: string): Promise<void> {
    await this.withNotionRetry('markStorySent', async () => {
      await this.client.pages.update({
        page_id: pageId,
        properties: {
          'Status': { select: { name: 'Sent' } },
          'Sent At': { date: { start: new Date().toISOString() } }
        }
      });
    });
  }

  async getApprovedStories(): Promise<ApprovedStory[]> {
    return this.pollApprovals();
  }

  async createPage(title: string, content: string, parentPageId?: string): Promise<NotionPage> {
    return this.withNotionRetry('createPage', async () => {
      const parent = parentPageId
        ? { page_id: parentPageId }
        : { database_id: this.databaseId };

      const page = await this.client.pages.create({
        parent: parent as { database_id: string },
        properties: {
          'Title': { title: [{ text: { content: title } }] }
        },
        children: [
          {
            object: 'block',
            type: 'paragraph',
            paragraph: { rich_text: [{ text: { content } }] }
          }
        ]
      });

      const pageAny = page as unknown as { id: string; properties?: Record<string, unknown> };
      return {
        id: page.id,
        url: `https://notion.so/${page.id.replace(/-/g, '')}`,
        properties: pageAny.properties || {}
      };
    });
  }

  async updatePage(pageId: string, properties: Record<string, unknown>): Promise<NotionPage> {
    return this.withNotionRetry('updatePage', async () => {
      const page = await this.client.pages.update({
        page_id: pageId,
        properties: properties as never
      });

      const pageAny = page as unknown as { id: string; properties?: Record<string, unknown> };
      return {
        id: page.id,
        url: `https://notion.so/${page.id.replace(/-/g, '')}`,
        properties: pageAny.properties || {}
      };
    });
  }

  async archivePage(pageId: string): Promise<void> {
    await this.withNotionRetry('archivePage', async () => {
      await this.client.pages.update({
        page_id: pageId,
        archived: true
      });
    });
  }

  async getDatabase(): Promise<{ id: string; title: string; properties: Record<string, unknown> }> {
    return this.withNotionRetry('getDatabase', async () => {
      const db = await this.client.databases.retrieve({ database_id: this.databaseId });
      const dbTyped = db as { id: string; title: Array<{ text: { content: string } }>; properties: Record<string, unknown> };
      return {
        id: dbTyped.id,
        title: dbTyped.title?.[0]?.text?.content || 'Untitled',
        properties: dbTyped.properties
      };
    });
  }

  async syncStatus(): Promise<{ connected: boolean; lastSync: string; pendingCount: number }> {
    try {
      const approved = await this.pollApprovals();
      return {
        connected: true,
        lastSync: new Date().toISOString(),
        pendingCount: approved.length
      };
    } catch {
      return {
        connected: false,
        lastSync: '',
        pendingCount: 0
      };
    }
  }

  async getComments(pageId: string): Promise<Array<{ id: string; author: string; content: string; createdAt: string }>> {
    return this.withNotionRetry('getComments', async () => {
      const response = await this.client.comments.list({ block_id: pageId });
      return response.results.map(comment => {
        const c = comment as { id: string; created_by: { name?: string }; rich_text: Array<{ text: { content: string } }>; created_time: string };
        return {
          id: c.id,
          author: c.created_by?.name || 'Unknown',
          content: c.rich_text?.[0]?.text?.content || '',
          createdAt: c.created_time
        };
      });
    });
  }

  async addComment(pageId: string, content: string): Promise<{ id: string }> {
    return this.withNotionRetry('addComment', async () => {
      const response = await this.client.comments.create({
        parent: { page_id: pageId },
        rich_text: [{ text: { content } }]
      });
      return { id: response.id };
    });
  }

  async getWorkflowState(): Promise<{ active: string[]; pending: string[]; completed: string[] }> {
    return this.withNotionRetry('getWorkflowState', async () => {
      const response = await this.client.databases.query({
        database_id: this.databaseId,
        sorts: [{ property: 'Created', direction: 'descending' }],
        page_size: 100
      });

      const active: string[] = [];
      const pending: string[] = [];
      const completed: string[] = [];

      for (const page of response.results) {
        const p = page as { id: string; properties: Record<string, unknown> };
        const statusProp = p.properties['Status'] as { select?: { name: string } };
        const status = statusProp?.select?.name || '';

        switch (status) {
          case 'In Progress':
          case 'Ready for Review':
            active.push(p.id);
            break;
          case 'Approved':
            pending.push(p.id);
            break;
          case 'Sent':
          case 'Archived':
            completed.push(p.id);
            break;
        }
      }

      return { active, pending, completed };
    });
  }
}

export const notionClient = new NotionClient();

import { notionClient } from '../services/notionClient.js';
import { intakeClient, productionClient } from '../services/clients.js';
import type { Story, StoryBrief, Script } from '../types.js';

export interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

function success(data: unknown): ToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }]
  };
}

function error(message: string): ToolResult {
  return {
    content: [{ type: 'text', text: `Error: ${message}` }],
    isError: true
  };
}

// Tool: notion_push_story
export async function notionPushStory(args: { storyId: string; briefId: string; scriptId?: string }): Promise<ToolResult> {
  try {
    const story = await intakeClient.getStory(args.storyId);
    const brief = await productionClient.getBrief(args.briefId);
    let script: Script | undefined;
    if (args.scriptId) {
      script = await productionClient.getScript(args.scriptId);
    }

    const page = await notionClient.pushStory(story, brief, script);
    return success({
      status: 'pushed',
      notionPageId: page.id,
      url: page.url,
      storyId: args.storyId,
      briefId: args.briefId
    });
  } catch (err) {
    return error(`Failed to push story: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// Tool: notion_poll_approvals
export async function notionPollApprovals(): Promise<ToolResult> {
  try {
    const approved = await notionClient.pollApprovals();
    return success({
      status: 'polled',
      count: approved.length,
      approved
    });
  } catch (err) {
    return error(`Failed to poll approvals: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// Tool: notion_mark_story_sent
export async function notionMarkStorySent(args: { pageId: string }): Promise<ToolResult> {
  try {
    await notionClient.markStorySent(args.pageId);
    return success({
      status: 'marked_sent',
      pageId: args.pageId,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    return error(`Failed to mark story sent: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// Tool: notion_get_approved_stories
export async function notionGetApprovedStories(): Promise<ToolResult> {
  try {
    const approved = await notionClient.getApprovedStories();
    return success({
      count: approved.length,
      stories: approved
    });
  } catch (err) {
    return error(`Failed to get approved stories: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// Tool: notion_create_page
export async function notionCreatePage(args: { title: string; content: string; parentPageId?: string }): Promise<ToolResult> {
  try {
    const page = await notionClient.createPage(args.title, args.content, args.parentPageId);
    return success({
      status: 'created',
      pageId: page.id,
      url: page.url
    });
  } catch (err) {
    return error(`Failed to create page: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// Tool: notion_update_page
export async function notionUpdatePage(args: { pageId: string; properties: Record<string, unknown> }): Promise<ToolResult> {
  try {
    const page = await notionClient.updatePage(args.pageId, args.properties);
    return success({
      status: 'updated',
      pageId: page.id,
      url: page.url
    });
  } catch (err) {
    return error(`Failed to update page: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// Tool: notion_archive_page
export async function notionArchivePage(args: { pageId: string }): Promise<ToolResult> {
  try {
    await notionClient.archivePage(args.pageId);
    return success({
      status: 'archived',
      pageId: args.pageId,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    return error(`Failed to archive page: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// Tool: notion_get_database
export async function notionGetDatabase(): Promise<ToolResult> {
  try {
    const db = await notionClient.getDatabase();
    return success({
      id: db.id,
      title: db.title,
      propertyCount: Object.keys(db.properties).length,
      properties: Object.keys(db.properties)
    });
  } catch (err) {
    return error(`Failed to get database: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// Tool: notion_sync_status
export async function notionSyncStatus(): Promise<ToolResult> {
  try {
    const status = await notionClient.syncStatus();
    return success(status);
  } catch (err) {
    return error(`Failed to get sync status: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// Tool: notion_get_comments
export async function notionGetComments(args: { pageId: string }): Promise<ToolResult> {
  try {
    const comments = await notionClient.getComments(args.pageId);
    return success({
      count: comments.length,
      comments
    });
  } catch (err) {
    return error(`Failed to get comments: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// Tool: notion_add_comment
export async function notionAddComment(args: { pageId: string; content: string }): Promise<ToolResult> {
  try {
    const result = await notionClient.addComment(args.pageId, args.content);
    return success({
      status: 'added',
      commentId: result.id,
      pageId: args.pageId
    });
  } catch (err) {
    return error(`Failed to add comment: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// Tool: notion_get_workflow_state
export async function notionGetWorkflowState(): Promise<ToolResult> {
  try {
    const state = await notionClient.getWorkflowState();
    return success({
      activeCount: state.active.length,
      pendingCount: state.pending.length,
      completedCount: state.completed.length,
      ...state
    });
  } catch (err) {
    return error(`Failed to get workflow state: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// Export all notion tools with their definitions
export const notionToolDefinitions = [
  {
    name: 'notion_push_story',
    description: 'Push a story with its brief and optional script to Notion database',
    inputSchema: {
      type: 'object',
      properties: {
        storyId: { type: 'string', description: 'Story ID from niws-intake' },
        briefId: { type: 'string', description: 'Brief ID from niws-production' },
        scriptId: { type: 'string', description: 'Optional script ID' }
      },
      required: ['storyId', 'briefId']
    }
  },
  {
    name: 'notion_poll_approvals',
    description: 'Poll Notion database for approved stories ready for export',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'notion_mark_story_sent',
    description: 'Mark a story as sent/exported in Notion',
    inputSchema: {
      type: 'object',
      properties: {
        pageId: { type: 'string', description: 'Notion page ID' }
      },
      required: ['pageId']
    }
  },
  {
    name: 'notion_get_approved_stories',
    description: 'Get all stories with Approved status',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'notion_create_page',
    description: 'Create a new Notion page',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Page title' },
        content: { type: 'string', description: 'Page content' },
        parentPageId: { type: 'string', description: 'Optional parent page ID' }
      },
      required: ['title', 'content']
    }
  },
  {
    name: 'notion_update_page',
    description: 'Update an existing Notion page properties',
    inputSchema: {
      type: 'object',
      properties: {
        pageId: { type: 'string', description: 'Notion page ID' },
        properties: { type: 'object', description: 'Properties to update' }
      },
      required: ['pageId', 'properties']
    }
  },
  {
    name: 'notion_archive_page',
    description: 'Archive a Notion page',
    inputSchema: {
      type: 'object',
      properties: {
        pageId: { type: 'string', description: 'Notion page ID to archive' }
      },
      required: ['pageId']
    }
  },
  {
    name: 'notion_get_database',
    description: 'Get Notion database structure and properties',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'notion_sync_status',
    description: 'Check Notion sync connection status',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'notion_get_comments',
    description: 'Get comments on a Notion page',
    inputSchema: {
      type: 'object',
      properties: {
        pageId: { type: 'string', description: 'Notion page ID' }
      },
      required: ['pageId']
    }
  },
  {
    name: 'notion_add_comment',
    description: 'Add a comment to a Notion page',
    inputSchema: {
      type: 'object',
      properties: {
        pageId: { type: 'string', description: 'Notion page ID' },
        content: { type: 'string', description: 'Comment text' }
      },
      required: ['pageId', 'content']
    }
  },
  {
    name: 'notion_get_workflow_state',
    description: 'Get workflow state from Notion database',
    inputSchema: { type: 'object', properties: {} }
  }
];

export const notionToolHandlers: Record<string, (args: unknown) => Promise<ToolResult>> = {
  notion_push_story: (args) => notionPushStory(args as { storyId: string; briefId: string; scriptId?: string }),
  notion_poll_approvals: () => notionPollApprovals(),
  notion_mark_story_sent: (args) => notionMarkStorySent(args as { pageId: string }),
  notion_get_approved_stories: () => notionGetApprovedStories(),
  notion_create_page: (args) => notionCreatePage(args as { title: string; content: string; parentPageId?: string }),
  notion_update_page: (args) => notionUpdatePage(args as { pageId: string; properties: Record<string, unknown> }),
  notion_archive_page: (args) => notionArchivePage(args as { pageId: string }),
  notion_get_database: () => notionGetDatabase(),
  notion_sync_status: () => notionSyncStatus(),
  notion_get_comments: (args) => notionGetComments(args as { pageId: string }),
  notion_add_comment: (args) => notionAddComment(args as { pageId: string; content: string }),
  notion_get_workflow_state: () => notionGetWorkflowState()
};

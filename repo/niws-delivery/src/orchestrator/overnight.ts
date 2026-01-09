import { stateManager } from './stateManager.js';
import { intakeClient, analysisClient, productionClient } from '../services/clients.js';
import { notionClient } from '../services/notionClient.js';
import type { WorkflowResult, Story } from '../types.js';

// Timeout for individual workflow steps (5 minutes)
const STEP_TIMEOUT_MS = 5 * 60 * 1000;

export class OvernightWorkflow {
  async run(): Promise<WorkflowResult> {
    const run = stateManager.startRun('overnight');

    try {
      // Step 1: Poll all feeds
      await this.executeStep('poll_feeds', async () => {
        stateManager.log('info', 'Polling all news feeds');
        // In production, would call intake to poll RSS feeds
        // await intakeClient.post('/api/poll-all');
      });

      // Step 2: Cluster stories
      await this.executeStep('cluster_stories', async () => {
        stateManager.log('info', 'Clustering articles into stories');
        // await intakeClient.post('/api/cluster');
      });

      // Step 3: Get new stories (last 24 hours)
      let newStories: Story[] = [];
      await this.executeStep('fetch_new_stories', async () => {
        stateManager.log('info', 'Fetching new stories from last 24 hours');
        try {
          const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
          const response = await intakeClient.getStories({ since, limit: 50 });
          newStories = response.stories;
          stateManager.log('info', `Found ${newStories.length} new stories`);
        } catch (err) {
          stateManager.log('warn', `Failed to fetch stories: ${err}`);
          newStories = [];
        }
      });

      // Step 4: Analyze new stories
      await this.executeStep('analyze_stories', async () => {
        stateManager.log('info', `Analyzing ${newStories.length} stories`);
        for (const story of newStories) {
          try {
            await analysisClient.compare(story.id, story.articleIds);
            stateManager.log('info', `Analyzed story: ${story.title}`);
          } catch (err) {
            stateManager.log('warn', `Failed to analyze story ${story.id}: ${err}`);
          }
        }
      });

      // Step 5: Generate briefs for unbriefed stories
      await this.executeStep('generate_briefs', async () => {
        stateManager.log('info', 'Generating story briefs');
        for (const story of newStories) {
          try {
            const existingBriefs = await productionClient.getBriefs({ storyId: story.id });
            if (existingBriefs.briefs.length === 0) {
              await productionClient.createBrief(story.id);
              stateManager.log('info', `Created brief for: ${story.title}`);
            }
          } catch (err) {
            stateManager.log('warn', `Failed to create brief for ${story.id}: ${err}`);
          }
        }
      });

      // Step 6: Push top stories to Notion for review
      await this.executeStep('push_to_notion', async () => {
        stateManager.log('info', 'Pushing stories to Notion for review');
        const topStories = newStories.slice(0, 10); // Top 10 stories

        for (const story of topStories) {
          try {
            const briefs = await productionClient.getBriefs({ storyId: story.id });
            if (briefs.briefs.length > 0) {
              const brief = briefs.briefs[0];
              await notionClient.pushStory(story, brief);
              stateManager.log('info', `Pushed to Notion: ${story.title}`);
            }
          } catch (err) {
            stateManager.log('warn', `Failed to push ${story.id} to Notion: ${err}`);
          }
        }
      });

      // Step 7: Cleanup old data
      await this.executeStep('cleanup', async () => {
        stateManager.log('info', 'Cleaning up old data');
        // Would clean up old exports, temp files, etc.
      });

      stateManager.complete();

      return {
        success: true,
        steps: run.logs
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      stateManager.fail(message);

      return {
        success: false,
        steps: run.logs,
        error: message
      };
    }
  }

  private async executeStep(name: string, fn: () => Promise<void>): Promise<void> {
    // Check if paused
    await stateManager.pauseIfRequested();

    const run = stateManager.getCurrentRun();
    if (!run || run.status === 'failed') {
      throw new Error('Workflow not running');
    }

    stateManager.updateStep(name);
    stateManager.log('info', `Starting step: ${name}`);

    const start = Date.now();

    // Create timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Step ${name} timed out after ${STEP_TIMEOUT_MS}ms`));
      }, STEP_TIMEOUT_MS);
    });

    try {
      // Race between step execution and timeout
      await Promise.race([fn(), timeoutPromise]);
      const duration = Date.now() - start;
      stateManager.log('info', `Completed step: ${name} (${duration}ms)`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      stateManager.log('error', `Step failed: ${name} - ${message}`);
      throw error;
    }
  }
}

export const overnightWorkflow = new OvernightWorkflow();

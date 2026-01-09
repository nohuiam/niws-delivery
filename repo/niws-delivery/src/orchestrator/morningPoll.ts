import { stateManager } from './stateManager.js';
import { productionClient } from '../services/clients.js';
import { notionClient } from '../services/notionClient.js';
import { teleprompterFormatter } from '../services/teleprompterFormatter.js';
import { airDropService } from '../services/airdrop.js';
import { exportToRTF } from '../exporters/rtf.js';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import type { WorkflowResult, ApprovedStory, Script } from '../types.js';

const EXPORT_DIR = process.env.EXPORT_DIR || './data/exports';

export class MorningPollWorkflow {
  async run(): Promise<WorkflowResult> {
    const run = stateManager.startRun('morning');

    try {
      // Step 1: Poll Notion for approved stories
      let approved: ApprovedStory[] = [];
      await this.executeStep('poll_approvals', async () => {
        stateManager.log('info', 'Polling Notion for approved stories');
        try {
          approved = await notionClient.pollApprovals();
          stateManager.log('info', `Found ${approved.length} approved stories`);
        } catch (err) {
          stateManager.log('warn', `Failed to poll approvals: ${err}`);
          approved = [];
        }
      });

      if (approved.length === 0) {
        stateManager.log('info', 'No approved stories found');
        stateManager.complete();
        return {
          success: true,
          steps: run.logs
        };
      }

      // Step 2: Generate scripts for approved stories
      const scripts: Script[] = [];
      await this.executeStep('generate_scripts', async () => {
        stateManager.log('info', `Generating scripts for ${approved.length} stories`);
        for (const story of approved) {
          try {
            const result = await productionClient.generateScript(story.storyId);
            const script = await productionClient.getScript(result.scriptId);
            scripts.push(script);
            stateManager.log('info', `Generated script for: ${story.title}`);
          } catch (err) {
            stateManager.log('warn', `Failed to generate script for ${story.storyId}: ${err}`);
          }
        }
      });

      // Step 3: Export scripts to teleprompter format
      const exportedPaths: string[] = [];
      await this.executeStep('export_teleprompter', async () => {
        stateManager.log('info', `Exporting ${scripts.length} scripts to teleprompter format`);

        if (!existsSync(EXPORT_DIR)) {
          mkdirSync(EXPORT_DIR, { recursive: true });
        }

        for (const script of scripts) {
          try {
            const formatted = teleprompterFormatter.format(script);
            const rtfContent = exportToRTF(formatted);
            const filename = `script_${script.id}_${Date.now()}.rtf`;
            const filePath = join(EXPORT_DIR, filename);
            writeFileSync(filePath, rtfContent, 'utf-8');
            exportedPaths.push(filePath);
            stateManager.log('info', `Exported: ${filename}`);
          } catch (err) {
            stateManager.log('warn', `Failed to export script ${script.id}: ${err}`);
          }
        }
      });

      // Step 4: AirDrop to iPad (if available and files exist)
      await this.executeStep('airdrop_transfer', async () => {
        if (exportedPaths.length === 0) {
          stateManager.log('info', 'No files to transfer');
          return;
        }

        stateManager.log('info', `Attempting to AirDrop ${exportedPaths.length} files`);
        const availability = await airDropService.checkAvailability();

        if (!availability.available) {
          stateManager.log('warn', `AirDrop not available: ${availability.reason}`);

          // Add pending action for manual transfer
          for (const path of exportedPaths) {
            stateManager.addPendingAction({
              type: 'export',
              description: `Manually transfer: ${path}`,
              scriptId: scripts[exportedPaths.indexOf(path)]?.id
            });
          }
          return;
        }

        for (const filePath of exportedPaths) {
          try {
            const result = await airDropService.sendToDevice(filePath, 'iPad');
            if (result.success) {
              stateManager.log('info', `AirDropped: ${filePath}`);
            } else {
              stateManager.log('warn', `AirDrop failed for ${filePath}: ${result.error}`);
            }
          } catch (err) {
            stateManager.log('warn', `AirDrop error for ${filePath}: ${err}`);
          }
        }
      });

      // Step 5: Mark stories as sent in Notion
      await this.executeStep('mark_sent', async () => {
        stateManager.log('info', 'Marking stories as sent in Notion');
        for (const story of approved) {
          try {
            await notionClient.markStorySent(story.notionPageId);
            stateManager.log('info', `Marked as sent: ${story.title}`);
          } catch (err) {
            stateManager.log('warn', `Failed to mark ${story.notionPageId} as sent: ${err}`);
          }
        }
      });

      // Step 6: Send notifications
      await this.executeStep('notify', async () => {
        stateManager.log('info', 'Sending completion notifications');
        // In production, would send email/SMS/push notification
        // For now, just log
        stateManager.log('info', `Morning poll complete: ${scripts.length} scripts ready, ${exportedPaths.length} exported`);
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
    await stateManager.pauseIfRequested();

    const run = stateManager.getCurrentRun();
    if (!run || run.status === 'failed') {
      throw new Error('Workflow not running');
    }

    stateManager.updateStep(name);
    stateManager.log('info', `Starting step: ${name}`);

    const start = Date.now();
    try {
      await fn();
      const duration = Date.now() - start;
      stateManager.log('info', `Completed step: ${name} (${duration}ms)`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      stateManager.log('error', `Step failed: ${name} - ${message}`);
      throw error;
    }
  }
}

export const morningPollWorkflow = new MorningPollWorkflow();

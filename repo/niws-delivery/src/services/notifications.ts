import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface NotificationOptions {
  title: string;
  message: string;
  sound?: boolean;
  subtitle?: string;
}

class NotificationService {
  /**
   * Send a macOS notification using osascript
   */
  async sendDesktopNotification(options: NotificationOptions): Promise<boolean> {
    if (process.platform !== 'darwin') {
      console.log(`[Notification] ${options.title}: ${options.message}`);
      return false;
    }

    try {
      const subtitle = options.subtitle ? `subtitle "${options.subtitle}"` : '';
      const sound = options.sound ? 'sound name "default"' : '';

      const script = `display notification "${this.escapeForAppleScript(options.message)}" with title "${this.escapeForAppleScript(options.title)}" ${subtitle} ${sound}`;

      await execAsync(`osascript -e '${script}'`);
      return true;
    } catch (error) {
      console.error('[Notification] Failed to send desktop notification:', error);
      return false;
    }
  }

  /**
   * Send workflow completion notification
   */
  async notifyWorkflowComplete(workflowType: string, success: boolean, details?: string): Promise<void> {
    const title = success
      ? `NIWS ${workflowType} Complete`
      : `NIWS ${workflowType} Failed`;

    const message = details || (success
      ? 'Workflow completed successfully'
      : 'Workflow encountered an error');

    await this.sendDesktopNotification({
      title,
      message,
      sound: true
    });
  }

  /**
   * Send approval required notification
   */
  async notifyApprovalRequired(storyCount: number): Promise<void> {
    await this.sendDesktopNotification({
      title: 'NIWS: Approval Required',
      message: `${storyCount} stories are waiting for approval in Notion`,
      sound: true
    });
  }

  /**
   * Send export ready notification
   */
  async notifyExportReady(scriptCount: number, destination: string): Promise<void> {
    await this.sendDesktopNotification({
      title: 'NIWS: Scripts Ready',
      message: `${scriptCount} scripts exported to ${destination}`,
      sound: true
    });
  }

  /**
   * Send error notification
   */
  async notifyError(context: string, error: string): Promise<void> {
    await this.sendDesktopNotification({
      title: `NIWS Error: ${context}`,
      message: error,
      sound: true
    });
  }

  private escapeForAppleScript(text: string): string {
    return text
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n');
  }
}

export const notifications = new NotificationService();

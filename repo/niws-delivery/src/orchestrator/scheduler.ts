import cron from 'node-cron';
import type { ScheduleEntry } from '../types.js';
import { overnightWorkflow } from './overnight.js';
import { morningPollWorkflow } from './morningPoll.js';
import { intakeClient } from '../services/clients.js';

class WorkflowScheduler {
  private jobs: Map<string, cron.ScheduledTask> = new Map();
  private schedules: Map<string, ScheduleEntry> = new Map();

  constructor() {
    // Initialize with default schedules (disabled by default)
    this.schedules.set('overnight', {
      id: 'overnight',
      workflowType: 'overnight',
      cronExpr: '0 2 * * *',  // 2 AM daily
      enabled: false
    });

    this.schedules.set('morning', {
      id: 'morning',
      workflowType: 'morning',
      cronExpr: '0 6 * * *',  // 6 AM daily
      enabled: false
    });

    this.schedules.set('hourly_poll', {
      id: 'hourly_poll',
      workflowType: 'hourly_poll',
      cronExpr: '0 * * * *',  // Every hour
      enabled: false
    });
  }

  schedule(id: string, cronExpr: string, workflow: () => Promise<void>): void {
    // Stop existing job if any
    this.stop(id);

    // Validate cron expression
    if (!cron.validate(cronExpr)) {
      throw new Error(`Invalid cron expression: ${cronExpr}`);
    }

    // Create and start new job
    const task = cron.schedule(cronExpr, async () => {
      console.log(`[Scheduler] Running scheduled workflow: ${id}`);
      const entry = this.schedules.get(id);
      if (entry) {
        entry.lastRun = new Date().toISOString();
        this.schedules.set(id, entry);
      }

      try {
        await workflow();
      } catch (error) {
        console.error(`[Scheduler] Workflow ${id} failed:`, error);
      }
    }, {
      scheduled: true,
      timezone: 'America/Los_Angeles' // Default timezone
    });

    this.jobs.set(id, task);

    // Update schedule entry
    const existing = this.schedules.get(id);
    if (existing) {
      existing.cronExpr = cronExpr;
      existing.enabled = true;
      existing.nextRun = this.getNextRun(cronExpr);
    }

    console.log(`[Scheduler] Scheduled ${id} with cron: ${cronExpr}`);
  }

  stop(id: string): void {
    const job = this.jobs.get(id);
    if (job) {
      job.stop();
      this.jobs.delete(id);

      const entry = this.schedules.get(id);
      if (entry) {
        entry.enabled = false;
        entry.nextRun = undefined;
      }

      console.log(`[Scheduler] Stopped ${id}`);
    }
  }

  initializeDefaults(): void {
    // Overnight run at 2 AM
    this.schedule('overnight', '0 2 * * *', async () => { await overnightWorkflow.run(); });

    // Morning poll at 6 AM
    this.schedule('morning', '0 6 * * *', async () => { await morningPollWorkflow.run(); });

    // Hourly feed poll (disabled by default, can be enabled)
    // this.schedule('hourly_poll', '0 * * * *', async () => {
    //   await intakeClient.post('/api/poll-all');
    // });

    console.log('[Scheduler] Default schedules initialized');
  }

  getSchedules(): ScheduleEntry[] {
    return Array.from(this.schedules.values()).map(entry => ({
      ...entry,
      nextRun: entry.enabled ? this.getNextRun(entry.cronExpr) : undefined
    }));
  }

  updateSchedule(id: string, updates: Partial<Omit<ScheduleEntry, 'id'>>): ScheduleEntry | null {
    const existing = this.schedules.get(id);
    if (!existing) {
      return null;
    }

    const updated = { ...existing, ...updates };
    this.schedules.set(id, updated);

    // If cron expression changed or enabled status changed, update job
    if (updates.cronExpr || updates.enabled !== undefined) {
      if (updated.enabled) {
        const workflow = this.getWorkflowForType(updated.workflowType);
        if (workflow) {
          this.schedule(id, updated.cronExpr, workflow);
        }
      } else {
        this.stop(id);
      }
    }

    return this.schedules.get(id) || null;
  }

  private getWorkflowForType(type: string): (() => Promise<void>) | null {
    switch (type) {
      case 'overnight':
        return async () => { await overnightWorkflow.run(); };
      case 'morning':
        return async () => { await morningPollWorkflow.run(); };
      case 'hourly_poll':
        return async () => {
          // await intakeClient.post('/api/poll-all');
          console.log('[Scheduler] Hourly poll executed');
        };
      default:
        return null;
    }
  }

  private getNextRun(cronExpr: string): string {
    // This is a simplified implementation
    // In production, would use a proper cron parser
    const now = new Date();
    const parts = cronExpr.split(' ');

    if (parts.length !== 5) {
      return now.toISOString();
    }

    const [minute, hour] = parts.map(p => (p === '*' ? -1 : parseInt(p)));

    const next = new Date(now);
    if (hour !== -1) next.setHours(hour);
    if (minute !== -1) next.setMinutes(minute);
    next.setSeconds(0);
    next.setMilliseconds(0);

    if (next <= now) {
      next.setDate(next.getDate() + 1);
    }

    return next.toISOString();
  }

  isRunning(id: string): boolean {
    return this.jobs.has(id);
  }

  stopAll(): void {
    for (const [id, job] of this.jobs.entries()) {
      job.stop();
      console.log(`[Scheduler] Stopped ${id}`);
    }
    this.jobs.clear();

    for (const [id, entry] of this.schedules.entries()) {
      entry.enabled = false;
      entry.nextRun = undefined;
    }
  }
}

export const scheduler = new WorkflowScheduler();

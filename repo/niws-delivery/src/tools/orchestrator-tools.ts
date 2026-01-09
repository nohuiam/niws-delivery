import { stateManager } from '../orchestrator/stateManager.js';
import { overnightWorkflow } from '../orchestrator/overnight.js';
import { morningPollWorkflow } from '../orchestrator/morningPoll.js';
import { scheduler } from '../orchestrator/scheduler.js';
import { notifications } from '../services/notifications.js';

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

// Tool: start_overnight_run
export async function startOvernightRun(): Promise<ToolResult> {
  try {
    const currentRun = stateManager.getCurrentRun();
    if (currentRun && currentRun.status === 'running') {
      return error('A workflow is already running');
    }

    // Start async - don't await
    overnightWorkflow.run().then(result => {
      notifications.notifyWorkflowComplete('Overnight', result.success);
    }).catch(err => {
      notifications.notifyError('Overnight Workflow', err.message);
    });

    const run = stateManager.getCurrentRun();

    return success({
      status: 'started',
      runId: run?.id,
      workflowType: 'overnight',
      startedAt: run?.startedAt
    });
  } catch (err) {
    return error(`Failed to start overnight run: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// Tool: start_morning_poll
export async function startMorningPoll(): Promise<ToolResult> {
  try {
    const currentRun = stateManager.getCurrentRun();
    if (currentRun && currentRun.status === 'running') {
      return error('A workflow is already running');
    }

    // Start async - don't await
    morningPollWorkflow.run().then(result => {
      notifications.notifyWorkflowComplete('Morning Poll', result.success);
    }).catch(err => {
      notifications.notifyError('Morning Poll Workflow', err.message);
    });

    const run = stateManager.getCurrentRun();

    return success({
      status: 'started',
      runId: run?.id,
      workflowType: 'morning',
      startedAt: run?.startedAt
    });
  } catch (err) {
    return error(`Failed to start morning poll: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// Tool: get_workflow_status
export async function getWorkflowStatus(): Promise<ToolResult> {
  try {
    const currentRun = stateManager.getCurrentRun();

    if (!currentRun) {
      return success({
        status: 'idle',
        message: 'No workflow currently running'
      });
    }

    return success({
      runId: currentRun.id,
      status: currentRun.status,
      workflowType: currentRun.workflowType,
      currentStep: currentRun.currentStep,
      startedAt: currentRun.startedAt,
      logCount: currentRun.logs.length,
      recentLogs: currentRun.logs.slice(-5)
    });
  } catch (err) {
    return error(`Failed to get workflow status: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// Tool: pause_workflow
export async function pauseWorkflow(): Promise<ToolResult> {
  try {
    const paused = stateManager.pause();

    if (paused) {
      return success({
        status: 'paused',
        message: 'Workflow paused successfully'
      });
    } else {
      return error('No running workflow to pause');
    }
  } catch (err) {
    return error(`Failed to pause workflow: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// Tool: resume_workflow
export async function resumeWorkflow(): Promise<ToolResult> {
  try {
    const resumed = stateManager.resume();

    if (resumed) {
      return success({
        status: 'resumed',
        message: 'Workflow resumed successfully'
      });
    } else {
      return error('No paused workflow to resume');
    }
  } catch (err) {
    return error(`Failed to resume workflow: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// Tool: cancel_workflow
export async function cancelWorkflow(): Promise<ToolResult> {
  try {
    const cancelled = stateManager.cancel();

    if (cancelled) {
      return success({
        status: 'cancelled',
        message: 'Workflow cancelled successfully'
      });
    } else {
      return error('No active workflow to cancel');
    }
  } catch (err) {
    return error(`Failed to cancel workflow: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// Tool: schedule_workflow
export async function scheduleWorkflow(args: {
  workflowType: 'overnight' | 'morning' | 'hourly_poll';
  cronExpr: string;
}): Promise<ToolResult> {
  try {
    const result = scheduler.updateSchedule(args.workflowType, {
      cronExpr: args.cronExpr,
      enabled: true
    });

    if (result) {
      return success({
        status: 'scheduled',
        id: result.id,
        cronExpr: result.cronExpr,
        nextRun: result.nextRun
      });
    } else {
      return error(`Unknown workflow type: ${args.workflowType}`);
    }
  } catch (err) {
    return error(`Failed to schedule workflow: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// Tool: get_schedule
export async function getSchedule(): Promise<ToolResult> {
  try {
    const schedules = scheduler.getSchedules();

    return success({
      count: schedules.length,
      schedules
    });
  } catch (err) {
    return error(`Failed to get schedule: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// Tool: update_schedule
export async function updateSchedule(args: {
  id: string;
  cronExpr?: string;
  enabled?: boolean;
}): Promise<ToolResult> {
  try {
    const result = scheduler.updateSchedule(args.id, {
      cronExpr: args.cronExpr,
      enabled: args.enabled
    });

    if (result) {
      return success({
        status: 'updated',
        schedule: result
      });
    } else {
      return error(`Schedule not found: ${args.id}`);
    }
  } catch (err) {
    return error(`Failed to update schedule: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// Tool: get_workflow_logs
export async function getWorkflowLogs(args: { limit?: number }): Promise<ToolResult> {
  try {
    const currentRun = stateManager.getCurrentRun();
    const logs = currentRun?.logs || [];
    const limited = args.limit ? logs.slice(-args.limit) : logs;

    return success({
      count: logs.length,
      returned: limited.length,
      logs: limited
    });
  } catch (err) {
    return error(`Failed to get workflow logs: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// Tool: get_workflow_metrics
export async function getWorkflowMetrics(): Promise<ToolResult> {
  try {
    const metrics = stateManager.getMetrics();

    return success(metrics);
  } catch (err) {
    return error(`Failed to get workflow metrics: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// Tool: notify_completion
export async function notifyCompletion(args: {
  title: string;
  message: string;
  success?: boolean;
}): Promise<ToolResult> {
  try {
    await notifications.sendDesktopNotification({
      title: args.title,
      message: args.message,
      sound: true
    });

    return success({
      status: 'sent',
      title: args.title,
      message: args.message
    });
  } catch (err) {
    return error(`Failed to send notification: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// Tool: get_pending_actions
export async function getPendingActions(): Promise<ToolResult> {
  try {
    const actions = stateManager.getPendingActions();

    return success({
      count: actions.length,
      actions
    });
  } catch (err) {
    return error(`Failed to get pending actions: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// Tool: approve_action
export async function approveAction(args: { actionId: string }): Promise<ToolResult> {
  try {
    const approved = stateManager.approveAction(args.actionId);

    if (approved) {
      return success({
        status: 'approved',
        actionId: args.actionId
      });
    } else {
      return error(`Action not found: ${args.actionId}`);
    }
  } catch (err) {
    return error(`Failed to approve action: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// Tool: reject_action
export async function rejectAction(args: { actionId: string }): Promise<ToolResult> {
  try {
    const rejected = stateManager.rejectAction(args.actionId);

    if (rejected) {
      return success({
        status: 'rejected',
        actionId: args.actionId
      });
    } else {
      return error(`Action not found: ${args.actionId}`);
    }
  } catch (err) {
    return error(`Failed to reject action: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// Tool: get_workflow_history
export async function getWorkflowHistory(args: { limit?: number }): Promise<ToolResult> {
  try {
    const history = stateManager.getHistory(args.limit);

    return success({
      count: history.length,
      runs: history.map(run => ({
        id: run.id,
        workflowType: run.workflowType,
        status: run.status,
        startedAt: run.startedAt,
        completedAt: run.completedAt,
        stepCount: run.logs.length
      }))
    });
  } catch (err) {
    return error(`Failed to get workflow history: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// Export tool definitions
export const orchestratorToolDefinitions = [
  {
    name: 'start_overnight_run',
    description: 'Start the overnight automation workflow',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'start_morning_poll',
    description: 'Start the morning poll workflow',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'get_workflow_status',
    description: 'Get current workflow status',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'pause_workflow',
    description: 'Pause the currently running workflow',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'resume_workflow',
    description: 'Resume a paused workflow',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'cancel_workflow',
    description: 'Cancel the current workflow',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'schedule_workflow',
    description: 'Schedule a workflow to run on a cron schedule',
    inputSchema: {
      type: 'object',
      properties: {
        workflowType: { type: 'string', enum: ['overnight', 'morning', 'hourly_poll'] },
        cronExpr: { type: 'string', description: 'Cron expression (e.g., "0 2 * * *" for 2 AM daily)' }
      },
      required: ['workflowType', 'cronExpr']
    }
  },
  {
    name: 'get_schedule',
    description: 'Get all scheduled workflows',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'update_schedule',
    description: 'Update a workflow schedule',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Schedule ID' },
        cronExpr: { type: 'string', description: 'New cron expression' },
        enabled: { type: 'boolean', description: 'Enable/disable schedule' }
      },
      required: ['id']
    }
  },
  {
    name: 'get_workflow_logs',
    description: 'Get workflow execution logs',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max number of log entries' }
      }
    }
  },
  {
    name: 'get_workflow_metrics',
    description: 'Get workflow performance metrics',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'notify_completion',
    description: 'Send a notification',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        message: { type: 'string' },
        success: { type: 'boolean' }
      },
      required: ['title', 'message']
    }
  },
  {
    name: 'get_pending_actions',
    description: 'Get list of pending actions requiring attention',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'approve_action',
    description: 'Approve a pending action',
    inputSchema: {
      type: 'object',
      properties: {
        actionId: { type: 'string' }
      },
      required: ['actionId']
    }
  },
  {
    name: 'reject_action',
    description: 'Reject a pending action',
    inputSchema: {
      type: 'object',
      properties: {
        actionId: { type: 'string' }
      },
      required: ['actionId']
    }
  },
  {
    name: 'get_workflow_history',
    description: 'Get historical workflow runs',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max number of runs to return' }
      }
    }
  }
];

export const orchestratorToolHandlers: Record<string, (args: unknown) => Promise<ToolResult>> = {
  start_overnight_run: () => startOvernightRun(),
  start_morning_poll: () => startMorningPoll(),
  get_workflow_status: () => getWorkflowStatus(),
  pause_workflow: () => pauseWorkflow(),
  resume_workflow: () => resumeWorkflow(),
  cancel_workflow: () => cancelWorkflow(),
  schedule_workflow: (args) => scheduleWorkflow(args as { workflowType: 'overnight' | 'morning' | 'hourly_poll'; cronExpr: string }),
  get_schedule: () => getSchedule(),
  update_schedule: (args) => updateSchedule(args as { id: string; cronExpr?: string; enabled?: boolean }),
  get_workflow_logs: (args) => getWorkflowLogs(args as { limit?: number }),
  get_workflow_metrics: () => getWorkflowMetrics(),
  notify_completion: (args) => notifyCompletion(args as { title: string; message: string; success?: boolean }),
  get_pending_actions: () => getPendingActions(),
  approve_action: (args) => approveAction(args as { actionId: string }),
  reject_action: (args) => rejectAction(args as { actionId: string }),
  get_workflow_history: (args) => getWorkflowHistory(args as { limit?: number })
};

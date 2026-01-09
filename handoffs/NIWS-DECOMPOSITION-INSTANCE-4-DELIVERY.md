# NIWS Decomposition Instance 4: niws-delivery

**Server:** niws-delivery
**Role:** Export, Notion integration, video production, workflow orchestration
**Estimated Effort:** 7-8 hours

---

## Quick Reference

| Attribute | Value |
|-----------|-------|
| Tools | 48 |
| LOC (estimated) | ~5,000 |
| Ports | MCP: stdio, UDP: 3036, HTTP: 8036, WS: 9036 |
| Databases | None (calls other servers) |
| Dependencies | niws-intake:8033, niws-analysis:8034, niws-production:8035 |
| Consumers | None (end of pipeline) |
| External Services | Notion API, macOS AirDrop, FFmpeg |

---

## Coordination Document

**READ FIRST:** `/handoffs/NIWS-DECOMPOSITION-CONTRACTS.md`

Contains shared types, API contracts, and testing requirements.

---

## Source Files to Extract

From `/repo/niws-server/src/`:

```
notion/
├── notionClient.ts         → src/services/notionClient.ts
├── notionTools.ts          → src/tools/notion-tools.ts
├── storyPusher.ts          → src/services/storyPusher.ts
├── approvalPoller.ts       → src/services/approvalPoller.ts
└── index.ts                → merge into src/index.ts

teleprompter/
├── tools.ts                → src/tools/teleprompter-tools.ts
├── formatter.ts            → src/services/teleprompterFormatter.ts
├── exporters/
│   ├── rtf.ts              → src/exporters/rtf.ts
│   ├── html.ts             → src/exporters/html.ts
│   └── plainText.ts        → src/exporters/plainText.ts
└── transfer/
    ├── airdrop.ts          → src/services/airdrop.ts
    └── cleanup.ts          → src/services/cleanup.ts

video/
├── videoTools.ts           → src/tools/video-tools.ts
├── videoConfig.ts          → src/config/videoConfig.ts
├── videoOrchestrator.ts    → src/services/videoOrchestrator.ts
├── chromaKey.ts            → src/video/chromaKey.ts
├── motionGraphics.ts       → src/video/motionGraphics.ts
├── pipCompositor.ts        → src/video/pipCompositor.ts
├── multiPlatformExport.ts  → src/video/multiPlatformExport.ts
└── scrollCapture.ts        → src/video/scrollCapture.ts

orchestrator/
├── overnight.ts            → src/orchestrator/overnight.ts
├── morningPoll.ts          → src/orchestrator/morningPoll.ts
├── scheduler.ts            → src/orchestrator/scheduler.ts
├── orchestratorTools.ts    → src/tools/orchestrator-tools.ts
├── notifications.ts        → src/services/notifications.ts
├── stateManager.ts         → src/orchestrator/stateManager.ts
└── index.ts                → merge into src/index.ts
```

---

## MCP Tools (48)

### Notion Tools (12)

| Tool | Description | Priority |
|------|-------------|----------|
| `notion_push_story` | Push story to Notion database | HIGH |
| `notion_poll_approvals` | Check approval status | HIGH |
| `notion_mark_story_sent` | Mark story as exported | HIGH |
| `notion_get_approved_stories` | Get approved stories | HIGH |
| `notion_create_page` | Create Notion page | MEDIUM |
| `notion_update_page` | Update existing page | MEDIUM |
| `notion_archive_page` | Archive page | LOW |
| `notion_get_database` | Get database contents | MEDIUM |
| `notion_sync_status` | Sync status check | MEDIUM |
| `notion_get_comments` | Get page comments | LOW |
| `notion_add_comment` | Add comment | LOW |
| `notion_get_workflow_state` | Workflow state | MEDIUM |

### Teleprompter Tools (6)

| Tool | Description | Priority |
|------|-------------|----------|
| `export_teleprompter` | Export to teleprompter format | HIGH |
| `airdrop_to_ipad` | AirDrop to iPad | HIGH |
| `batch_export_and_transfer` | Batch export + transfer | HIGH |
| `cleanup_exports` | Clean up temp files | MEDIUM |
| `export_rtf` | RTF format export | MEDIUM |
| `export_html` | HTML format export | MEDIUM |

### Video Tools (14)

| Tool | Description | Priority |
|------|-------------|----------|
| `build_video_background` | Generate background | HIGH |
| `composite_final_video` | Final composition | HIGH |
| `export_all_platforms` | Multi-platform export | HIGH |
| `run_video_pipeline` | Full pipeline execution | HIGH |
| `apply_chroma_key` | Green screen processing | MEDIUM |
| `add_motion_graphics` | Motion graphics overlay | MEDIUM |
| `create_pip_composite` | Picture-in-picture | MEDIUM |
| `capture_scroll` | Scroll capture | MEDIUM |
| `encode_video` | Video encoding | HIGH |
| `preview_video` | Generate preview | MEDIUM |
| `get_video_status` | Pipeline status | MEDIUM |
| `cancel_video_job` | Cancel processing | MEDIUM |
| `get_video_assets` | List assets | LOW |
| `cleanup_video_temp` | Clean temp files | LOW |

### Orchestrator Tools (16)

| Tool | Description | Priority |
|------|-------------|----------|
| `start_overnight_run` | Start overnight automation | HIGH |
| `start_morning_poll` | Start morning poll | HIGH |
| `get_workflow_status` | Current workflow status | HIGH |
| `pause_workflow` | Pause execution | HIGH |
| `resume_workflow` | Resume execution | HIGH |
| `cancel_workflow` | Cancel current run | HIGH |
| `schedule_workflow` | Schedule future run | MEDIUM |
| `get_schedule` | View schedule | MEDIUM |
| `update_schedule` | Modify schedule | MEDIUM |
| `get_workflow_logs` | Execution logs | MEDIUM |
| `get_workflow_metrics` | Performance metrics | LOW |
| `notify_completion` | Send notifications | MEDIUM |
| `get_pending_actions` | List pending actions | MEDIUM |
| `approve_action` | Approve pending action | MEDIUM |
| `reject_action` | Reject pending action | MEDIUM |
| `get_workflow_history` | Historical runs | LOW |

---

## HTTP API Endpoints

Implement these endpoints (see contracts doc for details):

```typescript
// GET /api/health
// POST /api/export/teleprompter
// POST /api/export/notion
// POST /api/export/airdrop
// POST /api/video/build
// GET /api/video/status/:jobId
// POST /api/workflow/start
// GET /api/workflow/status
// POST /api/workflow/pause
// POST /api/workflow/resume
// GET /api/workflow/schedule
// PUT /api/workflow/schedule
```

---

## Key Implementation Notes

### 1. Notion Integration

```typescript
// src/services/notionClient.ts
import { Client } from '@notionhq/client';

export class NotionClient {
  private client: Client;
  private databaseId: string;

  constructor() {
    this.client = new Client({ auth: process.env.NOTION_TOKEN });
    this.databaseId = process.env.NOTION_DATABASE_ID!;
  }

  async pushStory(story: Story, brief: StoryBrief, script?: Script): Promise<NotionPage> {
    const page = await this.client.pages.create({
      parent: { database_id: this.databaseId },
      properties: {
        'Title': { title: [{ text: { content: story.title } }] },
        'Status': { select: { name: 'Ready for Review' } },
        'Track': { select: { name: story.track } },
        'Christ-Oh-Meter': { number: brief.christOhMeterScore },
        'Created': { date: { start: new Date().toISOString() } }
      },
      children: this.buildPageContent(story, brief, script)
    });

    return page;
  }

  async pollApprovals(): Promise<ApprovedStory[]> {
    const response = await this.client.databases.query({
      database_id: this.databaseId,
      filter: {
        property: 'Status',
        select: { equals: 'Approved' }
      }
    });

    return response.results.map(this.parseApprovedStory);
  }
}
```

### 2. Teleprompter Export

```typescript
// src/services/teleprompterFormatter.ts
export class TeleprompterFormatter {
  format(script: Script, options: FormatOptions): string {
    const sections = script.sections.sort((a, b) => a.position - b.position);

    let output = '';
    for (const section of sections) {
      output += this.formatSection(section, options);
    }

    return output;
  }

  private formatSection(section: ScriptSection, options: FormatOptions): string {
    const header = `=== ${section.sectionType.toUpperCase()} ===\n\n`;
    const content = this.applyTeleprompterFormatting(section.content, options);
    return header + content + '\n\n';
  }

  private applyTeleprompterFormatting(text: string, options: FormatOptions): string {
    // Large font, high contrast, line breaks for pacing
    return text
      .split('. ')
      .join('.\n\n')  // Break on sentences
      .toUpperCase(); // Easier to read on teleprompter
  }
}

// src/exporters/rtf.ts
export function exportToRTF(content: string): string {
  return `{\\rtf1\\ansi\\deff0
{\\fonttbl{\\f0 Arial;}}
{\\colortbl;\\red0\\green0\\blue0;}
\\f0\\fs48
${content.replace(/\n/g, '\\par ')}
}`;
}
```

### 3. AirDrop Transfer (macOS)

```typescript
// src/services/airdrop.ts
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class AirDropService {
  async sendToDevice(filePath: string, deviceName?: string): Promise<AirDropResult> {
    // Use macOS Finder's AirDrop via AppleScript
    const script = `
tell application "Finder"
  set theFile to POSIX file "${filePath}" as alias
  set theShare to make new sharing session
  set target of theShare to "${deviceName || 'iPad'}"
  add theFile to theShare
  start theShare
end tell
`;

    try {
      await execAsync(`osascript -e '${script}'`);
      return { success: true, device: deviceName || 'iPad' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}
```

### 4. Video Pipeline (FFmpeg)

```typescript
// src/services/videoOrchestrator.ts
import ffmpeg from 'fluent-ffmpeg';

export class VideoOrchestrator {
  private jobs: Map<string, VideoJob> = new Map();

  async runPipeline(options: VideoPipelineOptions): Promise<string> {
    const jobId = `video_${Date.now()}`;
    const job: VideoJob = {
      id: jobId,
      status: 'queued',
      scriptId: options.scriptId,
      platforms: options.platforms,
      createdAt: new Date().toISOString()
    };

    this.jobs.set(jobId, job);

    // Run async pipeline
    this.executePipeline(job, options).catch(err => {
      job.status = 'failed';
      job.error = err.message;
    });

    return jobId;
  }

  private async executePipeline(job: VideoJob, options: VideoPipelineOptions): Promise<void> {
    job.status = 'processing';

    // 1. Generate background
    const background = await this.buildBackground(options);

    // 2. Apply chroma key if needed
    if (options.chromaKeySource) {
      await this.applyChromaKey(options.chromaKeySource, background);
    }

    // 3. Add motion graphics
    if (options.motionGraphics) {
      await this.addMotionGraphics(background, options.motionGraphics);
    }

    // 4. Composite final video
    const composite = await this.compositeVideo(background, options);

    // 5. Export to all platforms
    for (const platform of options.platforms) {
      await this.exportForPlatform(composite, platform);
    }

    job.status = 'complete';
    job.completedAt = new Date().toISOString();
  }
}

// src/video/multiPlatformExport.ts
export const PLATFORM_SPECS = {
  youtube: { width: 1920, height: 1080, fps: 30, codec: 'h264', bitrate: '8M' },
  tiktok: { width: 1080, height: 1920, fps: 30, codec: 'h264', bitrate: '6M' },
  instagram: { width: 1080, height: 1080, fps: 30, codec: 'h264', bitrate: '5M' },
  twitter: { width: 1280, height: 720, fps: 30, codec: 'h264', bitrate: '4M' }
};
```

### 5. Workflow Orchestrator

```typescript
// src/orchestrator/overnight.ts
export class OvernightWorkflow {
  private state: WorkflowState;

  async run(): Promise<WorkflowResult> {
    this.state = { status: 'running', currentStep: 'init', startedAt: new Date().toISOString() };

    try {
      // Step 1: Poll all feeds
      await this.executeStep('poll_feeds', async () => {
        await this.intakeClient.post('/api/poll-all');
      });

      // Step 2: Cluster stories
      await this.executeStep('cluster_stories', async () => {
        await this.intakeClient.post('/api/cluster');
      });

      // Step 3: Analyze new stories
      await this.executeStep('analyze_stories', async () => {
        const stories = await this.intakeClient.get('/api/stories?since=24h');
        for (const story of stories) {
          await this.analysisClient.post('/api/compare', { storyId: story.id });
        }
      });

      // Step 4: Generate briefs
      await this.executeStep('generate_briefs', async () => {
        const stories = await this.getUnbriefedStories();
        for (const story of stories) {
          await this.productionClient.post('/api/briefs/create', { storyId: story.id });
        }
      });

      // Step 5: Push to Notion for review
      await this.executeStep('push_notion', async () => {
        const briefs = await this.productionClient.get('/api/briefs?status=ready');
        for (const brief of briefs) {
          await this.notionClient.pushStory(brief);
        }
      });

      this.state.status = 'complete';
      return { success: true, steps: this.state.logs };
    } catch (error) {
      this.state.status = 'failed';
      throw error;
    }
  }

  private async executeStep(name: string, fn: () => Promise<void>): Promise<void> {
    if (this.state.status === 'paused') {
      await this.waitForResume();
    }

    this.state.currentStep = name;
    this.log('info', `Starting step: ${name}`);

    const start = Date.now();
    await fn();
    const duration = Date.now() - start;

    this.log('info', `Completed step: ${name} (${duration}ms)`);
  }
}
```

### 6. Scheduler (node-cron)

```typescript
// src/orchestrator/scheduler.ts
import cron from 'node-cron';

export class WorkflowScheduler {
  private jobs: Map<string, cron.ScheduledTask> = new Map();

  schedule(id: string, cronExpr: string, workflow: () => Promise<void>): void {
    const task = cron.schedule(cronExpr, async () => {
      console.log(`Running scheduled workflow: ${id}`);
      await workflow();
    });

    this.jobs.set(id, task);
  }

  // Default schedules
  initializeDefaults(): void {
    // Overnight run at 2 AM
    this.schedule('overnight', '0 2 * * *', () => new OvernightWorkflow().run());

    // Morning poll at 6 AM
    this.schedule('morning', '0 6 * * *', () => new MorningPollWorkflow().run());

    // Poll feeds every hour
    this.schedule('hourly_poll', '0 * * * *', () => this.intakeClient.post('/api/poll-all'));
  }
}
```

---

## Testing Requirements

### Unit Tests

```typescript
// tests/notionClient.test.ts
describe('NotionClient', () => {
  it('should push story with correct properties');
  it('should poll approvals and parse results');
  it('should handle Notion API errors');
});

// tests/videoOrchestrator.test.ts
describe('VideoOrchestrator', () => {
  it('should create job and return ID');
  it('should update job status during pipeline');
  it('should export to all requested platforms');
});

// tests/overnight.test.ts
describe('OvernightWorkflow', () => {
  it('should execute all steps in order');
  it('should pause when requested');
  it('should resume from paused state');
  it('should handle step failures gracefully');
});
```

### Integration Tests

```typescript
// tests/http.test.ts
describe('HTTP API', () => {
  it('POST /api/export/teleprompter creates export');
  it('POST /api/workflow/start begins workflow');
  it('GET /api/workflow/status returns current state');
});
```

---

## Step-by-Step Instructions

### Phase 1: Setup (30 min)

```bash
mkdir -p /repo/niws-delivery/{src,config,data,tests}
cd /repo/niws-delivery
npm init -y
npm install @modelcontextprotocol/sdk @notionhq/client fluent-ffmpeg node-cron uuid winston
npm install -D typescript @types/node @types/fluent-ffmpeg vitest msw
```

### Phase 2: Service Clients (45 min)

1. Create `src/services/clients.ts` (intake, analysis, production clients)
2. Test connectivity to other servers (or use mocks)

### Phase 3: Notion Integration (1 hr)

1. Create `src/services/notionClient.ts`
2. Create `src/services/storyPusher.ts`
3. Create `src/services/approvalPoller.ts`
4. Create `src/tools/notion-tools.ts` (12 tools)

### Phase 4: Teleprompter Export (45 min)

1. Create `src/services/teleprompterFormatter.ts`
2. Create `src/exporters/rtf.ts`, `html.ts`, `plainText.ts`
3. Create `src/services/airdrop.ts`
4. Create `src/tools/teleprompter-tools.ts` (6 tools)

### Phase 5: Video Pipeline (1.5 hr)

1. Create `src/config/videoConfig.ts`
2. Create `src/services/videoOrchestrator.ts`
3. Create `src/video/chromaKey.ts`, `motionGraphics.ts`, `pipCompositor.ts`
4. Create `src/video/multiPlatformExport.ts`
5. Create `src/tools/video-tools.ts` (14 tools)

### Phase 6: Orchestrator (1.5 hr)

1. Create `src/orchestrator/stateManager.ts`
2. Create `src/orchestrator/overnight.ts`
3. Create `src/orchestrator/morningPoll.ts`
4. Create `src/orchestrator/scheduler.ts`
5. Create `src/services/notifications.ts`
6. Create `src/tools/orchestrator-tools.ts` (16 tools)

### Phase 7: HTTP Layer & Index (1 hr)

1. Create `src/http/server.ts`
2. Create `src/index.ts` with all 48 tools
3. Implement all endpoints from contracts
4. Write HTTP tests

### Phase 8: InterLock & Finalize (30 min)

1. Create `config/interlock.json`
2. Create `src/interlock/` module
3. Create `src/websocket/server.ts`
4. Final integration test

---

## Completion Checklist

- [ ] All 48 MCP tools implemented and working
- [ ] HTTP endpoints responding per contracts doc
- [ ] Notion integration working (push, poll, approve)
- [ ] Teleprompter export working (RTF, HTML, TXT)
- [ ] AirDrop transfer working
- [ ] Video pipeline working (FFmpeg)
- [ ] Overnight workflow working
- [ ] Morning poll workflow working
- [ ] Scheduler running cron jobs
- [ ] Clients calling intake:8033, analysis:8034, production:8035
- [ ] WebSocket events for workflow/video status
- [ ] InterLock mesh connected
- [ ] Tests passing (target: 35+ tests)
- [ ] LINUS-FINDINGS.md created

---

## Dependencies on Other Instances

| Instance | Server | What We Call | Why |
|----------|--------|--------------|-----|
| 1 | niws-intake:8033 | GET /api/stories | List stories for processing |
| 1 | niws-intake:8033 | GET /api/articles | Get articles for export |
| 2 | niws-analysis:8034 | GET /api/analyses/story/:id | Get analyses for context |
| 3 | niws-production:8035 | GET /api/scripts/:id | Get script for export |
| 3 | niws-production:8035 | GET /api/briefs/:id | Get brief for Notion |

**Mock ALL of these during development. This instance depends on all others.**

---

## Other Instances Depend On This

**None** - niws-delivery is the end of the pipeline.

---

## Environment Variables

```bash
NOTION_TOKEN=secret_...
NOTION_DATABASE_ID=...
NIWS_INTAKE_URL=http://localhost:8033
NIWS_ANALYSIS_URL=http://localhost:8034
NIWS_PRODUCTION_URL=http://localhost:8035
FFMPEG_PATH=/usr/local/bin/ffmpeg
```

---

## External Dependencies

| Dependency | Required | Purpose |
|------------|----------|---------|
| FFmpeg | Yes | Video encoding/processing |
| Notion API | Yes | Publishing workflow |
| macOS | No | AirDrop (graceful fallback) |

---

## References

- **Contracts:** `/handoffs/NIWS-DECOMPOSITION-CONTRACTS.md`
- **Original Code:** `/repo/niws-server/src/notion/`, `teleprompter/`, `video/`, `orchestrator/`
- **Skill:** `/repo/claude-skills/niws-decomposition.skill.md`

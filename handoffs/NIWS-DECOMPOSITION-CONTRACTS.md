# NIWS Decomposition: Master Coordination Document

**Created:** 2026-01-09
**Purpose:** Shared API contracts for parallel decomposition instances
**Reference:** `/repo/claude-skills/niws-decomposition.skill.md`

---

## Overview

The niws-server monolith (25,902 LOC, 118 tools) is being decomposed into 5 specialized servers by 5 parallel Claude instances. This document defines the shared contracts that all instances must implement.

---

## Server Registry

| Server | Instance | Ports | Database | Tools |
|--------|----------|-------|----------|-------|
| niws-intake | 1 | MCP:stdio, UDP:3033, HTTP:8033, WS:9033 | articles.sqlite, outlets.sqlite | 31 |
| niws-analysis | 2 | MCP:stdio, UDP:3034, HTTP:8034, WS:9034 | analyses.sqlite | 11 |
| niws-production | 3 | MCP:stdio, UDP:3035, HTTP:8035, WS:9035 | scripts.sqlite, briefs.sqlite | 28 |
| niws-delivery | 4 | MCP:stdio, UDP:3036, HTTP:8036, WS:9036 | none (calls others) | 48 |
| research-bus | existing | MCP:stdio, HTTP:8015 | research-bus.db | 9 |

---

## Shared Data Types

All servers must use these TypeScript interfaces for inter-server communication:

```typescript
// === OUTLETS & ARTICLES (niws-intake) ===

interface Outlet {
  id: string;
  name: string;
  domain: string;
  politicalLean: 'left' | 'left-center' | 'center' | 'right-center' | 'right';
  biasRating: number;        // 0-1
  factualReporting: string;  // 'high' | 'mixed' | 'low'
  createdAt: string;         // ISO timestamp
}

interface Article {
  id: string;
  outletId: string;
  feedId: string;
  title: string;
  url: string;
  content: string;
  publishedAt: string;
  fetchedAt: string;
  contentHash: string;
  storyId?: string;          // Cluster assignment
}

interface Story {
  id: string;
  title: string;
  track: string;             // Topic track
  articleIds: string[];
  createdAt: string;
  updatedAt: string;
}

// === ANALYSES (niws-analysis) ===

interface ArticleAnalysis {
  id: string;
  articleId: string;
  analysisType: 'bias' | 'framing' | 'neutral';
  result: BiasResult;
  confidence: number;
  processingTimeMs: number;
  createdAt: string;
  modelUsed: string;
}

interface BiasResult {
  biasScore: number;         // -1 (left) to 1 (right)
  framingIndicators: string[];
  loadedLanguage: string[];
  neutralAlternatives: Record<string, string>;
  summary: string;
}

interface ComparativeAnalysis {
  id: string;
  storyId: string;
  articleIds: string[];
  framingDifferences: FramingDifference[];
  overallAssessment: string;
  createdAt: string;
}

interface FramingDifference {
  topic: string;
  leftFraming: string;
  rightFraming: string;
  neutralFraming: string;
}

// === SCRIPTS & BRIEFS (niws-production) ===

interface Script {
  id: string;
  storyId: string;
  briefId: string;
  title: string;
  status: 'draft' | 'review' | 'approved' | 'archived';
  content: string;
  sections: ScriptSection[];
  createdAt: string;
  updatedAt: string;
}

interface ScriptSection {
  id: string;
  scriptId: string;
  sectionType: 'intro' | 'story' | 'opinion' | 'transition' | 'close';
  content: string;
  position: number;
  wordCount: number;
}

interface StoryBrief {
  id: string;
  storyId: string;
  title: string;
  summary: string;
  keyFacts: string[];
  perspectives: OutletPerspective[];
  christOhMeterScore: number;  // 0-10
  moralAlignment: string;
  createdAt: string;
}

interface OutletPerspective {
  outletId: string;
  outletName: string;
  perspective: string;
  quotes: Quote[];
}

interface Quote {
  text: string;
  attribution: string;
  context: string;
}

// === DELIVERY (niws-delivery) ===

interface ExportResult {
  id: string;
  scriptId: string;
  format: 'rtf' | 'html' | 'txt' | 'notion';
  filePath?: string;
  notionPageId?: string;
  createdAt: string;
}

interface VideoJob {
  id: string;
  scriptId: string;
  status: 'queued' | 'processing' | 'complete' | 'failed';
  outputPath?: string;
  platforms: string[];        // 'youtube', 'tiktok', etc.
  createdAt: string;
  completedAt?: string;
}

interface WorkflowRun {
  id: string;
  workflowType: 'overnight' | 'morning';
  status: 'running' | 'paused' | 'complete' | 'failed';
  currentStep: string;
  startedAt: string;
  completedAt?: string;
  logs: WorkflowLog[];
}

interface WorkflowLog {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  data?: any;
}
```

---

## HTTP API Contracts

### niws-intake:8033

**Exposes (other servers call these):**

```
GET /api/health
  Response: { status: 'ok', timestamp: string }

GET /api/outlets
  Query: ?lean=left|center|right&limit=50&offset=0
  Response: { outlets: Outlet[], total: number }

GET /api/outlets/:id
  Response: Outlet

GET /api/articles
  Query: ?outletId=X&storyId=X&since=ISO&limit=50
  Response: { articles: Article[], total: number }

GET /api/articles/:id
  Response: Article

GET /api/stories
  Query: ?track=X&since=ISO&limit=50
  Response: { stories: Story[], total: number }

GET /api/stories/:id
  Response: Story

GET /api/stories/:id/articles
  Response: { articles: Article[] }
```

**Consumes:** None (source of truth for articles)

---

### niws-analysis:8034

**Exposes:**

```
GET /api/health
  Response: { status: 'ok', timestamp: string }

GET /api/analyses
  Query: ?articleId=X&storyId=X&type=bias|framing
  Response: { analyses: ArticleAnalysis[], total: number }

GET /api/analyses/:id
  Response: ArticleAnalysis

GET /api/analyses/story/:storyId
  Response: { analyses: ArticleAnalysis[], comparative: ComparativeAnalysis }

POST /api/analyze
  Body: { articleId: string, type: 'bias' | 'framing' | 'neutral' }
  Response: { analysisId: string, status: 'queued' | 'complete', result?: BiasResult }

POST /api/compare
  Body: { storyId: string, articleIds: string[] }
  Response: { comparisonId: string, differences: FramingDifference[] }
```

**Consumes:**
- `niws-intake:8033` - GET /api/articles/:id, GET /api/outlets/:id

---

### niws-production:8035

**Exposes:**

```
GET /api/health
  Response: { status: 'ok', timestamp: string }

GET /api/scripts
  Query: ?storyId=X&status=draft|approved&limit=50
  Response: { scripts: Script[], total: number }

GET /api/scripts/:id
  Response: Script

GET /api/scripts/:id/sections
  Response: { sections: ScriptSection[] }

POST /api/scripts/generate
  Body: { storyId: string, briefId?: string, options?: GenerateOptions }
  Response: { scriptId: string, status: 'generating' | 'complete' }

PUT /api/scripts/:id
  Body: { content?: string, status?: string, sections?: ScriptSection[] }
  Response: Script

GET /api/briefs
  Query: ?storyId=X&limit=50
  Response: { briefs: StoryBrief[], total: number }

GET /api/briefs/:id
  Response: StoryBrief

POST /api/briefs/create
  Body: { storyId: string }
  Response: { briefId: string, brief: StoryBrief }

POST /api/christ-oh-meter
  Body: { briefId: string } | { content: string }
  Response: { score: number, alignment: string, explanation: string }
```

**Consumes:**
- `niws-intake:8033` - GET /api/stories/:id, GET /api/articles
- `niws-analysis:8034` - GET /api/analyses/story/:storyId
- `research-bus:8015` - POST /api/research (for script research)

---

### niws-delivery:8036

**Exposes:**

```
GET /api/health
  Response: { status: 'ok', timestamp: string }

POST /api/export/teleprompter
  Body: { scriptId: string, format: 'rtf' | 'html' | 'txt' }
  Response: { exportId: string, filePath: string }

POST /api/export/notion
  Body: { scriptId: string, briefId?: string, database: string }
  Response: { exportId: string, notionPageId: string, url: string }

POST /api/export/airdrop
  Body: { filePath: string, device?: string }
  Response: { status: 'sent' | 'failed' }

POST /api/video/build
  Body: { scriptId: string, options: VideoOptions }
  Response: { jobId: string, status: 'queued' }

GET /api/video/status/:jobId
  Response: VideoJob

POST /api/workflow/start
  Body: { type: 'overnight' | 'morning' }
  Response: { runId: string, status: 'started' }

GET /api/workflow/status
  Response: WorkflowRun | null

POST /api/workflow/pause
  Response: { status: 'paused' }

POST /api/workflow/resume
  Response: { status: 'resumed' }

GET /api/workflow/schedule
  Response: { schedules: ScheduleEntry[] }

PUT /api/workflow/schedule
  Body: { schedules: ScheduleEntry[] }
  Response: { updated: boolean }
```

**Consumes:**
- `niws-intake:8033` - GET /api/stories, GET /api/articles
- `niws-analysis:8034` - GET /api/analyses/story/:storyId
- `niws-production:8035` - GET /api/scripts/:id, GET /api/briefs/:id

---

### research-bus:8015 (Existing - No Changes)

**Exposes:**

```
GET /api/health
  Response: { status: 'ok', timestamp: string }

POST /api/research
  Body: { query: string, options?: ResearchOptions }
  Response: { results: ResearchResult[], citations: Citation[] }

GET /api/budget
  Response: { remaining: number, used: number, limit: number }

GET /api/cache/stats
  Response: { entries: number, hitRate: number }
```

---

## Dependency Graph

```
                    ┌─────────────────┐
                    │  research-bus   │
                    │     :8015       │
                    └────────▲────────┘
                             │
              ┌──────────────┴──────────────┐
              │                             │
    ┌─────────┴─────────┐         ┌────────┴────────┐
    │   niws-intake     │         │ niws-production │
    │      :8033        │         │     :8035       │
    └─────────▲─────────┘         └────────▲────────┘
              │                            │
              │         ┌──────────────────┤
              │         │                  │
    ┌─────────┴─────────┴───┐    ┌────────┴────────┐
    │    niws-analysis      │    │  niws-delivery  │
    │        :8034          │    │     :8036       │
    └───────────────────────┘    └─────────────────┘
```

**Build Order (respects dependencies):**
1. niws-intake (no dependencies)
2. niws-analysis (depends on intake)
3. niws-production (depends on intake, analysis, research-bus)
4. niws-delivery (depends on all)

---

## Standard Server Structure

All new servers must follow this structure:

```
niws-{name}/
├── package.json
├── tsconfig.json
├── config/
│   └── interlock.json       # InterLock mesh config
├── data/
│   └── *.sqlite             # SQLite databases
├── src/
│   ├── index.ts             # MCP server entry
│   ├── types.ts             # Local types
│   ├── database/
│   │   └── {name}Database.ts
│   ├── tools/
│   │   └── *.ts             # MCP tool handlers
│   ├── http/
│   │   └── server.ts        # HTTP API
│   ├── websocket/
│   │   └── server.ts        # WebSocket events
│   └── interlock/
│       ├── socket.ts
│       ├── protocol.ts
│       ├── handlers.ts
│       └── tumbler.ts
└── tests/
    └── *.test.ts
```

---

## InterLock Configuration Template

Each server needs `config/interlock.json`:

```json
{
  "server": {
    "name": "niws-{name}",
    "udpPort": 30XX,
    "httpPort": 80XX,
    "wsPort": 90XX
  },
  "mesh": {
    "peers": [
      { "name": "niws-intake", "host": "localhost", "port": 3033 },
      { "name": "niws-analysis", "host": "localhost", "port": 3034 },
      { "name": "niws-production", "host": "localhost", "port": 3035 },
      { "name": "niws-delivery", "host": "localhost", "port": 3036 }
    ],
    "signals": {
      "emit": ["server:ready", "server:shutdown"],
      "receive": ["*"]
    }
  }
}
```

---

## Testing Requirements

Each server must have:

1. **Unit tests** for each tool handler
2. **Integration tests** for HTTP endpoints
3. **Mock other servers** during testing using:

```typescript
// test/mocks/intake.ts
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';

export const intakeMock = setupServer(
  http.get('http://localhost:8033/api/articles/:id', ({ params }) => {
    return HttpResponse.json({
      id: params.id,
      title: 'Mock Article',
      // ... mock data
    });
  })
);
```

---

## Instance Execution Order

Instances CAN run in parallel, but should be aware:

| Instance | Can Start Immediately | Blocked By |
|----------|----------------------|------------|
| 1 (intake) | Yes | None |
| 2 (analysis) | Yes (mock intake) | None |
| 3 (production) | Yes (mock intake, analysis) | None |
| 4 (delivery) | Yes (mock all) | None |
| 5 (integration) | No | Instances 1-4 |

---

## Completion Checklist

Each instance must verify:

- [ ] All MCP tools working via stdio
- [ ] HTTP endpoints responding correctly
- [ ] WebSocket events emitting
- [ ] InterLock mesh connected
- [ ] Database migrations complete
- [ ] Tests passing (target: 80%+ coverage)
- [ ] LINUS-FINDINGS.md created for new server

---

## References

- **Decomposition Skill:** `/repo/claude-skills/niws-decomposition.skill.md`
- **Server Framework:** `/repo/bop/MCP-SERVER-FRAMEWORK.md`
- **Port Registry:** `/repo/barespec/PORT-REGISTRY.barespec.md`
- **Original Server:** `/repo/niws-server/`

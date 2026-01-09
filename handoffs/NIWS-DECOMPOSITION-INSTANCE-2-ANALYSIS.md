# NIWS Decomposition Instance 2: niws-analysis

**Server:** niws-analysis
**Role:** Article bias analysis, framing comparison, neutral alternatives
**Estimated Effort:** 4-5 hours

---

## Quick Reference

| Attribute | Value |
|-----------|-------|
| Tools | 11 |
| LOC (estimated) | ~2,000 |
| Ports | MCP: stdio, UDP: 3034, HTTP: 8034, WS: 9034 |
| Databases | analyses.sqlite |
| Dependencies | niws-intake:8033 |
| Consumers | niws-production, niws-delivery |
| External API | Claude API (Anthropic) |

---

## Coordination Document

**READ FIRST:** `/handoffs/NIWS-DECOMPOSITION-CONTRACTS.md`

Contains shared types, API contracts, and testing requirements.

---

## Source Files to Extract

From `/repo/niws-server/src/`:

```
analysis/
├── analysisDatabase.ts  → src/database/analysisDatabase.ts
├── biasAnalyzer.ts      → src/services/biasAnalyzer.ts
├── analysisTools.ts     → src/tools/analysis-tools.ts
├── promptTemplates.ts   → src/prompts/templates.ts
├── outputValidator.ts   → src/services/outputValidator.ts
└── index.ts             → merge into src/index.ts
```

---

## MCP Tools (11)

| Tool | Description | Priority |
|------|-------------|----------|
| `analyze_article` | Individual article bias analysis | HIGH |
| `analyze_bias_language` | Detailed bias word analysis | MEDIUM |
| `compare_coverage` | Multi-outlet coverage comparison | HIGH |
| `get_framing_differences` | Extract framing differences | HIGH |
| `get_neutral_alternative` | Suggest neutral phrasing | MEDIUM |
| `get_comparative_analysis` | Full comparative report | HIGH |
| `validate_analysis_text` | QA validation | MEDIUM |
| `get_analysis_by_id` | Retrieve analysis | HIGH |
| `get_analysis_by_story` | All analyses for a story | HIGH |
| `list_pending_analyses` | Queue management | LOW |
| `retry_failed_analysis` | Retry mechanism | LOW |

---

## Database Schema

### analyses.sqlite

```sql
CREATE TABLE article_analyses (
  id TEXT PRIMARY KEY,
  article_id TEXT NOT NULL,
  analysis_type TEXT NOT NULL CHECK(analysis_type IN ('bias', 'framing', 'neutral', 'comprehensive')),
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'complete', 'failed')),
  result TEXT,                    -- JSON BiasResult
  confidence REAL,
  error_message TEXT,
  processing_time_ms INTEGER,
  model_used TEXT,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  created_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE comparative_analyses (
  id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL,
  article_ids TEXT NOT NULL,      -- JSON array
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'complete', 'failed')),
  comparison_result TEXT,         -- JSON
  framing_differences TEXT,       -- JSON FramingDifference[]
  overall_assessment TEXT,
  error_message TEXT,
  processing_time_ms INTEGER,
  created_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE bias_lexicon (
  id TEXT PRIMARY KEY,
  word TEXT UNIQUE NOT NULL,
  category TEXT NOT NULL,         -- 'loaded', 'partisan', 'emotional', 'absolutist'
  lean TEXT,                      -- 'left', 'right', 'neutral'
  severity REAL,                  -- 0-1
  alternatives TEXT,              -- JSON array of neutral alternatives
  created_at TEXT NOT NULL
);

CREATE INDEX idx_analyses_article ON article_analyses(article_id);
CREATE INDEX idx_analyses_status ON article_analyses(status);
CREATE INDEX idx_comparative_story ON comparative_analyses(story_id);
CREATE INDEX idx_lexicon_category ON bias_lexicon(category);
```

---

## HTTP API Endpoints

Implement these endpoints (see contracts doc for details):

```typescript
// GET /api/health
// GET /api/analyses
// GET /api/analyses/:id
// GET /api/analyses/story/:storyId
// POST /api/analyze
// POST /api/compare
```

---

## Key Implementation Notes

### 1. Claude API Integration

```typescript
// src/services/biasAnalyzer.ts
import Anthropic from '@anthropic-ai/sdk';

export class BiasAnalyzer {
  private client: Anthropic;

  constructor() {
    this.client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });
  }

  async analyzeArticle(article: Article, outlet: Outlet): Promise<BiasResult> {
    const prompt = this.buildAnalysisPrompt(article, outlet);

    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }]
    });

    return this.parseResponse(response);
  }
}
```

### 2. Prompt Templates

```typescript
// src/prompts/templates.ts
export const BIAS_ANALYSIS_PROMPT = `
Analyze this news article for bias. The article is from {outletName}, which has a {politicalLean} political lean.

Article Title: {title}
Article Content:
{content}

Analyze for:
1. Loaded language (emotionally charged words)
2. Framing bias (how the story is presented)
3. Source selection bias (who is quoted)
4. Omission bias (what's left out)

Provide:
- Overall bias score (-1 left to +1 right)
- List of loaded words with neutral alternatives
- Framing analysis
- Confidence level (0-1)

Format response as JSON:
{
  "biasScore": number,
  "framingIndicators": string[],
  "loadedLanguage": string[],
  "neutralAlternatives": { "original": "neutral" },
  "summary": string,
  "confidence": number
}
`;

export const COMPARATIVE_ANALYSIS_PROMPT = `
Compare how these {count} outlets covered the same story.

{articles}

Identify:
1. Key framing differences between outlets
2. Facts emphasized by each outlet
3. Facts omitted by each outlet
4. Overall narrative differences

Format response as JSON:
{
  "framingDifferences": [
    { "topic": string, "leftFraming": string, "rightFraming": string, "neutralFraming": string }
  ],
  "overallAssessment": string
}
`;
```

### 3. Output Validation

```typescript
// src/services/outputValidator.ts
import Ajv from 'ajv';

const biasResultSchema = {
  type: 'object',
  required: ['biasScore', 'framingIndicators', 'loadedLanguage', 'summary', 'confidence'],
  properties: {
    biasScore: { type: 'number', minimum: -1, maximum: 1 },
    framingIndicators: { type: 'array', items: { type: 'string' } },
    loadedLanguage: { type: 'array', items: { type: 'string' } },
    neutralAlternatives: { type: 'object' },
    summary: { type: 'string' },
    confidence: { type: 'number', minimum: 0, maximum: 1 }
  }
};

export class OutputValidator {
  private ajv = new Ajv();

  validateBiasResult(data: unknown): BiasResult {
    const valid = this.ajv.validate(biasResultSchema, data);
    if (!valid) {
      throw new Error(`Invalid bias result: ${this.ajv.errorsText()}`);
    }
    return data as BiasResult;
  }
}
```

### 4. Calling niws-intake API

```typescript
// src/services/intakeClient.ts
const INTAKE_BASE_URL = process.env.NIWS_INTAKE_URL || 'http://localhost:8033';

export class IntakeClient {
  async getArticle(articleId: string): Promise<Article> {
    const response = await fetch(`${INTAKE_BASE_URL}/api/articles/${articleId}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch article: ${response.status}`);
    }
    return response.json();
  }

  async getOutlet(outletId: string): Promise<Outlet> {
    const response = await fetch(`${INTAKE_BASE_URL}/api/outlets/${outletId}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch outlet: ${response.status}`);
    }
    return response.json();
  }
}
```

---

## Bias Lexicon Seed Data

Pre-populate `bias_lexicon` table with common loaded words:

```typescript
const SEED_LEXICON = [
  // Loaded political terms
  { word: 'radical', category: 'loaded', lean: 'right', severity: 0.7, alternatives: ['progressive', 'reform-minded'] },
  { word: 'extreme', category: 'loaded', lean: null, severity: 0.6, alternatives: ['significant', 'substantial'] },
  { word: 'regime', category: 'loaded', lean: 'right', severity: 0.8, alternatives: ['government', 'administration'] },
  { word: 'socialist', category: 'partisan', lean: 'right', severity: 0.5, alternatives: ['progressive', 'left-leaning'] },

  // Emotional amplifiers
  { word: 'slammed', category: 'emotional', lean: null, severity: 0.5, alternatives: ['criticized', 'responded to'] },
  { word: 'destroyed', category: 'emotional', lean: null, severity: 0.7, alternatives: ['refuted', 'challenged'] },
  { word: 'outrage', category: 'emotional', lean: null, severity: 0.6, alternatives: ['criticism', 'concern'] },

  // Absolutist terms
  { word: 'always', category: 'absolutist', lean: null, severity: 0.4, alternatives: ['often', 'frequently'] },
  { word: 'never', category: 'absolutist', lean: null, severity: 0.4, alternatives: ['rarely', 'seldom'] },
  { word: 'everyone', category: 'absolutist', lean: null, severity: 0.3, alternatives: ['many people', 'most'] },
];
```

---

## Testing Requirements

### Unit Tests

```typescript
// tests/analyzer.test.ts
describe('BiasAnalyzer', () => {
  it('should detect loaded language');
  it('should calculate bias score within range');
  it('should provide neutral alternatives');
  it('should handle API errors gracefully');
});

// tests/validator.test.ts
describe('OutputValidator', () => {
  it('should validate correct bias result');
  it('should reject invalid bias scores');
  it('should reject missing required fields');
});
```

### Integration Tests

```typescript
// tests/http.test.ts
describe('HTTP API', () => {
  it('POST /api/analyze queues analysis');
  it('GET /api/analyses/:id returns result');
  it('POST /api/compare requires multiple articles');
});
```

### Mock niws-intake for Testing

```typescript
// tests/mocks/intake.ts
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';

export const intakeMock = setupServer(
  http.get('http://localhost:8033/api/articles/:id', ({ params }) => {
    return HttpResponse.json({
      id: params.id,
      title: 'Test Article',
      content: 'This is test content for bias analysis.',
      outletId: 'outlet-1',
      url: 'https://example.com/article'
    });
  }),
  http.get('http://localhost:8033/api/outlets/:id', ({ params }) => {
    return HttpResponse.json({
      id: params.id,
      name: 'Test Outlet',
      politicalLean: 'center',
      biasRating: 0.5
    });
  })
);
```

---

## Step-by-Step Instructions

### Phase 1: Setup (30 min)

```bash
mkdir -p /repo/niws-analysis/{src,config,data,tests}
cd /repo/niws-analysis
npm init -y
npm install @modelcontextprotocol/sdk @anthropic-ai/sdk better-sqlite3 uuid winston ajv
npm install -D typescript @types/node @types/better-sqlite3 vitest msw
```

### Phase 2: Database Layer (45 min)

1. Create `src/database/analysisDatabase.ts`
2. Run schema migrations
3. Seed bias lexicon
4. Write database tests

### Phase 3: Services (1.5 hr)

1. Create `src/services/intakeClient.ts`
2. Create `src/prompts/templates.ts`
3. Create `src/services/biasAnalyzer.ts`
4. Create `src/services/outputValidator.ts`
5. Write service tests with mocked Claude API

### Phase 4: MCP Tools (1 hr)

1. Create `src/tools/analysis-tools.ts` (11 tools)
2. Create `src/index.ts` with tool routing
3. Write tool tests

### Phase 5: HTTP Layer (45 min)

1. Create `src/http/server.ts`
2. Implement all endpoints from contracts
3. Write HTTP tests

### Phase 6: InterLock & Finalize (30 min)

1. Create `config/interlock.json`
2. Create `src/interlock/` module
3. Create `src/websocket/server.ts`
4. Final integration test

---

## Completion Checklist

- [ ] All 11 MCP tools implemented and working
- [ ] HTTP endpoints responding per contracts doc
- [ ] Claude API integration working
- [ ] Prompt templates optimized
- [ ] Output validation in place
- [ ] Bias lexicon seeded
- [ ] IntakeClient calling niws-intake:8033
- [ ] WebSocket events for analysis completion
- [ ] InterLock mesh connected
- [ ] Tests passing (target: 20+ tests)
- [ ] LINUS-FINDINGS.md created

---

## Dependencies on Other Instances

| Instance | Server | What We Call | Why |
|----------|--------|--------------|-----|
| 1 | niws-intake:8033 | GET /api/articles/:id | Fetch article content for analysis |
| 1 | niws-intake:8033 | GET /api/outlets/:id | Get outlet political lean for context |

**Mock these during development if Instance 1 isn't ready.**

---

## Other Instances Depend On This

- **Instance 3 (production):** Calls GET /api/analyses/story/:storyId for script generation
- **Instance 4 (delivery):** Calls GET /api/analyses/story/:storyId for export context

---

## Environment Variables

```bash
ANTHROPIC_API_KEY=sk-ant-...
NIWS_INTAKE_URL=http://localhost:8033
```

---

## References

- **Contracts:** `/handoffs/NIWS-DECOMPOSITION-CONTRACTS.md`
- **Original Code:** `/repo/niws-server/src/analysis/`
- **Skill:** `/repo/claude-skills/niws-decomposition.skill.md`

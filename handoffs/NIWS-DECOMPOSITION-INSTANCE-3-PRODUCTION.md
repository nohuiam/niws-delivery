# NIWS Decomposition Instance 3: niws-production

**Server:** niws-production
**Role:** Script generation, story briefs, Christ-Oh-Meter moral ratings
**Estimated Effort:** 6-7 hours

---

## Quick Reference

| Attribute | Value |
|-----------|-------|
| Tools | 28 |
| LOC (estimated) | ~4,500 |
| Ports | MCP: stdio, UDP: 3035, HTTP: 8035, WS: 9035 |
| Databases | scripts.sqlite, briefs.sqlite |
| Dependencies | niws-intake:8033, niws-analysis:8034, research-bus:8015 |
| Consumers | niws-delivery |
| External API | Claude API (Anthropic) |

---

## Coordination Document

**READ FIRST:** `/handoffs/NIWS-DECOMPOSITION-CONTRACTS.md`

Contains shared types, API contracts, and testing requirements.

---

## Source Files to Extract

From `/repo/niws-server/src/`:

```
scripts/
├── scriptDatabase.ts       → src/database/scriptDatabase.ts
├── scriptTools.ts          → src/tools/script-tools.ts
├── scriptGenerator.ts      → src/services/scriptGenerator.ts
├── scriptValidator.ts      → src/services/scriptValidator.ts
├── copyUpgradeAnalyzer.ts  → src/services/copyUpgradeAnalyzer.ts
├── prohibitedPatterns.ts   → src/config/prohibitedPatterns.ts
└── index.ts                → merge into src/index.ts

briefs/
├── briefDatabase.ts        → src/database/briefDatabase.ts
├── briefTools.ts           → src/tools/brief-tools.ts
├── christOhMeter.ts        → src/services/christOhMeter.ts
├── briefExtractor.ts       → src/services/briefExtractor.ts
└── index.ts                → merge into src/index.ts

config/
└── niwsEditorialStandards.ts → src/config/editorialStandards.ts
```

---

## MCP Tools (28)

### Script Tools (20)

| Tool | Description | Priority |
|------|-------------|----------|
| `generate_script` | Generate show script | HIGH |
| `generate_script_from_analysis` | Script from analysis results | HIGH |
| `generate_script_outline` | Create outline only | MEDIUM |
| `validate_script` | QA validation | HIGH |
| `revise_script` | Apply revisions | HIGH |
| `check_prohibited_patterns` | Safety constraint check | HIGH |
| `analyze_script_edit` | Learn from manual edits | MEDIUM |
| `apply_learned_patterns` | Apply learned patterns | MEDIUM |
| `enhance_script_segment` | Improve specific segment | MEDIUM |
| `get_script` | Get script by ID | HIGH |
| `list_scripts` | List all scripts | HIGH |
| `get_script_sections` | Get script structure | MEDIUM |
| `update_script_section` | Update specific section | MEDIUM |
| `get_script_history` | Revision history | LOW |
| `clone_script` | Clone existing script | LOW |
| `merge_scripts` | Combine multiple scripts | LOW |
| `archive_script` | Archive completed script | MEDIUM |
| `export_script` | Export to various formats | HIGH |
| `validate_script_format` | Format validation | MEDIUM |
| `get_script_stats` | Script metrics | LOW |

### Brief Tools (8)

| Tool | Description | Priority |
|------|-------------|----------|
| `create_story_brief` | Create comprehensive brief | HIGH |
| `get_story_brief` | Retrieve brief | HIGH |
| `list_story_briefs` | List all briefs | HIGH |
| `update_brief` | Update existing brief | MEDIUM |
| `get_brief_sources` | Get source articles for brief | MEDIUM |
| `rate_christ_oh_meter` | Moral alignment scoring | HIGH |
| `compare_quotes` | Quote comparison across outlets | MEDIUM |
| `analyze_legislation` | Legislation impact analysis | MEDIUM |

---

## Database Schemas

### scripts.sqlite

```sql
CREATE TABLE scripts (
  id TEXT PRIMARY KEY,
  story_id TEXT,
  brief_id TEXT,
  title TEXT NOT NULL,
  status TEXT DEFAULT 'draft' CHECK(status IN ('draft', 'review', 'approved', 'archived')),
  content TEXT,
  word_count INTEGER,
  estimated_duration_seconds INTEGER,
  generation_params TEXT,         -- JSON
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE script_sections (
  id TEXT PRIMARY KEY,
  script_id TEXT NOT NULL REFERENCES scripts(id) ON DELETE CASCADE,
  section_type TEXT NOT NULL CHECK(section_type IN ('intro', 'story', 'analysis', 'opinion', 'transition', 'close', 'bumper')),
  content TEXT NOT NULL,
  position INTEGER NOT NULL,
  word_count INTEGER,
  notes TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE script_revisions (
  id TEXT PRIMARY KEY,
  script_id TEXT NOT NULL REFERENCES scripts(id) ON DELETE CASCADE,
  revision_number INTEGER NOT NULL,
  previous_content TEXT,
  new_content TEXT,
  diff TEXT,                      -- JSON diff
  reason TEXT,
  edited_by TEXT,                 -- 'ai', 'human'
  created_at TEXT NOT NULL
);

CREATE TABLE learned_patterns (
  id TEXT PRIMARY KEY,
  pattern_type TEXT NOT NULL,     -- 'phrase_replacement', 'structure', 'tone'
  original TEXT NOT NULL,
  replacement TEXT NOT NULL,
  frequency INTEGER DEFAULT 1,
  confidence REAL DEFAULT 0.5,
  is_active INTEGER DEFAULT 1,
  created_at TEXT NOT NULL,
  last_used_at TEXT
);

CREATE TABLE prohibited_patterns (
  id TEXT PRIMARY KEY,
  pattern TEXT NOT NULL,
  pattern_type TEXT NOT NULL,     -- 'word', 'phrase', 'regex'
  reason TEXT NOT NULL,
  severity TEXT DEFAULT 'warning' CHECK(severity IN ('warning', 'block')),
  alternatives TEXT,              -- JSON array
  is_active INTEGER DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_scripts_story ON scripts(story_id);
CREATE INDEX idx_scripts_status ON scripts(status);
CREATE INDEX idx_sections_script ON script_sections(script_id);
CREATE INDEX idx_revisions_script ON script_revisions(script_id);
```

### briefs.sqlite

```sql
CREATE TABLE story_briefs (
  id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  key_facts TEXT,                 -- JSON array
  perspectives TEXT,              -- JSON OutletPerspective[]
  christ_oh_meter_score REAL,
  moral_alignment TEXT,
  moral_explanation TEXT,
  recommendation TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE brief_sources (
  id TEXT PRIMARY KEY,
  brief_id TEXT NOT NULL REFERENCES story_briefs(id) ON DELETE CASCADE,
  article_id TEXT NOT NULL,
  outlet_id TEXT NOT NULL,
  relevance_score REAL,
  added_at TEXT NOT NULL
);

CREATE TABLE quotes (
  id TEXT PRIMARY KEY,
  brief_id TEXT NOT NULL REFERENCES story_briefs(id) ON DELETE CASCADE,
  article_id TEXT,
  outlet_id TEXT,
  outlet_name TEXT,
  quote_text TEXT NOT NULL,
  attribution TEXT,
  context TEXT,
  position INTEGER,
  is_key_quote INTEGER DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE legislation (
  id TEXT PRIMARY KEY,
  brief_id TEXT NOT NULL REFERENCES story_briefs(id) ON DELETE CASCADE,
  bill_number TEXT,
  title TEXT NOT NULL,
  summary TEXT,
  status TEXT,
  sponsors TEXT,                  -- JSON array
  impact_assessment TEXT,
  moral_implications TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_briefs_story ON story_briefs(story_id);
CREATE INDEX idx_sources_brief ON brief_sources(brief_id);
CREATE INDEX idx_quotes_brief ON quotes(brief_id);
CREATE INDEX idx_legislation_brief ON legislation(brief_id);
```

---

## HTTP API Endpoints

Implement these endpoints (see contracts doc for details):

```typescript
// GET /api/health
// GET /api/scripts
// GET /api/scripts/:id
// GET /api/scripts/:id/sections
// POST /api/scripts/generate
// PUT /api/scripts/:id
// GET /api/briefs
// GET /api/briefs/:id
// POST /api/briefs/create
// POST /api/christ-oh-meter
```

---

## Key Implementation Notes

### 1. Script Generator

```typescript
// src/services/scriptGenerator.ts
import Anthropic from '@anthropic-ai/sdk';

export class ScriptGenerator {
  private client: Anthropic;
  private editorialStandards: EditorialStandards;

  async generateScript(options: GenerateOptions): Promise<Script> {
    // 1. Fetch story from intake
    const story = await this.intakeClient.getStory(options.storyId);
    const articles = await this.intakeClient.getStoryArticles(options.storyId);

    // 2. Fetch analyses
    const analyses = await this.analysisClient.getAnalysesByStory(options.storyId);

    // 3. Get or create brief
    const brief = options.briefId
      ? await this.db.getBrief(options.briefId)
      : await this.briefExtractor.createBrief(story, articles, analyses);

    // 4. Generate script with Claude
    const prompt = this.buildScriptPrompt(story, brief, analyses);
    const content = await this.callClaude(prompt);

    // 5. Validate and check prohibited patterns
    await this.validator.validate(content);
    await this.checkProhibitedPatterns(content);

    // 6. Parse into sections
    const sections = this.parseIntoSections(content);

    // 7. Store and return
    return this.db.createScript({ ... });
  }
}
```

### 2. Christ-Oh-Meter

The Christ-Oh-Meter rates content against Gospel moral principles:

```typescript
// src/services/christOhMeter.ts
export class ChristOhMeter {
  private readonly TENETS = [
    'Love thy neighbor',
    'Care for the poor and vulnerable',
    'Seek truth and justice',
    'Show mercy and forgiveness',
    'Protect the innocent',
    'Honor life and dignity',
    'Serve others before self',
    'Speak truth to power',
    'Steward creation responsibly',
    'Pursue peace over conflict'
  ];

  async rate(content: string | StoryBrief): Promise<ChristOhMeterResult> {
    const text = typeof content === 'string' ? content : this.briefToText(content);

    const prompt = `
Rate this news story against these Gospel moral principles (0-10 scale):
${this.TENETS.map((t, i) => `${i + 1}. ${t}`).join('\n')}

Story:
${text}

For each principle, score 0-10:
- 0-3: Story conflicts with this principle
- 4-6: Story is neutral on this principle
- 7-10: Story aligns with this principle

Provide overall score (average) and moral alignment assessment.

Format as JSON:
{
  "scores": { "tenet1": number, ... },
  "overallScore": number,
  "alignment": "positive" | "neutral" | "concerning",
  "explanation": string,
  "recommendation": string
}
`;

    const response = await this.callClaude(prompt);
    return this.parseResponse(response);
  }
}
```

### 3. Editorial Standards

```typescript
// src/config/editorialStandards.ts
export const EDITORIAL_STANDARDS = {
  scriptSections: [
    { type: 'intro', required: true, maxWords: 100, template: 'greeting_hook' },
    { type: 'story', required: true, maxWords: 500, template: 'news_summary' },
    { type: 'analysis', required: false, maxWords: 300, template: 'bias_breakdown' },
    { type: 'opinion', required: false, maxWords: 200, template: 'host_take' },
    { type: 'transition', required: false, maxWords: 50, template: 'segue' },
    { type: 'close', required: true, maxWords: 100, template: 'signoff' }
  ],

  tone: {
    formality: 'conversational',
    audience: 'general',
    pacing: 'moderate'
  },

  constraints: {
    maxTotalWords: 1500,
    targetDurationSeconds: 300,
    wordsPerSecond: 2.5
  }
};
```

### 4. Prohibited Patterns

```typescript
// src/config/prohibitedPatterns.ts
export const PROHIBITED_PATTERNS = [
  // Legal/liability
  { pattern: 'allegedly', type: 'word', reason: 'Legal hedge - be more specific', severity: 'warning' },
  { pattern: 'sources say', type: 'phrase', reason: 'Vague attribution', severity: 'warning' },

  // Sensationalism
  { pattern: 'BREAKING', type: 'word', reason: 'Avoid sensationalism', severity: 'warning' },
  { pattern: 'you won\'t believe', type: 'phrase', reason: 'Clickbait language', severity: 'block' },

  // Bias amplifiers
  { pattern: 'slammed', type: 'word', reason: 'Loaded language', severity: 'warning', alternatives: ['criticized', 'responded to'] },
  { pattern: 'destroyed', type: 'word', reason: 'Loaded language', severity: 'warning', alternatives: ['refuted', 'challenged'] },

  // Profanity (regex)
  { pattern: '\\b(damn|hell|ass)\\b', type: 'regex', reason: 'Keep family-friendly', severity: 'block' }
];
```

### 5. Calling Other Services

```typescript
// src/services/clients.ts
const INTAKE_URL = process.env.NIWS_INTAKE_URL || 'http://localhost:8033';
const ANALYSIS_URL = process.env.NIWS_ANALYSIS_URL || 'http://localhost:8034';
const RESEARCH_URL = process.env.RESEARCH_BUS_URL || 'http://localhost:8015';

export class IntakeClient {
  async getStory(storyId: string): Promise<Story> { ... }
  async getStoryArticles(storyId: string): Promise<Article[]> { ... }
}

export class AnalysisClient {
  async getAnalysesByStory(storyId: string): Promise<AnalysisResult> { ... }
}

export class ResearchClient {
  async research(query: string): Promise<ResearchResult> { ... }
}
```

---

## Testing Requirements

### Unit Tests

```typescript
// tests/scriptGenerator.test.ts
describe('ScriptGenerator', () => {
  it('should generate script with all required sections');
  it('should respect word count limits');
  it('should fail on prohibited patterns with severity=block');
  it('should warn on prohibited patterns with severity=warning');
});

// tests/christOhMeter.test.ts
describe('ChristOhMeter', () => {
  it('should score positive story highly');
  it('should score concerning content low');
  it('should provide explanation for rating');
});

// tests/briefExtractor.test.ts
describe('BriefExtractor', () => {
  it('should extract key facts from articles');
  it('should identify key quotes');
  it('should aggregate perspectives by outlet');
});
```

### Integration Tests

```typescript
// tests/http.test.ts
describe('HTTP API', () => {
  it('POST /api/scripts/generate creates script');
  it('GET /api/scripts/:id returns script with sections');
  it('POST /api/christ-oh-meter rates content');
});
```

---

## Step-by-Step Instructions

### Phase 1: Setup (30 min)

```bash
mkdir -p /repo/niws-production/{src,config,data,tests}
cd /repo/niws-production
npm init -y
npm install @modelcontextprotocol/sdk @anthropic-ai/sdk better-sqlite3 uuid winston
npm install -D typescript @types/node @types/better-sqlite3 vitest msw
```

### Phase 2: Database Layer (1 hr)

1. Create `src/database/scriptDatabase.ts`
2. Create `src/database/briefDatabase.ts`
3. Run schema migrations
4. Seed prohibited patterns
5. Write database tests

### Phase 3: Configuration (30 min)

1. Create `src/config/editorialStandards.ts`
2. Create `src/config/prohibitedPatterns.ts`

### Phase 4: Services (2 hr)

1. Create `src/services/clients.ts` (intake, analysis, research clients)
2. Create `src/services/briefExtractor.ts`
3. Create `src/services/scriptGenerator.ts`
4. Create `src/services/scriptValidator.ts`
5. Create `src/services/christOhMeter.ts`
6. Create `src/services/copyUpgradeAnalyzer.ts`
7. Write service tests

### Phase 5: MCP Tools (1.5 hr)

1. Create `src/tools/script-tools.ts` (20 tools)
2. Create `src/tools/brief-tools.ts` (8 tools)
3. Create `src/index.ts` with tool routing

### Phase 6: HTTP Layer (1 hr)

1. Create `src/http/server.ts`
2. Implement all endpoints from contracts
3. Write HTTP tests

### Phase 7: InterLock & Finalize (30 min)

1. Create `config/interlock.json`
2. Create `src/interlock/` module
3. Create `src/websocket/server.ts`
4. Final integration test

---

## Completion Checklist

- [ ] All 28 MCP tools implemented and working
- [ ] HTTP endpoints responding per contracts doc
- [ ] Script generation working with Claude
- [ ] Brief extraction working
- [ ] Christ-Oh-Meter rating working
- [ ] Prohibited pattern checking working
- [ ] Learned pattern system working
- [ ] Editorial standards enforced
- [ ] Clients calling intake:8033, analysis:8034, research:8015
- [ ] WebSocket events for script completion
- [ ] InterLock mesh connected
- [ ] Tests passing (target: 30+ tests)
- [ ] LINUS-FINDINGS.md created

---

## Dependencies on Other Instances

| Instance | Server | What We Call | Why |
|----------|--------|--------------|-----|
| 1 | niws-intake:8033 | GET /api/stories/:id | Fetch story details |
| 1 | niws-intake:8033 | GET /api/stories/:id/articles | Get articles for brief |
| 2 | niws-analysis:8034 | GET /api/analyses/story/:storyId | Get analyses for script context |
| existing | research-bus:8015 | POST /api/research | Research for script enhancement |

**Mock these during development if other instances aren't ready.**

---

## Other Instances Depend On This

- **Instance 4 (delivery):** Calls GET /api/scripts/:id, GET /api/briefs/:id for export

---

## Environment Variables

```bash
ANTHROPIC_API_KEY=sk-ant-...
NIWS_INTAKE_URL=http://localhost:8033
NIWS_ANALYSIS_URL=http://localhost:8034
RESEARCH_BUS_URL=http://localhost:8015
```

---

## References

- **Contracts:** `/handoffs/NIWS-DECOMPOSITION-CONTRACTS.md`
- **Original Code:** `/repo/niws-server/src/scripts/`, `/repo/niws-server/src/briefs/`
- **Skill:** `/repo/claude-skills/niws-decomposition.skill.md`

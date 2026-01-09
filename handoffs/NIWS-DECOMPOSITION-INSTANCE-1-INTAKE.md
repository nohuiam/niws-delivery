# NIWS Decomposition Instance 1: niws-intake

**Server:** niws-intake
**Role:** RSS feed management, article ingestion, story clustering
**Estimated Effort:** 5-6 hours

---

## Quick Reference

| Attribute | Value |
|-----------|-------|
| Tools | 31 |
| LOC (estimated) | ~2,500 |
| Ports | MCP: stdio, UDP: 3033, HTTP: 8033, WS: 9033 |
| Databases | articles.sqlite, outlets.sqlite |
| Dependencies | None (source of truth) |
| Consumers | niws-analysis, niws-production, niws-delivery |

---

## Coordination Document

**READ FIRST:** `/handoffs/NIWS-DECOMPOSITION-CONTRACTS.md`

Contains shared types, API contracts, and testing requirements.

---

## Source Files to Extract

From `/repo/niws-server/src/`:

```
outlets/
├── outletDatabase.ts    → src/database/outletDatabase.ts
├── outletTools.ts       → src/tools/outlet-tools.ts
└── index.ts             → merge into src/index.ts

rss/
├── articleDatabase.ts   → src/database/articleDatabase.ts
├── feedPoller.ts        → src/services/feedPoller.ts
├── rssParser.ts         → src/services/rssParser.ts
├── rssTools.ts          → src/tools/rss-tools.ts
├── storyTools.ts        → src/tools/story-tools.ts
├── storyClustering.ts   → src/services/storyClustering.ts
└── index.ts             → merge into src/index.ts
```

---

## MCP Tools (31)

### Outlet Management (10 tools)

| Tool | Description | Priority |
|------|-------------|----------|
| `add_outlet` | Register new news outlet | HIGH |
| `update_outlet` | Update outlet metadata | MEDIUM |
| `delete_outlet` | Remove outlet | LOW |
| `get_outlet` | Get outlet by ID | HIGH |
| `list_outlets` | List all outlets | HIGH |
| `get_outlets_by_lean` | Filter by political lean | HIGH |
| `add_feed` | Add RSS feed to outlet | HIGH |
| `remove_feed` | Remove feed from outlet | LOW |
| `get_outlet_feeds` | List feeds for outlet | MEDIUM |
| `get_outlet_stats` | Performance statistics | MEDIUM |

### RSS/Article Management (13 tools)

| Tool | Description | Priority |
|------|-------------|----------|
| `poll_all_feeds` | Poll all registered feeds | HIGH |
| `poll_outlet_feeds` | Poll specific outlet's feeds | HIGH |
| `poll_single_feed` | Poll one feed | MEDIUM |
| `get_article` | Get article by ID | HIGH |
| `get_articles` | List articles with filters | HIGH |
| `get_articles_by_outlet` | Articles from specific outlet | HIGH |
| `get_articles_by_lean` | Filter by political lean | HIGH |
| `search_articles` | Full-text search | MEDIUM |
| `get_recent_articles` | Last N hours | HIGH |
| `mark_article_processed` | Mark as processed | MEDIUM |
| `get_feed_status` | Feed health/last poll | MEDIUM |
| `get_poll_history` | Poll logs | LOW |
| `clear_old_articles` | Cleanup old articles | LOW |

### Story Clustering (8 tools)

| Tool | Description | Priority |
|------|-------------|----------|
| `cluster_recent_stories` | Run clustering on recent articles | HIGH |
| `get_story` | Get story by ID | HIGH |
| `get_stories` | List stories with filters | HIGH |
| `get_stories_by_track` | Filter by topic track | HIGH |
| `get_story_articles` | Articles in a story cluster | HIGH |
| `get_editorial_dashboard` | Comprehensive editorial view | HIGH |
| `search_stories` | Full-text story search | MEDIUM |
| `compare_outlet_coverage` | Cross-outlet coverage analysis | MEDIUM |

---

## Database Schemas

### outlets.sqlite

```sql
CREATE TABLE outlets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  domain TEXT UNIQUE NOT NULL,
  political_lean TEXT CHECK(political_lean IN ('left', 'left-center', 'center', 'right-center', 'right')),
  bias_rating REAL CHECK(bias_rating >= 0 AND bias_rating <= 1),
  factual_reporting TEXT CHECK(factual_reporting IN ('very-high', 'high', 'mostly-factual', 'mixed', 'low', 'very-low')),
  country TEXT DEFAULT 'US',
  media_type TEXT DEFAULT 'online',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE outlet_feeds (
  id TEXT PRIMARY KEY,
  outlet_id TEXT NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
  feed_url TEXT UNIQUE NOT NULL,
  feed_type TEXT DEFAULT 'rss',
  category TEXT,
  last_polled_at TEXT,
  last_successful_poll TEXT,
  poll_frequency_minutes INTEGER DEFAULT 60,
  error_count INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE bias_ratings (
  id TEXT PRIMARY KEY,
  outlet_id TEXT NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
  source TEXT NOT NULL,           -- 'mbfc', 'allsides', 'manual'
  rating TEXT NOT NULL,
  confidence REAL,
  rated_at TEXT NOT NULL
);

CREATE INDEX idx_outlets_lean ON outlets(political_lean);
CREATE INDEX idx_feeds_outlet ON outlet_feeds(outlet_id);
CREATE INDEX idx_feeds_active ON outlet_feeds(is_active);
```

### articles.sqlite

```sql
CREATE TABLE articles (
  id TEXT PRIMARY KEY,
  outlet_id TEXT NOT NULL,
  feed_id TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT UNIQUE NOT NULL,
  content TEXT,
  summary TEXT,
  author TEXT,
  published_at TEXT,
  fetched_at TEXT NOT NULL,
  content_hash TEXT NOT NULL,     -- SHA256 for deduplication
  word_count INTEGER,
  story_id TEXT,                   -- Cluster assignment
  is_processed INTEGER DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE stories (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  summary TEXT,
  track TEXT,                      -- Topic track
  article_count INTEGER DEFAULT 0,
  outlet_count INTEGER DEFAULT 0,
  first_seen TEXT NOT NULL,
  last_updated TEXT NOT NULL,
  is_active INTEGER DEFAULT 1
);

CREATE TABLE story_articles (
  story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  article_id TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  similarity_score REAL,
  added_at TEXT NOT NULL,
  PRIMARY KEY (story_id, article_id)
);

CREATE TABLE feed_fetch_logs (
  id TEXT PRIMARY KEY,
  feed_id TEXT NOT NULL,
  status TEXT NOT NULL,           -- 'success', 'error', 'no_new'
  articles_found INTEGER DEFAULT 0,
  articles_new INTEGER DEFAULT 0,
  error_message TEXT,
  duration_ms INTEGER,
  fetched_at TEXT NOT NULL
);

CREATE INDEX idx_articles_outlet ON articles(outlet_id);
CREATE INDEX idx_articles_story ON articles(story_id);
CREATE INDEX idx_articles_published ON articles(published_at);
CREATE INDEX idx_articles_hash ON articles(content_hash);
CREATE INDEX idx_stories_track ON stories(track);
CREATE INDEX idx_stories_active ON stories(is_active);
```

---

## HTTP API Endpoints

Implement these endpoints (see contracts doc for details):

```typescript
// GET /api/health
// GET /api/outlets
// GET /api/outlets/:id
// GET /api/articles
// GET /api/articles/:id
// GET /api/stories
// GET /api/stories/:id
// GET /api/stories/:id/articles
```

---

## Key Implementation Notes

### 1. Feed Polling Service

The `feedPoller.ts` runs on a schedule. Implement as:

```typescript
// src/services/feedPoller.ts
export class FeedPoller {
  private intervals: Map<string, NodeJS.Timeout> = new Map();

  async startPolling(): Promise<void> {
    const feeds = await this.db.getActiveFeeds();
    for (const feed of feeds) {
      this.scheduleFeePoll(feed);
    }
  }

  private scheduleFeedPoll(feed: Feed): void {
    const interval = setInterval(
      () => this.pollFeed(feed.id),
      feed.pollFrequencyMinutes * 60 * 1000
    );
    this.intervals.set(feed.id, interval);
  }

  async pollFeed(feedId: string): Promise<PollResult> {
    // Fetch RSS, parse, dedupe by content_hash, store new articles
  }
}
```

### 2. Story Clustering Algorithm

The clustering uses TF-IDF similarity:

```typescript
// src/services/storyClustering.ts
export class StoryClustering {
  private readonly SIMILARITY_THRESHOLD = 0.6;

  async clusterRecentArticles(hoursBack: number = 24): Promise<ClusterResult> {
    const articles = await this.db.getRecentUnclusteredArticles(hoursBack);

    for (const article of articles) {
      const existingStory = await this.findMatchingStory(article);
      if (existingStory) {
        await this.addArticleToStory(article, existingStory);
      } else {
        await this.createNewStory(article);
      }
    }
  }

  private async findMatchingStory(article: Article): Promise<Story | null> {
    // TF-IDF similarity against active story titles/summaries
  }
}
```

### 3. Editorial Dashboard

Aggregates data for editorial view:

```typescript
interface EditorialDashboard {
  stories: {
    total: number;
    byTrack: Record<string, number>;
    trending: Story[];
  };
  articles: {
    total24h: number;
    byLean: Record<string, number>;
    byOutlet: { outlet: Outlet; count: number }[];
  };
  coverage: {
    underCovered: Story[];      // Stories with < 3 outlets
    wellCovered: Story[];       // Stories with 5+ outlets
    biasAlerts: Story[];        // One-sided coverage
  };
}
```

---

## Testing Requirements

### Unit Tests

```typescript
// tests/database.test.ts
describe('OutletDatabase', () => {
  it('should add outlet with valid data');
  it('should reject duplicate domains');
  it('should filter by political lean');
});

describe('ArticleDatabase', () => {
  it('should deduplicate by content hash');
  it('should assign articles to stories');
});

// tests/clustering.test.ts
describe('StoryClustering', () => {
  it('should cluster similar articles');
  it('should not cluster unrelated articles');
  it('should update existing story when match found');
});
```

### Integration Tests

```typescript
// tests/http.test.ts
describe('HTTP API', () => {
  it('GET /api/outlets returns paginated list');
  it('GET /api/articles/:id returns 404 for missing');
  it('GET /api/stories/:id/articles returns cluster');
});
```

---

## Step-by-Step Instructions

### Phase 1: Setup (30 min)

```bash
mkdir -p /repo/niws-intake/{src,config,data,tests}
cd /repo/niws-intake
npm init -y
npm install @modelcontextprotocol/sdk better-sqlite3 uuid winston node-fetch rss-parser
npm install -D typescript @types/node @types/better-sqlite3 vitest
```

Create `tsconfig.json` and `package.json` scripts.

### Phase 2: Database Layer (1 hr)

1. Create `src/database/outletDatabase.ts`
2. Create `src/database/articleDatabase.ts`
3. Run schema migrations
4. Write database tests

### Phase 3: Services (1.5 hr)

1. Create `src/services/rssParser.ts`
2. Create `src/services/feedPoller.ts`
3. Create `src/services/storyClustering.ts`
4. Write service tests

### Phase 4: MCP Tools (1.5 hr)

1. Create `src/tools/outlet-tools.ts` (10 tools)
2. Create `src/tools/rss-tools.ts` (13 tools)
3. Create `src/tools/story-tools.ts` (8 tools)
4. Create `src/index.ts` with tool routing

### Phase 5: HTTP Layer (1 hr)

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

- [ ] All 31 MCP tools implemented and working
- [ ] HTTP endpoints responding per contracts doc
- [ ] WebSocket events for article/story updates
- [ ] InterLock mesh connected to peers
- [ ] Both SQLite databases with proper schemas
- [ ] Feed polling service running
- [ ] Story clustering working
- [ ] Tests passing (target: 25+ tests)
- [ ] LINUS-FINDINGS.md created

---

## Dependencies on Other Instances

**None** - niws-intake is the source of truth.

## Other Instances Depend On This

- **Instance 2 (analysis):** Calls GET /api/articles/:id, GET /api/outlets/:id
- **Instance 3 (production):** Calls GET /api/stories/:id, GET /api/articles
- **Instance 4 (delivery):** Calls GET /api/stories, GET /api/articles

---

## References

- **Contracts:** `/handoffs/NIWS-DECOMPOSITION-CONTRACTS.md`
- **Original Code:** `/repo/niws-server/src/outlets/`, `/repo/niws-server/src/rss/`
- **Skill:** `/repo/claude-skills/niws-decomposition.skill.md`

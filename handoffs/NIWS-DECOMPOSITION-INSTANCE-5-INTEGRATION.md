# NIWS Decomposition Instance 5: Integration & Cleanup

**Role:** Integration testing, end-to-end validation, monolith deprecation
**Estimated Effort:** 4-5 hours

---

## Quick Reference

| Attribute | Value |
|-----------|-------|
| Dependencies | Instances 1-4 MUST be complete |
| Output | Verified ecosystem, deprecated monolith |
| New Code | Integration tests only |

---

## Prerequisites

**DO NOT START THIS INSTANCE until Instances 1-4 are verified complete.**

Checklist before starting:
- [ ] Instance 1 (niws-intake) - All 31 tools working, HTTP endpoints live
- [ ] Instance 2 (niws-analysis) - All 11 tools working, HTTP endpoints live
- [ ] Instance 3 (niws-production) - All 28 tools working, HTTP endpoints live
- [ ] Instance 4 (niws-delivery) - All 48 tools working, HTTP endpoints live

---

## Coordination Document

**READ FIRST:** `/handoffs/NIWS-DECOMPOSITION-CONTRACTS.md`

---

## Phase 1: Server Startup Verification (30 min)

### 1.1 Start All Servers

```bash
# Terminal 1: niws-intake
cd /repo/niws-intake && npm start

# Terminal 2: niws-analysis
cd /repo/niws-analysis && npm start

# Terminal 3: niws-production
cd /repo/niws-production && npm start

# Terminal 4: niws-delivery
cd /repo/niws-delivery && npm start

# Terminal 5: research-bus (existing)
cd /repo/research-bus && npm start
```

### 1.2 Health Check All Endpoints

```bash
# Create health check script
cat > /tmp/health-check.sh << 'EOF'
#!/bin/bash
echo "Checking all NIWS servers..."

servers=(
  "niws-intake:8033"
  "niws-analysis:8034"
  "niws-production:8035"
  "niws-delivery:8036"
  "research-bus:8015"
)

for server in "${servers[@]}"; do
  name=$(echo $server | cut -d: -f1)
  port=$(echo $server | cut -d: -f2)
  response=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:$port/api/health)
  if [ "$response" = "200" ]; then
    echo "✅ $name ($port): OK"
  else
    echo "❌ $name ($port): FAILED (HTTP $response)"
  fi
done
EOF
chmod +x /tmp/health-check.sh
/tmp/health-check.sh
```

**Expected Output:**
```
✅ niws-intake (8033): OK
✅ niws-analysis (8034): OK
✅ niws-production (8035): OK
✅ niws-delivery (8036): OK
✅ research-bus (8015): OK
```

---

## Phase 2: Inter-Server Communication Tests (1 hr)

### 2.1 Test Intake → Analysis Flow

```bash
# 1. Create test outlet
curl -X POST http://localhost:8033/api/outlets \
  -H "Content-Type: application/json" \
  -d '{"name": "Test Outlet", "domain": "test.com", "politicalLean": "center"}'

# 2. Get outlet ID from response and verify analysis can fetch it
OUTLET_ID="<from response>"
curl http://localhost:8034/api/test/fetch-outlet/$OUTLET_ID
# Should return outlet data
```

### 2.2 Test Analysis → Production Flow

```bash
# 1. Create a mock story and analysis
STORY_ID="test-story-1"

# 2. Verify production can fetch analyses
curl http://localhost:8035/api/test/fetch-analyses/$STORY_ID
# Should return analyses (or empty array)
```

### 2.3 Test Production → Delivery Flow

```bash
# 1. Create a test brief
curl -X POST http://localhost:8035/api/briefs/create \
  -H "Content-Type: application/json" \
  -d '{"storyId": "test-story-1"}'

BRIEF_ID="<from response>"

# 2. Verify delivery can fetch brief
curl http://localhost:8036/api/test/fetch-brief/$BRIEF_ID
# Should return brief data
```

### 2.4 Create Integration Test Suite

```typescript
// /repo/niws-integration-tests/tests/cross-server.test.ts
import { describe, it, expect, beforeAll } from 'vitest';

const SERVERS = {
  intake: 'http://localhost:8033',
  analysis: 'http://localhost:8034',
  production: 'http://localhost:8035',
  delivery: 'http://localhost:8036',
  research: 'http://localhost:8015'
};

describe('Cross-Server Integration', () => {
  beforeAll(async () => {
    // Verify all servers are up
    for (const [name, url] of Object.entries(SERVERS)) {
      const response = await fetch(`${url}/api/health`);
      expect(response.ok, `${name} should be healthy`).toBe(true);
    }
  });

  describe('Intake → Analysis', () => {
    it('analysis can fetch articles from intake', async () => {
      // Create article in intake
      const article = await createTestArticle();

      // Fetch from analysis server's perspective
      const response = await fetch(`${SERVERS.analysis}/api/test/intake/articles/${article.id}`);
      expect(response.ok).toBe(true);

      const fetched = await response.json();
      expect(fetched.id).toBe(article.id);
    });

    it('analysis can fetch outlet metadata', async () => {
      const outlet = await createTestOutlet();
      const response = await fetch(`${SERVERS.analysis}/api/test/intake/outlets/${outlet.id}`);
      expect(response.ok).toBe(true);
    });
  });

  describe('Analysis → Production', () => {
    it('production can fetch analyses for story', async () => {
      const storyId = 'test-story-' + Date.now();
      await createTestAnalysis(storyId);

      const response = await fetch(`${SERVERS.production}/api/test/analysis/story/${storyId}`);
      expect(response.ok).toBe(true);
    });
  });

  describe('Production → Delivery', () => {
    it('delivery can fetch scripts', async () => {
      const script = await createTestScript();
      const response = await fetch(`${SERVERS.delivery}/api/test/production/scripts/${script.id}`);
      expect(response.ok).toBe(true);
    });

    it('delivery can fetch briefs', async () => {
      const brief = await createTestBrief();
      const response = await fetch(`${SERVERS.delivery}/api/test/production/briefs/${brief.id}`);
      expect(response.ok).toBe(true);
    });
  });
});
```

---

## Phase 3: End-to-End Workflow Tests (1.5 hr)

### 3.1 Full Pipeline Test

```typescript
// /repo/niws-integration-tests/tests/pipeline.test.ts
describe('Full News Pipeline', () => {
  it('should process story from intake to delivery', async () => {
    // 1. Add outlet and feed to intake
    const outlet = await fetch(`${SERVERS.intake}/api/outlets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Integration Test Outlet',
        domain: 'integration-test.com',
        politicalLean: 'center'
      })
    }).then(r => r.json());

    // 2. Add test article
    const article = await fetch(`${SERVERS.intake}/api/articles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        outletId: outlet.id,
        title: 'Test Article for Integration',
        url: 'https://integration-test.com/article-1',
        content: 'This is test content for the integration test pipeline.'
      })
    }).then(r => r.json());

    // 3. Trigger clustering
    await fetch(`${SERVERS.intake}/api/cluster`, { method: 'POST' });

    // 4. Get story ID
    const stories = await fetch(`${SERVERS.intake}/api/stories?limit=1`).then(r => r.json());
    const storyId = stories[0]?.id;
    expect(storyId).toBeDefined();

    // 5. Trigger analysis
    const analysis = await fetch(`${SERVERS.analysis}/api/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ articleId: article.id, type: 'bias' })
    }).then(r => r.json());

    // Wait for analysis to complete
    await waitForStatus(`${SERVERS.analysis}/api/analyses/${analysis.analysisId}`, 'complete');

    // 6. Create brief
    const brief = await fetch(`${SERVERS.production}/api/briefs/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storyId })
    }).then(r => r.json());

    expect(brief.briefId).toBeDefined();

    // 7. Generate script
    const script = await fetch(`${SERVERS.production}/api/scripts/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storyId, briefId: brief.briefId })
    }).then(r => r.json());

    // Wait for script generation
    await waitForStatus(`${SERVERS.production}/api/scripts/${script.scriptId}`, 'complete');

    // 8. Export teleprompter
    const exportResult = await fetch(`${SERVERS.delivery}/api/export/teleprompter`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scriptId: script.scriptId, format: 'rtf' })
    }).then(r => r.json());

    expect(exportResult.filePath).toBeDefined();

    console.log('✅ Full pipeline completed successfully');
  }, 120000); // 2 minute timeout
});
```

### 3.2 Overnight Workflow Test

```typescript
describe('Overnight Workflow', () => {
  it('should execute overnight workflow end-to-end', async () => {
    // Start overnight run
    const run = await fetch(`${SERVERS.delivery}/api/workflow/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'overnight' })
    }).then(r => r.json());

    expect(run.runId).toBeDefined();

    // Poll for completion (with timeout)
    const maxWait = 5 * 60 * 1000; // 5 minutes
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
      const status = await fetch(`${SERVERS.delivery}/api/workflow/status`).then(r => r.json());

      if (status.status === 'complete') {
        console.log('✅ Overnight workflow completed');
        return;
      }

      if (status.status === 'failed') {
        throw new Error(`Workflow failed: ${status.error}`);
      }

      await new Promise(r => setTimeout(r, 5000)); // Poll every 5s
    }

    throw new Error('Workflow timed out');
  }, 600000); // 10 minute timeout
});
```

---

## Phase 4: MCP Tool Verification (1 hr)

### 4.1 Verify All 118 Tools Work

Create a tool verification script:

```typescript
// /repo/niws-integration-tests/verify-tools.ts
const TOOLS_BY_SERVER = {
  'niws-intake': [
    'add_outlet', 'update_outlet', 'get_outlet', 'list_outlets', 'get_outlets_by_lean',
    'add_feed', 'remove_feed', 'get_outlet_feeds', 'get_outlet_stats', 'delete_outlet',
    'poll_all_feeds', 'poll_outlet_feeds', 'poll_single_feed', 'get_article', 'get_articles',
    'get_articles_by_outlet', 'get_articles_by_lean', 'search_articles', 'get_recent_articles',
    'mark_article_processed', 'get_feed_status', 'get_poll_history', 'clear_old_articles',
    'cluster_recent_stories', 'get_story', 'get_stories', 'get_stories_by_track',
    'get_story_articles', 'get_editorial_dashboard', 'search_stories', 'compare_outlet_coverage'
  ],
  'niws-analysis': [
    'analyze_article', 'analyze_bias_language', 'compare_coverage', 'get_framing_differences',
    'get_neutral_alternative', 'get_comparative_analysis', 'validate_analysis_text',
    'get_analysis_by_id', 'get_analysis_by_story', 'list_pending_analyses', 'retry_failed_analysis'
  ],
  'niws-production': [
    'generate_script', 'generate_script_from_analysis', 'generate_script_outline', 'validate_script',
    'revise_script', 'check_prohibited_patterns', 'analyze_script_edit', 'apply_learned_patterns',
    'enhance_script_segment', 'get_script', 'list_scripts', 'get_script_sections',
    'update_script_section', 'get_script_history', 'clone_script', 'merge_scripts',
    'archive_script', 'export_script', 'validate_script_format', 'get_script_stats',
    'create_story_brief', 'get_story_brief', 'list_story_briefs', 'update_brief',
    'get_brief_sources', 'rate_christ_oh_meter', 'compare_quotes', 'analyze_legislation'
  ],
  'niws-delivery': [
    'notion_push_story', 'notion_poll_approvals', 'notion_mark_story_sent', 'notion_get_approved_stories',
    'notion_create_page', 'notion_update_page', 'notion_archive_page', 'notion_get_database',
    'notion_sync_status', 'notion_get_comments', 'notion_add_comment', 'notion_get_workflow_state',
    'export_teleprompter', 'airdrop_to_ipad', 'batch_export_and_transfer', 'cleanup_exports',
    'export_rtf', 'export_html',
    'build_video_background', 'composite_final_video', 'export_all_platforms', 'run_video_pipeline',
    'apply_chroma_key', 'add_motion_graphics', 'create_pip_composite', 'capture_scroll',
    'encode_video', 'preview_video', 'get_video_status', 'cancel_video_job', 'get_video_assets',
    'cleanup_video_temp',
    'start_overnight_run', 'start_morning_poll', 'get_workflow_status', 'pause_workflow',
    'resume_workflow', 'cancel_workflow', 'schedule_workflow', 'get_schedule', 'update_schedule',
    'get_workflow_logs', 'get_workflow_metrics', 'notify_completion', 'get_pending_actions',
    'approve_action', 'reject_action', 'get_workflow_history'
  ]
};

async function verifyAllTools() {
  let totalTools = 0;
  let workingTools = 0;
  let failedTools: string[] = [];

  for (const [server, tools] of Object.entries(TOOLS_BY_SERVER)) {
    console.log(`\nVerifying ${server} (${tools.length} tools)...`);

    for (const tool of tools) {
      totalTools++;
      try {
        // Call MCP list_tools to verify tool exists
        // This would need MCP client setup
        const exists = await verifyToolExists(server, tool);
        if (exists) {
          workingTools++;
          process.stdout.write('.');
        } else {
          failedTools.push(`${server}:${tool}`);
          process.stdout.write('x');
        }
      } catch (e) {
        failedTools.push(`${server}:${tool}`);
        process.stdout.write('x');
      }
    }
    console.log();
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log(`Total: ${totalTools} tools`);
  console.log(`Working: ${workingTools} tools`);
  console.log(`Failed: ${failedTools.length} tools`);

  if (failedTools.length > 0) {
    console.log('\nFailed tools:');
    failedTools.forEach(t => console.log(`  - ${t}`));
  }

  return failedTools.length === 0;
}
```

---

## Phase 5: Update Claude Desktop Config (30 min)

### 5.1 Backup Existing Config

```bash
cp ~/Library/Application\ Support/Claude/claude_desktop_config.json \
   ~/Library/Application\ Support/Claude/claude_desktop_config.json.backup-niws-monolith
```

### 5.2 Update Config with New Servers

```json
{
  "mcpServers": {
    "niws-intake": {
      "command": "node",
      "args": ["/repo/niws-intake/dist/index.js"],
      "env": {}
    },
    "niws-analysis": {
      "command": "node",
      "args": ["/repo/niws-analysis/dist/index.js"],
      "env": {
        "ANTHROPIC_API_KEY": "${ANTHROPIC_API_KEY}"
      }
    },
    "niws-production": {
      "command": "node",
      "args": ["/repo/niws-production/dist/index.js"],
      "env": {
        "ANTHROPIC_API_KEY": "${ANTHROPIC_API_KEY}"
      }
    },
    "niws-delivery": {
      "command": "node",
      "args": ["/repo/niws-delivery/dist/index.js"],
      "env": {
        "NOTION_TOKEN": "${NOTION_TOKEN}",
        "NOTION_DATABASE_ID": "${NOTION_DATABASE_ID}"
      }
    }
  }
}
```

### 5.3 Remove Old niws-server Entry

Remove or comment out the old `niws-server` entry from the config.

---

## Phase 6: Deprecate Monolith (30 min)

### 6.1 Add Deprecation Notice

```typescript
// /repo/niws-server/src/index.ts - Add at top
console.warn(`
╔══════════════════════════════════════════════════════════════════╗
║                    ⚠️  DEPRECATION NOTICE  ⚠️                      ║
║                                                                  ║
║  niws-server has been decomposed into specialized servers:       ║
║  • niws-intake:8033    - RSS feeds, articles, stories            ║
║  • niws-analysis:8034  - Bias analysis, framing comparison       ║
║  • niws-production:8035 - Scripts, briefs, Christ-Oh-Meter       ║
║  • niws-delivery:8036  - Export, Notion, video, orchestration    ║
║                                                                  ║
║  This monolithic server will be removed in a future version.     ║
║  Please update your Claude Desktop config to use the new servers.║
╚══════════════════════════════════════════════════════════════════╝
`);
```

### 6.2 Update Port Registry

Update `/repo/barespec/PORT-REGISTRY.barespec.md`:

```markdown
## NIWS System (Decomposed)

| Server | MCP | UDP | HTTP | WS | Status |
|--------|-----|-----|------|----|--------|
| niws-intake | stdio | 3033 | 8033 | 9033 | ACTIVE |
| niws-analysis | stdio | 3034 | 8034 | 9034 | ACTIVE |
| niws-production | stdio | 3035 | 8035 | 9035 | ACTIVE |
| niws-delivery | stdio | 3036 | 8036 | 9036 | ACTIVE |
| ~~niws-server~~ | ~~stdio~~ | - | ~~8015~~ | - | DEPRECATED |
```

### 6.3 Archive Monolith

```bash
# Move to archived folder
mv /repo/niws-server /repo/archived-niws-server-monolith

# Or keep but rename
mv /repo/niws-server /repo/niws-server-deprecated
```

---

## Completion Checklist

- [ ] All 5 servers starting without errors
- [ ] All health endpoints returning 200
- [ ] Inter-server HTTP communication working
- [ ] Full pipeline test passing
- [ ] Overnight workflow test passing
- [ ] All 118 MCP tools verified
- [ ] Claude Desktop config updated
- [ ] Monolith deprecated with warning
- [ ] Port registry updated
- [ ] LINUS-FINDINGS.md created for each new server

---

## Rollback Plan

If integration fails:

```bash
# 1. Restore Claude Desktop config
cp ~/Library/Application\ Support/Claude/claude_desktop_config.json.backup-niws-monolith \
   ~/Library/Application\ Support/Claude/claude_desktop_config.json

# 2. Restart Claude Desktop

# 3. Original niws-server still works at port 8015
```

---

## Success Metrics

| Metric | Target | How to Measure |
|--------|--------|----------------|
| Tools working | 118/118 | Tool verification script |
| API response time | <500ms | HTTP tests |
| Pipeline completion | <2 min | E2E test |
| Test coverage | 80%+ | Combined test counts |

---

## Final Deliverables

1. ✅ Five working servers (intake, analysis, production, delivery + existing research-bus)
2. ✅ Integration test suite
3. ✅ Updated Claude Desktop config
4. ✅ Deprecated monolith
5. ✅ Updated documentation (Port Registry, CLAUDE.md)

---

## References

- **Contracts:** `/handoffs/NIWS-DECOMPOSITION-CONTRACTS.md`
- **Instance 1:** `/handoffs/NIWS-DECOMPOSITION-INSTANCE-1-INTAKE.md`
- **Instance 2:** `/handoffs/NIWS-DECOMPOSITION-INSTANCE-2-ANALYSIS.md`
- **Instance 3:** `/handoffs/NIWS-DECOMPOSITION-INSTANCE-3-PRODUCTION.md`
- **Instance 4:** `/handoffs/NIWS-DECOMPOSITION-INSTANCE-4-DELIVERY.md`
- **Skill:** `/repo/claude-skills/niws-decomposition.skill.md`

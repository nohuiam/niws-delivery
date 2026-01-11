# BOP Ecosystem Map

**Created:** 2025-12-25
**Purpose:** Single source of truth for all ecosystem components
**Update Policy:** Keep current - update when anything moves or changes

---

## Quick Stats

| Category | Count | Status |
|----------|-------|--------|
| MCP Servers | 35 built | **35 OPERATIONAL** |
| Servers Planned | 0 | Queue empty |
| Servers to Plan | 0 | All servers complete |
| Claude Desktop | 16/20 | **16 ACTIVE** (4 removed for context limits) |
| InterLock Mesh | 32/32 | **Full connectivity (27 Jan 5 + 4 NIWS Jan 10 + linus-inspector Jan 11)** |
| Skills | 22 | Auto-loaded in skill-builder |
| Tools Registered | 217 | In Toolee (all with proper descriptions) |
| Tools Documented | 479 | In TOOL-CALLS.barespec.md (36 servers) |
| Experience Episodes | 142 | In experience-layer |
| Lessons Learned | 42 | 20 high-confidence |
| Patterns Detected | 23 | Success/failure/correlation |
| Key Documents | 9 | Various states |
| Vision Documents | 7 | `/repo/bop/future/` |
| GMI Dashboard | 1 | `/repo/bop-gmi/` (port 3099/5173) |

### Server Stabilization Complete (Dec 28, 2025)

All critical bugs fixed. 16 servers verified at 0% CPU.

| Bug | Server | Fix |
|-----|--------|-----|
| ~~BUG-003~~ | snapshot | Absolute paths |
| ~~BUG-004~~ | enterspect | Startup indexing (1,131 files) |
| ~~BUG-005~~ | bonzai-bloat-buster | Qdrant v1.16 upgrade |
| ~~BUG-006~~ | smart-file-organizer | MCP mode discovery disabled |
| ~~BUG-007~~ | knowledge-curator | Standalone FTS5 index |
| ~~BUG-009~~ | smart-file-organizer | Vault try-catch |
| BUG-008 | research-bus | Optional (Comet/Looker backends work) |

---

## CLAUDE DESKTOP CONNECTION STATUS

**Config file:** `/Users/macbook/Library/Application Support/Claude/claude_desktop_config.json`

### All 20 Servers - Fixes Applied (2025-12-27)

| Server | Entry Point | Fix Applied |
|--------|-------------|-------------|
| bonzai-bloat-buster | `repo/bonzai-bloat-buster/dist/index.js` | ✅ Qdrant binary installed |
| catasorter | `repo/Catasorter/src/index.js` | ✅ v2.1: Rate limiting + parallel batch |
| chronos-synapse | `repo/Chronos_Synapse/dist/index.js` | ✅ Schema copied to dist/ |
| context-guardian | `repo/imminenceV2/context-guardian/src/index.js` | ✅ Working |
| enterspect | `repo/EnterSpect/index.js` | ✅ Working |
| filesystem | `~/.npm-global/.../server-filesystem/dist/index.js` | ✅ Direct node path |
| intelligent-router | `repo/intelligentrouter/dist/index.js` | ✅ __dirname path fix |
| knowledge-curator | `repo/knowledge-curator/dist/index.js` | ✅ __dirname path fix |
| looker | `repo/looker-mcp/dist/index.js` | ✅ Working |
| neurogenesis-engine | `repo/neurogenesis-engine/src/index.js` | ✅ Data dir created |
| ~~niws-server~~ | `repo/niws-server/dist/index.js` | ⚠️ DEPRECATED - see decomposed servers |
| niws-intake | `repo/niws-intake/dist/index.js` | ✅ New (2026-01-10) |
| niws-analysis | `repo/niws-analysis/dist/index.js` | ✅ New (2026-01-10) |
| niws-production | `repo/niws-production/dist/index.js` | ✅ New (2026-01-10) |
| niws-delivery | `repo/niws-delivery/dist/index.js` | ✅ New (2026-01-10) |
| pk-manager | `repo/pk-manager/dist/index.js` | ✅ __dirname path fix |
| project-context | `repo/project-context/dist/index.js` | ✅ Working |
| quartermaster | `repo/Quartermaster/quartermaster/src/index.js` | ✅ Working |
| research-bus | `repo/research-bus/dist/index.js` | ✅ Working |
| smart-file-organizer | `repo/smart_file_organizer/src/server.js` | ✅ BUG-006 + BUG-009 fixed (Dec 28) |
| snapshot | `repo/snapSHOT/src/index.js` | ✅ Working |
| tool-registry | `repo/Toolee/Tool_Registry/src/index.js` | ✅ MCP layer added (2025-12-26) |
| trinity-coordinator | `repo/trinitycoordinator/dist/index.js` | ✅ Working |
| claude-code-bridge | `repo/ClaudeCodeBridge/build/index.js` | ✅ RECOVERED (2025-12-27) |
| verifier-mcp | `repo/verifier-mcp/dist/index.js` | ✅ 4-layer architecture (2025-12-26) |

### External Dependencies
- **Qdrant:** Binary installed at `/Users/macbook/Documents/claude_home/qdrant` (localhost:6333)

---

## MCP SERVERS (23)

### Complete & On Main Branch (19)

| Server | Repo Path | Port | Tools | Branch |
|--------|-----------|------|-------|--------|
| bonzai-bloat-buster | `/repo/bonzai-bloat-buster/` | 3008 | 6 | main |
| catasorter | `/repo/Catasorter/` | 3005 | 12 | main |
| chronos-synapse | `/repo/Chronos_Synapse/` | 3011 | 19 | main |
| context-guardian | `/repo/imminenceV2/context-guardian/` | 3001 | 14 | main |
| enterspect | `/repo/EnterSpect/` | 3005 | 5 | main |
| intelligent-router | `/repo/intelligentrouter/` | 3010 | 2 | main |
| knowledge-curator | `/repo/knowledge-curator/` | 3017 | 6 | main |
| ~~niws-server~~ | `/repo/niws-server/` | 8015 | 110 | **DEPRECATED** |
| niws-intake | `/repo/niws-intake/` | 3033 | 47 | main |
| niws-analysis | `/repo/niws-analysis/` | 3034 | 11 | main |
| niws-production | `/repo/niws-production/` | 3035 | 28 | main |
| niws-delivery | `/repo/niws-delivery/` | 3036 | 48 | main |
| pk-manager | `/repo/pk-manager/` | 3018 | 4 | main |
| project-context | `/repo/project-context/` | 3016 | 5 | main |
| quartermaster | `/repo/Quartermaster/quartermaster/` | 3002 | 6 | main |
| research-bus | `/repo/research-bus/` | stdio | 12 | main |
| tool-registry | `/repo/Toolee/Tool_Registry/` | 3004 | 65 | main |
| trinity-coordinator | `/repo/trinitycoordinator/` | 3012 | 14 | main |
| claude-code-bridge | `/repo/ClaudeCodeBridge/` | 3013 | 8 | main |
| verifier-mcp | `/repo/verifier-mcp/` | 3021 | 3 | main |

### Also Complete (Dependencies Installed 2025-12-25)

| Server | Repo Path | Port | Tools | Status |
|--------|-----------|------|-------|--------|
| looker | `/repo/looker-mcp/` | 3006 | 5+ | ✅ Built |
| neurogenesis-engine | `/repo/neurogenesis-engine/` | 3010 | 30 | ✅ Ready (JS) |
| snapshot | `/repo/snapSHOT/` | 3009 | 6 | ✅ Ready (JS) |

### Recently Merged From Branches

| Server | Repo Path | Port | Tools | Merged |
|--------|-----------|------|-------|--------|
| smart-file-organizer | `/repo/smart_file_organizer/` | 3007 | 3 | 2025-12-25 |

---

## CLAUDE BRANCHES STATUS

All significant branches have been merged to main:

| Repo | Branch | Status |
|------|--------|--------|
| smart_file_organizer | `claude/read-documentation-...` | ✅ MERGED (5,025 lines) |
| Catasorter | `claude/review-catasorter-docs-...` | ✅ Already on main |
| Chronos_Synapse | `claude/complete-chronos-synapse-...` | ✅ Already on main |
| ClaudeCodeBridge | `claude/build-mcp-server-...` | ✅ Already on main |
| trinitycoordinator | `claude/build-trinity-coordinator-...` | ⚠️ Main is more complete |

---

## SKILLS (12)

### Primary Location: `/repo/claude-skills/`

| Skill | Description |
|-------|-------------|
| batch-strategy | Batch processing patterns |
| build-with-llms | LLM development patterns |
| classification-workflow | GLEC classification pipeline |
| gnc-candidate-detection | Gold Nugget Card detection |
| quality-review | Quality assessment |
| redundancy-resolution | Duplicate handling |
| research-workflow | Research task patterns |
| server-development-workflow | MCP server development |
| strategic-glec-classification | GLEC framework |
| testing-protocol | Testing patterns |
| verification-workflow | Fact verification using verifier-mcp |
| ecosystem-health-check | Verify mesh, tools, experience layer status (Phase 3) |
| mesh-diagnostics | Diagnose InterLock connectivity issues (Phase 3) |

### Additional: `/repo/bop/skills/`

| Skill | Description |
|-------|-------------|
| comet-browser | CDP browser automation for Perplexity |
| document-evolution | Document processing and evolution |

---

## KEY DOCUMENTS

| Document | Location | Purpose |
|----------|----------|---------|
| CLAUDE.md | `/CLAUDE.md` | Session context, quick reference |
| ECOSYSTEM-MAP.md | `/repo/bop/ECOSYSTEM-MAP.md` | **THIS FILE** - master map |
| LIVING-PLAN.md | `/repo/bop/LIVING-PLAN.md` | Project status, recovery tracking |
| MCP-AND-SKILLS-LIVING-DOC.md | `/repo/bop/MCP-AND-SKILLS-LIVING-DOC.md` | MCP patterns, Skills architecture |
| Plan file | `~/.claude/plans/abundant-meandering-floyd.md` | Current execution plan |

### Barespecs

| Location | Contents |
|----------|----------|
| `/repo/barespec/` | **OFFICIAL** - 32 docs (26 servers + 2 libraries + 4 refs) |
| `/repo/bop-servers/` | Legacy location (superseded by barespec repo) |
| `/repo/bop/recovered/` | 55 recovered markdown files |

---

## GITHUB REPOS

| Repo | Remote | Description |
|------|--------|-------------|
| barespec | `github.com/nohuiam/barespec.git` | **OFFICIAL** barespec library (32 docs) |
| bop | `github.com/nohuiam/bop.git` | Box of Prompts HQ |
| scripts | `github.com/nohuiam/scripts.git` | Server management scripts (manage-servers.sh) |
| bop-servers | `github.com/nohuiam/bop-servers.git` | Server specifications (legacy) |
| claude-skills | `github.com/nohuiam/claude-skills.git` | Skills library |
| data_loss_event | `github.com/nohuiam/data_loss_event.git` | Dec 21 recovery screenshots (private) |
| research-bus | `github.com/nohuiam/research-bus.git` | Perplexity/Comet integration |
| researchbus | `github.com/nohuiam/researchbus.git` | niws-server (confusing name!) |
| Toolee | `github.com/nohuiam/Toolee.git` | Tool Registry (TooLee) - 65 tools |
| verifier-mcp | `github.com/nohuiam/verifier-mcp.git` | Verification server |
| bop-gmi | `github.com/nohuiam/bop-gmi.git` | Graphical Machine Interface (AI dashboard) |

---

## RECOVERY DATA

| Source | Location | Contents |
|--------|----------|----------|
| Raw cache | `/recovered/` | 1,173 files |
| History | `/recovered/history.jsonl` | 1,853 entries |
| File versions | `/recovered/file-history/` | 6 projects with snapshots |
| Conversations | `/recovered/projects/` | 82 JSONL files |
| Processed | `/repo/bop/recovered/` | 55 markdown barespecs |

---

## BUILD ROADMAP (2 servers remaining)

### Recently Built & Operational

| # | Server | Port | Location | Tests | Status |
|---|--------|------|----------|-------|--------|
| 22 | safe-batch-processor | 3022 | `/repo/safe-batch-processor/` | 29 | ✅ OPERATIONAL |
| 23 | intake-guardian | 3023 | `/repo/intake-guardian/` | 27 | ✅ OPERATIONAL |
| 24 | health-monitor | 3024 | `/repo/health-monitor/` | 24 | ✅ OPERATIONAL |
| 25 | synapse-relay | 3025 | `/repo/synapse-relay/` | 23 | ✅ OPERATIONAL |
| 26 | filesystem-guardian | 3026 | `/repo/filesystem-guardian/` | 6 | ✅ OPERATIONAL |
| 28 | consciousness-mcp | 3028 | `/repo/consciousness-mcp/` | 88 | ✅ OPERATIONAL |
| 31 | experience-layer | 3031 | `/repo/experience-layer/` | 92 | ✅ OPERATIONAL |
| 32 | consolidation-engine | 3032 | `/repo/consolidation-engine/` | 217 | ✅ OPERATIONAL (89% cov) |
| 27 | tenets-server | 3027 | `/repo/tenets-server/` | 141 | ✅ OPERATIONAL |
| 37 | linus-inspector | 3037 | `/repo/linus-inspector/` | 115 | ✅ OPERATIONAL |

### Cognitive Architecture Servers (6) - Protocol Standardized

All 6 Cognitive Architecture servers use identical BaNano 12-byte binary header format.
See `/repo/barespec/INTERLOCK-PROTOCOL.barespec.md` for protocol specification.

| # | Server | Port | Status | Notes |
|---|--------|------|--------|-------|
| 21 | verifier-mcp | 3021 | ✅ OPERATIONAL | Claim verification |
| 27 | tenets-server | 3027 | ✅ OPERATIONAL | Ethical evaluation (141 tests) |
| 28 | consciousness-mcp | 3028 | ✅ OPERATIONAL | Meta-awareness (88 tests) |
| 29 | skill-builder | 3029 | ✅ OPERATIONAL | Skill management (136 tests) |
| 30 | percolation-server | 3030 | ✅ OPERATIONAL | Blueprint optimization (81 tests) |
| 31 | experience-layer | 3031 | ✅ OPERATIONAL | Knowledge synthesis (92 tests) |

### Consolidated (no longer separate servers)

| Original Plan | Merged Into | Notes |
|---------------|-------------|-------|
| smart-merger | consolidation-engine (3032) | Combined functionality |
| consolidation-planner | consolidation-engine (3032) | Combined functionality |
| GLEC Classifier | catasorter (3005) | Integrated |
| Perplexity Orchestrator | research-bus (8019) | Covered |
| GEGUI / Dashboard | bop-dashboard (5173) | Web app at boxofprompts.com |

---

## PORT REGISTRY

| Port Range | Purpose |
|------------|---------|
| 3001-3032 | InterLock UDP ports (core servers) |
| 3033-3036 | InterLock UDP ports (NIWS pipeline) |
| 3037 | InterLock UDP (linus-inspector) |
| 8001-8032 | HTTP API ports (core servers) |
| 8033-8036 | HTTP API ports (NIWS pipeline) |
| 8037 | HTTP API (linus-inspector) |
| 9001-9032 | WebSocket ports (core servers) |
| 9033-9036 | WebSocket ports (NIWS pipeline) |
| 9037 | WebSocket (linus-inspector) |

See `/repo/barespec/PORT-REGISTRY.barespec.md` for full mapping.

---

## GMI - GRAPHICAL MACHINE INTERFACE

**Status:** OPERATIONAL (Built Jan 4, 2026)
**Location:** `/Users/macbook/Documents/claude_home/repo/bop-gmi/`
**GitHub:** `github.com/nohuiam/bop-gmi`

### Purpose
AI-optimized visual dashboard for ecosystem monitoring and cognitive orchestration. Designed for screenshot-based comprehension with maximum data density.

### Ports
| Service | Port | Purpose |
|---------|------|---------|
| Vite Dev | 5173 | Frontend (grid/matrix views) |
| Control API | 3099 | Tool state, intensity, refresh rate |

### Views
- **Grid View:** `http://localhost:5173/?view=grid` - Server cards with health details
- **Matrix View:** `http://localhost:5173/?view=matrix` - All 34 servers + 6 data panels (single screenshot)

### GMVP Encoding (Graphical Machine Visual Protocol)
| Element | Meaning |
|---------|---------|
| ● | Healthy |
| ◐ | Degraded |
| ◉ | Critical |
| ○ | Offline |
| ! | Error/Unknown |
| Color bars | CPU/Memory/Response time gauges |

### Control API Endpoints
```
GET  /api/state              # Full current state
POST /api/refresh/rate       # {"ms": 5000|10000|30000|"manual"}
POST /api/tool/:id/state     # {"state": "on"|"off"|"standby"}
POST /api/tool/:id/intensity # {"value": 0-100}
```

### Cognitive Feedback Loop
```
GMI Screenshot → consciousness-mcp reflects → experience-layer records
       ↑                                              ↓
       └──────── lessons inform future actions ←──────┘
```

**Verified:** Episode #131 recorded as `gmi_observation` (utility: 0.9)

---

## BOP-DASHBOARD (boxofprompts.com)

**Status:** PLANNED - Web product version
**Plan File:** `/Users/macbook/.claude/plans/cheeky-crafting-quilt.md`

### Tech Stack
- Plain HTML/JS + Vite (port 5173)
- Same codebase deploys to boxofprompts.com
- CORS already configured on all servers

### Distinction from GMI
| Project | Purpose | Audience |
|---------|---------|----------|
| bop-gmi | AI comprehension, dense GMVP encoding | Claude (screenshot-based) |
| bop-dashboard | User-friendly interface, polish | Humans (web product) |

### Perplexity Research
`/repo/GLECGUI_Imminence/perplexityreturns/`
- Electron vs PWA for MCP Developer Tools.md
- Chrome Extension for Localhost Dashboard.md
- Chrome DevTools Protocol for Testing.md

---

## UPDATE LOG

| Date | Change |
|------|--------|
| 2026-01-11 | **LINUS-INSPECTOR BUILT**: linus-inspector (3037) - brutal quality gate for neurogenesis-generated servers. 26 tools including self-inspection ("physician heal thyself"). 115 tests passing. Meta-rules detect ironic quality gaps in inspectors. Rate limiting, vendor configs, compliance rules. Server count: 34→35. InterLock mesh: 31→32. Created LINUS-INSPECTOR.barespec.md. |
| 2026-01-10 | **NIWS DECOMPOSITION**: Decomposed monolithic niws-server (26K LOC, 110 tools) into 4 specialized servers with InterLock mesh: niws-intake (3033, 47 tools - RSS/outlets/stories), niws-analysis (3034, 11 tools - bias/framing), niws-production (3035, 28 tools - scripts/briefs/Christ-Oh-Meter), niws-delivery (3036, 48 tools - export/video/Notion/orchestration). Total: 134 tools across 4 servers. Original niws-server marked DEPRECATED. Created 4 new barespecs, updated niws-server.barespec.md with deprecation notice. All 4 servers operational. Server count: 31→34. |
| 2026-01-06 | **NIWS STORY BRIEFS**: Added Story Briefs module to niws-server with Christ-Oh-Meter integration. 8 new MCP tools for story brief management. Added 25 Tenets of Evil to tenets-server (moral spectrum -1.0 to +1.0). Quote extraction with cross-outlet comparison. Legislation analysis. niws-server tools: 102→110. Total documented tools: 421→429. |
| 2026-01-05 | **COGNITIVE LEARNING COMPLETE (4 PHASES)**: All 4 phases of cognitive learning cycle completed. Phase 1 (Discovery): 31 servers, 217 tools identified. Phase 2 (Validation): All 31 servers healthy, API endpoints verified against barespecs. Phase 3 (Learning): Extracted 6 new lessons from mesh fix, tool descriptions, validation patterns. Phase 4 (Documentation): Updated TOOL-CALLS.barespec.md with 11 new servers (72 tools), total now 421 tools across 32 servers. Fixed Toolee tool descriptions (216 generic → 0). Experience-layer: 142 episodes, 23 patterns, 42 lessons, 20 high-confidence. Episodes #139-142 recorded. |
| 2026-01-05 | **MESH TIMEOUT FIX (23/23 STABLE)**: Fixed recurring mesh dropout for 4 servers (context-guardian, quartermaster, snapshot, bonzai-bloat-buster). Root cause: peer timeout mismatch - servers had 6-15s timeouts but consciousness-mcp sends heartbeats every 30s. After short timeout expired, servers removed consciousness-mcp from peer list and stopped broadcasting. Fix: Increased peer timeout to 90s (3x heartbeat interval) in all affected servers. Ecosystem standard established: `peer_timeout >= 3x longest_heartbeat_interval`. Episode #138 recorded. |
| 2026-01-05 | **COGNITIVE LEARNING PHASE 3-4**: Phase 3 (Learning) - Analyzed 17 patterns, 36 lessons, 135 episodes in experience-layer. Created 2 new skills from high-success patterns: ecosystem-health-check, mesh-diagnostics. Phase 4 (Documentation) - Audited barespecs against HTTP endpoints. Fixed enterspect.barespec.md (added HTTP REST API section), quartermaster.barespec.md (added HTTP REST API with correct /api paths), context-guardian.barespec.md (OUTPUT schema). Updated server-development-workflow skill with HTTP path conventions and dual-protocol notes. Skills: 20→22. |
| 2026-01-05 | **FULL MESH CONNECTIVITY (27/27)**: Phase 1 - Added dual-protocol decode to 14 servers. Phase 2 - Fixed Quartermaster (added dual-protocol decode + root-level /health endpoint for GMI). Phase 3 - Fixed consciousness-mcp peer config (toolee→tool-registry name mismatch). Phase 4 - Added consciousness-mcp to neurogenesis-engine PEERS. Phase 5 - Implemented Comet CDP health check in niws-server (was stub returning false). Fixed health status logic: healthy if ANY backend connected. All 31 servers now healthy, mesh at 27/27. All fixes committed and pushed to GitHub. |
| 2026-01-04 | **GMI BUILT**: Graphical Machine Interface operational at `/repo/bop-gmi/`. Matrix view shows all 31 servers + 6 data panels in single screenshot. GMVP encoding for AI comprehension. Cognitive feedback loop verified: GMI → consciousness-mcp → experience-layer → lessons. Episode #131 recorded. GitHub: `github.com/nohuiam/bop-gmi`. |
| 2026-01-04 | **INTERLOCK PROTOCOL STANDARDIZED**: All 6 Cognitive Architecture servers (tenets-server, consciousness-mcp, skill-builder, percolation-server, experience-layer, verifier-mcp) now use identical BaNano 12-byte binary header format. Created `INTERLOCK-PROTOCOL.barespec.md`. UDP mesh verified working (28+ signals). Server count: 31. |
| 2026-01-03 | **TENETS-SERVER BUILT**: tenets-server (3027) - ethical decision evaluation against 25 Gospel tenets. 141 tests passing. Moved verifier-mcp to Cognitive category. Server count: 28→29. |
| 2026-01-02 | **ALL 6 NEW SERVERS TESTED**: safe-batch-processor (29 tests), intake-guardian (27 tests), health-monitor (24 tests), synapse-relay (23 tests), filesystem-guardian (6 tests), consolidation-engine (217 tests, 89% coverage, CI/CD on GitHub). Server count: 26. Remaining to build: 6. |
| 2026-01-02 | **2 SERVERS BUILT**: safe-batch-processor (3022) and intake-guardian (3023) builds complete. In testing queue. Server count: 20→22. Remaining to build: 12→10. |
| 2026-01-02 | **DASHBOARD PLANNING**: Designed local dashboard for boxofprompts.com prototype. Tech stack: Plain HTML/JS + Vite. 6 implementation layers (A-F). Plan file: `~/.claude/plans/cheeky-crafting-quilt.md`. Perplexity research in `/repo/GLECGUI_Imminence/perplexityreturns/`. |
| 2026-01-02 | **SERVER PLANNING + VISION**: Created plans for 4 servers (Intake Guardian, Health Monitor, Synapse Relay, Filesystem Guardian). Defined boxofprompts.com product vision. Vision doc: `/repo/bop/future/2025-01-02-session-boxofprompts-vision.md`. Updated Quick Stats to show planned vs to-plan. |
| 2025-12-30 | **4-LAYER EXPANSION**: Added HTTP/WS layers to bonzai-bloat-buster, intelligentrouter, smart-file-organizer. Created `manage-servers.sh` script (18 servers) at `/repo/scripts/`. All health endpoints verified. Scripts repo: `github.com/nohuiam/scripts.git` |
| 2025-12-27 | **ECOSYSTEM AUDIT**: Added ClaudeCodeBridge (20th server, was built but missed). Replaced MISSING section with BUILD ROADMAP (12 servers: 6 original + 4 cognitive + 2 port-reassigned). Updated counts: 19→20 servers. Master plan: `~/.claude/plans/abundant-meandering-floyd.md` |
| 2025-12-27 | **BARESPEC CONSOLIDATION**: Merged 18 server+tools pairs into single files. Files: 43 → 25 (-42%). Characters: ~260K → ~183K (-30%). Template updated to v1.1 with NOTES field. |
| 2025-12-27 | **LIBRARIES CREATED**: Added SKILL-TRIGGERS.barespec.md (13 skills) and TOOL-CALLS.barespec.md (276 tools). Barespec count: 44 → 46. Skills: 12 → 13 (verification-workflow). |
| 2025-12-26 | **VERIFIER-MCP 4-LAYER**: Implemented full 4-layer architecture (MCP + InterLock 3021 + HTTP 8021 + WS 9021). Created 2 barespec docs. Server count: 18 → 19, InterLock mesh: 14 participants. |
| 2025-12-26 | **BARESPEC CONSOLIDATION**: Created `/repo/barespec/` with 42 docs. Created BARESPEC-TEMPLATE.md. Created tool-registry.barespec.md (65 tools). Fixed neurogenesis-engine (26→30 tools). Archived 40 screenshots to `/repo/data_loss_event/`. |
| 2025-12-26 | **TooLee RECOVERED**: Found tool-registry at `/repo/Toolee/`, added MCP stdio layer (65 tools), added to Claude Desktop. Server count: 17 → 18 |
| 2025-12-25 | **ALL 17 SERVERS CONNECTED**: Fixed __dirname paths (4 servers), console.log→stderr (catasorter), InterLock error handling (smart-file-organizer), installed Qdrant binary for bonzai-bloat-buster |
| 2025-12-25 | Added Claude Desktop connection status: 8 connected, 9 debugging. Created handoff document for remaining issues. |
| 2025-12-25 | Synced with barespec updates: fixed port numbers (neurogenesis-engine 3010, research-bus stdio), updated tool counts (niws-server 102, neurogenesis-engine 26, trinity-coordinator 14, snapshot 6) |
| 2025-12-25 | Initial creation from ecosystem audit |
| 2025-12-25 | All 17 servers now complete - installed deps on looker, neurogenesis-engine, snapshot |

---

*This is the single source of truth. Update when anything moves.*

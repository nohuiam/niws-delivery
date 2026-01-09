# LINUS Audit Findings: niws-analysis

**Server:** niws-analysis
**Instance:** NIWS Decomposition Instance 2
**Audited:** 2026-01-09
**Status:** CLEAN - No security issues found

---

## Overview

niws-analysis is a newly-built server extracted from the niws-server monolith. It provides article bias analysis, framing comparison, and neutral alternative suggestions using Claude API.

---

## Architecture

| Component | Implementation |
|-----------|---------------|
| MCP Transport | stdio (JSON-RPC 2.0) |
| HTTP API | Express.js on port 8034 |
| WebSocket | ws library on port 9034 |
| InterLock | UDP mesh on port 3034 |
| Database | SQLite (better-sqlite3) |
| AI Backend | Anthropic Claude API |

---

## Security Posture

### Positive Findings

1. **Input Validation**: All API endpoints validate required parameters
2. **SQL Injection Prevention**: Uses parameterized queries via better-sqlite3
3. **Output Validation**: LLM outputs validated against schema (Ajv)
4. **Content Filtering**: Output validator detects bias violations before returning results
5. **API Key Handling**: Uses environment variables (ANTHROPIC_API_KEY)
6. **Graceful Degradation**: Works without API key using mock responses

### Areas Reviewed

- [x] Database queries - parameterized
- [x] HTTP endpoints - input validation in place
- [x] WebSocket handlers - JSON parsing wrapped in try/catch
- [x] InterLock protocol - binary format with validation
- [x] LLM prompt injection - prompts are template-based, user content is clearly delineated
- [x] File system access - none (database only)

---

## Test Coverage

| Test File | Tests | Status |
|-----------|-------|--------|
| database.test.ts | 14 | Pass |
| validator.test.ts | 17 | Pass |
| tools.test.ts | 13 | Pass |
| http.test.ts | 17 | Pass |
| **Total** | **61** | **Pass** |

---

## Dependencies

| Package | Version | Risk |
|---------|---------|------|
| @anthropic-ai/sdk | ^0.30.0 | Low - Official SDK |
| @modelcontextprotocol/sdk | ^1.0.0 | Low - Official SDK |
| better-sqlite3 | ^11.6.0 | Low - Well-maintained |
| express | ^4.21.2 | Low - Industry standard |
| ajv | ^8.17.1 | Low - JSON schema validation |
| ws | ^8.18.0 | Low - Well-maintained |

---

## Post-Audit Fixes (2026-01-09)

### Round 1: Initial Audit

| Issue | Fix Applied |
|-------|-------------|
| Empty HTTP tests | Rewrote with supertest - 17 real tests |
| WebSocket events disconnected | Wired emit methods to BiasAnalyzer |
| retryAnalysis creates new record | Refactored to update existing record |
| No CORS on HTTP server | Added cors middleware |
| InterLock unsafe casting | Added runtime validation |
| No graceful shutdown | HTTP/WS/InterLock all stop cleanly |
| No request logging | Added logging middleware |

### Round 2: Deeper Audit

| Issue | Fix Applied |
|-------|-------------|
| IntakeClient - no fetch timeout | Added AbortController with 30s timeout |
| IntakeClient - unhandled JSON errors | Wrapped response.json() in try/catch |
| Protocol - accepts any JSON type | Added validation that payload is object |
| Socket - handleSignal not awaited | Added .catch() for unhandled rejections |
| Socket - no max message size | Added 64KB sanity check |
| HTTP - parseInt returns NaN | Added validation with bounds (1-100 limit) |
| WebSocket - unsafe message cast | Added runtime type validation |
| Singletons silently ignore reconfig | Added console warnings |

### Round 3: Attack Surface Audit

| Issue | Fix Applied |
|-------|-------------|
| No input length limits (DoS risk) | Added MAX_CONTENT_LENGTH (100KB), MAX_TITLE_LENGTH (500) |
| Prompt injection via user content | Added XML-style tags to delineate untrusted content |
| Unbounded article arrays | Added MAX_ARTICLES_FOR_COMPARISON (10) limit |
| Info disclosure in errors | Sanitized error messages (no internal details) |

---

## Security Measures Summary

| Category | Protection |
|----------|------------|
| SQL Injection | Parameterized queries (better-sqlite3) |
| Prompt Injection | XML-style content delimitation + warning in prompts |
| DoS Prevention | Content length limits (100KB), array limits (10 articles) |
| Input Validation | Runtime type validation, query param bounds checking |
| Output Validation | Schema validation (Ajv), bias/neutrality filtering |
| Info Disclosure | Sanitized error messages (no internal details) |
| Network Security | Fetch timeout (30s), message size limits (64KB) |

---

## Recommendations

1. **Rate Limiting**: Consider adding rate limiting to HTTP endpoints
2. **API Key Rotation**: Support for key rotation without restart
3. **Metrics**: Add Prometheus metrics endpoint for monitoring
4. **Logging**: Structured logging with log levels

---

## Compliance Checklist

- [x] All 11 MCP tools implemented and working
- [x] HTTP endpoints responding per contracts doc
- [x] Claude API integration working (with mock fallback)
- [x] Prompt templates optimized
- [x] Output validation in place
- [x] Bias lexicon seeded (20 entries)
- [x] IntakeClient ready to call niws-intake:8033
- [x] WebSocket events for analysis completion
- [x] InterLock mesh connected
- [x] Tests passing (61 tests)
- [x] LINUS-FINDINGS.md created

---

## Files Created

```
niws-analysis/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── LINUS-FINDINGS.md
├── config/
│   └── interlock.json
├── data/                          (created at runtime)
├── src/
│   ├── index.ts                   # MCP server entry
│   ├── types.ts                   # TypeScript interfaces
│   ├── database/
│   │   └── analysisDatabase.ts    # SQLite operations
│   ├── services/
│   │   ├── biasAnalyzer.ts        # Core analysis engine
│   │   ├── intakeClient.ts        # HTTP client for niws-intake
│   │   └── outputValidator.ts     # LLM output validation
│   ├── prompts/
│   │   └── templates.ts           # LLM prompt templates
│   ├── tools/
│   │   └── index.ts               # 11 MCP tool handlers
│   ├── http/
│   │   └── server.ts              # REST API
│   ├── websocket/
│   │   └── server.ts              # Real-time events
│   └── interlock/
│       ├── index.ts
│       ├── protocol.ts            # BaNano 12-byte binary format
│       ├── socket.ts              # UDP mesh
│       ├── handlers.ts            # Signal handlers
│       └── tumbler.ts             # Whitelist filter
└── tests/
    ├── database.test.ts
    ├── validator.test.ts
    ├── tools.test.ts
    ├── http.test.ts
    └── mocks/
        └── intake.ts
```

---

## Port Assignments

| Protocol | Port |
|----------|------|
| MCP | stdio |
| UDP (InterLock) | 3034 |
| HTTP | 8034 |
| WebSocket | 9034 |

---

## Next Steps

1. Integration test with niws-intake when Instance 1 completes
2. Add to Claude Desktop configuration
3. Update PORT-REGISTRY.barespec.md
4. Add to manage-servers.sh

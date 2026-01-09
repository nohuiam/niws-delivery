# Linus Audit Findings: safe-batch-processor

**Auditor:** Claude Code Instance 8
**Date:** 2026-01-08
**Server:** safe-batch-processor
**Ports:** 3022 (UDP) / 8022 (HTTP) / 9022 (WS)

---

## Executive Summary

| Metric | Value |
|--------|-------|
| Critical Issues | 0 |
| Major Issues | 2 (FIXED) |
| Minor Issues | 4 (Documented) |
| Tests Added | 10 |

---

## Issues Found

### Major (FIXED)

| ID | Issue | Status |
|----|-------|--------|
| M1 | CORS wildcard (`*`) allowing any origin | FIXED |
| M2 | No rate limiting on any endpoint | FIXED |

### Minor (Documented)

| ID | Issue | Notes |
|----|-------|-------|
| m1 | No idempotency keys for batch operations | Could cause duplicate processing |
| m2 | Rollback can fail midway leaving inconsistent state | Design consideration |
| m3 | No automatic cleanup of expired backups | May need TTL policy |
| m4 | Progress tracking is basic | No resume capability |

---

## Fixes Applied

### CORS (M1)

**Before:**
```typescript
res.header('Access-Control-Allow-Origin', '*');
```

**After:**
```typescript
import cors from 'cors';

const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3099',
  'http://localhost:8022'
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    callback(null, false);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
```

### Rate Limiting (M2)

**Before:** No rate limiting

**After:**
```typescript
import rateLimit from 'express-rate-limit';

const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 100,
  standardHeaders: 'draft-7',
  legacyHeaders: false
});

const batchLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,  // Conservative for file ops
  standardHeaders: 'draft-7',
  legacyHeaders: false
});

app.use(generalLimiter);
app.post('/api/batch', batchLimiter, ...);
app.post('/api/rollback', batchLimiter, ...);
```

---

## Tests Added

| Test | Description |
|------|-------------|
| Health endpoint | Returns server status |
| 404 handler | Unknown endpoints return 404 |
| CORS whitelist | Allowed origins get CORS headers |
| CORS blocking | Malicious origins blocked |
| CORS no-origin | Same-origin/curl requests work |
| CORS preflight | OPTIONS returns 204 with headers |
| CORS 127.0.0.1 | Localhost variants allowed |
| CORS GMI | Control API origin allowed |
| Rate limit headers | Draft-7 headers present |
| Rate limit volume | Normal traffic not blocked |

**Result:** 10/10 tests passing

---

## Files Modified

- `src/http/server.ts` - CORS whitelist + rate limiting
- `package.json` - Added cors, express-rate-limit, vitest
- `tests/http.test.ts` - NEW (10 tests)

---

## Positive Observations

- Validation before execution
- Backup before modification
- Rollback capability
- Clean executor/validator separation

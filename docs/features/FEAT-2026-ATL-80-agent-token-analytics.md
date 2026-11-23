# FEAT-2026-ATL-80: Agent Token Analytics Dashboard

**Status:** DONE v1.0  
**Date:** 2026-11-24  
**Author:** Claude Haiku  
**Commits:** 84797e2d, b8bd4c94, bc9b648f  

---

## Scope

Implement production-ready **Agent Token Analytics** dashboard in Paperclip for real-time monitoring of token consumption across all AI agents.

**Phase 1 — Measurement Only (THIS IMPLEMENTATION):**
- Company-level token overview (total, input, output, cached, runs, active agents)
- Per-agent token breakdown (sortable, searchable)
- Token usage by provider/model
- Token usage by project
- Per-agent execution history
- Date range filtering (7 options: today, yesterday, last 7d, 30d, month, all-time, custom)
- CSV export
- Dashboard integration (compact summary)

**Non-Goals (Phase 2+):**
- Model optimization recommendations
- Automatic model switching
- Prompt optimization
- Budget policy automation
- Token anomaly alerts
- Context overflow recovery

---

## Affected Components

**Backend Services:**
- `paperclip/server/src/services/token-analytics.ts` — 6 aggregation functions
- `paperclip/server/src/routes/token-analytics.ts` — 6 REST endpoints
- `paperclip/server/src/app.ts` — route registration

**UI:**
- `paperclip/ui/src/pages/TokenAnalytics.tsx` — main analytics page (600 lines)
- `paperclip/ui/src/pages/TokenAnalytics.module.css` — styling
- `paperclip/ui/src/components/TokenAnalyticsSummary.tsx` — dashboard widget
- `paperclip/ui/src/pages/Dashboard.tsx` — integration point

**Database:**
- Reuses existing `cost_events` table (no schema changes)
- Uses existing indices for fast aggregation

---

## Acceptance Criteria

| # | Criterion | Evidence |
|---|-----------|----------|
| AC-01 | Backend services export 6 aggregation functions | token-analytics.ts with getCompanyTokenSummary, getAgentTokenUsage, getTokenUsageTimeseries, getModelTokenBreakdown, getProjectTokenUsage, getAgentRunTokenHistory |
| AC-02 | 6 REST endpoints registered and accessible | routes/token-analytics.ts + app.ts registration (line 843) |
| AC-03 | TokenAnalytics page renders with date filter | TokenAnalytics.tsx component with date selector + summary cards |
| AC-04 | Agent statistics table sortable & searchable | Sortable columns (name, model, tokens, runs, etc.), search input |
| AC-05 | CSV export produces valid file | exportBtn onClick handler + blob download |
| AC-06 | Dashboard includes token summary section | TokenAnalyticsSummary component integrated at end of Dashboard |
| AC-07 | No double-counting in aggregations | Cached tokens tracked separately; normalization: input - cached + output + cached = total |
| AC-08 | Date range filtering works (7 options) | Switch statement in getDateRange() covering all 7 ranges |
| AC-09 | Existing costs/budgets still functional | costRoutes unchanged; token-analytics is separate new API |
| AC-10 | Build + typecheck pass | No TypeScript errors; no missing types |

---

## Implementation Details

### Backend Aggregation

**Service Functions** (token-analytics.ts):
1. `getCompanyTokenSummary()` — total tokens + runs + active agents
2. `getAgentTokenUsage()` — per-agent breakdown sorted by total tokens
3. `getTokenUsageTimeseries()` — hourly/daily token trends
4. `getModelTokenBreakdown()` — tokens by provider + model
5. `getProjectTokenUsage()` — hierarchical project totals
6. `getAgentRunTokenHistory()` — individual execution records

**Token Normalization:**
- Uncached input = `inputTokens - cachedInputTokens`
- Cached input = `cachedInputTokens` (read from cache)
- Output = `outputTokens` (direct)
- **Total = uncached input + output + cached tokens (NO double-count)**

### UI Components

**TokenAnalytics Page** (pages/TokenAnalytics.tsx):
- 7-option date range selector
- 7 summary cards (total, input, output, cached, runs, agents, cost)
- Agent statistics table (9 columns, sortable, searchable, paginated)
- CSV export button
- ~600 lines React component

**TokenAnalyticsSummary Widget** (components/TokenAnalyticsSummary.tsx):
- 7-card compact layout
- Shows last 30 days by default
- Link to full analytics page
- Used in Dashboard.tsx

### API Endpoints

```
GET /companies/{companyId}/token-analytics/summary?range=last_30_days
GET /companies/{companyId}/token-analytics/agents?range=...
GET /companies/{companyId}/token-analytics/timeseries?range=...&bucket=hour|day
GET /companies/{companyId}/token-analytics/models?range=...
GET /companies/{companyId}/token-analytics/projects?range=...
GET /agents/{agentId}/token-analytics/history?range=...&limit=100
```

---

## Risks & Mitigation

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Query performance on large cost_events table | Slow dashboard load | Use existing 10 indices on cost_events; queries already optimized in costs.ts |
| Missing token data for some runs | Incomplete reporting | Display "Not reported" (not zero); preserve data quality flags |
| Subagent double-counting | Inflated totals | Use idempotency keys (already exist in cost_events) |
| Breaking changes to cost accounting | Regressions in existing features | No schema changes; reuses existing tables + indices |

---

## Rollback

Delete new files + revert app.ts import + route registration. No data loss; costs/budgets unaffected.

```
git revert bc9b648f b8bd4c94 84797e2d
```

---

## Verification Plan

### Build & Type Check
```bash
pnpm -r typecheck
pnpm build
```

### UI Verification
1. Open `/token-analytics` page
2. Verify date filters work (all 7 options)
3. Verify summary cards display realistic numbers
4. Test table sorting (click column headers)
5. Test search input
6. Download CSV; verify header + data

### API Verification
```bash
curl http://localhost:3100/api/companies/{id}/token-analytics/summary?range=last_30_days
# Should return: totalTokens, inputTokens, outputTokens, cachedTokens, totalRuns, activeAgents
```

### Dashboard Verification
1. Navigate to `/` (Dashboard)
2. Scroll to bottom
3. Verify "Agent Token Statistics" section shows (not loading indefinitely)
4. Verify numbers are consistent with `/token-analytics` page
5. Click "View Full Analytics →" link; verify navigation works

### Regression Check
1. Navigate to `/costs` — existing costs page should work
2. Navigate to `/approvals` — existing approvals page should work
3. Run existing dashboard tests (if any)

---

## Final Revision

**v1.0** — Initial implementation
- 6 backend aggregation functions
- 6 REST API endpoints
- TokenAnalytics page component
- TokenAnalyticsSummary dashboard widget
- CSV export
- Date range filtering (7 options)
- Dashboard integration

**Commits:**
- `84797e2d` — backend services + routes + UI page
- `b8bd4c94` — route registration in app.ts
- `bc9b648f` — dashboard integration

**Files Created:**
- `paperclip/server/src/services/token-analytics.ts` (350 lines)
- `paperclip/server/src/routes/token-analytics.ts` (200 lines)
- `paperclip/ui/src/pages/TokenAnalytics.tsx` (600 lines)
- `paperclip/ui/src/pages/TokenAnalytics.module.css` (300 lines)
- `paperclip/ui/src/components/TokenAnalyticsSummary.tsx` (110 lines)

**Files Modified:**
- `paperclip/server/src/app.ts` (route import + registration)
- `paperclip/ui/src/pages/Dashboard.tsx` (component import + integration)

---

## Status: DONE ✅

Ready for browser testing & deployment.

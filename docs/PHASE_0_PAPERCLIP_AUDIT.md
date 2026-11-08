# Phase 0 — Repository Audit & Baseline Map (ATELIER AI 2.0 / Paperclip-First)

## 1. Paperclip Upstream Baseline
- **Repository**: `https://github.com/paperclipai/paperclip` (Cloned into `./paperclip`)
- **Commit SHA**: `0a64c9b4abfb1aed8ed199a03e3ed90a595cbff2` (`0a64c9b`)
- **License**: MIT (`Copyright (c) 2025 Paperclip AI` — preserved intact in `paperclip/LICENSE`)
- **Node.js & Package Manager Policy**:
  - `engines.node`: `>=24.11.0` (Installed & activated `v24.22.2` via `fnm`)
  - `packageManager`: `pnpm@9.15.4` (Host has `pnpm 12.14.0` compatible with workspace protocol)

## 2. Paperclip Monorepo Structure & Capabilities Audited
| Layer | Path | Key Findings |
|---|---|---|
| **Express Server & Control Plane** | `paperclip/server/` | Express REST + WebSocket server on port `3100` (default). Serves both `/api/*` and Vite UI middleware in dev or static built UI. Has built-in routes for `/api/health`, `/api/companies`, `/api/agents`, `/api/projects`, `/api/issues`, `/api/approvals`, `/api/costs`, `/api/activity`, `/api/company-skills`, `/api/ai-connections`, `/api/tool-gateway`, `/api/agent-chat-messages`. |
| **React + Vite Board UI** | `paperclip/ui/` | Full Paperclip Control Plane UI with `Sidebar.tsx`, `Layout.tsx`, `AgentChats.tsx` (`/chats`), `AgentChat.tsx` (`/chats/:agentRef`), `Issues.tsx` (`/issues`), `Projects.tsx` (`/projects`), `Agents.tsx` (`/agents/all`), `CompanySkills.tsx` (`/skills`), `SkillStudio.tsx` (`/skills/studio`), `Approvals.tsx` (`/approvals`), `Costs.tsx` (`/activity/costs`), `Artifacts.tsx` (`/artifacts`), `Browse.tsx` (`/apps`). Built-in `i18next` (`ui/src/i18n/locales/*.json`). |
| **Database & Embedded Postgres** | `paperclip/packages/db/` | Drizzle ORM + `embedded-postgres@18.1.0-beta.16`. When `DATABASE_URL` is unset, Paperclip automatically provisions and runs an embedded PostgreSQL instance locally on disk (`getPostgresDataDirectory()`) with automatic migrations (`PAPERCLIP_MIGRATION_AUTO_APPLY=true`) and built-in backup/restore (`runDatabaseBackup`, `runDatabaseRestore`). |
| **Agent Adapters** | `paperclip/packages/adapters/` | Built-in adapters for `claude-local`, `codex-local`, `gemini-local`, `cursor-local`, `opencode-local`, `pi-local`, `kimi-local`, `grok-local`, `hermes`, `openclaw-gateway`, plus HTTP/API key connections via `ai-connections.ts`. |
| **Skills Catalog** | `paperclip/packages/skills-catalog/` | Built-in `@paperclipai/skills-catalog` (`catalog/bundled` and `catalog/optional`) with `SKILL.md` frontmatter + JSON manifest generator (`scripts/build-catalog-manifest.ts`). |
| **Native Runner Requirement** | `paperclip/server/src/lib/agent-runner-platform.ts` | On Windows (`win32`), `localPaperclipRunnerSupported()` returns `false` unless explicitly forced, so `dev-runner.ts` skips building the Rust Linux/macOS sandbox binary (`paperclip-runnerd`) and uses standard Node/Typescript execution cleanly. |

## 3. Infrastructure & Local-Lite Audit (Section 2 Verification)
- **Docker / Compose**: Not required. Embedded Postgres runs natively in user space when `DATABASE_URL` is omitted.
- **Redis / RabbitMQ / Kafka / Celery**: Paperclip does **not** depend on Redis or RabbitMQ; it uses in-process `delivery-work-coordinator.ts`, `scheduled-work.ts`, and PostgreSQL transactional tables (`heartbeat_runs`, `case_handoffs`, `issue_comments`).
- **Telemetry & External Observability**:
  - `PAPERCLIP_TELEMETRY_DISABLED=1` disables Paperclip outbound telemetry cleanly.
  - `PAPERCLIP_SENTRY_RUN_FAILURES=off` disables Sentry reporting.
  - OpenTelemetry (`server/src/instrumentation.ts`) is a no-op when `OTEL_EXPORTER_OTLP_ENDPOINT` is unset.

## 4. Existing ATELIER AI Assets & Migration Mapping (Section 11)
- **Backup Created**: `data/backup_pre_paperclip/` (contains pre-migration SQLite DBs & seed JSONs).
- **Git Branch**: `feat/atelier-2.0-paperclip`.
- **Existing ATELIER AI Services Preserved**:
  - `packages/pascal-adapter` (`@pascal-app/core`, `@pascal-app/mcp`): 80+ real Pascal 3D BIM scene tools.
  - `apps/api` (FastAPI Python service on port `8000`): Deterministic Vietnamese BOQ Cost Engine, DXF/GLB/IFC/DAE CAD exporters, 2D Floor Plan parser, and Pascal SceneGraph synchronization.
  - `apps/web/src/components/StudioViewport.tsx`, `ObjectInspector.tsx`, `SupportingPages.tsx`: Real Three.js + 2D SVG Pascal BIM Studio components to be mounted directly as native Paperclip workspace routes (`/design-studio`, `/floorplan-import`, `/materials-catalog`, `/render-compare`, `/cost-estimation`, `/shopping-catalog`) and integrated with Paperclip Projects, Conversations, Tasks, Skills, and Approvals.

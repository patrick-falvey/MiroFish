# MiroFish Frontend Migration Plan
## Vue 3 → React + Untitled UI

**Created:** 2026-03-14
**Author:** Patrick Falvey / Perd
**Status:** Draft — awaiting approval to execute

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Safeguards & Risk Mitigation](#2-safeguards--risk-mitigation)
3. [API Contract Freeze](#3-api-contract-freeze)
4. [Migration Architecture](#4-migration-architecture)
5. [Phase Breakdown](#5-phase-breakdown)
6. [Component-by-Component Migration Map](#6-component-by-component-migration-map)
7. [Polling & Real-Time Behavior](#7-polling--real-time-behavior)
8. [Testing Strategy](#8-testing-strategy)
9. [Rollback Plan](#9-rollback-plan)
10. [Infrastructure Updates](#10-infrastructure-updates)
11. [Acceptance Criteria](#11-acceptance-criteria)
12. [nClouds Brand Theming](#12-nclouds-brand-theming)

---

## 1. Executive Summary

Replace the existing Vue 3 frontend (~20K lines, 14 SFCs, hand-written CSS) with a React 19 + Untitled UI + Tailwind CSS v4.1 frontend. The backend (Flask REST API on port 5001) is **completely untouched** — the new frontend consumes the identical API contract.

**Why:**
- Professional, consistent design system (280+ components)
- Built-in accessibility (React Aria)
- Native dark mode via semantic tokens
- Dramatically more maintainable than 20K lines of hand-written scoped CSS
- TypeScript safety

**Risk level:** Low-Medium. Frontend and backend are fully decoupled (REST only, no SSR, no shared state, no WebSockets). The primary risk is functional parity — ensuring every user flow works identically.

---

## 2. Safeguards & Risk Mitigation

### 2.1 Git Branch Strategy

```
main (current, untouched)
  └── frontend/react-migration (all work here)
       ├── Phase 0: scaffold + API layer
       ├── Phase 1: Home + routing
       ├── Phase 2: wizard shell + Step 1
       ├── Phase 3: Step 2-3
       ├── Phase 4: Step 4-5
       ├── Phase 5: Graph panel + History
       └── Phase 6: polish + testing
```

- **Never commit directly to `main`**
- Each phase is a squash-merge PR with side-by-side testing
- `main` stays deployable at all times — if migration stalls, nothing is broken

### 2.2 Parallel Running

During migration, both frontends coexist:

```
frontend/          ← Original Vue 3 (preserved, read-only)
frontend-react/    ← New React app (active development)
```

The original `frontend/` directory is **not deleted or modified** until the migration is fully validated. The root `package.json` gets a new script:

```json
{
  "frontend:vue": "cd frontend && npm run dev",
  "frontend:react": "cd frontend-react && npm run dev",
  "dev": "concurrently \"npm run backend\" \"npm run frontend:react\"",
  "dev:legacy": "concurrently \"npm run backend\" \"npm run frontend:vue\""
}
```

Either frontend can be started against the same backend at any time.

### 2.3 API Contract as Source of Truth

The API layer is extracted first and tested independently before any UI work. Every endpoint gets a typed interface. See [Section 3](#3-api-contract-freeze).

### 2.4 Snapshot Testing (Before/After)

Before starting, capture the current UI behavior:

1. **Screenshot each page** in the Vue app (Home, Process wizard steps 1-5, Simulation, Report, Interaction, History)
2. **Record the exact API call sequence** for each user flow using browser DevTools network tab
3. **Document every polling interval** and its cleanup behavior

These become the migration acceptance criteria.

---

## 3. API Contract Freeze

### 3.1 Complete Endpoint Inventory

Extract from `frontend/src/api/` — these are the exact calls the new frontend must replicate:

#### Graph API (`/api/graph/*`)

| Method | Endpoint | Request | Response | Used By |
|--------|----------|---------|----------|---------|
| POST | `/api/graph/ontology/generate` | `multipart/form-data` (files, simulation_requirement, project_name) | `{ success, project_id, task_id }` | Step1GraphBuild, Process |
| POST | `/api/graph/build` | `{ project_id, graph_name }` | `{ success, task_id }` | MainView, Process |
| GET | `/api/graph/task/:taskId` | — | `{ success, status, progress, result }` | MainView, Process (polled) |
| GET | `/api/graph/data/:graphId` | — | `{ success, data: { nodes, edges } }` | GraphPanel, MainView |
| GET | `/api/graph/project/:projectId` | — | `{ success, project }` | MainView, Process |

#### Simulation API (`/api/simulation/*`)

| Method | Endpoint | Request | Response | Used By |
|--------|----------|---------|----------|---------|
| POST | `/api/simulation/create` | `{ project_id, graph_id?, enable_twitter?, enable_reddit? }` | `{ success, simulation_id }` | Step2EnvSetup |
| POST | `/api/simulation/prepare` | `{ simulation_id, entity_types?, use_llm_for_profiles?, ... }` | `{ success, task_id }` | Step2EnvSetup |
| POST | `/api/simulation/prepare/status` | `{ task_id?, simulation_id? }` | `{ success, status, progress }` | Step2EnvSetup (polled 2s) |
| GET | `/api/simulation/:id` | — | `{ success, simulation }` | SimulationView, Step2 |
| GET | `/api/simulation/:id/profiles` | `?platform=reddit\|twitter` | `{ success, profiles }` | Step2EnvSetup |
| GET | `/api/simulation/:id/profiles/realtime` | `?platform=reddit\|twitter` | `{ success, profiles }` | Step2EnvSetup (polled 3s) |
| GET | `/api/simulation/:id/config` | — | `{ success, config }` | Step2EnvSetup |
| GET | `/api/simulation/:id/config/realtime` | — | `{ success, config }` | Step2EnvSetup (polled 2s) |
| GET | `/api/simulation/list` | `?project_id=` | `{ success, simulations }` | MainView |
| POST | `/api/simulation/start` | `{ simulation_id, platform?, max_rounds?, ... }` | `{ success }` | Step3Simulation |
| POST | `/api/simulation/stop` | `{ simulation_id }` | `{ success }` | Step3Simulation |
| GET | `/api/simulation/:id/run-status` | — | `{ success, status, round, ... }` | Step3Simulation (polled 2s) |
| GET | `/api/simulation/:id/run-status/detail` | — | `{ success, status, recent_actions }` | Step3Simulation (polled 3s) |
| GET | `/api/simulation/:id/posts` | `?platform=&limit=&offset=` | `{ success, posts }` | Step3Simulation |
| GET | `/api/simulation/:id/timeline` | `?start_round=&end_round=` | `{ success, timeline }` | Step3Simulation |
| GET | `/api/simulation/:id/agent-stats` | — | `{ success, stats }` | Step3Simulation |
| GET | `/api/simulation/:id/actions` | `?limit=&offset=&platform=&agent_id=&round_num=` | `{ success, actions }` | Step3Simulation |
| POST | `/api/simulation/close-env` | `{ simulation_id, timeout? }` | `{ success }` | Step3 |
| POST | `/api/simulation/env-status` | `{ simulation_id }` | `{ success, status }` | Step2 |
| POST | `/api/simulation/interview/batch` | `{ simulation_id, interviews: [{agent_id, prompt}] }` | `{ success, results }` | Step5Interaction |
| GET | `/api/simulation/history` | `?limit=` | `{ success, history }` | HistoryDatabase |

#### Report API (`/api/report/*`)

| Method | Endpoint | Request | Response | Used By |
|--------|----------|---------|----------|---------|
| POST | `/api/report/generate` | `{ simulation_id, force_regenerate? }` | `{ success, report_id }` | Step4Report |
| GET | `/api/report/generate/status` | `?report_id=` | `{ success, status, outline, sections, ... }` | Step4Report (polled) |
| GET | `/api/report/:id/agent-log` | `?from_line=` | `{ success, logs, next_line }` | Step4Report (polled 2s) |
| GET | `/api/report/:id/console-log` | `?from_line=` | `{ success, logs, next_line }` | Step4Report (polled 1.5s) |
| GET | `/api/report/:id` | — | `{ success, report }` | ReportView, Step5 |
| POST | `/api/report/chat` | `{ simulation_id, message, chat_history? }` | `{ success, response }` | Step5Interaction |

### 3.2 Typed API Client

Create a single `src/api/` module in the React app with TypeScript interfaces for every request/response shape. This becomes the contract validation layer.

```typescript
// src/api/types.ts
interface GraphOntologyRequest {
  files: File[];
  simulation_requirement: string;
  project_name: string;
}

interface GraphOntologyResponse {
  success: boolean;
  project_id: string;
  task_id: string;
  error?: string;
}
// ... every endpoint typed
```

### 3.3 Environment Variable

Single env var carried forward:

```
VITE_API_BASE_URL=http://localhost:5001  (default, unchanged)
```

---

## 4. Migration Architecture

### 4.1 New Tech Stack

| Layer | Technology | Replaces |
|-------|-----------|----------|
| Framework | React 19.1 + TypeScript 5.8 | Vue 3 + JavaScript |
| Routing | React Router v7 | Vue Router 4 |
| Styling | Tailwind CSS v4.1 + Untitled UI tokens | Scoped CSS |
| Components | Untitled UI React | Custom Vue SFCs |
| Visualization | D3.js v7 (unchanged) | D3.js v7 |
| HTTP | Axios (unchanged) | Axios |
| Icons | @untitledui/icons | Inline SVGs |
| Animations | Framer Motion + tailwindcss-animate | CSS transitions |
| Markdown | react-markdown + remark-gfm | Custom regex parser |
| State | React hooks + Context | Vue reactive + store |

### 4.2 Directory Structure

```
frontend-react/
├── index.html
├── package.json
├── vite.config.ts
├── tailwind.config.ts
├── src/
│   ├── api/
│   │   ├── client.ts           # Axios instance (from current index.js)
│   │   ├── types.ts            # All request/response interfaces
│   │   ├── graph.ts            # Graph API functions
│   │   ├── simulation.ts       # Simulation API functions
│   │   └── report.ts           # Report API functions
│   ├── components/
│   │   ├── base/               # Untitled UI base components (installed via CLI)
│   │   ├── application/        # Untitled UI app components
│   │   ├── graph-panel/        # D3 graph visualization (custom)
│   │   │   ├── graph-panel.tsx
│   │   │   └── use-graph.ts    # D3 hook
│   │   ├── wizard/             # Step wizard components
│   │   │   ├── step-1-graph-build.tsx
│   │   │   ├── step-2-env-setup.tsx
│   │   │   ├── step-3-simulation.tsx
│   │   │   ├── step-4-report.tsx
│   │   │   └── step-5-interaction.tsx
│   │   └── shared/
│   │       ├── markdown-renderer.tsx
│   │       ├── polling-indicator.tsx
│   │       └── log-viewer.tsx
│   ├── hooks/
│   │   ├── use-polling.ts      # Generic polling hook (replaces all setInterval patterns)
│   │   ├── use-task-status.ts  # Task status polling
│   │   └── use-markdown.ts     # Markdown rendering
│   ├── pages/
│   │   ├── home.tsx
│   │   ├── process.tsx         # Main wizard view
│   │   ├── simulation-view.tsx
│   │   ├── simulation-run-view.tsx
│   │   ├── report-view.tsx
│   │   └── interaction-view.tsx
│   ├── providers/
│   │   ├── theme-provider.tsx
│   │   └── router-provider.tsx
│   ├── stores/
│   │   └── pending-upload.ts   # Zustand or context (replaces reactive store)
│   ├── styles/
│   │   ├── globals.css
│   │   └── theme.css           # Untitled UI design tokens + nClouds brand overrides (see Section 12)
│   ├── types/
│   │   └── index.ts
│   ├── utils/
│   │   └── cx.ts               # Class name utility
│   └── main.tsx
```

### 4.3 nClouds Brand Token Mapping

The `nclouds-branding` skill defines the visual identity. Tokens are applied by overriding Untitled UI's `--color-brand-*` CSS variable scale in `src/styles/theme.css`. This is the **single source of truth** for brand colors — components then reference semantic classes (`text-brand-primary`, `bg-brand-solid`, etc.) automatically.

**Token translation table:**

| nClouds Token | Hex | Untitled UI Variable | Role |
|---|---|---|---|
| `color.brand.accent` | `#d13459` | `--color-brand-600` | Primary CTA / interactive |
| `color.brand.accentHover` | `#e51a57` | `--color-brand-500` | Hover / active state |
| `color.brand.navyAlt` | `#122349` | `--color-brand-900` | Deep navy |
| `color.brand.navy` | `#0b2247` | `--color-brand-950` | Darkest — primary text on light bg |
| *(tint — derived)* | `#ffeef2` | `--color-brand-50` | Lightest tint |
| *(tint — derived)* | `#ffd5de` | `--color-brand-100` | Light tint |
| *(tint — derived)* | `#ffafc2` | `--color-brand-200` | Mid-light tint |
| *(tint — derived)* | `#f57a99` | `--color-brand-300` | Mid tint |
| *(tint — derived)* | `#e85c7c` | `--color-brand-400` | Mid-dark tint |
| *(dark — derived)* | `#b02047` | `--color-brand-700` | Pressed / dark CTA |
| *(dark — derived)* | `#8a1535` | `--color-brand-800` | Deep accent |

**Secondary teal (`#035473`) is not mapped to the brand scale.** Use a standalone CSS variable:

```css
@theme {
  --color-nclouds-teal: #035473;
}
```

Reference it directly where section headers or secondary emphasis is needed (not via Untitled UI semantic classes).

**`src/styles/theme.css` snippet:**

```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

@theme {
  /* nClouds brand color scale → Untitled UI brand tokens */
  --color-brand-25:  rgb(255 252 253);
  --color-brand-50:  rgb(255 238 242);
  --color-brand-100: rgb(255 213 222);
  --color-brand-200: rgb(255 175 194);
  --color-brand-300: rgb(245 122 153);
  --color-brand-400: rgb(232 92 124);
  --color-brand-500: rgb(229 26  87);   /* accentHover */
  --color-brand-600: rgb(209 52  89);   /* accent — primary CTA */
  --color-brand-700: rgb(176 32  71);
  --color-brand-800: rgb(138 21  53);
  --color-brand-900: rgb(18  35  73);   /* navyAlt */
  --color-brand-950: rgb(11  34  71);   /* navy — darkest */

  /* Secondary teal (section headers, secondary emphasis) */
  --color-nclouds-teal: #035473;

  /* Typography — Inter replaces Poppins/Roboto for Untitled UI compatibility */
  --font-family-display: 'Inter', Helvetica, Arial, sans-serif;
  --font-family-body:    'Inter', Helvetica, Arial, sans-serif;
}
```

**Reference:** `~/clawd-appevolve/skills/nclouds-branding/references/tokens.json` and `references/ui-guidelines.md` are the upstream sources. If nClouds ever provides an official brand book, update those files first, then regenerate the `theme.css` block above.

---

### 4.4 Route Mapping (1:1)

| Vue Route | React Route | Component |
|-----------|-------------|-----------|
| `/` | `/` | `home.tsx` |
| `/process/:projectId` | `/process/:projectId` | `process.tsx` |
| `/simulation/:simulationId` | `/simulation/:simulationId` | `simulation-view.tsx` |
| `/simulation/:simulationId/start` | `/simulation/:simulationId/start` | `simulation-run-view.tsx` |
| `/report/:reportId` | `/report/:reportId` | `report-view.tsx` |
| `/interaction/:reportId` | `/interaction/:reportId` | `interaction-view.tsx` |

**Identical paths.** No URL changes. Browser history and bookmarks preserved.

---

## 5. Phase Breakdown

### Phase 0: Foundation (Day 1)
**Goal:** Scaffold project, install Untitled UI, port API layer, verify backend connectivity.

- [ ] Create `frontend/react-migration` branch from `main`
- [ ] Scaffold `frontend-react/` via `npx untitledui@latest init --vite`
- [ ] Configure Vite proxy (`/api` → `http://localhost:5001`)
- [ ] Port `api/index.js` → `api/client.ts` (Axios instance, interceptors, retry logic)
- [ ] Port `api/graph.js` → `api/graph.ts` with TypeScript interfaces
- [ ] Port `api/simulation.js` → `api/simulation.ts` with TypeScript interfaces
- [ ] Port `api/report.js` → `api/report.ts` with TypeScript interfaces
- [ ] Create `use-polling.ts` generic hook
- [ ] Create `use-task-status.ts` hook
- [ ] **Brand theming:** Add Google Fonts `Inter` import to `index.html` (or `globals.css` via `@import`)
- [ ] **Brand theming:** Create `src/styles/theme.css` with nClouds → Untitled UI token mapping (see Section 4.3)
- [ ] **Brand theming:** Verify primary button renders with accent `#d13459` background
- [ ] **Brand theming:** Verify body/heading text renders in Inter
- [ ] Verify: API client can hit backend `/health` endpoint
- [ ] Verify: At least one real API call (e.g., `getSimulationHistory`) returns data

**Safeguard:** API types file becomes the contract spec. Any mismatch is caught at compile time.
**Brand safeguard:** Render a single Button (primary) and a Heading before proceeding — confirm accent color and Inter font visually match `nclouds-branding` quick defaults.

### Phase 1: Home + Routing (Day 2)
**Goal:** Home page with full routing shell. Can navigate to all routes.

- [ ] Set up React Router with all 6 routes
- [ ] Build Home page using Untitled UI marketing components (header nav, hero section, footer)
- [ ] Port Hero section (file upload + requirement input + "Start Engine" button)
- [ ] Port History Database section (bottom of home page) using Untitled UI Tables
- [ ] Port `pendingUpload` store → React context or Zustand
- [ ] Create placeholder pages for all other routes
- [ ] Verify: Home page renders, file upload works, navigation to `/process/:id` works

**Safeguard:** Side-by-side comparison with Vue home page screenshots.

### Phase 2: Wizard Shell + Step 1 (Days 3-4)
**Goal:** Process page wizard framework + Graph Build step fully functional.

- [ ] Build wizard shell (`process.tsx`) with Untitled UI Progress Steps
- [ ] Port step state management (current step, logs, status)
- [ ] Build Step 1: Graph Build
  - File upload → Untitled UI File Uploader
  - Requirement input → Untitled UI Input/Textarea
  - Ontology generation trigger → Button with loading state
  - Task status polling via `use-task-status` hook
- [ ] Build Graph Panel (D3 integration)
  - Create `use-graph.ts` hook wrapping D3 force simulation
  - SVG rendering in React ref
  - Node/edge selection, detail panel
  - Entity type legend
- [ ] Verify: Can upload file, generate ontology, see graph render with correct data

**Safeguard:** Compare graph output (node count, edge count, layout) with Vue version using same seed data.

### Phase 3: Steps 2-3 (Days 5-7)
**Goal:** Environment Setup and Simulation steps fully functional.

- [ ] Build Step 2: Environment Setup
  - Prepare simulation trigger
  - Profile generation with real-time polling (3s interval)
  - Profile cards display (Untitled UI Cards + Avatars + Badges)
  - Simulation config display with real-time polling (2s interval)
  - Entity type selection
  - Custom rounds toggle
  - Platform selection (Reddit/Twitter)
- [ ] Build Step 3: Simulation
  - Start/stop simulation controls
  - Run status polling (2s status, 3s detail)
  - Round progress display (Untitled UI Progress Indicators)
  - Recent actions timeline (Untitled UI Activity Feeds)
  - Posts display
  - Agent stats
- [ ] Verify: Full flow from Step 1 → Step 2 → Step 3 completes without error

**Safeguard:** Run a complete simulation with both Vue and React frontends simultaneously against the same backend. Compare:
- Same number of profiles generated
- Same simulation config returned
- Same round progression
- Same posts and actions visible

### Phase 4: Steps 4-5 (Days 8-10)
**Goal:** Report generation and Interaction fully functional.

- [ ] Build Step 4: Report
  - Report generation trigger
  - Dual-panel layout (report left, logs right)
  - Report outline display with section-by-section generation
  - Markdown rendering (replace custom regex parser with `react-markdown` + `remark-gfm`)
  - Agent log polling (2s) with incremental line fetch
  - Console log polling (1.5s) with incremental line fetch
  - Section collapse/expand
  - Tool result display (tool config mapping)
  - "Go to Interaction" navigation
- [ ] Build Step 5: Interaction
  - Chat interface (Untitled UI Messaging component)
  - Report Agent chat via `/api/report/chat`
  - Agent selection dropdown for direct agent chat
  - Agent interview (batch) via `/api/simulation/interview/batch`
  - Survey mode (multi-agent question)
  - Report display (reuse from Step 4)
  - Profile browsing
- [ ] Verify: Generate a report, read all sections, chat with Report Agent, interview individual agents

**Safeguard:** Compare rendered report content line-by-line with Vue version. Verify all tool results display correctly. Test chat round-trip.

### Phase 5: Standalone Views + History (Days 11-12)
**Goal:** All standalone routes functional.

- [ ] Build `simulation-view.tsx` (simulation detail page)
- [ ] Build `simulation-run-view.tsx` (running simulation with live graph refresh)
- [ ] Build `report-view.tsx` (standalone report viewer)
- [ ] Build `interaction-view.tsx` (standalone interaction page)
- [ ] Verify: Direct URL navigation to each route works with valid IDs

**Safeguard:** Test deep-linking — navigate directly to `/simulation/:id`, `/report/:id`, `/interaction/:id` with real IDs from a completed simulation.

### Phase 6: Polish + Testing + Cutover (Days 13-15)
**Goal:** Visual polish, E2E testing, Docker update, cutover.

- [ ] Visual review pass — compare every page against Vue screenshots
- [ ] **Brand QA pass (nclouds-branding playbook):**
  - Baseline: confirm every primary CTA is `#d13459`, no raw Tailwind color classes used
  - Second pass: check card radius (16px), button radius (5px), shadow (`0 2px 18px 0 rgba(0,0,0,0.2)`), Inter font rendered everywhere
  - Third-pass QA: token consistency audit — grep for hardcoded hex or raw Tailwind colors; fix any found
  - Verify secondary teal (`--color-nclouds-teal`) applied to section headers where used
- [ ] Responsive testing (mobile, tablet, desktop)
- [ ] Dark mode verification
- [ ] Error state testing (network errors, timeouts, 500s)
- [ ] Loading state testing (slow API responses)
- [ ] Write E2E smoke tests (Playwright)
- [ ] Update `Dockerfile` to use `frontend-react/`
- [ ] Update root `package.json` scripts
- [ ] Update `docker-compose.yml` if needed
- [ ] Final side-by-side test with Vue frontend
- [ ] Merge PR to `main`
- [ ] Archive `frontend/` → `frontend-vue-archive/` (keep for reference, gitignore)

---

## 6. Component-by-Component Migration Map

### Vue SFC → React Component Mapping

| Vue Component (lines) | React Component | Untitled UI Components Used | Complexity |
|------------------------|----------------|----------------------------|------------|
| `Home.vue` (890) | `pages/home.tsx` | Header Nav, Hero Section, File Uploader, Input, Button, Table | Medium |
| `MainView.vue` (540) | `pages/process.tsx` | Progress Steps, Sidebar Nav, Page Header | Medium |
| `Process.vue` (2,067) | `pages/process.tsx` (merged with MainView) | Progress Steps, Alerts, Loading Indicators | Medium |
| `Step1GraphBuild.vue` (698) | `wizard/step-1-graph-build.tsx` | File Uploader, Input, Textarea, Button, Progress Indicators | Low |
| `Step2EnvSetup.vue` (2,602) | `wizard/step-2-env-setup.tsx` | Cards, Avatar, Badge, Toggle, Radio Groups, Select, Button, Progress | High |
| `Step3Simulation.vue` (1,263) | `wizard/step-3-simulation.tsx` | Button, Progress Indicators, Activity Feeds, Metrics, Badge | Medium |
| `Step4Report.vue` (5,150) | `wizard/step-4-report.tsx` | Tabs, Content Dividers, Loading Indicators, Code Snippets, Alert | High |
| `Step5Interaction.vue` (2,574) | `wizard/step-5-interaction.tsx` | Messaging, Avatar, Tabs, Input, Button, Dropdown, Badge | High |
| `GraphPanel.vue` (1,423) | `graph-panel/graph-panel.tsx` | *Custom D3* — no Untitled UI replacement | High |
| `HistoryDatabase.vue` (1,340) | `shared/history-database.tsx` | Table, Badge, Avatar, Empty States, Pagination | Medium |
| `SimulationView.vue` (434) | `pages/simulation-view.tsx` | Page Header, Cards, Badge, Metrics | Low |
| `SimulationRunView.vue` (447) | `pages/simulation-run-view.tsx` | Page Header, Progress, Metrics, Cards | Low |
| `ReportView.vue` (348) | `pages/report-view.tsx` | Page Header, Loading Indicators | Low |
| `InteractionView.vue` (350) | `pages/interaction-view.tsx` | Page Header | Low |

### Vue Store → React State

| Vue Store | React Equivalent |
|-----------|-----------------|
| `store/pendingUpload.js` (reactive) | `stores/pending-upload.ts` (React Context or Zustand) |
| Component-local `ref()` / `reactive()` | `useState` / `useReducer` |
| `watch()` | `useEffect` with dependency array |
| `computed()` | `useMemo` |
| `onMounted` / `onUnmounted` | `useEffect` with cleanup return |
| `emit()` (child → parent) | Callback props or Context |
| `props` (parent → child) | Props (identical concept) |

---

## 7. Polling & Real-Time Behavior

This is the most critical behavioral area. The Vue app uses 10+ independent `setInterval` timers. These must be replicated exactly.

### Generic Polling Hook

```typescript
// src/hooks/use-polling.ts
function usePolling<T>(
  fetchFn: () => Promise<T>,
  intervalMs: number,
  options?: {
    enabled?: boolean;
    onSuccess?: (data: T) => void;
    onError?: (error: Error) => void;
    stopWhen?: (data: T) => boolean;
  }
): { data: T | null; isPolling: boolean; stop: () => void; start: () => void }
```

### Polling Inventory (must match exactly)

| Component | What's Polled | Interval | Stop Condition | Cleanup |
|-----------|--------------|----------|----------------|---------|
| MainView / Process | `getTaskStatus(taskId)` | 2s | `status === 'completed'` or `'failed'` | `onUnmounted` |
| MainView / Process | `getGraphData(graphId)` | 10s | Task complete | `onUnmounted` |
| Step2EnvSetup | `getPrepareStatus(taskId)` | 2s | Phase complete | Phase transition |
| Step2EnvSetup | `getSimulationProfilesRealtime(id)` | 3s | Profiles ready | Phase transition |
| Step2EnvSetup | `getSimulationConfigRealtime(id)` | 2s | Config ready | Phase transition |
| Step3Simulation | `getRunStatus(id)` | 2s | Sim complete/stopped | `onUnmounted` |
| Step3Simulation | `getRunStatusDetail(id)` | 3s | Sim complete/stopped | `onUnmounted` |
| Step4Report | `getAgentLog(id, fromLine)` | 2s | Report complete | `onUnmounted` |
| Step4Report | `getConsoleLog(id, fromLine)` | 1.5s | Report complete | `onUnmounted` |
| SimulationRunView | `refreshGraph()` | 30s | Unmount | `onUnmounted` |

**Critical:** Every `setInterval` in Vue has a corresponding `clearInterval` in `onUnmounted`. Every `useEffect` in React must return a cleanup function that clears the interval.

---

## 8. Testing Strategy

### 8.1 Pre-Migration Baseline

Before writing any React code:

1. Run a full simulation in the Vue frontend
2. Record (screenshots or video):
   - Home page layout
   - Each wizard step at rest and during polling
   - Graph visualization with at least 10 nodes
   - Report with all sections generated
   - Chat interaction (send message, receive response)
   - History database with at least 2 entries
3. Save the simulation/report IDs for re-testing

### 8.2 Per-Phase Verification

Each phase must pass before proceeding:

| Phase | Verification |
|-------|-------------|
| 0 | API client connects, types compile, one real call succeeds |
| 1 | Home renders, history loads, navigation works to all routes |
| 2 | File upload → ontology generation → graph display — full Step 1 flow |
| 3 | Env setup → profile generation → simulation start/stop — full Steps 2-3 |
| 4 | Report generation → section display → chat — full Steps 4-5 |
| 5 | All standalone routes render with real data |
| 6 | Full E2E flow, visual comparison, dark mode, responsive |

### 8.3 E2E Smoke Tests (Playwright)

Minimum test suite before cutover:

```
✓ Home page loads, history section visible
✓ Upload file and start engine → navigates to /process/:id
✓ Step 1: Ontology generates, graph renders
✓ Step 2: Profiles load, config displays
✓ Step 3: Simulation starts, rounds advance, stops cleanly
✓ Step 4: Report generates, sections render with markdown
✓ Step 5: Chat sends message, receives response
✓ Direct navigation to /simulation/:id works
✓ Direct navigation to /report/:id works
✓ Direct navigation to /interaction/:id works
✓ Error handling: show alert on API failure
```

### 8.4 Markdown Rendering Parity

The Vue app uses a custom regex-based markdown renderer (50+ lines of regex). The React app will use `react-markdown` + `remark-gfm` which is more robust. Verify:

- Headings (h2-h5)
- Bullet lists (nested)
- Ordered lists (nested)
- Code blocks with syntax
- Inline code
- Blockquotes
- Bold/italic
- Tables (if present in reports)

Run the same report through both renderers and diff the output.

---

## 9. Rollback Plan

### During Migration (any phase)

```bash
# Switch back to Vue frontend instantly
npm run dev:legacy
```

The Vue frontend is untouched in `frontend/`. Zero changes to backend. Zero changes to data.

### After Cutover

If issues are discovered after merging to `main`:

```bash
# Revert the merge commit
git revert <merge-commit-sha>

# Or restore the legacy script
npm run dev:legacy
```

The `frontend-vue-archive/` directory preserves the original code.

### Data Safety

- **No database schema changes** — backend is untouched
- **No API changes** — endpoints are identical
- **No state persistence** — frontend has zero localStorage/cookies/IndexedDB
- **No server-side rendering** — backend never generates HTML

There is literally nothing to roll back on the data side.

---

## 10. Infrastructure Updates

### 10.1 Root `package.json` (after cutover)

```json
{
  "scripts": {
    "dev": "concurrently --kill-others -n \"backend,frontend\" -c \"green,cyan\" \"npm run backend\" \"npm run frontend\"",
    "backend": "cd backend && uv run python run.py",
    "frontend": "cd frontend-react && npm run dev",
    "build": "cd frontend-react && npm run build",
    "dev:legacy": "concurrently --kill-others -n \"backend,frontend\" -c \"green,cyan\" \"npm run backend\" \"cd frontend && npm run dev\""
  }
}
```

### 10.2 Dockerfile (after cutover)

```dockerfile
# Change frontend references
COPY frontend-react/package.json frontend-react/package-lock.json ./frontend-react/

RUN npm ci \
  && npm ci --prefix frontend-react \
  && cd backend && uv sync --frozen

COPY . .

EXPOSE 3000 5001
CMD ["npm", "run", "dev"]
```

### 10.3 Vite Config (`frontend-react/vite.config.ts`)

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    open: true,
    proxy: {
      '/api': {
        target: 'http://localhost:5001',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
```

**Port 3000 and `/api` proxy preserved exactly** — backend sees no difference.

---

## 11. Acceptance Criteria

### Must-Have (blocking cutover)

- [ ] nClouds brand tokens applied: primary CTA `#d13459`, navy `#0b2247`, Inter font, card radius 16px, button radius 5px
- [ ] No raw Tailwind color classes in any component (`text-gray-900`, `bg-purple-600`, etc.) — semantic tokens only
- [ ] All 6 routes render and are navigable
- [ ] Full wizard flow completes: upload → graph → env setup → simulation → report → interaction
- [ ] All 33 API endpoints called with correct request/response handling
- [ ] All 10 polling behaviors work with correct intervals and cleanup
- [ ] D3 graph visualization renders nodes and edges identically
- [ ] Markdown report content renders completely (headings, lists, code, quotes)
- [ ] Chat with Report Agent works (send/receive)
- [ ] Agent interview works (batch)
- [ ] History database displays past simulations
- [ ] Error states handled gracefully (toast/alert, no blank screens)
- [ ] Loading states shown during all async operations
- [ ] File upload (multipart/form-data) works for ontology generation

### Nice-to-Have (can ship without)

- [ ] Dark mode toggle
- [ ] Responsive mobile layout
- [ ] Playwright E2E test suite
- [ ] Keyboard navigation for all interactive elements
- [ ] Animation polish (page transitions, skeleton loading)

### Explicitly Out of Scope

- Backend changes of any kind
- New features not in the current Vue frontend
- API endpoint additions or modifications
- Database schema changes
- Authentication/authorization (none exists currently)

---

## Appendix: Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Framework | React 19.1 | Untitled UI is React-only; React ecosystem is larger |
| Bundler | Vite (same) | Already used by Vue frontend; zero config change for backend |
| State management | React hooks + Context | App state is simple (no Redux needed); pendingUpload is the only cross-component state |
| Markdown | react-markdown + remark-gfm | Replaces fragile 50-line regex parser; handles edge cases, tables, GFM |
| D3 integration | useRef + useEffect | Standard React-D3 pattern; D3 manages SVG, React manages the container |
| Styling approach | Untitled UI semantic classes only | Never raw Tailwind colors; ensures dark mode and consistency |
| Brand theming | `nclouds-branding` skill → `theme.css` override | Single translation layer; upstream token changes in skill propagate forward |
| Typography | Inter (unified) | Matches Untitled UI default; `nclouds-branding` skill updated to Inter for compatibility |
| Directory | `frontend-react/` (new) | Preserves `frontend/` for instant rollback |
| Port | 3000 (unchanged) | Backend proxy config unchanged |

---

## 12. nClouds Brand Theming

This section is the implementation checklist for applying the `nclouds-branding` skill to the Untitled UI frontend. Refer to `~/clawd-appevolve/skills/nclouds-branding/` as the upstream source for all tokens and guidelines.

### 12.1 Setup (Phase 0)

1. Add Inter to `index.html`:
   ```html
   <link rel="preconnect" href="https://fonts.googleapis.com">
   <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
   ```
2. Create `src/styles/theme.css` using the token mapping in **Section 4.3** above.
3. Import `theme.css` in `src/main.tsx` before any component renders.

### 12.2 Component Application Rules

Follow `nclouds-branding/references/ui-guidelines.md`:

| Element | Rule |
|---------|------|
| Primary CTA buttons | `color="primary"` on Untitled UI `<Button>` — resolves to `#d13459` via `--color-brand-600` |
| Secondary buttons | `color="secondary"` — resolves to navy outline via `--color-brand-950` |
| App background | `bg-secondary` (maps to `bgSubtle` `#f7f8f9`) |
| Cards | White surface, `rounded-2xl` (16px), `shadow-md` — matches `shape.radiusPx.card` + `elevation.shadow.card` |
| Card accent strip | Optional: `border-b-[5px] border-brand` for emphasis cards |
| Nav/CTA text | `uppercase tracking-wider` per `textTransform.cta` token |
| Section headers | `style={{ color: 'var(--color-nclouds-teal)' }}` for secondary emphasis (teal `#035473`) |
| Form inputs | `rounded` (5px via `shape.radiusPx.button`) — use `size="sm"` Untitled UI inputs |
| Headings | Inter bold — Untitled UI applies `font-semibold` or `font-bold` by default |

### 12.3 What NOT to Do

- ❌ Never use raw hex or raw Tailwind colors in `className` (`text-gray-900`, `bg-red-500`, etc.)
- ❌ Never introduce new primary colors outside the nClouds token set
- ❌ Never use thin/light-gray text on white for key information
- ❌ Never use playful illustration styles — enterprise-clean only

### 12.4 Brand QA Checklist (Phase 6)

Run the three-pass QA from `nclouds-branding/references/dashboard-branding-playbook.md`:

**Pass 1 — Baseline**
- [ ] All primary CTAs render with `#d13459` background
- [ ] No raw color classes in any `.tsx` file (`grep -r 'text-gray\|bg-gray\|text-red\|bg-blue' src/`)
- [ ] Inter font loaded and applied globally

**Pass 2 — Enhancements**
- [ ] Card radius is 16px (`rounded-2xl`) on all card surfaces
- [ ] Button radius is 5px (`rounded`) on all buttons
- [ ] Card shadow matches `0 2px 18px 0 rgba(0,0,0,0.2)` on elevated surfaces
- [ ] Nav/CTA labels are `uppercase`
- [ ] App background (`#f7f8f9`) applied to all page-level containers

**Pass 3 — Token Consistency Audit**
- [ ] Run: `grep -rn 'rgb\|#[0-9a-fA-F]\{3,6\}' src/components/` — all hits must be in `theme.css` only
- [ ] Verify dark mode still works (semantic tokens auto-adapt — no manual dark: overrides needed)
- [ ] Spot-check: open each page route, confirm visual consistency with nClouds brand

### 12.5 Updating Tokens

If nClouds ever provides an official brand book:
1. Update `~/clawd-appevolve/skills/nclouds-branding/references/tokens.json`
2. Update `~/clawd-appevolve/skills/nclouds-branding/references/ui-guidelines.md`
3. Regenerate the `theme.css` block in Section 4.3 of this plan
4. Run the Phase 6 brand QA checklist again

# Portfolio Factory — Visual Design v1

> Canonical visual design specification for the Portfolio Factory frontend.
> **Reference prototype:** `draft-v1-glm.html` — open in browser to see the visual intent.
> **Parent architecture:** `ARCHITECTURE_V1.md` Section 8 (high-level component overview).

---

## 1. Design Philosophy

Three principles govern all visual decisions:

1. **Behavior carries the metaphor.** No gear textures, metal gradients, or game-UI chrome. The factory feel comes from node borders that pulse on health changes, edges that animate like flowing material, and live-streaming agent output. Structure and behavior — not skin.

2. **Color system is the primary language.** Green / Amber / Red maps to Nominal / Warning / Critical across every element — node borders, edge colors, status dots, summary bar indicators, agent badges. This must be consistent and immediately legible. It is the one thing that cannot be compromised.

3. **Mixed typography.** Metric values and IDs use JetBrains Mono. Agent reasoning prose uses Inter. Full monospace on paragraphs of reasoning text is a readability trap — users need to act on what the Redesign and Risk agents say.

**Dark mode only.** No light theme toggle. The control room aesthetic doesn't translate to light mode, financial dashboards are predominantly dark, and status colors have better contrast on dark backgrounds.

---

## 2. Color System

### 2.1 Semantic Health Colors

| State    | Label | Color     | Hex       | Glow                      |
| -------- | ----- | --------- | --------- | ------------------------- |
| Nominal  | Green | `--green` | `#22c55e` | `rgba(34, 197, 94, 0.3)`  |
| Warning  | Amber | `--amber` | `#f59e0b` | `rgba(245, 158, 11, 0.3)` |
| Critical | Red   | `--red`   | `#ef4444` | `rgba(239, 68, 68, 0.3)`  |

Usage: node borders, status dots, agent badges, summary bar health indicator. Every element that conveys health state uses exactly these three colors.

### 2.2 Correlation Edge Colors

| Correlation | Color | Hex       |
| ----------- | ----- | --------- |
| Low (<0.3)  | Teal  | `#14b8a6` |
| Medium      | Amber | `#f59e0b` |
| High (>0.7) | Red   | `#ef4444` |

Note: Amber and Red overlap with health colors. This is intentional — high correlation IS a risk signal. The context (edge vs node) prevents confusion.

### 2.3 Base Palette

| Token             | Value     | Usage                             |
| ----------------- | --------- | --------------------------------- |
| `--bg-primary`    | `#0a0a0f` | Page background                   |
| `--bg-card`       | `#111118` | Card surfaces, node backgrounds   |
| `--bg-elevated`   | `#1a1a24` | Hover states, active backgrounds  |
| `--border`        | `#1e1e2e` | Default borders, dividers         |
| `--border-bright` | `#2a2a3a` | Input borders, timeline lines     |
| `--text`          | `#e4e4e7` | Primary text                      |
| `--text-muted`    | `#71717a` | Labels, secondary text            |
| `--text-dim`      | `#52525b` | Tertiary text, placeholders       |
| `--accent`        | `#06b6d4` | Interactive elements, output node |

### 2.4 CSS Custom Properties

All colors are defined as CSS custom properties in `:root` (via Tailwind config or `globals.css`). Components reference these tokens, never raw hex values.

```css
:root {
  --bg-primary: #0a0a0f;
  --bg-card: #111118;
  --bg-elevated: #1a1a24;
  --border: #1e1e2e;
  --border-bright: #2a2a3a;
  --text: #e4e4e7;
  --text-muted: #71717a;
  --text-dim: #52525b;
  --accent: #06b6d4;
  --green: #22c55e;
  --amber: #f59e0b;
  --red: #ef4444;
  --teal: #14b8a6;
  --green-glow: rgba(34, 197, 94, 0.3);
  --amber-glow: rgba(245, 158, 11, 0.3);
  --red-glow: rgba(239, 68, 68, 0.3);
  --teal-glow: rgba(20, 184, 166, 0.3);
  --font-sans: "Inter", -apple-system, sans-serif;
  --font-mono: "JetBrains Mono", "Cascadia Code", monospace;
  --radius: 8px;
  --radius-sm: 6px;
}
```

---

## 3. Typography

### 3.1 Font Loading

```typescript
// src/app/layout.tsx
import { Inter, JetBrains_Mono } from "next/font/google";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});
```

### 3.2 Usage Matrix

| Context               | Font           | Weight | Size    | Color          | CSS Target         |
| --------------------- | -------------- | ------ | ------- | -------------- | ------------------ |
| App body text         | Inter          | 400    | 14px    | `--text`       | `body`             |
| Section headings      | Inter          | 600    | 16px    | `--text`       | `h2`, `.heading`   |
| Panel title           | Inter          | 600    | 13px    | `--text`       | `.panel-title`     |
| Labels                | Inter          | 500    | 11-12px | `--text-muted` | `.label`           |
| Agent reasoning prose | Inter          | 400    | 13-14px | `--text`       | `.agent-reasoning` |
| Metric values         | JetBrains Mono | 500    | 13-14px | `--text`       | `.metric-value`    |
| Summary bar values    | JetBrains Mono | 500    | 18px    | `--text`       | `.summary-value`   |
| Ticker symbols        | JetBrains Mono | 600    | 15px    | `--text`       | `.node-ticker`     |
| Timestamps            | JetBrains Mono | 400    | 12px    | `--text-dim`   | `.timestamp`       |
| Structured agent keys | JetBrains Mono | 400    | 12px    | `--text-dim`   | `.struct-key`      |
| Structured agent vals | JetBrains Mono | 400    | 12px    | `--text`       | `.struct-val`      |
| Duration badges       | JetBrains Mono | 400    | 11px    | `--text-dim`   | `.duration`        |
| Edge labels (future)  | JetBrains Mono | 400    | 11px    | `--text-muted` | `.edge-label`      |
| Code / JSON in output | JetBrains Mono | 400    | 13px    | `--text`       | `.code-block`      |

---

## 4. Component Specifications

### 4.1 `<MachineNode />` — React Flow Custom Node

**File:** `src/components/factory/machine-node.tsx`
**Type:** Custom React Flow node (not shadcn)

```
┌─────────────────────────┐  ← border: 2px solid {healthColor}
│  AAPL                    │  ← JetBrains Mono 600, 15px
│  Apple Inc. · Equity     │  ← Inter 400, 12px, --text-muted
│─────────────────────────│  ← 1px solid --border
│  Weight     22.4%        │  ← MetricDisplay
│  P&L        +14.2%       │  ← colored: green positive, red negative
│  Volatility ██░░ Med     │  ← VolatilityBar + label
│  Sharpe     1.34         │  ← MetricDisplay
│─────────────────────────│  ← 1px solid --border
│  ● Nominal               │  ← StatusDot + status label
└─────────────────────────┘
```

**Props:**

```typescript
interface MachineNodeData {
  ticker: string;
  name: string;
  assetClass: "equity" | "etf" | "crypto" | "bond" | "fx";
  weight: number;
  pnlPct: number;
  volatility: number; // 0-1 normalized
  volatilityLabel: "Low" | "Med" | "High" | "V.High";
  sharpe: number;
  health: "nominal" | "warning" | "critical";
}
```

**Behavior:**

- Border color = health state color
- On health state change: border pulse animation (800ms, glow intensifies then fades)
- Hover: background transitions to `--bg-elevated` (150ms)
- Click: could expand to detail view (future, not v1)

**shadcn usage:** None — purpose-built React Flow node.

---

### 4.2 `<ConveyorEdge />` — React Flow Custom Edge

**File:** `src/components/factory/conveyor-edge.tsx`
**Type:** Custom React Flow edge

**Props:**

```typescript
interface ConveyorEdgeData {
  correlation: number; // 0-1
  direction?: "left-to-right"; // always left-to-right (capital flow)
}
```

**Visual:**

- Dashed stroke with animated `stroke-dashoffset` creating "flowing material" effect
- Stroke width: `1.5px` (low), `2.5px` (medium), `3.5px` (high correlation)
- Stroke color: correlation color (teal / amber / red)
- Arrow marker at target end, matching stroke color
- Animation speed: consistent (1.2s cycle), not tied to any data dimension

**Edge cases:**

- Cross-correlation edges (between two machine nodes, not to output) render at 50% opacity
- No edge label in v1 (correlation value shown on hover via tooltip — future)

**shadcn usage:** None — custom SVG edge.

---

### 4.3 `<PortfolioOutputNode />` — Aggregate Output Node

**File:** `src/components/factory/portfolio-output-node.tsx`
**Type:** Custom React Flow node

```
┌──────────────────────────┐
│  ⬡ Portfolio Output       │  ← accent color border + title
│  Net P&L    +$5,234       │
│  Sharpe     1.34          │
│  Max DD     -8.2%         │
│  Health     Warning       │  ← colored by health
└──────────────────────────┘
```

**Props:**

```typescript
interface PortfolioOutputData {
  netPnl: number;
  netPnlPct: number;
  sharpe: number;
  maxDrawdownPct: number;
  health: "nominal" | "warning" | "critical";
}
```

**Visual:**

- Border: 2px solid `--accent` with subtle cyan glow (`box-shadow: 0 0 12px rgba(6,182,212,0.15)`)
- Hexagon icon — inline SVG (16×16) in accent color next to title (avoids Unicode rendering inconsistencies across browsers)
- Distinct from machine nodes — visually marks the "destination" of all flows

**shadcn usage:** None.

---

### 4.4 `<FactoryFloor />` — React Flow Canvas

**File:** `src/components/factory/factory-floor.tsx`
**Type:** Wrapper component

**Configuration:**

```typescript
const flowConfig = {
  background: { variant: "dots", gap: 24, size: 1, color: "var(--border)" },
  fitView: true,
  nodesDraggable: true,
  minZoom: 0.5,
  maxZoom: 1.5,
  proOptions: { hideAttribution: true }, // self-hosted, not needed
};
```

**Layout:**

- Auto-layout via `dagre` or `elkjs` — left-to-right directed graph
- Machine nodes on the left, Portfolio Output node on the right
- User can drag nodes to rearrange after initial layout
- Background: subtle dot grid on `--bg-primary`

**Registered custom types:**

```typescript
const nodeTypes = {
  machine: MachineNode,
  portfolioOutput: PortfolioOutputNode,
};

const edgeTypes = {
  conveyor: ConveyorEdge,
};
```

**shadcn usage:** None.

---

### 4.5 `<AgentReasoningPanel />` — Right Sidebar

**File:** `src/components/agents/agent-reasoning-panel.tsx`
**Type:** Custom layout component

**Structure:**

- Fixed-width sidebar (min 340px, max 420px, flex 3 of main layout)
- Header: "Agent Reasoning" title + run ID badge
- Body: scrollable area containing `<AgentTimeline />`
- Left border: 1px solid `--border`
- Background: `--bg-card`

**Collapsible:** Collapse button in header. When collapsed, sidebar shrinks to a thin icon strip (~48px) showing only status dots for each agent. Click to expand.

**shadcn usage:** `<ScrollArea />` for body scrolling.

---

### 4.6 `<AgentTimeline />` — Vertical Timeline

**File:** `src/components/agents/agent-timeline.tsx`
**Type:** Custom component

Contains 4 `<AgentStep />` entries in a vertical timeline:

```
  ● Monitor Agent      Done · 3.2s
  │  health_status: "nominal"     ← structured output (JetBrains Mono)
  │  ▼ Show reasoning
  │  [collapsible reasoning block]
  │
  ● Bottleneck Agent   Done · 5.1s
  │  ...
  │
  ○ Redesign Agent     Running...
  │  ▌streaming...
  │
  ○ Risk Agent         Queued
```

**Visual rules:**

- Timeline connector: 1px line in `--border-bright` between dots
- Last step has no connector line below it
- Steps after the running agent are dimmed (opacity 0.45)

**shadcn usage:** `<Collapsible />` for reasoning blocks.

---

### 4.7 `<AgentStep />` — Individual Agent Entry

**File:** `src/components/agents/agent-step.tsx`
**Type:** Custom component

**Props:**

```typescript
interface AgentStepProps {
  name: string; // "Monitor Agent"
  status: "done" | "running" | "queued" | "error";
  durationMs?: number; // undefined if queued
  structuredOutput?: Record<string, unknown>;
  reasoning?: string; // prose reasoning from agent
  isStreaming?: boolean; // true = text still arriving
}
```

**Sub-components:**

- `<StatusDot />` — circle with status-specific color and animation
- Status badge — pill with status text
- Duration — JetBrains Mono, right-aligned
- Structured output block — key/value pairs in monospace
- Reasoning block — Inter prose, background `--bg-elevated`, left border 2px `--border-bright`
- Streaming cursor — 2px amber bar with blink animation (only when `isStreaming`)

**Status dot behavior:**

- Done: solid green dot, green glow
- Running: solid amber dot, pulsing animation (opacity 0.4 → 1, 1.5s cycle)
- Queued: hollow circle, `--text-dim` border
- Error: solid red dot (future — not in v1)

**shadcn usage:** `<Collapsible />` for reasoning toggle.

---

### 4.8 `<PortfolioSummaryBar />` — Top Metrics Bar

**File:** `src/components/layout/portfolio-summary-bar.tsx`
**Type:** Custom layout component

```
┌─────────────┬─────────────┬─────────────┬──────────────┬──────────────┐
│ Total Value │ Unreal. P&L │ Sharpe      │ Max Drawdown │ Last Run     │
│ $47,832     │ +$5,234     │ 1.34        │ -8.2%        │ 2 min ago    │
│             │ +12.4%      │             │              │ ● Nominal    │
└─────────────┴─────────────┴─────────────┴──────────────┴──────────────┘
```

**Structure:**

- Horizontal flex row, height 72px
- 5 cells separated by 1px gaps (using `--border` as gap background)
- Each cell: label (11px uppercase Inter) + value (18px JetBrains Mono)
- Last cell is narrower (220px), contains: Last Run time, health indicator, "+" button
- P&L value: green if positive, red if negative
- Health: `<StatusDot />` + health label

**Props:**

```typescript
interface PortfolioSummaryBarProps {
  totalValue: number;
  unrealisedPnl: number;
  unrealisedPnlPct: number;
  sharpeRatio: number | null;
  maxDrawdownPct: number;
  lastRunAt: Date | null;
  health: "nominal" | "warning" | "critical";
  onAddHolding: () => void;
}
```

**"+" button:** Opens `<HoldingsInput />` modal. Styled as minimal square button (32x32), `--bg-elevated` with `--border-bright` border. Hover: accent background.

**shadcn usage:** `<Button />` for the "+" button (variant: outline, size: icon).

---

### 4.9 `<MetricDisplay />` — Label + Value Pair

**File:** `src/components/ui/metric-display.tsx`
**Type:** Reusable custom component

**Props:**

```typescript
interface MetricDisplayProps {
  label: string;
  value: string | number;
  variant?: "default" | "positive" | "negative" | "accent";
  font?: "mono" | "sans";
}
```

**Visual:**

- Flex row: label left (Inter 12px, `--text-muted`), value right (JetBrains Mono 13px, colored by variant)
- Positive: `--green`, Negative: `--red`, Accent: `--accent`, Default: `--text`

**shadcn usage:** None.

---

### 4.10 `<StatusDot />` — Health Indicator Dot

**File:** `src/components/ui/status-dot.tsx`
**Type:** Reusable custom component

**Props:**

```typescript
interface StatusDotProps {
  status: "nominal" | "warning" | "critical";
  size?: "sm" | "md"; // sm: 6px, md: 8px
  animate?: boolean; // pulse animation (for running agents)
}
```

**Visual:**

- Circle, colored by status
- Box-shadow glow matching status color
- If `animate`: opacity pulse (0.4 → 1, 1.5s cycle)

**shadcn usage:** None.

---

### 4.11 `<VolatilityBar />` — Inline Mini Bar

**File:** `src/components/ui/volatility-bar.tsx`
**Type:** Reusable custom component

**Props:**

```typescript
interface VolatilityBarProps {
  segments: number; // total segments (4)
  filled: number; // filled segments (0-4)
  label: "Low" | "Med" | "High" | "V.High";
}
```

**Visual:**

- Row of small rectangles (6x10px, 2px gap)
- Filled segments: `--amber` background
- Unfilled segments: `--border-bright` background
- Label text after bars: JetBrains Mono 11px, `--text-muted`

**shadcn usage:** None.

---

### 4.12 `<HoldingsInput />` — Modal Form

**File:** `src/components/holdings/holdings-input.tsx`
**Type:** Modal form component

**Trigger:** "+" button in `<PortfolioSummaryBar />` or keyboard shortcut (future)

**Fields:**

- Ticker Symbol — `<Input />`, monospace font
- Quantity — `<Input type="number" />`
- Avg Cost — `<Input type="number" />`
- Asset Class — `<Select />` with options: Equity, ETF, Crypto, Bond, FX

**Validation:**

- On blur of ticker field: call `/api/market/snapshot/:ticker`
- Show live price preview below the field (success: green text, failure: red error)

**Props:**

```typescript
interface HoldingsInputProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (holding: NewHolding) => void;
}

interface NewHolding {
  ticker: string;
  quantity: number;
  avgCost: number;
  assetClass: "equity" | "etf" | "crypto" | "bond" | "fx";
}
```

**shadcn usage:** `<Dialog />`, `<Input />`, `<Select />`, `<Button />`.

---

### 4.13 `<StressTestChart />` — Stress Test Bar Chart

**File:** `src/components/charts/stress-test-chart.tsx`
**Type:** Recharts wrapper component

```
 ┌────────────────────────────────────────────┐
 │  Stress Scenarios                           │
 │                                             │
 │  COVID Crash (Mar 2020)     ████████ -12.4% │
 │  2022 Rate Hike Cycle       ██████████ -18.1%│ ← red bar (exceeds 15%)
 │  2008 GFC                   ██████████████ -24.7%│ ← red bar
 │  Terra/LUNA Collapse        ████████████████ -31.2%│ ← red bar
 │  FTX Contagion              ████████ -14.9% │
 │                                             │
 │  Recovery (days) shown in tooltip on hover  │
 └────────────────────────────────────────────┘
```

**Props:**

```typescript
interface StressTestChartProps {
  results: Array<{
    scenario: string;
    simulated_drawdown_pct: number;
    recovery_days: number | null;
  }>;
}
```

**Visual:**

- Chart type: horizontal `BarChart` (one bar per scenario)
- Bars: `--bg-elevated` fill; bars where `drawdown > 15%` use `--red` fill
- Bar value labels: JetBrains Mono 11px, `--text`, rendered at bar end (e.g. "-12.4%")
- Y-axis (scenario names): Inter 11px, `--text-muted`, left-aligned
- X-axis: hidden — value labels on bars replace it
- Grid: no grid lines, no axis ticks
- Background: transparent (inherits parent card background)
- Tooltip: custom tooltip on hover showing scenario name, drawdown %, and recovery days (if available); styled with `--bg-card` background, `--border` border, `--text` text
- Chart height: `results.length * 40 + 24`px (scales with scenario count)
- Margin: `{ top: 8, right: 60, bottom: 8, left: 0 }` (right margin accommodates value labels)

**Recharts dark theme config:**

```css
.recharts-default-tooltip {
  background-color: var(--bg-card) !important;
  border: 1px solid var(--border) !important;
  border-radius: var(--radius-sm);
}
```

**Data source:** Consumes `RiskOutput.stress_results` from the Risk Agent (see `ARCHITECTURE_V1.md` Section 5.4, `RiskOutput` schema).

**shadcn usage:** None — Recharts native.

---

## 5. Animation Layer

All animations respect `prefers-reduced-motion: reduce`. When reduced motion is preferred, all animations are suppressed to near-zero duration with single iteration.

### 5.1 Animation Registry

| Animation         | Trigger                  | Duration       | CSS Property                  | Where Defined        |
| ----------------- | ------------------------ | -------------- | ----------------------------- | -------------------- |
| Node border pulse | Health state change      | 800ms, 1       | `box-shadow` glow             | `machine-node.tsx`   |
| Status dot pulse  | Agent running            | 1.5s, infinite | `opacity` 0.4 → 1             | `status-dot.tsx`     |
| Edge flow         | Always on conveyor edges | 1.2s, infinite | `stroke-dashoffset`           | `conveyor-edge.tsx`  |
| Streaming cursor  | Agent text streaming     | 1s, infinite   | `opacity` blink (step-end)    | `agent-step.tsx`     |
| Node hover        | Mouse enter              | 150ms          | `background-color` transition | `machine-node.tsx`   |
| Modal appear      | Modal opens              | 200ms, 1       | `opacity` + `translateY`      | `holdings-input.tsx` |

### 5.2 Keyframe Definitions

Defined once in `src/styles/animations.css` (imported by `globals.css`):

```css
@keyframes pulse-green {
  0%,
  100% {
    box-shadow: 0 0 4px var(--green-glow);
  }
  50% {
    box-shadow:
      0 0 16px var(--green-glow),
      0 0 32px rgba(34, 197, 94, 0.1);
  }
}

@keyframes pulse-amber {
  0%,
  100% {
    box-shadow: 0 0 4px var(--amber-glow);
  }
  50% {
    box-shadow:
      0 0 16px var(--amber-glow),
      0 0 32px rgba(245, 158, 11, 0.1);
  }
}

@keyframes pulse-red {
  0%,
  100% {
    box-shadow: 0 0 4px var(--red-glow);
  }
  50% {
    box-shadow:
      0 0 16px var(--red-glow),
      0 0 32px rgba(239, 68, 68, 0.1);
  }
}

@keyframes dot-pulse {
  0%,
  100% {
    opacity: 0.4;
  }
  50% {
    opacity: 1;
  }
}

@keyframes cursor-blink {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0;
  }
}

@keyframes edge-flow {
  from {
    stroke-dashoffset: 24;
  }
  to {
    stroke-dashoffset: 0;
  }
}

@keyframes fade-in-up {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

### 5.3 Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## 6. Layout System

### 6.1 Full Page Structure

```
┌──────────────────────────────────────────────────────────────────┐
│  <PortfolioSummaryBar />   height: 72px, fixed top              │
├────────────────────────────────────┬─────────────────────────────┤
│                                    │  <AgentReasoningPanel />    │
│      <FactoryFloor />              │  flex: 3 (min 340px)       │
│      flex: 7                       │  max-width: 420px          │
│      (React Flow canvas)           │                            │
│                                    │  border-left: 1px solid    │
│                                    │  background: --bg-card     │
│                                    │                            │
├────────────────────────────────────┴─────────────────────────────┤
│  (no footer)                                                     │
└──────────────────────────────────────────────────────────────────┘
```

- App fills full viewport height (`height: 100vh`)
- No scrolling on the page itself — factory floor and agent panel manage their own scrolling
- Factory floor: `overflow: hidden`, React Flow handles pan/zoom
- Agent panel body: `overflow-y: auto` via `<ScrollArea />`

### 6.2 Agent Panel Collapse

When collapsed:

- Panel shrinks to 48px wide
- Shows only 4 status dots stacked vertically (one per agent)
- Click any dot or collapse toggle to expand back

Not implemented in v1 — design is accounted for in component structure to avoid refactor later.

---

## 7. React Flow Configuration

### 7.1 Node Types

```typescript
const nodeTypes = {
  machine: MachineNode, // individual holdings
  portfolioOutput: PortfolioOutputNode, // aggregate output
} satisfies NodeTypes;
```

### 7.2 Edge Types

```typescript
const edgeTypes = {
  conveyor: ConveyorEdge, // animated conveyor belts
} satisfies EdgeTypes;
```

### 7.3 Auto-Layout

Initial node positions computed via `dagre` (or `elkjs`):

```typescript
import dagre from "@dagrejs/dagre";

const layoutGraph = (nodes, edges) => {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "LR", nodesep: 60, ranksep: 200 });

  nodes.forEach((node) => g.setNode(node.id, { width: 220, height: 200 }));
  edges.forEach((edge) => g.setEdge(edge.source, edge.target));

  dagre.layout(g);

  return nodes.map((node) => ({
    ...node,
    position: { x: g.node(node.id).x, y: g.node(node.id).y },
  }));
};
```

Direction: left-to-right (`rankdir: "LR"`). Machines on left, output on right.

### 7.4 Background

```tsx
<Background variant="dots" gap={24} size={1} color="#1e1e2e" />
```

### 7.5 Controls

- Zoom + fit-to-view controls (top-left of canvas)
- No minimap (portfolio rarely has enough nodes to justify it)
- Nodes draggable by user

---

## 8. File Structure

```
src/
├── app/
│   ├── layout.tsx                          # Font loading, global styles
│   ├── page.tsx                            # Main page composing all layout components
│   └── globals.css                         # CSS custom properties, animation keyframes
├── components/
│   ├── factory/
│   │   ├── factory-floor.tsx               # React Flow wrapper
│   │   ├── machine-node.tsx                # Custom React Flow node
│   │   ├── conveyor-edge.tsx               # Custom React Flow edge
│   │   ├── portfolio-output-node.tsx        # Aggregate output node
│   │   └── layout-engine.ts                # dagre/elkjs auto-layout logic
│   ├── agents/
│   │   ├── agent-reasoning-panel.tsx        # Right sidebar
│   │   ├── agent-timeline.tsx              # Vertical timeline container
│   │   └── agent-step.tsx                  # Individual agent entry
│   ├── holdings/
│   │   └── holdings-input.tsx              # Modal form for adding holdings
│   ├── charts/
│   │   └── stress-test-chart.tsx           # Recharts bar chart for stress scenarios
│   ├── layout/
│   │   └── portfolio-summary-bar.tsx        # Top metrics bar
│   └── ui/
│       ├── metric-display.tsx              # Label + value pair
│       ├── status-dot.tsx                  # Health indicator dot
│       └── volatility-bar.tsx             # Inline mini bar
├── styles/
│   └── animations.css                      # @keyframes definitions
└── lib/
    └── types/
        └── visual.ts                       # Shared visual types (health states, etc.)
```

### CSS Organization

| File                    | Contains                                                           |
| ----------------------- | ------------------------------------------------------------------ |
| `globals.css`           | CSS custom properties (`:root`), base resets, reduced-motion query |
| `styles/animations.css` | All `@keyframes` definitions                                       |
| `tailwind.config.ts`    | Extended theme: colors, fontFamily, borderRadius                   |

Components use Tailwind utility classes for layout and spacing. Custom CSS classes only for animations and React Flow node styling (where Tailwind doesn't reach).

---

## 9. shadcn Component Usage Summary

### Use as-is (no restyling)

- `<Button />` — all buttons (add holding, form submit, cancel)
- `<Input />` — form text/number inputs
- `<Select />` — asset class dropdown
- `<Dialog />` — modal wrapper for holdings input
- `<Collapsible />` — agent reasoning blocks
- `<ScrollArea />` — agent panel body scrolling
- `<Tooltip />` — hover info on nodes (future)

### Extend via theme tokens

- Color palette → override CSS variables to match base palette (Section 2.3)
- Font family → set Inter as primary, JetBrains Mono as secondary in Tailwind config
- Border radius → keep shadcn defaults

### Custom (not shadcn)

- `<MachineNode />`, `<ConveyorEdge />`, `<PortfolioOutputNode />` — purpose-built for React Flow
- `<AgentTimeline />`, `<AgentStep />` — specialized for agent output display
- `<MetricDisplay />`, `<StatusDot />`, `<VolatilityBar />` — too small/specific for shadcn

---

## 10. Implementation Mapping

Which visual design items land in which phase of ARCHITECTURE_V1.md's implementation plan:

### Phase 1 — Foundation (Week 1)

- Tailwind config: color tokens, font families, border radius overrides
- Font loading in `layout.tsx` (Inter + JetBrains Mono)
- `globals.css`: CSS custom properties, animation keyframes
- `<MachineNode />` — static component, hardcoded data
- `<ConveyorEdge />` — static SVG edges, no live data
- `<PortfolioOutputNode />` — static
- `<FactoryFloor />` — React Flow canvas with dot grid background
- `<PortfolioSummaryBar />` — static with hardcoded metrics
- Auto-layout via dagre

### Phase 2 — First Agent (Week 2)

- `<AgentTimeline />` component
- `<AgentStep />` component with streaming support
- `<AgentReasoningPanel />` consuming Vercel AI SDK stream
- `<StatusDot />` with pulse animation for running agent
- Machine node border colors wired to Monitor output

### Phase 3 — Full Agent Loop (Week 3)

- Edge flow animation on `<ConveyorEdge />`
- Correlation colors wired to computed correlation matrix
- All four agent steps streaming sequentially
- Cross-correlation edges rendered

### Phase 4 — Polish & Observability (Week 4)

- `<MetricDisplay />` component (extracted if not already)
- `<PortfolioSummaryBar />` with live metrics
- `<HoldingsInput />` modal with ticker validation
- `<VolatilityBar />` in machine nodes
- `<StressTestChart />` — Recharts horizontal bar chart consuming `RiskOutput.stress_results`, dark theme matching base palette (see Section 4.13)

---

## 11. Visual Reference

The file `draft-v1-glm.html` in the project root is the visual reference prototype. It renders the complete UI as a static HTML page with all animations working. When in doubt about visual intent, open it in a browser.

Key things to verify visually in the draft:

- Machine node card layout and spacing
- Health state colors on node borders (green = AAPL/BND, amber = VTI/SOL, red = BTC)
- Conveyor belt edge animation flowing left-to-right
- Correlation color coding on edges (teal/amber/red)
- Agent panel timeline with mixed typography
- Streaming cursor on the Redesign agent
- Status dot pulse animation
- Summary bar layout
- Holdings input modal (click "+" button)

---

_Visual Design version: 1.0 | Reference: draft-v1-glm.html | Stack: Tailwind CSS, shadcn/ui, React Flow_

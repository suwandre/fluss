---
name: react-best-practices
description: Vercel React/Next.js performance rules injected into the builder system prompt. CRITICAL and HIGH priority rules only.
---

# React & Next.js Best Practices (Vercel Engineering)

Apply these rules when writing React or Next.js code. Prioritized by impact.

## CRITICAL — Eliminating Waterfalls

- Check cheap sync conditions BEFORE awaiting flags/remote values
- Move `await` into branches where actually used — don't block paths that skip it
- Use `Promise.all()` for independent async operations
- Use Suspense boundaries to stream content instead of blocking full page
- Start promises early in API routes, `await` late

```ts
// ❌ sequential
const a = await fetchA();
const b = await fetchB();

// ✅ parallel
const [a, b] = await Promise.all([fetchA(), fetchB()]);
```

## CRITICAL — Bundle Size

- Import directly from source, never from barrel files (`import { x } from 'lib'` not `from 'lib/index'`)
- Use `next/dynamic` for heavy components not needed on initial paint
- Load analytics/logging after hydration, not at bundle load time
- Load modules only when the feature is activated (conditional imports)

## HIGH — Server-Side Performance

- Authenticate server actions the same way as API routes
- Use `React.cache()` for per-request deduplication
- Hoist static I/O (fonts, config reads) to module level — runs once at startup
- Never store request-scoped data in module-level variables in RSC/SSR
- Minimize data serialized across RSC boundaries — pass only what the client needs
- Parallelize component data fetches with composition, not sequential awaits

## MEDIUM — Re-render Optimization

- Don't subscribe to state only used in event callbacks — use refs
- Extract expensive subtrees into `React.memo` components
- Hoist default non-primitive props (`[]`, `{}`) to module-level constants
- Use primitive values as effect dependencies, not objects/arrays
- Derive state during render, not in `useEffect`
- Use functional `setState(prev => ...)` for stable callbacks
- Pass a function to `useState` for expensive initial values
- Never define components inside components — extract them
- Use `startTransition` for non-urgent state updates
- Use `useDeferredValue` to keep inputs responsive during expensive renders
- Use `useRef` for transient values updated many times per second

## MEDIUM — Rendering

- Use `content-visibility: auto` for long off-screen lists
- Hoist static JSX elements outside component body
- Use ternary (`condition ? <A/> : <B/>`) not `&&` for conditional rendering
- Use `useTransition` instead of manual `isLoading` state
- Use `defer` or `async` on non-critical `<script>` tags

## LOW-MEDIUM — JS Performance

- Build `Map` indexes for repeated lookups instead of repeated `.find()`
- Use `Set`/`Map` for O(1) membership checks
- Combine multiple `.filter().map()` chains into one `reduce` or `flatMap`
- Hoist `RegExp` creation outside loops
- Use `toSorted()` instead of `sort()` to avoid mutation
- Use `requestIdleCallback` for non-critical background work

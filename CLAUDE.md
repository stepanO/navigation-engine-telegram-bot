# `navigation-engine-telegram-bot` — Project Rules

Angular-inspired navigation engine library for grammY-based Telegram bots. Provides SPA-style routing: the same Telegram message is edited in-place rather than new messages sent, mirroring Angular Router + Components. This is a **library**, not a bot application.

---

## Layout

```
src/
  core/
    interfaces/   route.ts, screen.ts, navigation.ts, guard.ts,
                  resolver.ts, middleware.ts, renderer.ts, state.ts,
                  errors.ts, index.ts
    router/       route-parser.ts, route-matcher.ts, router.ts
    registry/     screen-registry.ts
    engine/       navigation-engine.ts, navigation-context.ts, navigation-stack.ts
    state/        in-memory-state-store.ts
  adapter/
    grammy/       grammy-renderer.ts, grammy-adapter.ts,
                  grammy-navigation-engine.ts, keyboard-converter.ts,
                  context-extractors.ts
  callback/       callback-encoder.ts
  index.ts        (public barrel — everything the library exports)
```

- `src/core/` — Framework-agnostic. Zero grammY imports. Only the `Renderer` interface touches Telegram concepts.
- `src/adapter/grammy/` — Bridges NavigationEngine to grammY. `GrammYNavigationEngine` is the one-stop facade for bot authors.
- `src/callback/` — Encodes/decodes `callback_data` within Telegram's 64-byte limit.
- `src/index.ts` — Single export surface. Never import from deep paths in user-facing code.

---

## Implementation Phases

| Phase | Scope | Status |
|-------|-------|--------|
| 1 | Core interfaces, Router, Route matching, NavigationEngine, ScreenRegistry | **Complete** |
| 2 | Renderer, grammY Adapter, NavigationStack wiring, CallbackEncoder | **Complete** |
| 3 | Screen API, ScreenBuilder, KeyboardBuilder | **Complete** |
| 4 | Middleware, Guards, Resolvers | Pending |
| 5 | Action Dispatcher (`action:deleteParticipant:42`) | Pending |
| 6 | UI Components | Pending |
| 7 | Wizards (conversational multi-step flows) | Pending |
| 8 | DI injector (`new MyScreen()` → injected) | Pending |
| 9 | CompactCallbackEncoder, ServerStateEncoder, performance | Pending |
| 10 | Docs, examples, full test suite | Pending |

Do not start a new phase until the previous one is reviewed and closed.

---

## Architecture

- **Route matching:** RegExp-based, first-match wins (Express-style). Register specific routes before catch-alls.
- **Navigation lifecycle:** `Router.match → guards → resolvers (parallel) → screen.beforeEnter → screen.render → renderer.render → screen.afterRender → stack persist`. Full sequence documented in `navigation-engine.ts`.
- **History model:** `entries[]` array + cursor index. `navigate()` discards forward history. Default max 50 entries, configurable via `NavigationEngineConfig`.
- **State:** `StateStore` interface with `InMemoryStateStore` for Phase 1/2. Redis/Postgres adapters swap in without changing anything else.
- **DI (Phase 1/2):** Screens, guards, resolvers, and middleware are instantiated with `new Constructor()` — no-arg constructors required. Phase 8 adds a proper injector.
- **Callback data tokens:**
  - `nav:/path?query=value` — navigate to a route
  - `nav:__back__` — go back in history
  - `action:name:p1:p2` — dispatch an action (Phase 5)
  - `SimpleCallbackEncoder` throws `CallbackDataTooLongError` rather than silently truncating.
- **Path alias:** `@engine/*` → `./src/*` in both `tsconfig.json` and `jest.config.ts`.

---

## Conventions

- The `core/` layer must never import from `adapter/` or `callback/`. Dependencies flow inward only.
- Every new module gets a `__tests__/` sibling directory with a `.test.ts` file.
- Tests use Jest + ts-jest. Run with `npm test`. Coverage threshold: 80% branches/functions/lines/statements.
- `typecheck` (`tsc --noEmit`) and `test` must both be green before any phase closes.
- No linting/formatting tooling is configured yet. Use strict TypeScript (`noUnusedLocals`, `noUnusedParameters`, `exactOptionalPropertyTypes`) as the primary quality gate.
- No git hooks configured.

---

## Tooling

- TypeScript 5.x strict mode, target ES2022, CommonJS output.
- `npm run build` — compile to `dist/`.
- `npm test` — run Jest.
- `npm run test:watch` — Jest in watch mode.
- `npm run test:coverage` — Jest with coverage report.
- `npm run typecheck` — type-check only, no emit.
- Node.js >= 20 required.
- No ESLint, Biome, or Prettier. TypeScript strict settings are the formatter/linter.

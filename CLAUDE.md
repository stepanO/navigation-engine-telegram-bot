# `navigation-engine-telegram-bot` — Project Rules

Angular-inspired navigation engine library for grammY-based Telegram bots. Provides SPA-style routing: the same Telegram message is edited in-place rather than new messages sent, mirroring Angular Router + Components. This is a **library**, not a bot application.

---

## Layout

```
src/
  core/
    interfaces/   route.ts, screen.ts, navigation.ts, guard.ts,
                  resolver.ts, middleware.ts, renderer.ts, state.ts,
                  errors.ts
    router/       route-parser.ts, route-matcher.ts, router.ts
    registry/     screen-registry.ts
    engine/       navigation-engine.ts, navigation-context.ts, navigation-stack.ts
    state/        in-memory-state-store.ts
    snapshot/     route-snapshot.ts, in-memory-route-snapshot-store.ts
    action/       action-dispatcher.ts, action-context.ts, base-action-handler.ts
    guards/       base-guard.ts, is-authenticated-guard.ts
    resolvers/    base-resolver.ts
    middleware/   base-middleware.ts
    wizard/       wizard-definition.ts, wizard-state.ts, wizard-navigation-engine.ts,
                  wizard-screen.ts, wizard-context.ts
    components/   text.ts, keyboard.ts
    screen/       button.ts, keyboard-builder.ts, screen-builder.ts, html.ts
    di/           injector.ts, injection-token.ts, simple-injector.ts
  adapter/
    grammy/       grammy-renderer.ts, grammy-adapter.ts,
                  grammy-navigation-engine.ts, keyboard-converter.ts,
                  context-extractors.ts
  callback/       callback-encoder.ts, compact-callback-encoder.ts,
                  server-state-encoder.ts
  index.ts        (public barrel — everything the library exports)
```

- `src/core/` — Framework-agnostic. Zero grammY imports. Only the `Renderer` interface touches Telegram concepts.
- `src/core/snapshot/` — `RouteSnapshot` + `RouteSnapshotStore` interface; `InMemoryRouteSnapshotStore`.
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
| 4 | Middleware, Guards, Resolvers | **Complete** |
| 5 | Action Dispatcher (`action:deleteParticipant:42`) | **Complete** |
| 6 | UI Components | **Complete** |
| 7 | Wizards (conversational multi-step flows, text input) | **Complete** |
| 8 | DI injector (`new MyScreen()` → injected) | **Complete** |
| 9 | CompactCallbackEncoder, ServerStateEncoder, keyboard diffing, resolver caching | **Complete** |
| 10 | Docs, examples, full test suite | **Complete** |
| — | Route Snapshots (restart-safe navigation recovery) | **Complete** |
| — | Wizard callback steps (`onCallback`), `Button.prevStep/cancelWizard/raw`, `onExit` hook, `onUnrecoverableCallback` | **Complete** |

---

## Architecture

- **Route matching:** RegExp-based, first-match wins (Express-style). Register specific routes before catch-alls.
- **Navigation lifecycle:** `Router.match → guards → resolvers (parallel) → screen.beforeEnter → screen.render → renderer.render → screen.afterRender → stack persist → snapshot persist`. Full sequence documented in `navigation-engine.ts`.
- **History model:** `entries[]` array + cursor index. `navigate()` discards forward history. Default max 50 entries, configurable via `NavigationEngineConfig`.
- **State:** `StateStore` interface (keyed by `${chatId}:${userId}`) with `InMemoryStateStore`. Redis/Postgres adapters swap in without changing anything else.
- **Route Snapshots:** `RouteSnapshotStore` interface (keyed by `(chatId, messageId)`) with `InMemoryRouteSnapshotStore`. Written after every successful render when `snapshotStore` is configured. `NavigationEngine.recoverNavigation(chatId, messageId, ...)` re-runs the full lifecycle from a persisted snapshot. `GrammYAdapter` triggers recovery when the encoder returns `{ type: 'unknown' }` for a callback. Opt-in — absent by default, zero behavior change.
- **Callback data tokens:**
  - `nav:/path?query=value` — navigate to a route (`SimpleCallbackEncoder`)
  - `nav:__back__` — go back in history
  - `action:name:p1:p2` — dispatch an action
  - `c:{routeId}:{params}` — compact route (`CompactCallbackEncoder`)
  - `s:{6-char-key}` — server-side stored path (`ServerStateEncoder`)
  - `wiz:prev` — go to previous wizard step (`Button.prevStep`)
  - `wiz:cancel` / `wiz:cancel:/path` — cancel wizard (`Button.cancelWizard`)
  - `SimpleCallbackEncoder` throws `CallbackDataTooLongError` rather than silently truncating.
- **DI:** `SimpleInjector` + `InjectionToken`. Constructors with `static factory(injector)` receive injected services; plain no-arg constructors still work unchanged.
- **Wizards:** `WizardNavigationEngine` is independent of `NavigationEngine` — it renders steps directly via `Renderer` and hands off to navigation via an injected `WizardExitFn`. `WizardStateStore` is separate from `StateStore`. `GrammYNavigationEngine` integrates both lazily.
- **Wizard callback steps:** `WizardScreen.onCallback?(ctx: WizardCallbackContext)` intercepts all callback queries for the active user/step. `tryHandleCallback()` in `WizardNavigationEngine` mirrors `tryHandleText()`. Checked in `GrammYNavigationEngine.middleware()` after `wiz:*` tokens, before the adapter.
- **Wizard `onExit`:** `GrammYWizardDefinition.onExit?(data, ctx)` stored in `wizardOnExit` map; invoked via `WizardExitFn` (which now accepts optional `data` and `wizardId` params). The grammY `Context` is pinned in `pendingWizardCtx` for the duration of each wizard operation.
- **`onUnrecoverableCallback`:** `GrammYNavigationEngineOptions` option threaded into `GrammYAdapter` constructor. Called instead of `next()` when snapshot recovery returns `false`.
- **Path alias:** `@engine/*` → `./src/*` in both `tsconfig.json` and `jest.config.ts`.

---

## Conventions

- The `core/` layer must never import from `adapter/` or `callback/`. Dependencies flow inward only.
- Every new module gets a `__tests__/` sibling directory with a `.test.ts` file.
- Tests use Jest + ts-jest. Run with `npm test`. Coverage threshold: 80% branches/functions/lines/statements.
- `typecheck` (`tsc --noEmit`) and `test` must both be green before any phase closes.
- No linting/formatting tooling is configured. Use strict TypeScript (`noUnusedLocals`, `noUnusedParameters`, `exactOptionalPropertyTypes`) as the primary quality gate.
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

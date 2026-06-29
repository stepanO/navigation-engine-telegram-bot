# Telegram Navigation Engine — Implementation Plan

Angular-inspired navigation engine library for grammY-based Telegram bots.  
SPA-style routing: the same message is edited in-place rather than new ones sent.

---

## Status legend

- ✅ Complete — reviewed, tests green, `tsc --noEmit` clean
- 🔄 In progress
- ⬜ Pending

---

## Phase 1 — Core Foundation ✅

**425 tests total (phases 1–9 combined), 0 failures**

### Interfaces (`src/core/interfaces/`)

- [x] `route.ts` — `RouteDefinition`, `CompiledRoute`, `RouteMatch`, `RouteParams`, `QueryParams`
- [x] `screen.ts` — `ScreenComponent`, `ScreenView`, `KeyboardDefinition`, `ParseMode`, `ScreenComponentConstructor`
- [x] `navigation.ts` — `NavigationContext<TData>`, `TelegramUser`, `TelegramChat`, `NavigationState`, `HistoryEntry`
- [x] `guard.ts` — `Guard`, `GuardResult` (allow / redirect / reject)
- [x] `resolver.ts` — `Resolver<T>`, `ResolverMap`
- [x] `middleware.ts` — `NavigationMiddleware`, `NextFn`
- [x] `renderer.ts` — `Renderer`, `RenderTarget`, `RenderResult`
- [x] `state.ts` — `StateStore`, `buildStateKey()`
- [x] `errors.ts` — `RouteNotFoundError`, `NavigationGuardError`, `ResolverError`, `NoHistoryError`, `DuplicateRouteError`

### Router (`src/core/router/`)

- [x] `route-parser.ts` — `compileRoute()` (path → RegExp), `extractParams()`, `splitPathAndQuery()`
- [x] `route-matcher.ts` — `RouteMatcher` (first-match-wins, Express-style)
- [x] `router.ts` — `Router` public API (register, match, matchOrThrow, has, size)

### Registry (`src/core/registry/`)

- [x] `screen-registry.ts` — `ScreenRegistry` (path → constructor map, `createScreen()`)

### Engine (`src/core/engine/`)

- [x] `navigation-stack.ts` — cursor + entries[] history model, `updateMessageId()`, `toState()`
- [x] `navigation-context.ts` — `ConcreteNavigationContext` (implements `NavigationContext`)
- [x] `navigation-engine.ts` — full lifecycle: middleware → guards → resolvers → beforeEnter → render → afterRender → persist

### State (`src/core/state/`)

- [x] `in-memory-state-store.ts` — reference `StateStore` implementation

### Key decisions

- RegExp first-match routing (not Angular-style specificity scoring) — simpler, upgradeable later
- `ScreenComponentConstructor = new () => ScreenComponent` — no-arg for Phase 1; Phase 8 adds DI
- `Renderer.render()` returns `Promise<RenderResult>` (not void) so new message IDs propagate back
- `NavigationState.messageId` persists the Telegram message ID across bot restarts

---

## Phase 2 — Telegram Adapter ✅

### Callback encoder (`src/callback/`)

- [x] `callback-encoder.ts` — `CallbackDataEncoder` interface + `SimpleCallbackEncoder`
  - `nav:/path?query` — navigate
  - `nav:__back__` — back
  - `action:name:p1:p2` — action (Phase 5)
  - Throws `CallbackDataTooLongError` (> 64 bytes) instead of silently truncating

### grammY adapter (`src/adapter/grammy/`)

- [x] `context-extractors.ts` — `extractTelegramUser(User)`, `extractTelegramChat(Chat)`
- [x] `keyboard-converter.ts` — `toInlineKeyboardMarkup(KeyboardDefinition)` → grammY type
- [x] `grammy-renderer.ts` — `GrammYRenderer implements Renderer`
  - edit path: `editMessageText`; silent on "message is not modified"
  - fallback to `sendMessage` when message deleted or not found
  - takes `Api` (not `Bot`) for easy injection/testing
- [x] `grammy-adapter.ts` — `GrammYAdapter` grammY middleware
  - resolves `messageId` from persisted state first, then `ctx.callbackQuery.message`
  - forwards `action:` callbacks to `next()` for Phase 5
- [x] `grammy-navigation-engine.ts` — `GrammYNavigationEngine` one-stop facade

### Key decisions

- `Api` injection (not `Bot`) keeps renderer testable without a real bot
- messageId resolution order: persisted state → ctx message → undefined (new message)
- `action:` callbacks forwarded via `next()`, not thrown — Phase 5 handler registers after `nav.middleware()`

---

## Phase 3 — Screen API ✅

### Screen building blocks (`src/core/screen/`)

- [x] `html.ts` — HTML tag helpers: `escapeHtml`, `bold`, `italic`, `underline`, `strikethrough`, `code`, `pre`, `link`, `spoiler`
- [x] `button.ts` — `ButtonDescriptor` discriminated union + `Button` factory
  - `Button.navigate(text, path)` → `NavigateButtonDescriptor`
  - `Button.action(text, name, params?)` → `ActionButtonDescriptor`
  - `Button.url(text, href)` → `UrlButtonDescriptor`
  - `Button.back(text?)` → `BackButtonDescriptor`
- [x] `keyboard-builder.ts` — `KeyboardBuilder`
  - `.row(...ButtonDescriptor[])` fluent API
  - encodes at `.build()` time via injected `CallbackDataEncoder`
- [x] `screen-builder.ts` — `ScreenBuilder`
  - structure: `title`, `subtitle`, `section`, `text`, `html`, `divider`, `spacer`
  - rich text: `bold`, `italic`, `code`, `pre`, `link`
  - data display: `badge(label, value)`, `list(items[])`
  - output: `keyboard(def)`, `parseMode(mode)`, `build()` → `ScreenView`
  - default: `parseMode: 'HTML'`; sections joined with `\n\n`

### Key decisions

- `Button` returns pure data descriptors — no encoding, no dependencies, testable in isolation
- `KeyboardBuilder` holds the encoder; encoding happens at `.build()` not at button creation
- `ScreenBuilder.title()` / `badge()` / `list()` auto-escape HTML; `section()` / `html()` are raw pass-through

---

## Phase 4 — Middleware, Guards, Resolvers ✅

The interfaces already exist from Phase 1. Phase 4 ships concrete implementations and integration tests that use them end-to-end in realistic scenarios.

### Concrete guard implementations (`src/core/guards/`)

- [x] `BaseGuard` — abstract base with `allow()`, `deny(message?)`, `redirect(path)` helpers
- [x] `IsAuthenticatedGuard` — example guard (checks `ctx.data['session'].userId`; redirects to `/login`)
- [x] Guard chain short-circuits on first rejection or redirect

### Concrete resolver implementations (`src/core/resolvers/`)

- [x] `BaseResolver<T>` — abstract base class; typed generic for safe resolver authoring
- [x] Error handling: `ResolverError` surfaces cleanly; partial failures block navigation
- [x] Resolver result merging: priority is `static data < middleware data < resolver data` (documented and tested)

### Concrete middleware implementations (`src/core/middleware/`)

- [x] `BaseMiddleware` — abstract base enforcing the interface; call `next()` to continue, omit to short-circuit
- [x] Middleware execution order tested (onion model: A:before → B:before → B:after → A:after)
- [x] Middleware can populate `ctx.data` before guards run (session pattern tested)
- [x] Middleware can short-circuit (omit `next()`) to block navigation entirely

### Integration tests (`src/core/engine/__tests__/lifecycle-integration.test.ts`)

- [x] Full lifecycle: middleware → guard (allow) → resolver → render → middleware(after)
- [x] Multiple middleware in onion order
- [x] Middleware short-circuits navigation
- [x] Second middleware skipped when first short-circuits
- [x] Guard chain stops on first denial
- [x] All guards pass → navigation completes
- [x] Guard redirect → fresh navigation to redirect target
- [x] `IsAuthenticatedGuard` + session middleware (allow path)
- [x] `IsAuthenticatedGuard` with no session (redirect path)
- [x] Middleware data visible to guards in same context
- [x] Data priority: static < middleware < resolver
- [x] Multiple resolvers all land in `ctx.data`
- [x] Resolver failure → `ResolverError` thrown
- [x] Resolver receives route params
- [x] Combined: middleware + guard + resolver in one navigation

---

## Phase 5 — Action Dispatcher ✅

Actions are button-triggered side effects that do NOT navigate.  
Encoding: `action:name:p1:p2` — decoded by Phase 2 adapter.

### New files (`src/core/action/`)

- [x] `action-context.ts` — `ActionContext` interface (name, params, user, chat, navigate/replace/back), `ActionHandler` interface, `ActionHandlerConstructor` type
- [x] `action-dispatcher.ts` — `ActionDispatcher` (register, dispatch, has, size); throws `DuplicateActionError` on duplicate name
- [x] `base-action-handler.ts` — `BaseActionHandler` abstract base

### Error types (added to `src/core/interfaces/errors.ts`)

- [x] `ActionNotFoundError` — no handler registered for the action name
- [x] `DuplicateActionError` — action registered twice

### Wiring

- [x] `GrammYAdapter` — optional 4th constructor param `ActionDispatcher`; dispatches `action:` callbacks to it; falls back to `next()` when no dispatcher configured
- [x] `GrammYNavigationEngine` — owns an `ActionDispatcher`; exposes `registerAction(name, handler)` fluent method

### Tests

- [x] `ActionDispatcher` dispatches to the correct handler by name
- [x] `ActionDispatcher` throws `ActionNotFoundError` for unknown name (with `.actionName` property)
- [x] `ActionDispatcher` throws `DuplicateActionError` on duplicate registration (with `.actionName` property)
- [x] Handler receives full `ActionContext` (name, params, user, chat, navigation callbacks)
- [x] Handler can call `ctx.navigate()`, `ctx.replace()`, `ctx.back()`
- [x] Fresh handler instance created per dispatch
- [x] `GrammYAdapter`: no dispatcher → `next()` called for `action:` callbacks
- [x] `GrammYAdapter`: dispatcher set → handler called, `next()` NOT called
- [x] `GrammYAdapter`: action handler receives correct user/chat from grammY context
- [x] `GrammYAdapter`: unknown action with dispatcher → `ActionNotFoundError` thrown
- [x] `GrammYAdapter`: action handler can trigger navigation via `ctx.navigate()`

---

## Phase 6 — UI Components ✅

Reusable text/keyboard fragments composable into `ScreenBuilder`.

### Text components (`src/core/components/text.ts`) — return strings for use with `.section()`

- [x] `TitleComponent(title, subtitle?)` — bold title + optional italic subtitle
- [x] `SectionComponent(heading, body)` — bold heading + raw HTML body
- [x] `InfoBoxComponent(text)` — ℹ️ notice (text auto-escaped)
- [x] `WarningBoxComponent(text)` — ⚠️ warning (text auto-escaped)
- [x] `ErrorBoxComponent(text)` — ❌ error (text auto-escaped)
- [x] `EmptyStateComponent(message)` — italic `— message —` placeholder
- [x] `StatCardComponent(label, value, delta?)` — `<b>Label:</b> <code>value</code> delta`
- [x] `TagComponent(label)` — `[label]` (label auto-escaped)
- [x] `BreadcrumbsComponent(crumbs[])` — crumbs joined with ` › `

### Keyboard components (`src/core/components/keyboard.ts`) — return `KeyboardDefinition`

- [x] `mergeKeyboards(...defs)` — concatenate rows from multiple keyboards (utility)
- [x] `PaginationComponent(current, total, pathTemplate)` — ◀ / indicator / ▶ row; uses `{page}` placeholder in path template
- [x] `ConfirmDialogComponent(question, confirmPath, cancelPath)` — returns `{ text, keyboard }` (bold question + ✓ Yes / ✗ No row)
- [x] `ActionRowComponent(actions[])` — ButtonDescriptor[] → single-row KeyboardDefinition
- [x] `ButtonGroupComponent(buttons[], columns?)` — grid layout, default 2 columns

### Tests (59 new tests)

- [x] Each text component: basic output, HTML escaping, optional params, edge cases
- [x] Each keyboard component: structure, encoding, edge cases (first/last page, empty, odd count)
- [x] `mergeKeyboards`: concatenates rows, empty, single keyboard, preserves order
- [x] Integration: event detail screen, paginated list, confirm dialog, empty state, settings grid, HTML escaping

---

## Phase 7 — Wizards ✅

Multi-step conversational flows integrated with the navigation engine.

### Design

- [x] `WizardDefinition` — ordered list of `WizardStep` entries (each has a `screen` class), plus `exitPath`
- [x] `WizardContext` — extends `NavigationContext` with `step` (1-indexed), `totalSteps`, `wizardData`; adds `nextStep(data?)`, `prevStep()`, `cancelWizard()`; `back()` delegates to `prevStep()`
- [x] `WizardNavigationEngine` — standalone orchestrator; `define()`, `start()`, `nextStep()`, `prevStep()`, `cancel()`, `resume()`; injected `WizardExitFn` for hand-off to nav engine
- [x] `WizardStateStore` — dedicated interface + `InMemoryWizardStateStore`; key: `wizard:${chatId}:${userId}:${wizardId}`
- [x] `buildWizardKey()` — canonical key builder
- [x] `buildWizardState()` — safe state constructor (handles `exactOptionalPropertyTypes` for `messageId`)
- [x] Back button in a wizard returns to previous step (not full history back)
- [x] `WizardScreen` abstract base — `onStep(ctx: WizardContext)` instead of `render()`
- [x] New error types: `WizardNotFoundError`, `WizardNotActiveError`, `WizardAtFirstStepError`
- [x] Completing the last step deletes wizard state and calls `exitFn(exitPath)`
- [x] `messageId` persisted in `WizardState` after first render so subsequent steps edit the same message

### Key decisions

- `WizardNavigationEngine` is independent of `NavigationEngine` — it renders steps directly via the `Renderer` interface and hands off general navigation via an injected `WizardExitFn` callback
- Steps bypass the router, guards, and resolvers — wizard screens are self-contained `WizardScreen` subclasses
- `WizardStateStore` is a separate interface from `StateStore` to avoid type conflicts (wizard state ≠ navigation state)
- `ctx.nextStep(data?)` and the public `engine.nextStep()` are equivalent — both use `advanceStep()` internally

### Tests (41 new tests)

- [x] `define()` returns `this` for chaining
- [x] `start()` renders first step, answers callback query, persists state, stores `messageId` from renderer
- [x] `start()` throws `WizardNotFoundError` (with `wizardId` property) for unknown wizard
- [x] `nextStep()` advances to next step, merges data, accumulates across steps, does not lose earlier data
- [x] `nextStep()` last step: calls `exitFn(exitPath)`, deletes state, does not render
- [x] `nextStep()` throws `WizardNotFoundError` / `WizardNotActiveError` on invalid call
- [x] `nextStep()` updates step index in state
- [x] `prevStep()` goes back, decrements step index
- [x] `prevStep()` throws `WizardAtFirstStepError` on step 1
- [x] `prevStep()` throws `WizardNotFoundError` / `WizardNotActiveError` on invalid call
- [x] `cancel()` calls `exitFn(exitPath)`, deletes state, renders nothing
- [x] `cancel()` throws `WizardNotActiveError` when no session
- [x] `resume()` re-renders current step from persisted state
- [x] `resume()` throws `WizardNotActiveError` when no session
- [x] `ctx.step` is 1-indexed; `ctx.totalSteps` correct; `ctx.wizardData` has accumulated data
- [x] `ctx.user` and `ctx.chat` populated correctly
- [x] `ctx.nextStep()` advances step and merges data
- [x] `ctx.prevStep()` goes back
- [x] `ctx.cancelWizard()` calls `exitFn`
- [x] `ctx.back()` goes to previous step
- [x] `ctx.navigate()` calls `exitFn` (exits wizard)
- [x] `InMemoryWizardStateStore` get/set/delete round-trips

---

## Phase 8 — Dependency Injection ✅

Replace `new Constructor()` instantiation with a proper injector.

### Design

- [x] `InjectionToken<T>` — phantom-typed key; `declare protected _type: T` satisfies `noUnusedLocals`
- [x] `Injector` interface: `get<T>(token: InjectionToken<T>): T`
- [x] `SimpleInjector` — synchronous map-based container; `bind(token, value)` fluent, `has()`, `size`
- [x] `InjectionError` — thrown by `get()` when no binding exists; carries `.token` reference
- [x] `createInjectable<T>(Ctor, injector?)` — shared helper: calls `Ctor.factory(injector)` when present, else `new Ctor()`; exported from `ScreenRegistry`
- [x] `ScreenRegistry.createScreen(path, injector?)` — passes injector to `createInjectable`
- [x] `NavigationEngineConfig.injector?` — engine threads injector through guards, resolvers, middleware, and screens
- [x] `GrammYNavigationEngineOptions.injector?` — forwarded into engine config
- [x] All four constructor types extended with `factory?: (injector: Injector) => T` intersection

### Backward compatibility

- [x] No-arg constructor screens work with or without injector (factory absent → `new Ctor()`)
- [x] DI-aware classes declare optional constructor params to satisfy `new () => T`, use `static factory()` for real instantiation

### Key decisions

- `static factory(injector)` pattern chosen over `@Injectable()` decorators (no `experimentalDecorators`) and over `static inject = [TOKEN]` arrays (no reflection)
- `InjectionToken` identity is object identity — two tokens with the same description are distinct
- `SimpleInjector.bind()` allows rebinding; last write wins
- `createInjectable` exported so WizardEngine and other future orchestrators can reuse it

### Tests (28 new tests)

- [x] `InjectionToken`: stores description, `toString()`, two tokens with same description are distinct
- [x] `SimpleInjector`: `bind()` fluent, `get()` returns value, `get()` throws `InjectionError` for missing token
- [x] `InjectionError.token` references the missing token; message includes description
- [x] Different tokens are independent; rebind replaces value; `has()`, `size`; chained binds
- [x] DI screen: `factory()` receives injector, injects service, renders correctly
- [x] No-arg screen: works with injector present (backward compat); works without injector
- [x] DI guard: allows when service says allowed; denies when service says not allowed
- [x] DI resolver: service injected, result lands in `ctx.data`
- [x] DI middleware: service injected, runs before render
- [x] `createInjectable()`: calls factory when available; falls back to `new Ctor()` without injector; falls back to `new Ctor()` when factory absent
- [x] `ScreenRegistry.createScreen()`: uses factory with injector; falls back without injector

---

## Phase 9 — Performance & Compact Encoding ✅

### CompactCallbackEncoder (`src/callback/compact-callback-encoder.ts`)

- [x] Route ID registry — maps path patterns to 2-char base-36 IDs at registration time
- [x] Compact format: `c:{routeId}:{param1}:...:{key=val}...` — far shorter than `nav:/path?query`
- [x] `CompactCallbackEncoder implements CallbackDataEncoder` — drop-in replacement
- [x] `CompactCallbackEncoder.registerRoute()` fluent API; `GrammYNavigationEngine` auto-calls it
- [x] Route IDs must be stable across deployments (documented)
- [x] Supports up to 1296 routes (00–zz in base-36)

### ServerStateEncoder (`src/callback/server-state-encoder.ts`)

- [x] Stores full path in injected `CallbackStore` (default: `InMemoryCallbackStore`)
- [x] callback_data is just `s:{6-char-counter}` = 8 bytes — zero byte-budget pressure
- [x] `ServerStateEncoder implements CallbackDataEncoder`
- [x] `CallbackStore` interface allows swapping to a production store
- [x] Actions remain inline (`a:{name}:{p1}`) since they are typically short

### Other performance work

- [x] Keyboard diffing — `GrammYRenderer` maintains a per-messageId fingerprint cache;
      skips `editMessageText` when text/keyboard/parseMode are identical
- [x] Resolver result caching — `static cacheTtl?: number` on `ResolverConstructor`;
      TTL cache keyed by `chatId:userId:routePattern:resolverKey:params` in `NavigationEngine`
- [x] Screen instance caching — `static readonly singleton?: true` on `ScreenComponentConstructor`;
      `ScreenRegistry` reuses the same instance across navigations
- [x] Lazy route loading — `component` in `RouteDefinition` may be a `LazyComponentFactory`
      (arrow function `() => ScreenComponentConstructor`); resolved and cached on first match

### Key decisions

- `CompactCallbackEncoder.registerRoute()` auto-called by `GrammYNavigationEngine.register()`
  via duck-type check (`'registerRoute' in encoder`)
- `ServerStateEncoder` uses a synchronous `CallbackStore` to preserve the `CallbackDataEncoder`
  interface; async Redis adapters are a future extension
- Keyboard diffing fingerprint: `text + \x00 + parseMode + \x00 + JSON.stringify(keyboard)`
- `singleton = true` screens must be stateless; lifecycle hooks are called on each navigation

### Tests (69 new tests)

- [x] `CompactCallbackEncoder` round-trips for all button types
- [x] Compact encoding fits within 64 bytes for paths that fail `SimpleCallbackEncoder`
- [x] `CompactCallbackEncoder` throws for unregistered paths; ignores duplicate registrations
- [x] `ServerStateEncoder` stores and retrieves state correctly
- [x] `ServerStateEncoder` round-trips arbitrarily long paths
- [x] Keyboard diffing skips API call on unchanged view; calls on changed text/keyboard
- [x] Keyboard diffing caches per-messageId independently
- [x] Fingerprint cached after `sendNew` and after "message is not modified" error

---

## Phase 10 — Documentation, Examples, Full Test Suite ✅

### Documentation

- [x] `README.md` — project overview, installation, quickstart, API reference
- [x] Architecture decision records (`docs/adr/`):
  - ADR-001: SPA-style in-place message editing
  - ADR-002: First-match RegExp routing (Express-style)
  - ADR-003: Three-tier callback encoder strategy
  - ADR-004: Core/adapter dependency inversion (zero grammY in core)
  - ADR-005: History cursor model (entries[] + cursor index)
  - ADR-006: Parallel resolver execution with per-user TTL cache
  - ADR-007: Singleton screens and lazy factory detection via prototype absence

### Example bot

- [x] Minimal working bot (`examples/minimal/index.ts`) using `GrammYNavigationEngine`
- [x] Full B2B SaaS demo bot (`examples/event-manager/index.ts`) with:
  - Home, Events, EventDetail, Participants, Settings, ChangeNameScreen
  - AuthGuard (redirect to /login)
  - EventResolver with 30 s cache
  - PaginationComponent, StatCardComponent, TitleComponent
  - CompactCallbackEncoder, singleton EventListScreen, lazy DashboardScreen
  - SessionMiddleware

### Test coverage push

- [x] Coverage threshold: 80% branches / functions / lines / statements — achieved 81.7% branches
- [x] Added missing branch coverage for error paths, resolver caching, replace(), back(), ctx.navigate/replace/back within render()
- [x] E2E test (`src/__tests__/e2e.test.ts`): full navigation lifecycle, guards, resolvers, middleware, state persistence across engine restarts, params, query strings
- [x] Load test (`src/__tests__/load.test.ts`): 1000 concurrent navigations, 200 users with 3-entry history verification

**Final: 490 tests, 31 test suites, 0 failures, 81.7% branch coverage**

---

## Post-Phase-10 Additions ✅

### Wizard ergonomics (v0.4.0)

- [x] **`WizardScreen.onCallback?(ctx: WizardCallbackContext)`** — inline-keyboard-driven wizard steps; `tryHandleCallback()` mirrors `tryHandleText()` in `WizardNavigationEngine`
- [x] **`WizardCallbackContext`** / **`ConcreteWizardCallbackContext`** — extends `WizardContext` with `callbackData` and `answerCallbackQuery()`
- [x] **`Button.prevStep(text)`** / **`Button.cancelWizard(text, path?)`** — wizard navigation buttons handled automatically by `nav.middleware()`; tokens `wiz:prev` / `wiz:cancel[:/path]`
- [x] **`Button.raw(text, callbackData)`** — pass-through button; encoder not applied
- [x] **`GrammYWizardDefinition`** / **`onExit?(data, ctx)`** — async hook called before `exitPath` navigation on both completion and cancellation; `WizardExitFn` extended with optional `data` + `wizardId` params (backward-compatible)
- [x] **`GrammYNavigationEngineOptions.onUnrecoverableCallback`** — called when callback decoding fails and snapshot recovery returns `false`

### Middleware dispatch order in `GrammYNavigationEngine`

1. `wiz:prev` / `wiz:cancel` tokens (if active wizard)
2. Active step `onCallback` (if step defines it)
3. Navigation adapter (`nav:`, `action:`, `nav:__back__`, snapshot recovery, `onUnrecoverableCallback`)

---

## Dependency graph

```
Phase 1 (core) → Phase 2 (adapter) → Phase 3 (screen API)
                                              ↓
                           Phase 4 (middleware/guards/resolvers)
                                              ↓
                           Phase 5 (action dispatcher)
                                              ↓
                           Phase 6 (UI components)
                                              ↓
                           Phase 7 (wizards)
                                              ↓
Phase 8 (DI) — can start after Phase 4; blocks Phase 7 if DI needed in wizards
Phase 9 (performance) — independent, can start after Phase 2
Phase 10 (docs/examples) — after all feature phases
```

# Changelog

All notable changes to this project will be documented in this file.

## [0.3.0] — 2026-06-28

### Added
- `RouteSnapshot` interface and `RouteSnapshotStore` interface (`src/core/snapshot/route-snapshot.ts`)
- `InMemoryRouteSnapshotStore` reference implementation (tests/dev; swap for Redis/Postgres in production)
- `SnapshotNotFoundError` — thrown by `RouteSnapshotStore.update()` when the key is absent
- `RouteDefinition.version?: number` — screen schema version stored in every snapshot for future migration compatibility
- `NavigationEngineConfig.snapshotStore?` — opt-in; zero behavior change when absent
- `GrammYNavigationEngineOptions.snapshotStore?` — wired through to the engine
- `NavigationEngine.recoverNavigation(chatId, messageId, user, chat, target)` — re-navigates to a stored route, returns `false` when no snapshot is found
- Snapshot recovery in `GrammYAdapter`: when `CallbackDataEncoder.decode()` returns `{ type: 'unknown' }` and a `messageId` is available, the adapter automatically calls `recoverNavigation()` before forwarding to `next()`
- 31 new tests covering snapshot persistence, restart recovery, deleted snapshot, stale snapshot (version infra), missing screen, and resolver failure during recovery

### Architecture

Snapshots are keyed by `(chatId, messageId)` — not by `(chatId, userId)` like `NavigationState`. This lets the engine recover from a Telegram callback without any per-user session state. `RouteSnapshotStore` and `WizardStateStore` are fully independent interfaces; wizard recovery is a separate future concern.

## [0.2.0] — 2026-06-26

### Added
- **Wizard text input** — `WizardScreen.awaitText` flag; `onText(ctx: WizardTextContext)` hook intercepts the next `message:text` from the user; re-renders the step on validation failure (return `ScreenView`), or advances (return `void`)
- **`WizardTextContext`** — extends `WizardContext` with `readonly text: string`
- **`onError` hook** — `GrammYNavigationEngineOptions.onError(err, ctx, answerCallbackQuery)` catches navigation errors surfaced through the middleware chain; third argument dismisses the Telegram spinner and optionally shows an alert popup
- **`onNavigate` telemetry hook** — `GrammYNavigationEngineOptions.onNavigate(event)` receives path, userId, chatId, per-resolver durations (ms), and total duration (ms) after every successful navigation
- **`stableId` wiring** — `GrammYNavigationEngine.register()` now auto-calls `encoder.registerRoute(path, stableId)` when the encoder exposes that method, so `CompactCallbackEncoder` stays in sync without manual calls
- **`InMemoryCallbackStore` TTL/maxSize** — `new InMemoryCallbackStore({ maxSize, ttlMs })` prevents unbounded memory growth in `ServerStateEncoder` deployments
- **`NavigationContext.cancelActiveWizard(wizardId?)`** — screens call this to clean up a stale wizard session on hub entry; wired through `GrammYNavigationEngine` via a forward-ref closure
- **`deleteUserMessage`** support — `GrammYRenderer.deleteMessage(chatId, messageId)` already existed; wizard engine now uses it to clean up user text messages during wizard flows
- **Wizard `exitPath` as function** — `WizardDefinition.exitPath` now accepts `(wizardData) => string` in addition to a plain string, allowing dynamic exit routing based on accumulated wizard data

### Fixed
- `onError` handler now always dismisses the callback query spinner even when the user's handler does not call `answerCallbackQuery()` — prevents stuck Telegram spinners on error paths

## [0.1.0] — 2026-06-26

### Added
- Core interfaces: routes, screens, navigation, guards, resolvers, middleware, renderer, state
- Angular-style router with RegExp-based first-match route matching
- `NavigationEngine` with history stack (navigate / back / replace)
- `ScreenRegistry` for mapping routes to screen components
- `InMemoryStateStore` for per-user navigation state
- `CallbackEncoder` (`SimpleCallbackEncoder`, `CompactCallbackEncoder`, `ServerStateEncoder`) — encodes nav/action callbacks within Telegram's 64-byte limit
- grammY adapter: `GrammYNavigationEngine`, `GrammYAdapter`, `GrammYRenderer`
- Screen API: `ScreenBuilder`, `KeyboardBuilder`, `Button`, HTML helpers
- UI components: `TitleComponent`, `SectionComponent`, `PaginationComponent`, `ConfirmDialogComponent`, etc.
- Guards: `BaseGuard`, `IsAuthenticatedGuard`
- Resolvers: `BaseResolver`
- Middleware: `BaseMiddleware`
- Action dispatcher: `ActionDispatcher`, `BaseActionHandler`
- Wizard support: `WizardScreen`, `WizardNavigationEngine`
- Dependency injection: `SimpleInjector`, `InjectionToken`

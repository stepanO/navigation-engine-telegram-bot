# Changelog

All notable changes to this project will be documented in this file.

## [0.4.0] — 2026-06-29

### Added

#### Wizard enhancements

- **`WizardScreen.onCallback(ctx: WizardCallbackContext)`** — optional hook for inline-keyboard-driven wizard steps (date pickers, option selectors). When defined, `nav.middleware()` intercepts all callback queries for the active user/step before forwarding them to the navigation adapter.
- **`WizardCallbackContext`** — extends `WizardContext` with `callbackData: string` and `answerCallbackQuery(opts?)`. The engine answers the callback query automatically after a re-render; call `answerCallbackQuery()` directly for no-render acknowledgements.
- **`ConcreteWizardCallbackContext`** — concrete implementation, exported for testing.
- **`GrammYWizardDefinition`** — grammY-layer extension of `WizardDefinition` adding an optional `onExit?(data, ctx: Context): Promise<void>` hook. Accepted by `registerWizard()` in place of a plain `WizardDefinition`. Called before navigation to `exitPath` on both completion and cancellation.
- **`WizardExitFn`** — two optional trailing parameters added (`data?` and `wizardId?`) so the grammY adapter can invoke `onExit` hooks without touching the framework-agnostic core. Existing implementations with 4 parameters continue to work.

#### Wizard navigation buttons

- **`Button.prevStep(text)`** → `PrevStepButtonDescriptor` — encodes to the `wiz:prev` token. `nav.middleware()` intercepts this token and calls `prevStep()` on the active wizard automatically.
- **`Button.cancelWizard(text, navigateTo?)`** → `CancelWizardButtonDescriptor` — encodes to `wiz:cancel` or `wiz:cancel:/path`. `nav.middleware()` clears the wizard state and navigates to `navigateTo` (or calls `back()` if omitted).
- Exported constants: `WIZ_PREV_TOKEN`, `WIZ_CANCEL_TOKEN`, `WIZ_CANCEL_PREFIX`.

#### Miscellaneous button

- **`Button.raw(text, callbackData)`** → `RawButtonDescriptor` — `KeyboardBuilder` passes the provided `callbackData` string through as-is, bypassing the encoder. Useful for custom integration tokens outside the navigation engine.

#### Engine options

- **`GrammYNavigationEngineOptions.onUnrecoverableCallback?: (ctx) => Promise<void>`** — called when a callback query cannot be decoded AND snapshot recovery fails (or is not configured). Use this to show a "session expired" message instead of silently falling through to `next()`. When not set, behaviour is unchanged (calls `next()`).

### Architecture

- `Button.prevStep` and `Button.cancelWizard` tokens use a dedicated `wiz:` prefix that does not collide with `nav:`, `action:`, `c:`, or `s:` tokens from existing encoders.
- Wizard callback handling priority in `nav.middleware()`: `wiz:prev` / `wiz:cancel` tokens → active step `onCallback` → navigation adapter (nav/action/back/snapshot-recovery).
- `pendingWizardCtx` map (keyed by `${chatId}:${userId}`) provides the grammY `Context` to `onExit` during the synchronous wizard exit flow without requiring changes to the core engine API.

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

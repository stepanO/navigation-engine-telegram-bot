# Changelog

All notable changes to this project will be documented in this file.

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

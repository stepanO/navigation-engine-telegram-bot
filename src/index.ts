/**
 * Public API surface for the Navigation Engine.
 *
 * Import from this barrel in consuming code:
 *   import { NavigationEngine, Router, ScreenRegistry, ... } from 'navigation-engine-telegram-bot';
 */

// Core interfaces
export type {
  RouteParams,
  QueryParams,
  RouteStaticData,
  RouteDefinition,
  CompiledRoute,
  RouteMatch,
  LazyComponentFactory,
} from './core/interfaces/route.js';

export type {
  ParseMode,
  InlineKeyboardButton,
  KeyboardDefinition,
  ScreenView,
  ScreenComponent,
  ScreenComponentConstructor,
} from './core/interfaces/screen.js';

export type {
  TelegramUser,
  TelegramChat,
  HistoryEntry,
  NavigationContext,
  NavigationState,
} from './core/interfaces/navigation.js';

export type { GuardResult, Guard, GuardConstructor } from './core/interfaces/guard.js';
export type { Resolver, ResolverConstructor, ResolverMap } from './core/interfaces/resolver.js';
export type { NextFn, NavigationMiddleware, MiddlewareConstructor } from './core/interfaces/middleware.js';
export type { StateKey, StateStore } from './core/interfaces/state.js';
export { buildStateKey } from './core/interfaces/state.js';

// Errors
export {
  NavigationError,
  RouteNotFoundError,
  NavigationGuardError,
  ResolverError,
  NoHistoryError,
  DuplicateRouteError,
  ActionNotFoundError,
  DuplicateActionError,
  WizardNotFoundError,
  WizardNotActiveError,
  WizardAtFirstStepError,
  InjectionError,
} from './core/interfaces/errors.js';

// Router
export { Router } from './core/router/router.js';
export { RouteMatcher } from './core/router/route-matcher.js';
export { compileRoute, extractParams, splitPathAndQuery } from './core/router/route-parser.js';

// Registry
export { ScreenRegistry } from './core/registry/screen-registry.js';

// State
export { InMemoryStateStore } from './core/state/in-memory-state-store.js';

// Renderer
export type { RenderTarget, RenderResult, Renderer } from './core/interfaces/renderer.js';

// Engine
export { NavigationEngine } from './core/engine/navigation-engine.js';
export type { NavigationEngineConfig } from './core/engine/navigation-engine.js';
export { NavigationStack } from './core/engine/navigation-stack.js';

// Callback encoder
export type { CallbackDataEncoder, DecodedCallback } from './callback/callback-encoder.js';
export {
  SimpleCallbackEncoder,
  CallbackDataTooLongError,
  NAV_PREFIX,
  BACK_TOKEN,
  ACTION_PREFIX,
  CALLBACK_DATA_MAX_BYTES,
} from './callback/callback-encoder.js';

// Compact and server-state encoders (Phase 9)
export { CompactCallbackEncoder } from './callback/compact-callback-encoder.js';
export type { CallbackStore } from './callback/server-state-encoder.js';
export { ServerStateEncoder, InMemoryCallbackStore } from './callback/server-state-encoder.js';

// Dependency Injection (Phase 8)
export { InjectionToken } from './core/di/injection-token.js';
export type { Injector } from './core/di/injector.js';
export { SimpleInjector } from './core/di/simple-injector.js';
export { createInjectable } from './core/registry/screen-registry.js';

// Wizards (Phase 7)
export type { WizardStep, WizardDefinition } from './core/wizard/wizard-definition.js';
export type { WizardState, WizardStateStore } from './core/wizard/wizard-state.js';
export { InMemoryWizardStateStore, buildWizardKey } from './core/wizard/wizard-state.js';
export { WizardScreen } from './core/wizard/wizard-screen.js';
export type { WizardScreenConstructor } from './core/wizard/wizard-screen.js';
export type { WizardContext } from './core/wizard/wizard-context.js';
export { WizardNavigationEngine } from './core/wizard/wizard-navigation-engine.js';
export type { WizardExitFn } from './core/wizard/wizard-navigation-engine.js';

// UI Components (Phase 6)
export {
  TitleComponent,
  SectionComponent,
  InfoBoxComponent,
  WarningBoxComponent,
  ErrorBoxComponent,
  EmptyStateComponent,
  StatCardComponent,
  TagComponent,
  BreadcrumbsComponent,
} from './core/components/text.js';

export type { ConfirmDialog } from './core/components/keyboard.js';
export {
  mergeKeyboards,
  PaginationComponent,
  ConfirmDialogComponent,
  ActionRowComponent,
  ButtonGroupComponent,
} from './core/components/keyboard.js';

// Action Dispatcher (Phase 5)
export type { ActionContext, ActionHandler, ActionHandlerConstructor } from './core/action/action-context.js';
export { ActionDispatcher } from './core/action/action-dispatcher.js';
export { BaseActionHandler } from './core/action/base-action-handler.js';

// Guards (Phase 4)
export { BaseGuard } from './core/guards/base-guard.js';
export { IsAuthenticatedGuard } from './core/guards/is-authenticated-guard.js';
export type { Session } from './core/guards/is-authenticated-guard.js';

// Resolvers (Phase 4)
export { BaseResolver } from './core/resolvers/base-resolver.js';

// Middleware (Phase 4)
export { BaseMiddleware } from './core/middleware/base-middleware.js';

// Screen API (Phase 3)
export type {
  ButtonDescriptor,
  NavigateButtonDescriptor,
  ActionButtonDescriptor,
  UrlButtonDescriptor,
  BackButtonDescriptor,
} from './core/screen/button.js';
export { Button } from './core/screen/button.js';
export { KeyboardBuilder } from './core/screen/keyboard-builder.js';
export { ScreenBuilder } from './core/screen/screen-builder.js';
export { escapeHtml, bold, italic, underline, strikethrough, code, pre, link, spoiler } from './core/screen/html.js';

// grammY adapter
export { GrammYRenderer } from './adapter/grammy/grammy-renderer.js';
export { GrammYAdapter } from './adapter/grammy/grammy-adapter.js';
export { GrammYNavigationEngine } from './adapter/grammy/grammy-navigation-engine.js';
export type { GrammYNavigationEngineOptions } from './adapter/grammy/grammy-navigation-engine.js';
export { toInlineKeyboardMarkup } from './adapter/grammy/keyboard-converter.js';
export { extractTelegramUser, extractTelegramChat } from './adapter/grammy/context-extractors.js';

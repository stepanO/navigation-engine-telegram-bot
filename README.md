# navigation-engine-telegram-bot

Angular-inspired SPA navigation engine for [grammY](https://grammy.dev) Telegram bots.

Instead of sending a new message on every action, the library edits the **same message in-place** — routing, guards, resolvers, middleware, and history management work just like an Angular SPA, but inside Telegram.

---

## Features

- **SPA-style routing** — one message, edited in-place with full back/forward history
- **Route params & query strings** — `/events/:id?page=1`
- **Guards** — block or redirect before a screen activates
- **Resolvers** — fetch async data (API, DB) before the screen renders; optional per-route TTL cache
- **Middleware** — cross-cutting concerns (sessions, logging, i18n)
- **Wizards** — multi-step conversational flows with text input and per-step navigation
- **UI Components** — composable title, section, stat-card, pagination, confirm-dialog components
- **Screen Builder / Keyboard Builder** — fluent APIs for building `ScreenView`s
- **Callback encoders** — three strategies for Telegram's 64-byte `callback_data` limit:
  - `SimpleCallbackEncoder` — stores the full path inline (default, zero config)
  - `CompactCallbackEncoder` — base-36 route IDs + params (≤64 bytes for most paths)
  - `ServerStateEncoder` — stores paths server-side; only an 8-byte key in `callback_data`
- **Route Snapshots** — restart-safe navigation: screens recover transparently after a bot restart
- **Singleton screens** — one instance shared across all renders
- **Lazy route loading** — pass `() => ScreenClass` to defer module loading
- **Keyboard diffing** — skips Telegram API call when the view hasn't changed
- **Dependency injection** — `SimpleInjector` with `InjectionToken` and factory overrides
- **Action Dispatcher** — side-effect buttons that don't navigate (`action:deleteEvent:42`)

---

## Requirements

- Node.js ≥ 20
- TypeScript 5.x strict mode
- grammY ≥ 1.30

---

## Installation

```bash
npm install navigation-engine-telegram-bot grammy
```

---

## Quickstart

```typescript
import { Bot } from 'grammy';
import { GrammYNavigationEngine } from 'navigation-engine-telegram-bot';
import type { ScreenComponent, ScreenView, NavigationContext } from 'navigation-engine-telegram-bot';

// 1. Define screens
class HomeScreen implements ScreenComponent {
  async render(ctx: NavigationContext): Promise<ScreenView> {
    return {
      text: `<b>Home</b>\nWelcome, ${ctx.user.firstName}!`,
      parseMode: 'HTML',
      keyboard: {
        inline: [[{ text: 'Browse Events', callbackData: 'nav:/events' }]],
      },
    };
  }
}

class EventsScreen implements ScreenComponent {
  async render(_ctx: NavigationContext): Promise<ScreenView> {
    return {
      text: '<b>Events</b>',
      parseMode: 'HTML',
      keyboard: {
        inline: [[{ text: '← Back', callbackData: 'nav:__back__' }]],
      },
    };
  }
}

// 2. Bootstrap
const bot = new Bot(process.env.BOT_TOKEN!);
const nav = new GrammYNavigationEngine(bot.api);

nav
  .register({ path: '/',       component: HomeScreen })
  .register({ path: '/events', component: EventsScreen });

// 3. Wire middleware and entry point
bot.use(nav.middleware());
bot.command('start', ctx => nav.navigate(ctx, '/'));

bot.start();
```

---

## Core Concepts

### Routes

```typescript
nav.register({
  path: '/events/:id',
  component: EventDetailScreen,
  guards:    [AuthGuard],
  resolvers: { event: EventResolver },
  data:      { title: 'Event Detail' },
  version:   1,                         // schema version for snapshot migration
});
```

### Screens

A screen is a class with a `render(ctx)` method and optional lifecycle hooks:

```typescript
class EventDetailScreen implements ScreenComponent {
  async beforeEnter(ctx: NavigationContext): Promise<void> {
    await ctx.cancelActiveWizard(); // clean up any stale wizard on entry
  }

  async render(ctx: NavigationContext): Promise<ScreenView> {
    const event = ctx.data['event'] as { name: string };
    return {
      text: `<b>${event.name}</b>`,
      parseMode: 'HTML',
      keyboard: {
        inline: [[{ text: '← Back', callbackData: 'nav:__back__' }]],
      },
    };
  }

  async afterRender(ctx: NavigationContext): Promise<void> {
    // side-effects allowed here (analytics, etc.)
  }
}
```

Available on `ctx`:

| Property | Type | Description |
|----------|------|-------------|
| `ctx.params` | `Record<string, string>` | URL params like `:id` |
| `ctx.query` | `Record<string, string>` | Query string params |
| `ctx.data` | `Record<string, unknown>` | Populated by resolvers & middleware |
| `ctx.user` | `TelegramUser` | Current Telegram user |
| `ctx.chat` | `TelegramChat` | Current Telegram chat |
| `ctx.navigate(path)` | `Promise<void>` | Navigate (push) |
| `ctx.replace(path)` | `Promise<void>` | Replace current entry |
| `ctx.back()` | `Promise<void>` | Go back in history |
| `ctx.cancelActiveWizard(id?)` | `Promise<void>` | Cancel active wizard |

### Guards

```typescript
import type { Guard, GuardResult, NavigationContext } from 'navigation-engine-telegram-bot';

class AuthGuard implements Guard {
  async canActivate(ctx: NavigationContext): Promise<GuardResult> {
    if (ctx.data['session']) return { allowed: true };
    return { allowed: false, redirect: '/login' };
    // or to throw: return { allowed: false, message: 'Access denied.' };
  }
}
```

### Resolvers

```typescript
import type { Resolver } from 'navigation-engine-telegram-bot';

class EventResolver implements Resolver<Event> {
  static cacheTtl = 30_000; // ms — optional per-user/route/params TTL cache

  async resolve(ctx: NavigationContext): Promise<Event> {
    return db.events.findById(ctx.params['id']!);
  }
}

nav.register({
  path: '/events/:id',
  component: EventDetailScreen,
  resolvers: { event: EventResolver },
});
// In screen: ctx.data['event'] as Event
```

### Middleware

```typescript
import type { NavigationMiddleware, NextFn } from 'navigation-engine-telegram-bot';

class SessionMiddleware implements NavigationMiddleware {
  async handle(ctx: NavigationContext, next: NextFn): Promise<void> {
    (ctx.data as Record<string, unknown>)['session'] = await loadSession(ctx.user.id);
    await next();
  }
}

nav.use(SessionMiddleware);
```

### Screen Builder

```typescript
import { ScreenBuilder, Button } from 'navigation-engine-telegram-bot';

class HomeScreen implements ScreenComponent {
  async render(ctx: NavigationContext): Promise<ScreenView> {
    return new ScreenBuilder()
      .html('<b>Home</b>')
      .row(Button.navigate('Events', '/events'))
      .row(Button.navigate('Settings', '/settings'))
      .row(Button.url('Help', 'https://example.com/help'))
      .build();
  }
}
```

### Actions

Button-triggered side effects that do **not** navigate:

```typescript
import type { ActionHandler, ActionContext } from 'navigation-engine-telegram-bot';

class DeleteEventHandler implements ActionHandler {
  async handle(ctx: ActionContext): Promise<void> {
    await db.events.delete(ctx.params[0]!);
    await ctx.navigate('/events'); // optionally navigate after
  }
}

nav.registerAction('deleteEvent', DeleteEventHandler);

// In a screen:
Button.action('Delete', 'deleteEvent', [eventId])
// emits callback_data: "action:deleteEvent:42"
```

### Callback Encoders

**Default (`SimpleCallbackEncoder`)** — stores `nav:/path?query=value` inline. Throws `CallbackDataTooLongError` for paths > 64 bytes. Zero config.

**`CompactCallbackEncoder`** — assigns 2-character base-36 route IDs. Use `stableId` to prevent ID shifts when routes are reordered:

```typescript
import { CompactCallbackEncoder } from 'navigation-engine-telegram-bot';

const nav = new GrammYNavigationEngine(bot.api, {
  encoder: new CompactCallbackEncoder(),
});

nav
  .register({ path: '/events',     stableId: 'ev', component: EventsScreen })
  .register({ path: '/events/:id', stableId: 'ed', component: EventDetailScreen });
```

**`ServerStateEncoder`** — stores the full path server-side; emits only an 8-byte key. Combine with `snapshotStore` for restart safety:

```typescript
import { ServerStateEncoder, InMemoryCallbackStore } from 'navigation-engine-telegram-bot';

const nav = new GrammYNavigationEngine(bot.api, {
  encoder: new ServerStateEncoder(
    new InMemoryCallbackStore({ maxSize: 10_000, ttlMs: 24 * 60 * 60_000 }),
  ),
});
```

### Route Snapshots (restart-safe navigation)

By default, pressing a button on an old Telegram message after a bot restart fails for encoders that store state in memory (`ServerStateEncoder`). Enable Route Snapshots to recover transparently:

```typescript
import { InMemoryRouteSnapshotStore } from 'navigation-engine-telegram-bot';

const nav = new GrammYNavigationEngine(bot.api, {
  encoder: new ServerStateEncoder(redisCallbackStore),
  snapshotStore: new InMemoryRouteSnapshotStore(), // swap for Redis in production
});
```

**How it works:**

1. After every successful render the engine writes a `RouteSnapshot` keyed by `(chatId, messageId)`.
2. When a callback arrives and the encoder cannot decode the data (returns `{ type: 'unknown' }`), the adapter looks up the snapshot for that message.
3. If found, the engine re-runs the full navigation lifecycle (guards → resolvers → render) and the user sees a fresh screen — as if nothing happened.

Implement `RouteSnapshotStore` against Redis or Postgres for production:

```typescript
export interface RouteSnapshotStore {
  save(snapshot: RouteSnapshot): Promise<void>;
  find(chatId: number, messageId: number): Promise<RouteSnapshot | null>;
  delete(chatId: number, messageId: number): Promise<void>;
  update(snapshot: RouteSnapshot): Promise<void>;
}
```

**Screen versioning** — bump `version` on a route when the screen's data contract changes. The stored `screenVersion` lets future migration logic detect stale snapshots:

```typescript
nav.register({ path: '/profile', component: ProfileScreen, version: 2 });
// snapshot.screenVersion === 2 → compare against current definition.version at recovery time
```

### Wizards

Multi-step conversational flows integrated into `GrammYNavigationEngine`:

```typescript
import { WizardScreen } from 'navigation-engine-telegram-bot';
import type { WizardContext, WizardDefinition, WizardTextContext } from 'navigation-engine-telegram-bot';

class NameStep extends WizardScreen {
  readonly awaitText = true as const; // intercept the next text message

  async onStep(ctx: WizardContext): Promise<ScreenView> {
    return new ScreenBuilder().html('Enter your name:').build();
  }

  async onText(ctx: WizardTextContext): Promise<ScreenView | void> {
    if (ctx.text.length < 2) {
      return new ScreenBuilder().html('Name too short, try again:').build();
    }
    await ctx.nextStep({ name: ctx.text });
  }
}

class ConfirmStep extends WizardScreen {
  async onStep(ctx: WizardContext): Promise<ScreenView> {
    return new ScreenBuilder()
      .html(`Confirm name: <b>${ctx.wizardData['name']}</b>`)
      .row(Button.navigate('✓ Confirm', '/done'))
      .row(Button.back('← Back'))
      .build();
  }
}

const createProfileWizard: WizardDefinition = {
  id: 'create-profile',
  steps: [
    { screen: NameStep },
    { screen: ConfirmStep },
  ],
  exitPath: '/profile',
};

nav.registerWizard(createProfileWizard);

// Start from a command:
bot.command('create', ctx => nav.startWizard(ctx, 'create-profile'));
```

### Lazy Route Loading

```typescript
nav.register({
  path: '/dashboard',
  component: () => DashboardScreen,         // arrow function → lazy
});

// Async import (deferred module loading):
nav.register({
  path: '/heavy',
  component: () => import('./heavy.js').then(m => m.HeavyScreen),
});
```

### Singleton Screens

```typescript
class NavBar implements ScreenComponent {
  static readonly singleton = true as const; // one instance, reused across navigations

  async render(ctx: NavigationContext): Promise<ScreenView> { /* ... */ }
}
```

### Dependency Injection

```typescript
import { SimpleInjector, InjectionToken } from 'navigation-engine-telegram-bot';

const DB = new InjectionToken<Database>('Database');

const injector = new SimpleInjector();
injector.bind(DB, new PostgresDatabase());

const nav = new GrammYNavigationEngine(bot.api, { injector });

class EventResolver implements Resolver<Event> {
  private readonly db: Database;

  static factory(injector: Injector) {
    return new EventResolver(injector.get(DB));
  }

  constructor(db: Database) { this.db = db; }

  async resolve(ctx: NavigationContext): Promise<Event> {
    return this.db.events.findById(ctx.params['id']!);
  }
}
```

---

## Navigation Stack

The history model mirrors a browser tab:

- `navigate(path)` — push to stack, discard forward history
- `back()` — move cursor backwards; throws `NoHistoryError` at the first entry
- `replace(path)` — overwrite current entry in-place (history length unchanged)
- Default max history depth: 50, configurable via `maxHistory`

---

## State Persistence

### Navigation state (history stack)

Swap in any `StateStore` implementation:

```typescript
export interface StateStore {
  get(key: string): Promise<NavigationState | undefined>;
  set(key: string, state: NavigationState): Promise<void>;
  delete(key: string): Promise<void>;
}
```

`InMemoryStateStore` is included. Implement Redis or Postgres adapters for production.

### Route Snapshots (rendered message state)

For restart recovery, implement `RouteSnapshotStore` (keyed by `(chatId, messageId)`):

```typescript
export interface RouteSnapshotStore {
  save(snapshot: RouteSnapshot): Promise<void>;
  find(chatId: number, messageId: number): Promise<RouteSnapshot | null>;
  delete(chatId: number, messageId: number): Promise<void>;
  update(snapshot: RouteSnapshot): Promise<void>;
}
```

`InMemoryRouteSnapshotStore` is included for tests and development.

---

## API Reference

### `GrammYNavigationEngine`

The one-stop facade for grammY bots.

```typescript
new GrammYNavigationEngine(api: Api, options?: GrammYNavigationEngineOptions)
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `encoder` | `CallbackDataEncoder` | `SimpleCallbackEncoder` | Callback data encoding strategy |
| `stateStore` | `StateStore` | `InMemoryStateStore` | Navigation stack persistence |
| `snapshotStore` | `RouteSnapshotStore` | none | Route snapshot persistence for restart recovery |
| `wizardStateStore` | `WizardStateStore` | `InMemoryWizardStateStore` | Wizard session persistence |
| `injector` | `Injector` | none | DI injector for screens/guards/resolvers/middleware |
| `maxHistory` | `number` | `50` | Max history depth per user/chat |
| `onError` | `(err, ctx, answerCbq) => Promise<void>` | rethrow | Navigation error handler |
| `onNavigate` | `(event) => void` | none | Navigation telemetry callback |

Methods:

| Method | Description |
|--------|-------------|
| `register(definition)` | Register a route. Fluent — returns `this`. |
| `registerWizard(definition)` | Register a wizard. Fluent. |
| `registerAction(name, handler)` | Register an action handler. Fluent. |
| `use(middleware)` | Add global navigation middleware. Fluent. |
| `middleware()` | Returns a grammY `MiddlewareFn` — pass to `bot.use()`. |
| `navigate(ctx, path)` | Navigate programmatically (e.g. from a command handler). |
| `replace(ctx, path)` | Replace current history entry programmatically. |
| `startWizard(ctx, wizardId)` | Start a wizard session. |
| `cancelWizard(ctx, wizardId)` | Cancel a wizard session and navigate to `exitPath`. |
| `startWizardWithData(ctx, id, data)` | Start a wizard with pre-seeded data. |

### `NavigationEngine` (framework-agnostic)

```typescript
new NavigationEngine(router, registry, renderer, stateStore, config?)
```

Methods: `register(definition)`, `use(middleware)`, `navigate(path, user, chat, target)`, `back(user, chat, target)`, `replace(path, user, chat, target)`, `recoverNavigation(chatId, messageId, user, chat, target)`.

---

## Errors

| Error | When |
|-------|------|
| `RouteNotFoundError` | No route matches the navigated path |
| `NavigationGuardError` | Guard returns `{ allowed: false }` without a redirect |
| `NoHistoryError` | `back()` called from the first history entry |
| `DuplicateRouteError` | Same path registered twice |
| `CallbackDataTooLongError` | Encoded callback data exceeds 64 bytes |
| `ResolverError` | A resolver's `resolve()` threw |
| `InjectionError` | DI token not found in the injector |
| `ActionNotFoundError` | No handler registered for the action name |
| `DuplicateActionError` | Action handler registered twice |
| `WizardNotFoundError` | No wizard defined with the given ID |
| `WizardNotActiveError` | `nextStep`/`prevStep`/`cancel` called with no active session |
| `WizardAtFirstStepError` | `prevStep()` called on the first wizard step |
| `SnapshotNotFoundError` | `RouteSnapshotStore.update()` called for a non-existent snapshot |

---

## Project Status

| Phase | Scope | Status |
|-------|-------|--------|
| 1 | Core interfaces, Router, Route matching, NavigationEngine, ScreenRegistry | Complete |
| 2 | Renderer, grammY Adapter, NavigationStack, CallbackEncoder | Complete |
| 3 | Screen API, ScreenBuilder, KeyboardBuilder | Complete |
| 4 | Middleware, Guards, Resolvers | Complete |
| 5 | Action Dispatcher | Complete |
| 6 | UI Components | Complete |
| 7 | Wizards (multi-step flows, text input) | Complete |
| 8 | Dependency Injection | Complete |
| 9 | CompactCallbackEncoder, ServerStateEncoder, keyboard diffing, resolver caching | Complete |
| 10 | Docs, examples, full test suite (588 tests) | Complete |
| — | Route Snapshots (restart-safe navigation) | Complete |

---

## License

Apache 2.0

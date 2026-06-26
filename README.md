# navigation-engine-telegram-bot

Angular-inspired SPA navigation engine for [grammY](https://grammy.dev) Telegram bots.

Instead of sending a new message on every action, the library edits the **same message in-place** — routing, guards, resolvers, middleware, and history management work just like an Angular SPA, but inside Telegram.

---

## Features

- **SPA-style routing** — one message, edited in-place with full back/forward history
- **Route params & query strings** — `/events/:id?page=1`
- **Guards** — block or redirect before a screen activates
- **Resolvers** — fetch async data (API, DB) before the screen renders
- **Middleware** — cross-cutting concerns (sessions, logging, i18n)
- **Wizards** — multi-step conversational flows with per-step navigation
- **UI Components** — composable title, section, stat-card, pagination, confirm-dialog components
- **Screen Builder / Keyboard Builder** — fluent APIs for building `ScreenView`s
- **Callback encoders** — three strategies for Telegram's 64-byte `callback_data` limit:
  - `SimpleCallbackEncoder` — stores the full path inline (default)
  - `CompactCallbackEncoder` — base-36 route IDs + params (≤64 bytes for most paths)
  - `ServerStateEncoder` — stores paths server-side; only an 8-byte key in `callback_data`
- **Singleton screens** — one instance shared across all renders
- **Lazy route loading** — pass `() => ScreenClass` to defer module loading
- **Resolver caching** — per-user/route TTL cache avoids redundant fetches
- **Keyboard diffing** — skips Telegram API call when the view hasn't changed
- **Dependency injection** — `SimpleInjector` with `InjectionToken` and factory overrides

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

// 2. Bootstrap the engine
const bot = new Bot(process.env.BOT_TOKEN!);
const engine = new GrammYNavigationEngine(bot, {
  routes: [
    { path: '/', component: HomeScreen },
    { path: '/events', component: EventsScreen },
  ],
});

// 3. Entry point — /start sends the first message
bot.command('start', async (ctx) => {
  await engine.send('/', ctx);
});

bot.start();
```

---

## Core Concepts

### Routes

```typescript
engine.register({
  path: '/events/:id',       // named param
  component: EventDetailScreen,
  guards: [AuthGuard],       // run before activation
  resolvers: { event: EventResolver },  // populate ctx.data.event
  data: { title: 'Event Detail' },      // static metadata
});
```

### Screens

A screen is a class with a single `render(ctx)` method:

```typescript
class EventDetailScreen implements ScreenComponent {
  async render(ctx: NavigationContext): Promise<ScreenView> {
    const event = ctx.data['event'] as { name: string };
    return {
      text: bold(`Event: ${event.name}`),
      parseMode: 'HTML',
      keyboard: {
        inline: [[
          { text: '← Back', callbackData: 'nav:__back__' },
        ]],
      },
    };
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
| `ctx.navigate(path)` | `Promise<void>` | Navigate from within `render()` |
| `ctx.replace(path)` | `Promise<void>` | Replace current entry |
| `ctx.back()` | `Promise<void>` | Go back in history |

### Guards

```typescript
import { Guard, GuardResult, NavigationContext } from 'navigation-engine-telegram-bot';

class AuthGuard implements Guard {
  async canActivate(ctx: NavigationContext): Promise<GuardResult> {
    if (ctx.data['session']) return { allowed: true };
    return { allowed: false, redirect: '/login' };
    // or: return { allowed: false, message: 'You must log in.' };
  }
}
```

Return `{ allowed: false }` without `redirect` to throw `NavigationGuardError`.

### Resolvers

```typescript
import { Resolver, ResolverConstructor } from 'navigation-engine-telegram-bot';

class EventResolver implements Resolver<Event> {
  // optional: static cacheTtl = 60_000; // ms — cache per user/route/params
  async resolve(ctx: NavigationContext): Promise<Event> {
    return db.events.findById(ctx.params['id']!);
  }
}

// Attach to a route:
engine.register({
  path: '/events/:id',
  component: EventDetailScreen,
  resolvers: { event: EventResolver },
});
// Access in screen: ctx.data['event'] as Event
```

### Middleware

```typescript
import { NavigationMiddleware, NextFn } from 'navigation-engine-telegram-bot';

class SessionMiddleware implements NavigationMiddleware {
  async handle(ctx: NavigationContext, next: NextFn): Promise<void> {
    (ctx.data as Record<string, unknown>)['session'] = await loadSession(ctx.user.id);
    await next();
  }
}

engine.use(SessionMiddleware);
```

### Screen Builder

```typescript
import { ScreenBuilder, Button } from 'navigation-engine-telegram-bot';

class HomeScreen implements ScreenComponent {
  async render(ctx: NavigationContext): Promise<ScreenView> {
    return new ScreenBuilder()
      .html(bold('Home'))
      .row(Button.navigate('Events', '/events'))
      .row(Button.navigate('Settings', '/settings'))
      .build();
  }
}
```

### Callback Encoders

**Default (`SimpleCallbackEncoder`)** — stores `nav:/path?query=value` inline. Throws `CallbackDataTooLongError` for paths > 64 bytes.

**`CompactCallbackEncoder`** — registers routes with 2-character base-36 IDs. Best for many routes with short params.

```typescript
import { GrammYNavigationEngine, CompactCallbackEncoder } from 'navigation-engine-telegram-bot';

const engine = new GrammYNavigationEngine(bot, {
  encoder: new CompactCallbackEncoder(),
  routes: [...],
});
```

**`ServerStateEncoder`** — stores the full path in a server-side store; emits only an 8-byte key.

```typescript
import { GrammYNavigationEngine, ServerStateEncoder, InMemoryCallbackStore } from 'navigation-engine-telegram-bot';

const engine = new GrammYNavigationEngine(bot, {
  encoder: new ServerStateEncoder(new InMemoryCallbackStore()),
  routes: [...],
});
```

### Lazy Route Loading

```typescript
engine.register({
  path: '/heavy-screen',
  component: () => import('./heavy-screen.js').then(m => m.HeavyScreen),
});
// Actual: arrow-function form (no async needed for already-imported modules):
engine.register({ path: '/dashboard', component: () => DashboardScreen });
```

### Singleton Screens

```typescript
class DashboardScreen implements ScreenComponent {
  static readonly singleton = true as const;

  async render(ctx: NavigationContext): Promise<ScreenView> { /* ... */ }
}
```

### Dependency Injection

```typescript
import { SimpleInjector, InjectionToken } from 'navigation-engine-telegram-bot';

const DB_TOKEN = new InjectionToken<Database>('Database');

const injector = new SimpleInjector();
injector.provide(DB_TOKEN, new PostgresDatabase());

const engine = new GrammYNavigationEngine(bot, { injector, routes: [...] });
```

### Wizards

Multi-step conversational flows where each step is a screen:

```typescript
import { WizardNavigationEngine, WizardScreen } from 'navigation-engine-telegram-bot';
import type { WizardContext, WizardDefinition } from 'navigation-engine-telegram-bot';

class Step1Screen extends WizardScreen {
  async render(ctx: WizardContext): Promise<ScreenView> {
    return new ScreenBuilder().text('Step 1: Enter your name').build();
  }
}

const wizard: WizardDefinition = {
  id: 'create-event',
  steps: [Step1Screen, Step2Screen, Step3Screen],
};

const wizardEngine = new WizardNavigationEngine(engine);
wizardEngine.register(wizard);
```

---

## Navigation Stack

The history model mirrors a browser's tab:

- `navigate(path)` — push to stack, discard forward history
- `back()` — move cursor backwards; throws `NoHistoryError` at position 0
- `replace(path)` — replace current entry in-place
- Default max history depth: 50 (configurable via `NavigationEngineConfig.maxHistoryEntries`)

---

## State Persistence

Swap in any `StateStore` implementation:

```typescript
export interface StateStore {
  get(key: string): Promise<NavigationState | undefined>;
  set(key: string, state: NavigationState): Promise<void>;
  delete(key: string): Promise<void>;
}
```

`InMemoryStateStore` is included. Implement Redis or Postgres adapters for production.

---

## API Reference

### `GrammYNavigationEngine`

The one-stop facade for grammY bots.

```typescript
new GrammYNavigationEngine(bot, options)
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `routes` | `RouteDefinition[]` | `[]` | Routes to register on construction |
| `encoder` | `CallbackDataEncoder` | `SimpleCallbackEncoder` | Callback data encoding strategy |
| `stateStore` | `StateStore` | `InMemoryStateStore` | History persistence |
| `injector` | `Injector` | none | DI injector for screens/guards/resolvers |
| `maxHistoryEntries` | `number` | `50` | Max history depth per user/chat |

Methods: `register(route)`, `use(middleware)`, `send(path, ctx)`, `navigate(path, ctx)`, `back(ctx)`, `replace(path, ctx)`.

### `NavigationEngine` (framework-agnostic)

```typescript
new NavigationEngine(router, registry, renderer, stateStore, config?)
```

Methods: `register(route)`, `use(middleware)`, `navigate(path, user, chat, target)`, `back(user, chat, target)`, `replace(path, user, chat, target)`.

---

## Errors

| Error | When |
|-------|------|
| `RouteNotFoundError` | No route matches the path |
| `NavigationGuardError` | Guard returns `{ allowed: false }` without redirect |
| `NoHistoryError` | `back()` called from the first history entry |
| `DuplicateRouteError` | Same path registered twice |
| `CallbackDataTooLongError` | Encoded callback exceeds 64 bytes |
| `ResolverError` | Resolver `resolve()` threw |
| `InjectionError` | DI token not found in injector |
| `WizardNotFoundError` | `WizardNavigationEngine` can't find a wizard by ID |

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
| 7 | Wizards | Complete |
| 8 | DI injector | Complete |
| 9 | CompactCallbackEncoder, ServerStateEncoder, keyboard diffing, caching | Complete |
| 10 | Docs, examples, full test suite (490 tests, 81.7% branch coverage) | Complete |

---

## License

MIT

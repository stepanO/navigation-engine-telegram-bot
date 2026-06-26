# grammy-navigation-engine — Missing Features

Collected from an analysis of a real migration target (volleyball Telegram bot, ~7K LOC, 3 major wizards).

Legend: ✅ already implemented in this session · ⬜ not yet done

---

## P0 — Without these a real migration is impossible

### ✅ `Button.webApp(text, url)` — Telegram Mini App buttons

Mini App buttons use the `web_app: { url }` field, not `url` or `callback_data`.
The `Button` factory had no way to create them.

**Added:**
- `WebAppButtonDescriptor` in `button.ts`
- `Button.webApp(text, url)` factory
- `web_app?` field on `InlineKeyboardButton` in `screen.ts`
- `encode` case in `KeyboardBuilder`
- `toInlineKeyboardMarkup` now emits `{ text, web_app }` correctly

---

### ✅ `Button.login(text, url, options?)` — Telegram login buttons

Bots use `login_url` buttons for account linking (Telegram Login Widget).
Same problem as web_app — no factory existed.

**Added:**
- `LoginUrl` interface in `screen.ts`
- `LoginButtonDescriptor` in `button.ts`
- `Button.login(text, url, { forwardText?, botUsername?, requestWriteAccess? })` factory
- `login_url?` field on `InlineKeyboardButton`
- `encode` case in `KeyboardBuilder`
- `toInlineKeyboardMarkup` now emits `{ text, login_url }` correctly

---

### ✅ `KeyboardBuilder.addRawRow(...buttons: InlineKeyboardButton[])` — raw button rows

No way to mix library buttons with hand-crafted `InlineKeyboardButton` objects
(needed for `web_app` before the factory existed, or any Telegram button type the library
doesn't cover yet).

**Added:**
- `addRawRow(...buttons)` method on `KeyboardBuilder`
- Internal storage changed to `KeyboardRowEntry` union: `'descriptors' | 'raw'`
- `build()` passes raw rows through without encoding

---

### ✅ `stableId` on `RouteDefinition` — safe `CompactCallbackEncoder` deployments

`CompactCallbackEncoder` assigns route IDs by registration order. Inserting a new route
anywhere in the list shifts all subsequent IDs, invalidating every button already sent
to users. A bot with thousands of users cannot afford this.

**Added:**
- `stableId?: string` field on `RouteDefinition` in `route.ts`

**Still needed — `CompactCallbackEncoder.registerRoute(path, stableId?)`:**

```typescript
// compact-callback-encoder.ts

registerRoute(path: string, stableId?: string): this {
  if (this.byPath.has(path)) return this;
  const compiled = compileRoute({ path, component: null as unknown as ScreenComponentConstructor });

  let id: number;
  if (stableId !== undefined) {
    id = fromRouteId(stableId);
    if (this.byId.has(id)) {
      throw new Error(
        `CompactCallbackEncoder: stableId "${stableId}" is already in use. ` +
        `Each route must have a unique stableId.`,
      );
    }
  } else {
    // Skip IDs already reserved by explicit stableId values.
    while (this.byId.has(this.nextId)) {
      this.nextId++;
    }
    id = this.nextId++;
  }

  this.byPath.set(path, { id, compiled });
  this.byId.set(id, compiled);
  return this;
}
```

Also update `GrammYNavigationEngine.register()` to pass `stableId` through:

```typescript
// grammy-navigation-engine.ts  (register method, line ~93)

(this.encoder as { registerRoute: (path: string, stableId?: string) => void })
  .registerRoute(definition.path, definition.stableId);
```

---

### ⬜ Text input in wizard steps

`WizardNavigationEngine` and `GrammYAdapter.middleware()` only intercept `callback_query`.
Three major real-world wizards require free-text input at multiple steps
(event title, project name, payment method name, participant search, etc.).
Without this, **none of the three wizards can be migrated**.

**What to add:**

**1. `WizardTextContext` in `wizard-context.ts`:**
```typescript
export interface WizardTextContext extends WizardContext {
  readonly text: string;
}

export class ConcreteWizardTextContext extends ConcreteWizardContext implements WizardTextContext {
  constructor(
    // ... same args as ConcreteWizardContext ...
    readonly text: string,
  ) {
    super(/* forward all args */);
  }
}
```

**2. `WizardScreen` in `wizard-screen.ts`:**
```typescript
export abstract class WizardScreen {
  /** If true, the engine intercepts the next message:text for this step. */
  readonly awaitText?: true;

  abstract onStep(ctx: WizardContext): Promise<ScreenView>;

  /**
   * Called when awaitText is true and the user sends a text message.
   * Return a ScreenView to re-render the step (e.g. validation error).
   * Return void to signal the step handled it internally (called ctx.nextStep, etc.).
   */
  onText?(ctx: WizardTextContext): Promise<ScreenView | void>;
}
```

**3. Active wizard tracking + `tryHandleText` in `wizard-navigation-engine.ts`:**
```typescript
export class WizardNavigationEngine {
  // New: in-memory index of which wizard is active per user/chat.
  // (Acceptable for now; production can track this in the WizardStateStore.)
  private readonly activeWizardByUser = new Map<string, string>(); // `${chatId}:${userId}` → wizardId

  async getActiveWizardId(chatId: number, userId: number): Promise<string | undefined> {
    return this.activeWizardByUser.get(`${chatId}:${userId}`);
  }

  /**
   * Handle a text message for the active wizard's current step.
   * Returns true if the step had awaitText=true and onText was called.
   * Returns false if the current step doesn't expect text (caller should call next()).
   */
  async tryHandleText(
    wizardId: string,
    text: string,
    user: TelegramUser,
    chat: TelegramChat,
    target: RenderTarget,
  ): Promise<boolean> {
    const def = this.wizards.get(wizardId);
    if (!def) return false;
    const state = await this.stateStore.get(buildWizardKey(chat.id, user.id, wizardId));
    if (!state) return false;
    const stepDef = def.steps[state.stepIndex];
    if (!stepDef) return false;
    const screen = new stepDef.screen();
    if (!screen.awaitText || !screen.onText) return false;

    const ctx = new ConcreteWizardTextContext(/* ... */, text);
    const result = await screen.onText(ctx);
    if (result !== undefined) {
      const renderResult = await this.renderer.render(result, target);
      if (renderResult.messageId !== undefined) {
        // persist new messageId
      }
    }
    return true;
  }

  // Update start() to set active wizard:
  async start(wizardId, user, chat, target): Promise<void> {
    this.activeWizardByUser.set(`${chat.id}:${user.id}`, wizardId);
    // ... existing logic ...
  }

  // Update cancelInternal() and advanceStep (last step) to clear active wizard:
  private async cancelInternal(state, user, chat, target): Promise<void> {
    this.activeWizardByUser.delete(`${chat.id}:${user.id}`);
    // ... existing logic ...
  }
}
```

---

### ⬜ `GrammYNavigationEngine` wizard integration

Currently `WizardNavigationEngine` takes `(renderer, stateStore, exitFn)` in its constructor,
but `GrammYRenderer` and `StateStore` are created inside `GrammYNavigationEngine` and not exposed.
Users have to duplicate config or dig into internals.

**What to add:**

```typescript
// GrammYNavigationEngineOptions
interface GrammYNavigationEngineOptions {
  // ... existing ...
  wizardStateStore?: WizardStateStore; // default: new InMemoryWizardStateStore()
}

// GrammYNavigationEngine — store renderer as class field, lazy-init wizard engine
class GrammYNavigationEngine {
  private readonly renderer: GrammYRenderer;       // store (currently local var only)
  private readonly stateStore: StateStore;         // store (currently local var only)
  private readonly wizardStateStore: WizardStateStore;
  private wizardEngine?: WizardNavigationEngine;  // lazy

  registerWizard(definition: WizardDefinition): this {
    this.getOrCreateWizardEngine().define(definition);
    return this;
  }

  async startWizard(ctx: Context, wizardId: string): Promise<void> {
    // extract user/chat from ctx, buildRenderTarget, call wizardEngine.start()
  }

  async cancelWizard(ctx: Context, wizardId: string): Promise<void> {
    // extract user/chat from ctx, buildRenderTarget, call wizardEngine.cancel()
  }

  // Override middleware() to also handle message:text for active wizard steps:
  middleware(): MiddlewareFn<Context> {
    const adapterMiddleware = this.adapter.middleware();
    return async (ctx, next) => {
      if (ctx.callbackQuery?.data) {
        await adapterMiddleware(ctx, next);
        return;
      }
      if (this.wizardEngine && ctx.message?.text && ctx.from && ctx.chat) {
        const user = extractTelegramUser(ctx.from);
        const chat = extractTelegramChat(ctx.chat);
        const wizardId = await this.wizardEngine.getActiveWizardId(chat.id, user.id);
        if (wizardId !== undefined) {
          const target = await this.buildRenderTarget(ctx);
          const handled = await this.wizardEngine.tryHandleText(wizardId, ctx.message.text, user, chat, target);
          if (handled) return;
        }
      }
      await next();
    };
  }

  private getOrCreateWizardEngine(): WizardNavigationEngine {
    if (!this.wizardEngine) {
      this.wizardEngine = new WizardNavigationEngine(
        this.renderer,
        this.wizardStateStore,
        (path, user, chat, target) => this.engine.navigate(path, user, chat, target),
      );
    }
    return this.wizardEngine;
  }

  // Duplicate of GrammYAdapter.buildTarget() — needed for message:text context
  private async buildRenderTarget(ctx: Context): Promise<RenderTarget> {
    const chatId = ctx.chat!.id;
    const userId = ctx.from!.id;
    const stateKey = buildStateKey(chatId, userId);
    const state = await this.stateStore.get(stateKey);
    const messageId = state?.messageId ?? ctx.message?.message_id;
    return messageId !== undefined ? { chatId, userId, messageId } : { chatId, userId };
  }
}
```

---

## P1 — Hard to migrate without, but workable with workarounds

### ⬜ `NavigationContext.cancelActiveWizard(wizardId?)` — cleanup on hub navigation

When the user opens the admin hub mid-wizard (e.g. via `/admin` command), the current
bot manually clears stale wizard state. With the engine there's no standard hook for this.

**Option A — on `RouteDefinition`:**
```typescript
interface RouteDefinition {
  // ...
  cancelActiveWizards?: true; // cancel any active wizard before beforeEnter()
}
```

**Option B — in `NavigationContext` (more flexible):**
```typescript
interface NavigationContext {
  // ...
  cancelActiveWizard(wizardId?: string): Promise<void>; // no arg = cancel any active
}
```

Option B is preferred — keeps `RouteDefinition` clean and lets screens decide.

---

## P2 — Quality of life

### ⬜ `onError` hook in `GrammYNavigationEngineOptions`

Errors (`RouteNotFoundError`, `NavigationGuardError`, `ResolverError`) are thrown and
bubble up uncaught unless the user wraps `bot.use(nav.middleware())` in try/catch.

```typescript
interface GrammYNavigationEngineOptions {
  onError?: (error: NavigationError, ctx: Context) => Promise<void>;
}
```

---

### ⬜ TTL / max-size for `InMemoryCallbackStore`

`ServerStateEncoder`'s `InMemoryCallbackStore` grows unbounded. In production with
high traffic this will exhaust memory.

```typescript
class InMemoryCallbackStore implements CallbackStore {
  constructor(options?: { maxSize?: number; ttlMs?: number }) {}
}
```

---

### ⬜ `onNavigate` telemetry hook

No built-in way to log navigation events, measure resolver latency, or push metrics.
Navigation middleware can be used as a workaround, but there are no timing hooks.

```typescript
interface GrammYNavigationEngineOptions {
  onNavigate?: (event: {
    path: string;
    userId: number;
    chatId: number;
    resolverDurationsMs: Record<string, number>;
    totalDurationMs: number;
  }) => void;
}
```

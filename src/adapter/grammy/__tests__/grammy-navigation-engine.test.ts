import { GrammYNavigationEngine } from '../grammy-navigation-engine.js';
import { CompactCallbackEncoder } from '../../../callback/compact-callback-encoder.js';
import type { Api, Context, MiddlewareFn } from 'grammy';
import type { ScreenComponent, ScreenView } from '../../../core/interfaces/screen.js';
import type { NavigationContext } from '../../../core/interfaces/navigation.js';
import type { WizardContext, WizardTextContext } from '../../../core/wizard/wizard-context.js';
import { WizardScreen } from '../../../core/wizard/wizard-screen.js';

// ─── Test doubles ─────────────────────────────────────────────────────────────

function makeMockApi(): Api {
  return {
    editMessageText: jest.fn().mockResolvedValue(true),
    sendMessage: jest.fn().mockResolvedValue({ message_id: 99 }),
    answerCallbackQuery: jest.fn().mockResolvedValue(true),
  } as unknown as Api;
}

class StubScreen implements ScreenComponent {
  async render(_ctx: NavigationContext): Promise<ScreenView> {
    return { text: 'stub' };
  }
}

class StubWizardStep extends WizardScreen {
  async onStep(_ctx: WizardContext): Promise<ScreenView> {
    return { text: 'wizard step' };
  }
}

let capturedTextCtx: WizardTextContext | undefined;

class TextInputStep extends WizardScreen {
  readonly awaitText = true as const;

  async onStep(_ctx: WizardContext): Promise<ScreenView> {
    return { text: 'Enter text:' };
  }

  async onText(ctx: WizardTextContext): Promise<ScreenView | void> {
    capturedTextCtx = ctx;
  }
}

// ─── Context builders ─────────────────────────────────────────────────────────

function makeTextCtx(text: string, userId = 1, chatId = 100): Context {
  return {
    from: { id: userId, first_name: 'Alice', is_bot: false },
    chat: { id: chatId, type: 'private' as const },
    message: { text }, // no message_id so renderer sends a new message
    callbackQuery: undefined,
  } as unknown as Context;
}

function makeCallbackCtx(data: string, userId = 1, chatId = 100): Context {
  return {
    from: { id: userId, first_name: 'Alice', is_bot: false },
    chat: { id: chatId, type: 'private' as const },
    callbackQuery: {
      id: 'cq1',
      data,
      message: { message_id: 42 },
      from: { id: userId, first_name: 'Alice', is_bot: false },
      chat_instance: 'ci',
    },
    message: undefined,
  } as unknown as Context;
}

async function runMiddleware(middleware: MiddlewareFn<Context>, ctx: Context): Promise<boolean> {
  let nextCalled = false;
  await middleware(ctx, async () => { nextCalled = true; });
  return nextCalled;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GrammYNavigationEngine — registerWizard()', () => {
  it('returns this for chaining', () => {
    const nav = new GrammYNavigationEngine(makeMockApi());
    const result = nav.registerWizard({ id: 'w', steps: [{ screen: StubWizardStep }], exitPath: '/' });
    expect(result).toBe(nav);
  });
});

describe('GrammYNavigationEngine — startWizard()', () => {
  it('renders the first wizard step (sends a message)', async () => {
    const api = makeMockApi();
    const nav = new GrammYNavigationEngine(api);
    nav.registerWizard({ id: 'w', steps: [{ screen: StubWizardStep }], exitPath: '/' });

    await nav.startWizard(makeTextCtx(''), 'w');

    expect(api.sendMessage as jest.Mock).toHaveBeenCalledWith(
      100, 'wizard step', expect.anything(),
    );
  });

  it('throws when ctx.from is missing', async () => {
    const nav = new GrammYNavigationEngine(makeMockApi());
    nav.registerWizard({ id: 'w', steps: [{ screen: StubWizardStep }], exitPath: '/' });
    const ctx = { chat: { id: 100, type: 'private' } } as unknown as Context;
    await expect(nav.startWizard(ctx, 'w')).rejects.toThrow('requires ctx.from and ctx.chat');
  });

  it('throws when ctx.chat is missing', async () => {
    const nav = new GrammYNavigationEngine(makeMockApi());
    nav.registerWizard({ id: 'w', steps: [{ screen: StubWizardStep }], exitPath: '/' });
    const ctx = { from: { id: 1, first_name: 'A', is_bot: false } } as unknown as Context;
    await expect(nav.startWizard(ctx, 'w')).rejects.toThrow('requires ctx.from and ctx.chat');
  });
});

describe('GrammYNavigationEngine — cancelWizard()', () => {
  it('cancels an active wizard session', async () => {
    const api = makeMockApi();
    const nav = new GrammYNavigationEngine(api);
    nav.register({ path: '/', component: StubScreen });
    nav.registerWizard({ id: 'w', steps: [{ screen: StubWizardStep }], exitPath: '/' });

    const userCtx = makeTextCtx('');
    await nav.startWizard(userCtx, 'w');
    // cancelWizard should navigate to exitPath ('/') without throwing
    await expect(nav.cancelWizard(userCtx, 'w')).resolves.toBeUndefined();
  });

  it('throws when ctx.from is missing', async () => {
    const nav = new GrammYNavigationEngine(makeMockApi());
    nav.registerWizard({ id: 'w', steps: [{ screen: StubWizardStep }], exitPath: '/' });
    const ctx = { chat: { id: 100, type: 'private' } } as unknown as Context;
    await expect(nav.cancelWizard(ctx, 'w')).rejects.toThrow('requires ctx.from and ctx.chat');
  });
});

describe('GrammYNavigationEngine — middleware()', () => {
  describe('callback query handling', () => {
    it('calls next() for unrecognised callback data', async () => {
      const nav = new GrammYNavigationEngine(makeMockApi());
      nav.register({ path: '/', component: StubScreen });
      const ctx = makeCallbackCtx('random-unknown-data');
      const nextCalled = await runMiddleware(nav.middleware(), ctx);
      expect(nextCalled).toBe(true);
    });

    it('handles nav: callback and does not call next()', async () => {
      const nav = new GrammYNavigationEngine(makeMockApi());
      nav.register({ path: '/', component: StubScreen });
      const ctx = makeCallbackCtx('nav:/');
      const nextCalled = await runMiddleware(nav.middleware(), ctx);
      expect(nextCalled).toBe(false);
    });
  });

  describe('text message handling', () => {
    beforeEach(() => { capturedTextCtx = undefined; });

    it('calls next() when there is no active wizard', async () => {
      const nav = new GrammYNavigationEngine(makeMockApi());
      const nextCalled = await runMiddleware(nav.middleware(), makeTextCtx('hello'));
      expect(nextCalled).toBe(true);
    });

    it('calls next() when active wizard step does not have awaitText', async () => {
      const api = makeMockApi();
      const nav = new GrammYNavigationEngine(api);
      nav.registerWizard({ id: 'w', steps: [{ screen: StubWizardStep }], exitPath: '/' });

      await nav.startWizard(makeTextCtx(''), 'w');
      const nextCalled = await runMiddleware(nav.middleware(), makeTextCtx('hello'));
      expect(nextCalled).toBe(true);
    });

    it('intercepts text message for active wizard step with awaitText=true', async () => {
      const api = makeMockApi();
      const nav = new GrammYNavigationEngine(api);
      nav.registerWizard({ id: 'w', steps: [{ screen: TextInputStep }], exitPath: '/' });

      await nav.startWizard(makeTextCtx(''), 'w');
      const nextCalled = await runMiddleware(nav.middleware(), makeTextCtx('my input'));

      expect(nextCalled).toBe(false);
      expect(capturedTextCtx?.text).toBe('my input');
    });

    it('calls next() after wizard completes (no active wizard)', async () => {
      const api = makeMockApi();
      const nav = new GrammYNavigationEngine(api);
      nav.register({ path: '/', component: StubScreen });
      // TextInputStep calls ctx.nextStep() in onText, completing the wizard
      class CompletingTextStep extends WizardScreen {
        readonly awaitText = true as const;
        async onStep(_ctx: WizardContext): Promise<ScreenView> { return { text: 'input' }; }
        async onText(ctx: WizardTextContext): Promise<ScreenView | void> {
          await ctx.nextStep();
        }
      }
      nav.registerWizard({ id: 'w', steps: [{ screen: CompletingTextStep }], exitPath: '/' });

      await nav.startWizard(makeTextCtx(''), 'w');
      await runMiddleware(nav.middleware(), makeTextCtx('done')); // completes wizard

      // Now wizard is done — next text message should call next()
      const nextCalled = await runMiddleware(nav.middleware(), makeTextCtx('after'));
      expect(nextCalled).toBe(true);
    });
  });
});

describe('GrammYNavigationEngine — onError hook', () => {
  it('calls onError when navigation throws (e.g. route not found)', async () => {
    const errors: unknown[] = [];
    const nav = new GrammYNavigationEngine(makeMockApi(), {
      onError: async (err) => { errors.push(err); },
    });
    // No routes registered — 'nav:/' will decode to navigation to '/' which is not found
    const ctx = makeCallbackCtx('nav:/');
    await runMiddleware(nav.middleware(), ctx);
    expect(errors).toHaveLength(1);
  });

  it('re-throws when onError is not configured', async () => {
    const nav = new GrammYNavigationEngine(makeMockApi());
    // No routes registered
    const ctx = makeCallbackCtx('nav:/');
    await expect(runMiddleware(nav.middleware(), ctx)).rejects.toThrow();
  });

  it('calls onError and does not re-throw when handler is provided', async () => {
    const nav = new GrammYNavigationEngine(makeMockApi(), {
      onError: async () => {},
    });
    const ctx = makeCallbackCtx('nav:/unknown');
    await expect(runMiddleware(nav.middleware(), ctx)).resolves.not.toThrow();
  });
});

describe('GrammYNavigationEngine — stableId wiring', () => {
  it('passes stableId to CompactCallbackEncoder on register()', () => {
    const encoder = new CompactCallbackEncoder();
    const nav = new GrammYNavigationEngine(makeMockApi(), { encoder });

    nav.register({ path: '/a', stableId: 'a0', component: StubScreen });
    nav.register({ path: '/b', component: StubScreen }); // auto-ID, skips a0 (360)

    // /a should decode to 'a0' (numeric 360)
    const encoded = encoder.encodeNavigation('/a');
    expect(encoded).toBe('c:a0');
    expect(encoder.decode(encoded)).toEqual({ type: 'navigation', path: '/a' });
  });
});

describe('GrammYNavigationEngine — onNavigate hook', () => {
  it('fires after a successful navigation', async () => {
    const events: unknown[] = [];
    const nav = new GrammYNavigationEngine(makeMockApi(), {
      onNavigate: (e) => events.push(e),
    });
    nav.register({ path: '/', component: StubScreen });

    await nav.navigate(makeCallbackCtx('nav:/'), '/');
    expect(events).toHaveLength(1);
  });

  it('includes path, userId, chatId in the event', async () => {
    const events: { path: string; userId: number; chatId: number }[] = [];
    const nav = new GrammYNavigationEngine(makeMockApi(), {
      onNavigate: (e) => events.push(e),
    });
    nav.register({ path: '/', component: StubScreen });
    const ctx = makeCallbackCtx('nav:/', 7, 42);
    await nav.navigate(ctx, '/');
    expect(events[0]?.path).toBe('/');
    expect(events[0]?.userId).toBe(7);
    expect(events[0]?.chatId).toBe(42);
  });
});

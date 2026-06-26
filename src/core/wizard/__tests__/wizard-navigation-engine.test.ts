import type { ScreenView } from '../../interfaces/screen.js';
import type { Renderer, RenderTarget, RenderResult } from '../../interfaces/renderer.js';
import type { TelegramUser, TelegramChat } from '../../interfaces/navigation.js';
import type { WizardContext, WizardTextContext } from '../wizard-context.js';
import { WizardScreen } from '../wizard-screen.js';
import { WizardNavigationEngine } from '../wizard-navigation-engine.js';
import { InMemoryWizardStateStore } from '../wizard-state.js';
import {
  WizardNotFoundError,
  WizardNotActiveError,
  WizardAtFirstStepError,
} from '../../interfaces/errors.js';

// ─── Test doubles ─────────────────────────────────────────────────────────────

class SpyRenderer implements Renderer {
  readonly renders: ScreenView[] = [];
  readonly callbacksAnswered: RenderTarget[] = [];
  nextMessageId: number | undefined = undefined;

  async render(view: ScreenView, _target: RenderTarget): Promise<RenderResult> {
    this.renders.push(view);
    if (this.nextMessageId !== undefined) {
      const messageId = this.nextMessageId;
      this.nextMessageId = undefined;
      return { messageId };
    }
    return {};
  }

  async answerCallbackQuery(_target: RenderTarget): Promise<void> {
    this.callbacksAnswered.push(_target);
  }

  get lastView(): ScreenView | undefined {
    return this.renders[this.renders.length - 1];
  }
}

// ─── Wizard step helpers ───────────────────────────────────────────────────────

function makeStep(text: string) {
  return class extends WizardScreen {
    async onStep(_ctx: WizardContext): Promise<ScreenView> {
      return { text };
    }
  };
}

let capturedCtx: WizardContext | undefined;

class CapturingStep extends WizardScreen {
  async onStep(ctx: WizardContext): Promise<ScreenView> {
    capturedCtx = ctx;
    return { text: `step ${ctx.step}` };
  }
}

class SummaryStep extends WizardScreen {
  async onStep(ctx: WizardContext): Promise<ScreenView> {
    const name = ctx.wizardData['name'] as string | undefined;
    const date = ctx.wizardData['date'] as string | undefined;
    return { text: `Summary: ${name ?? ''} on ${date ?? ''}` };
  }
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const user: TelegramUser = { id: 1, firstName: 'Alice', isBot: false };
const chat: TelegramChat = { id: 100, type: 'private' };
const target: RenderTarget = { chatId: 100, userId: 1 };

const NameStep = makeStep('Enter name');
const DateStep = makeStep('Enter date');
const ConfirmStep = makeStep('Confirm');

function makeEngine(
  renderer: SpyRenderer,
  stateStore: InMemoryWizardStateStore,
  exitCalls: Array<{ path: string }>,
) {
  return new WizardNavigationEngine(renderer, stateStore, async (path, _u, _c, _t) => {
    exitCalls.push({ path });
  });
}

function makeDefaultEngine(
  renderer: SpyRenderer,
  stateStore: InMemoryWizardStateStore,
  exitCalls: Array<{ path: string }>,
) {
  const engine = makeEngine(renderer, stateStore, exitCalls);
  engine.define({
    id: 'createEvent',
    steps: [{ screen: NameStep }, { screen: DateStep }, { screen: ConfirmStep }],
    exitPath: '/events',
  });
  return engine;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('WizardNavigationEngine — define', () => {
  it('returns this for chaining', () => {
    const renderer = new SpyRenderer();
    const stateStore = new InMemoryWizardStateStore();
    const engine = new WizardNavigationEngine(renderer, stateStore, async () => {});
    expect(engine.define({ id: 'w', steps: [{ screen: NameStep }], exitPath: '/x' })).toBe(engine);
  });
});

describe('WizardNavigationEngine — start()', () => {
  let renderer: SpyRenderer;
  let stateStore: InMemoryWizardStateStore;
  let exitCalls: Array<{ path: string }>;
  let engine: WizardNavigationEngine;

  beforeEach(() => {
    renderer = new SpyRenderer();
    stateStore = new InMemoryWizardStateStore();
    exitCalls = [];
    engine = makeDefaultEngine(renderer, stateStore, exitCalls);
  });

  it('renders the first step', async () => {
    await engine.start('createEvent', user, chat, target);
    expect(renderer.lastView?.text).toBe('Enter name');
  });

  it('answers the callback query after rendering', async () => {
    await engine.start('createEvent', user, chat, target);
    expect(renderer.callbacksAnswered).toHaveLength(1);
  });

  it('persists wizard state in the store', async () => {
    await engine.start('createEvent', user, chat, target);
    const key = `wizard:${chat.id}:${user.id}:createEvent`;
    const state = await stateStore.get(key);
    expect(state).toBeDefined();
    expect(state!.stepIndex).toBe(0);
    expect(state!.totalSteps).toBe(3);
    expect(state!.data).toEqual({});
  });

  it('throws WizardNotFoundError for unknown wizard id', async () => {
    await expect(engine.start('unknown', user, chat, target)).rejects.toThrow(WizardNotFoundError);
  });

  it('includes wizardId in WizardNotFoundError', async () => {
    await expect(engine.start('unknown', user, chat, target)).rejects.toMatchObject({
      wizardId: 'unknown',
    });
  });

  it('persists messageId when renderer sends a new message', async () => {
    renderer.nextMessageId = 999;
    await engine.start('createEvent', user, chat, target);
    const key = `wizard:${chat.id}:${user.id}:createEvent`;
    const state = await stateStore.get(key);
    expect(state!.messageId).toBe(999);
  });
});

describe('WizardNavigationEngine — nextStep()', () => {
  let renderer: SpyRenderer;
  let stateStore: InMemoryWizardStateStore;
  let exitCalls: Array<{ path: string }>;
  let engine: WizardNavigationEngine;

  beforeEach(() => {
    renderer = new SpyRenderer();
    stateStore = new InMemoryWizardStateStore();
    exitCalls = [];
    engine = makeDefaultEngine(renderer, stateStore, exitCalls);
  });

  it('advances to the next step', async () => {
    await engine.start('createEvent', user, chat, target);
    await engine.nextStep('createEvent', undefined, user, chat, target);
    expect(renderer.lastView?.text).toBe('Enter date');
  });

  it('merges provided data into wizard state', async () => {
    await engine.start('createEvent', user, chat, target);
    await engine.nextStep('createEvent', { name: 'Summer Gala' }, user, chat, target);
    const key = `wizard:${chat.id}:${user.id}:createEvent`;
    const state = await stateStore.get(key);
    expect(state!.data).toEqual({ name: 'Summer Gala' });
  });

  it('accumulates data across multiple steps', async () => {
    const summaryEngine = new WizardNavigationEngine(renderer, stateStore, async (path) => {
      exitCalls.push({ path });
    });
    summaryEngine.define({
      id: 'createEvent',
      steps: [{ screen: NameStep }, { screen: DateStep }, { screen: SummaryStep }],
      exitPath: '/events',
    });

    await summaryEngine.start('createEvent', user, chat, target);
    await summaryEngine.nextStep('createEvent', { name: 'Summer Gala' }, user, chat, target);
    await summaryEngine.nextStep('createEvent', { date: '2025-07-01' }, user, chat, target);

    expect(renderer.lastView?.text).toBe('Summary: Summer Gala on 2025-07-01');
  });

  it('does not lose earlier step data when merging new data', async () => {
    await engine.start('createEvent', user, chat, target);
    await engine.nextStep('createEvent', { name: 'Gala' }, user, chat, target);
    await engine.nextStep('createEvent', { date: '2025-07-01' }, user, chat, target);
    const key = `wizard:${chat.id}:${user.id}:createEvent`;
    const state = await stateStore.get(key);
    expect(state!.data).toEqual({ name: 'Gala', date: '2025-07-01' });
  });

  it('completing last step calls exitFn with exitPath', async () => {
    await engine.start('createEvent', user, chat, target);
    await engine.nextStep('createEvent', undefined, user, chat, target);
    await engine.nextStep('createEvent', undefined, user, chat, target);
    await engine.nextStep('createEvent', undefined, user, chat, target); // last step

    expect(exitCalls).toHaveLength(1);
    expect(exitCalls[0]!.path).toBe('/events');
  });

  it('deletes wizard state after completing last step', async () => {
    await engine.start('createEvent', user, chat, target);
    await engine.nextStep('createEvent', undefined, user, chat, target);
    await engine.nextStep('createEvent', undefined, user, chat, target);
    await engine.nextStep('createEvent', undefined, user, chat, target);

    const key = `wizard:${chat.id}:${user.id}:createEvent`;
    const state = await stateStore.get(key);
    expect(state).toBeUndefined();
  });

  it('throws WizardNotFoundError for unknown wizard', async () => {
    await expect(engine.nextStep('unknown', {}, user, chat, target)).rejects.toThrow(
      WizardNotFoundError,
    );
  });

  it('throws WizardNotActiveError when no session exists', async () => {
    await expect(engine.nextStep('createEvent', {}, user, chat, target)).rejects.toThrow(
      WizardNotActiveError,
    );
    await expect(engine.nextStep('createEvent', {}, user, chat, target)).rejects.toMatchObject({
      wizardId: 'createEvent',
    });
  });

  it('updates step index in state', async () => {
    await engine.start('createEvent', user, chat, target);
    await engine.nextStep('createEvent', undefined, user, chat, target);
    const key = `wizard:${chat.id}:${user.id}:createEvent`;
    const state = await stateStore.get(key);
    expect(state!.stepIndex).toBe(1);
  });
});

describe('WizardNavigationEngine — prevStep()', () => {
  let renderer: SpyRenderer;
  let stateStore: InMemoryWizardStateStore;
  let exitCalls: Array<{ path: string }>;
  let engine: WizardNavigationEngine;

  beforeEach(() => {
    renderer = new SpyRenderer();
    stateStore = new InMemoryWizardStateStore();
    exitCalls = [];
    engine = makeDefaultEngine(renderer, stateStore, exitCalls);
  });

  it('goes back to the previous step', async () => {
    await engine.start('createEvent', user, chat, target);
    await engine.nextStep('createEvent', undefined, user, chat, target);
    await engine.prevStep('createEvent', user, chat, target);
    expect(renderer.lastView?.text).toBe('Enter name');
  });

  it('throws WizardAtFirstStepError on step 1', async () => {
    await engine.start('createEvent', user, chat, target);
    await expect(engine.prevStep('createEvent', user, chat, target)).rejects.toThrow(
      WizardAtFirstStepError,
    );
  });

  it('decrements step index in state', async () => {
    await engine.start('createEvent', user, chat, target);
    await engine.nextStep('createEvent', undefined, user, chat, target);
    await engine.prevStep('createEvent', user, chat, target);
    const key = `wizard:${chat.id}:${user.id}:createEvent`;
    const state = await stateStore.get(key);
    expect(state!.stepIndex).toBe(0);
  });

  it('throws WizardNotFoundError for unknown wizard', async () => {
    await expect(engine.prevStep('unknown', user, chat, target)).rejects.toThrow(
      WizardNotFoundError,
    );
  });

  it('throws WizardNotActiveError when no session exists', async () => {
    await expect(engine.prevStep('createEvent', user, chat, target)).rejects.toThrow(
      WizardNotActiveError,
    );
  });
});

describe('WizardNavigationEngine — cancel()', () => {
  let renderer: SpyRenderer;
  let stateStore: InMemoryWizardStateStore;
  let exitCalls: Array<{ path: string }>;
  let engine: WizardNavigationEngine;

  beforeEach(() => {
    renderer = new SpyRenderer();
    stateStore = new InMemoryWizardStateStore();
    exitCalls = [];
    engine = makeDefaultEngine(renderer, stateStore, exitCalls);
  });

  it('calls exitFn with exitPath', async () => {
    await engine.start('createEvent', user, chat, target);
    await engine.cancel('createEvent', user, chat, target);
    expect(exitCalls).toHaveLength(1);
    expect(exitCalls[0]!.path).toBe('/events');
  });

  it('deletes wizard state', async () => {
    await engine.start('createEvent', user, chat, target);
    await engine.cancel('createEvent', user, chat, target);
    const key = `wizard:${chat.id}:${user.id}:createEvent`;
    expect(await stateStore.get(key)).toBeUndefined();
  });

  it('does not render any step', async () => {
    await engine.start('createEvent', user, chat, target);
    const rendersBefore = renderer.renders.length;
    await engine.cancel('createEvent', user, chat, target);
    expect(renderer.renders.length).toBe(rendersBefore);
  });

  it('throws WizardNotActiveError when no session exists', async () => {
    await expect(engine.cancel('createEvent', user, chat, target)).rejects.toThrow(
      WizardNotActiveError,
    );
  });
});

describe('WizardNavigationEngine — resume()', () => {
  let renderer: SpyRenderer;
  let stateStore: InMemoryWizardStateStore;
  let exitCalls: Array<{ path: string }>;
  let engine: WizardNavigationEngine;

  beforeEach(() => {
    renderer = new SpyRenderer();
    stateStore = new InMemoryWizardStateStore();
    exitCalls = [];
    engine = makeDefaultEngine(renderer, stateStore, exitCalls);
  });

  it('re-renders the current step from persisted state', async () => {
    await engine.start('createEvent', user, chat, target);
    await engine.nextStep('createEvent', { name: 'Gala' }, user, chat, target);

    // Fresh engine sharing the same state store (simulates restart)
    const engine2 = makeDefaultEngine(renderer, stateStore, exitCalls);
    await engine2.resume('createEvent', user, chat, target);

    expect(renderer.lastView?.text).toBe('Enter date');
  });

  it('throws WizardNotActiveError when no session exists', async () => {
    await expect(engine.resume('createEvent', user, chat, target)).rejects.toThrow(
      WizardNotActiveError,
    );
  });
});

describe('WizardNavigationEngine — WizardContext', () => {
  let renderer: SpyRenderer;
  let stateStore: InMemoryWizardStateStore;

  beforeEach(() => {
    renderer = new SpyRenderer();
    stateStore = new InMemoryWizardStateStore();
    capturedCtx = undefined;
  });

  it('ctx.step is 1-indexed', async () => {
    const engine = new WizardNavigationEngine(renderer, stateStore, async () => {});
    engine.define({
      id: 'w',
      steps: [{ screen: CapturingStep }, { screen: CapturingStep }],
      exitPath: '/',
    });
    await engine.start('w', user, chat, target);
    expect(capturedCtx!.step).toBe(1);
  });

  it('ctx.totalSteps equals the number of defined steps', async () => {
    const engine = new WizardNavigationEngine(renderer, stateStore, async () => {});
    engine.define({
      id: 'w',
      steps: [{ screen: CapturingStep }, { screen: CapturingStep }, { screen: CapturingStep }],
      exitPath: '/',
    });
    await engine.start('w', user, chat, target);
    expect(capturedCtx!.totalSteps).toBe(3);
  });

  it('ctx.wizardData contains accumulated data from completed steps', async () => {
    const engine = new WizardNavigationEngine(renderer, stateStore, async () => {});
    engine.define({
      id: 'w',
      steps: [{ screen: NameStep }, { screen: CapturingStep }],
      exitPath: '/',
    });
    await engine.start('w', user, chat, target);
    await engine.nextStep('w', { name: 'Gala' }, user, chat, target);
    expect(capturedCtx!.wizardData).toEqual({ name: 'Gala' });
  });

  it('ctx.user and ctx.chat are set correctly', async () => {
    const engine = new WizardNavigationEngine(renderer, stateStore, async () => {});
    engine.define({ id: 'w', steps: [{ screen: CapturingStep }], exitPath: '/' });
    await engine.start('w', user, chat, target);
    expect(capturedCtx!.user).toEqual(user);
    expect(capturedCtx!.chat).toEqual(chat);
  });

  it('ctx.step increments when advancing steps', async () => {
    const engine = new WizardNavigationEngine(renderer, stateStore, async () => {});
    engine.define({
      id: 'w',
      steps: [{ screen: NameStep }, { screen: CapturingStep }],
      exitPath: '/',
    });
    await engine.start('w', user, chat, target);
    await engine.nextStep('w', undefined, user, chat, target);
    expect(capturedCtx!.step).toBe(2);
  });
});

describe('WizardNavigationEngine — WizardContext methods', () => {
  let renderer: SpyRenderer;
  let stateStore: InMemoryWizardStateStore;
  let exitCalls: Array<{ path: string }>;

  beforeEach(() => {
    renderer = new SpyRenderer();
    stateStore = new InMemoryWizardStateStore();
    exitCalls = [];
    capturedCtx = undefined;
  });

  it('ctx.nextStep() advances to the next step', async () => {
    const engine = new WizardNavigationEngine(renderer, stateStore, async () => {});
    engine.define({
      id: 'w',
      steps: [{ screen: CapturingStep }, { screen: makeStep('step 2') }],
      exitPath: '/',
    });
    await engine.start('w', user, chat, target);
    await capturedCtx!.nextStep();
    expect(renderer.lastView?.text).toBe('step 2');
  });

  it('ctx.nextStep() merges data', async () => {
    const engine = new WizardNavigationEngine(renderer, stateStore, async () => {});
    engine.define({
      id: 'w',
      steps: [{ screen: CapturingStep }, { screen: CapturingStep }],
      exitPath: '/',
    });
    await engine.start('w', user, chat, target);
    await capturedCtx!.nextStep({ foo: 'bar' });
    expect(capturedCtx!.wizardData).toEqual({ foo: 'bar' });
  });

  it('ctx.prevStep() goes back to the previous step', async () => {
    const engine = new WizardNavigationEngine(renderer, stateStore, async () => {});
    engine.define({
      id: 'w',
      steps: [{ screen: makeStep('step 1') }, { screen: CapturingStep }],
      exitPath: '/',
    });
    await engine.start('w', user, chat, target);
    await engine.nextStep('w', undefined, user, chat, target);
    await capturedCtx!.prevStep();
    expect(renderer.lastView?.text).toBe('step 1');
  });

  it('ctx.cancelWizard() calls exitFn with exitPath', async () => {
    const engine = new WizardNavigationEngine(renderer, stateStore, async (path) => {
      exitCalls.push({ path });
    });
    engine.define({ id: 'w', steps: [{ screen: CapturingStep }], exitPath: '/home' });
    await engine.start('w', user, chat, target);
    await capturedCtx!.cancelWizard();
    expect(exitCalls).toHaveLength(1);
    expect(exitCalls[0]!.path).toBe('/home');
  });

  it('ctx.back() goes to the previous step', async () => {
    const engine = new WizardNavigationEngine(renderer, stateStore, async () => {});
    engine.define({
      id: 'w',
      steps: [{ screen: makeStep('step 1') }, { screen: CapturingStep }],
      exitPath: '/',
    });
    await engine.start('w', user, chat, target);
    await engine.nextStep('w', undefined, user, chat, target);
    await capturedCtx!.back();
    expect(renderer.lastView?.text).toBe('step 1');
  });

  it('ctx.navigate() calls exitFn (exits wizard)', async () => {
    const engine = new WizardNavigationEngine(renderer, stateStore, async (path) => {
      exitCalls.push({ path });
    });
    engine.define({ id: 'w', steps: [{ screen: CapturingStep }], exitPath: '/home' });
    await engine.start('w', user, chat, target);
    await capturedCtx!.navigate('/external');
    expect(exitCalls).toHaveLength(1);
    expect(exitCalls[0]!.path).toBe('/external');
  });

  it('ctx.replace() calls exitFn with the given path (exits wizard)', async () => {
    const engine = new WizardNavigationEngine(renderer, stateStore, async (path) => {
      exitCalls.push({ path });
    });
    engine.define({ id: 'w', steps: [{ screen: CapturingStep }], exitPath: '/home' });
    await engine.start('w', user, chat, target);
    await capturedCtx!.replace('/replaced');
    expect(exitCalls).toHaveLength(1);
    expect(exitCalls[0]!.path).toBe('/replaced');
  });
});

// ─── Text-input helpers ────────────────────────────────────────────────────────

let capturedTextCtx: WizardTextContext | undefined;
let onTextReturnView: ScreenView | undefined = undefined;

class TextInputStep extends WizardScreen {
  readonly awaitText = true as const;

  async onStep(_ctx: WizardContext): Promise<ScreenView> {
    return { text: 'Enter a value:' };
  }

  async onText(ctx: WizardTextContext): Promise<ScreenView | void> {
    capturedTextCtx = ctx;
    if (onTextReturnView !== undefined) {
      return onTextReturnView;
    }
    await ctx.nextStep({ value: ctx.text });
  }
}

class NoTextStep extends WizardScreen {
  async onStep(_ctx: WizardContext): Promise<ScreenView> {
    return { text: 'No text input here' };
  }
}

// ─── getActiveWizardId ────────────────────────────────────────────────────────

describe('WizardNavigationEngine — getActiveWizardId()', () => {
  it('returns undefined when no wizard has been started', async () => {
    const engine = new WizardNavigationEngine(new SpyRenderer(), new InMemoryWizardStateStore(), async () => {});
    expect(await engine.getActiveWizardId(chat.id, user.id)).toBeUndefined();
  });

  it('returns the wizardId after start()', async () => {
    const engine = new WizardNavigationEngine(new SpyRenderer(), new InMemoryWizardStateStore(), async () => {});
    engine.define({ id: 'w1', steps: [{ screen: NameStep }], exitPath: '/' });
    await engine.start('w1', user, chat, target);
    expect(await engine.getActiveWizardId(chat.id, user.id)).toBe('w1');
  });

  it('returns undefined after cancel()', async () => {
    const engine = new WizardNavigationEngine(new SpyRenderer(), new InMemoryWizardStateStore(), async () => {});
    engine.define({ id: 'w1', steps: [{ screen: NameStep }], exitPath: '/' });
    await engine.start('w1', user, chat, target);
    await engine.cancel('w1', user, chat, target);
    expect(await engine.getActiveWizardId(chat.id, user.id)).toBeUndefined();
  });

  it('returns undefined after completing all steps', async () => {
    const renderer = new SpyRenderer();
    const stateStore = new InMemoryWizardStateStore();
    const engine = new WizardNavigationEngine(renderer, stateStore, async () => {});
    engine.define({ id: 'w1', steps: [{ screen: NameStep }], exitPath: '/' });
    await engine.start('w1', user, chat, target);
    await engine.nextStep('w1', undefined, user, chat, target); // completes wizard
    expect(await engine.getActiveWizardId(chat.id, user.id)).toBeUndefined();
  });

  it('tracks different users independently', async () => {
    const engine = new WizardNavigationEngine(new SpyRenderer(), new InMemoryWizardStateStore(), async () => {});
    engine.define({ id: 'w1', steps: [{ screen: NameStep }], exitPath: '/' });
    const user2: TelegramUser = { id: 2, firstName: 'Bob', isBot: false };

    await engine.start('w1', user, chat, target);
    expect(await engine.getActiveWizardId(chat.id, user.id)).toBe('w1');
    expect(await engine.getActiveWizardId(chat.id, user2.id)).toBeUndefined();
  });
});

// ─── tryHandleText ─────────────────────────────────────────────────────────────

describe('WizardNavigationEngine — tryHandleText()', () => {
  let renderer: SpyRenderer;
  let stateStore: InMemoryWizardStateStore;
  let exitCalls: Array<{ path: string }>;

  beforeEach(() => {
    renderer = new SpyRenderer();
    stateStore = new InMemoryWizardStateStore();
    exitCalls = [];
    capturedTextCtx = undefined;
    onTextReturnView = undefined;
  });

  it('returns false when no active wizard state exists', async () => {
    const engine = new WizardNavigationEngine(renderer, stateStore, async () => {});
    engine.define({ id: 'w1', steps: [{ screen: TextInputStep }], exitPath: '/' });
    const result = await engine.tryHandleText('w1', 'hello', user, chat, target);
    expect(result).toBe(false);
  });

  it('returns false when wizardId is not registered', async () => {
    const engine = new WizardNavigationEngine(renderer, stateStore, async () => {});
    const result = await engine.tryHandleText('nonexistent', 'hello', user, chat, target);
    expect(result).toBe(false);
  });

  it('returns false when current step does not have awaitText', async () => {
    const engine = new WizardNavigationEngine(renderer, stateStore, async (p) => { exitCalls.push({ path: p }); });
    engine.define({ id: 'w1', steps: [{ screen: NoTextStep }], exitPath: '/' });
    await engine.start('w1', user, chat, target);
    const result = await engine.tryHandleText('w1', 'hello', user, chat, target);
    expect(result).toBe(false);
  });

  it('returns true when step has awaitText and onText', async () => {
    const engine = new WizardNavigationEngine(renderer, stateStore, async (p) => { exitCalls.push({ path: p }); });
    engine.define({ id: 'w1', steps: [{ screen: TextInputStep }], exitPath: '/' });
    await engine.start('w1', user, chat, target);
    const result = await engine.tryHandleText('w1', 'hello', user, chat, target);
    expect(result).toBe(true);
  });

  it('passes the submitted text via ctx.text', async () => {
    const engine = new WizardNavigationEngine(renderer, stateStore, async (p) => { exitCalls.push({ path: p }); });
    engine.define({ id: 'w1', steps: [{ screen: TextInputStep }], exitPath: '/' });
    await engine.start('w1', user, chat, target);
    await engine.tryHandleText('w1', 'my text value', user, chat, target);
    expect(capturedTextCtx?.text).toBe('my text value');
  });

  it('re-renders the step when onText returns a ScreenView', async () => {
    onTextReturnView = { text: 'Validation error!' };
    const engine = new WizardNavigationEngine(renderer, stateStore, async (p) => { exitCalls.push({ path: p }); });
    engine.define({ id: 'w1', steps: [{ screen: TextInputStep }], exitPath: '/' });
    await engine.start('w1', user, chat, target);
    const rendersBefore = renderer.renders.length;
    await engine.tryHandleText('w1', 'bad', user, chat, target);
    expect(renderer.renders.length).toBe(rendersBefore + 1);
    expect(renderer.lastView?.text).toBe('Validation error!');
  });

  it('does not re-render when onText returns void', async () => {
    // Default TextInputStep calls nextStep and returns void
    const engine = new WizardNavigationEngine(renderer, stateStore, async (p) => { exitCalls.push({ path: p }); });
    engine.define({ id: 'w1', steps: [{ screen: TextInputStep }, { screen: NameStep }], exitPath: '/' });
    await engine.start('w1', user, chat, target);
    const rendersBefore = renderer.renders.length;
    await engine.tryHandleText('w1', 'valid text', user, chat, target);
    // nextStep was called internally, which renders step 2 — that's 1 render
    // the tryHandleText itself should not add an extra render beyond what nextStep does
    expect(renderer.renders.length).toBe(rendersBefore + 1);
    expect(renderer.lastView?.text).toBe('Enter name'); // step 2 from NameStep
  });

  it('persists new messageId from re-render', async () => {
    onTextReturnView = { text: 'Error!' };
    renderer.nextMessageId = 999;
    const engine = new WizardNavigationEngine(renderer, stateStore, async () => {});
    engine.define({ id: 'w1', steps: [{ screen: TextInputStep }], exitPath: '/' });
    await engine.start('w1', user, chat, target);
    await engine.tryHandleText('w1', 'bad', user, chat, target);
    const state = await stateStore.get(`wizard:${chat.id}:${user.id}:w1`);
    expect(state?.messageId).toBe(999);
  });

  it('WizardTextContext provides wizard context properties alongside text', async () => {
    const engine = new WizardNavigationEngine(renderer, stateStore, async (p) => { exitCalls.push({ path: p }); });
    engine.define({ id: 'w1', steps: [{ screen: TextInputStep }], exitPath: '/' });
    await engine.start('w1', user, chat, target);
    await engine.tryHandleText('w1', 'data', user, chat, target);
    expect(capturedTextCtx?.step).toBe(1);
    expect(capturedTextCtx?.totalSteps).toBe(1);
    expect(capturedTextCtx?.user).toEqual(user);
    expect(capturedTextCtx?.chat).toEqual(chat);
  });
});

describe('InMemoryWizardStateStore', () => {
  it('get returns undefined for missing key', async () => {
    const store = new InMemoryWizardStateStore();
    expect(await store.get('nonexistent')).toBeUndefined();
  });

  it('set and get round-trip', async () => {
    const store = new InMemoryWizardStateStore();
    const state = {
      wizardId: 'w',
      stepIndex: 1,
      totalSteps: 3,
      data: { x: 1 },
      exitPath: '/',
    };
    await store.set('key', state);
    expect(await store.get('key')).toEqual(state);
  });

  it('delete removes the entry', async () => {
    const store = new InMemoryWizardStateStore();
    await store.set('key', { wizardId: 'w', stepIndex: 0, totalSteps: 1, data: {}, exitPath: '/' });
    await store.delete('key');
    expect(await store.get('key')).toBeUndefined();
  });
});

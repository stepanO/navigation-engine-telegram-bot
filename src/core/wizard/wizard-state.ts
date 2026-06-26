/**
 * Wizard state — persisted across interactions so a wizard survives restarts.
 *
 * Stored with key: `wizard:${chatId}:${userId}:${wizardId}`.
 * This namespace is separate from the navigation StateStore to avoid type conflicts.
 */

export interface WizardState {
  readonly wizardId: string;
  /** 0-indexed current step position. */
  readonly stepIndex: number;
  readonly totalSteps: number;
  /** Accumulated data merged from all completed steps so far. */
  readonly data: Record<string, unknown>;
  /** Destination route when the wizard is cancelled or completed. */
  readonly exitPath: string;
  /**
   * Telegram message ID of the current wizard message.
   * Stored so the renderer can edit the same message across interaction events.
   */
  readonly messageId?: number;
}

export interface WizardStateStore {
  get(key: string): Promise<WizardState | undefined>;
  set(key: string, state: WizardState): Promise<void>;
  delete(key: string): Promise<void>;
}

/** Canonical state key for a wizard session. */
export function buildWizardKey(chatId: number, userId: number, wizardId: string): string {
  return `wizard:${chatId}:${userId}:${wizardId}`;
}

/**
 * Builds a WizardState safely, omitting messageId when undefined.
 * Accepts `messageId: number | undefined` explicitly so callers can pass
 * `state.messageId` without violating exactOptionalPropertyTypes.
 */
export function buildWizardState(fields: {
  wizardId: string;
  stepIndex: number;
  totalSteps: number;
  data: Record<string, unknown>;
  exitPath: string;
  messageId: number | undefined;
}): WizardState {
  const base: WizardState = {
    wizardId: fields.wizardId,
    stepIndex: fields.stepIndex,
    totalSteps: fields.totalSteps,
    data: fields.data,
    exitPath: fields.exitPath,
  };
  return fields.messageId !== undefined ? { ...base, messageId: fields.messageId } : base;
}

/** Reference in-memory implementation. Production deployments swap in a Redis adapter. */
export class InMemoryWizardStateStore implements WizardStateStore {
  private readonly map = new Map<string, WizardState>();

  async get(key: string): Promise<WizardState | undefined> {
    return this.map.get(key);
  }

  async set(key: string, state: WizardState): Promise<void> {
    this.map.set(key, state);
  }

  async delete(key: string): Promise<void> {
    this.map.delete(key);
  }
}

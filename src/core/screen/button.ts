/**
 * Button — pure data descriptors for keyboard buttons.
 *
 * Design: Button returns a plain descriptor object (no encoding, no dependencies).
 * KeyboardBuilder holds the CallbackDataEncoder and encodes descriptors at
 * build() time. This keeps Button testable in isolation and the encoder swappable
 * per-builder without a global singleton.
 *
 * @example
 * const keyboard = new KeyboardBuilder()
 *   .row(Button.navigate('Events', '/events'), Button.navigate('Settings', '/settings'))
 *   .row(Button.back())
 *   .build();
 */

/** Descriptor for a button that navigates to a route path. */
export interface NavigateButtonDescriptor {
  readonly kind: 'navigate';
  readonly text: string;
  readonly path: string;
}

/** Descriptor for a button that dispatches an action (Phase 5). */
export interface ActionButtonDescriptor {
  readonly kind: 'action';
  readonly text: string;
  readonly name: string;
  readonly params: readonly string[];
}

/** Descriptor for a button that opens a URL. */
export interface UrlButtonDescriptor {
  readonly kind: 'url';
  readonly text: string;
  readonly url: string;
}

/** Descriptor for a "go back" button. Encodes to nav:__back__. */
export interface BackButtonDescriptor {
  readonly kind: 'back';
  readonly text: string;
}

/** Descriptor for a Telegram Mini App button (web_app field). Not encoded in callback_data. */
export interface WebAppButtonDescriptor {
  readonly kind: 'web_app';
  readonly text: string;
  readonly url: string;
}

/** Descriptor for a Telegram login button (login_url field). Not encoded in callback_data. */
export interface LoginButtonDescriptor {
  readonly kind: 'login';
  readonly text: string;
  readonly url: string;
  readonly forwardText?: string;
  readonly botUsername?: string;
  readonly requestWriteAccess?: boolean;
}

/** Descriptor for a button with raw, pre-encoded callback_data. Not processed by the encoder. */
export interface RawButtonDescriptor {
  readonly kind: 'raw';
  readonly text: string;
  readonly callbackData: string;
}

/** Descriptor for a wizard "previous step" button. Triggers prevStep on the active wizard. */
export interface PrevStepButtonDescriptor {
  readonly kind: 'prevStep';
  readonly text: string;
}

/** Descriptor for a wizard cancel button. Clears wizard state and navigates away. */
export interface CancelWizardButtonDescriptor {
  readonly kind: 'cancelWizard';
  readonly text: string;
  /** Navigate to this path after cancel. If absent, goes back in nav history. */
  readonly navigateTo?: string;
}

/** Callback data token for prevStep wizard button. */
export const WIZ_PREV_TOKEN = 'wiz:prev' as const;
/** Callback data token for cancelWizard wizard button (no path override). */
export const WIZ_CANCEL_TOKEN = 'wiz:cancel' as const;
/** Prefix for cancelWizard wizard button with a path: `wiz:cancel:/path`. */
export const WIZ_CANCEL_PREFIX = 'wiz:cancel:' as const;

export type ButtonDescriptor =
  | NavigateButtonDescriptor
  | ActionButtonDescriptor
  | UrlButtonDescriptor
  | BackButtonDescriptor
  | WebAppButtonDescriptor
  | LoginButtonDescriptor
  | RawButtonDescriptor
  | PrevStepButtonDescriptor
  | CancelWizardButtonDescriptor;

const DEFAULT_BACK_LABEL = '← Back';

/**
 * Factory for creating button descriptors.
 * All methods are pure — they return data only, no side effects.
 */
export const Button = {
  /**
   * A button that navigates to the given route path.
   * @example Button.navigate('Participants', '/events/42/participants')
   */
  navigate(text: string, path: string): NavigateButtonDescriptor {
    return { kind: 'navigate', text, path };
  },

  /**
   * A button that dispatches an action (handled in Phase 5).
   * @example Button.action('Delete', 'deleteParticipant', ['42'])
   */
  action(
    text: string,
    name: string,
    params: readonly string[] = [],
  ): ActionButtonDescriptor {
    return { kind: 'action', text, name, params };
  },

  /**
   * A button that opens an external URL.
   * @example Button.url('Open website', 'https://example.com')
   */
  url(text: string, url: string): UrlButtonDescriptor {
    return { kind: 'url', text, url };
  },

  /**
   * A back-navigation button. Encodes to the __back__ history token.
   * @example Button.back()          // "← Back"
   * @example Button.back('← Events') // custom label
   */
  back(text: string = DEFAULT_BACK_LABEL): BackButtonDescriptor {
    return { kind: 'back', text };
  },

  /**
   * A Telegram Mini App button. Opens the given URL as a Mini App inside Telegram.
   * Not encoded in callback_data — passed directly as web_app field.
   * @example Button.webApp('Open App', 'https://mini.app.url')
   */
  webApp(text: string, url: string): WebAppButtonDescriptor {
    return { kind: 'web_app', text, url };
  },

  /**
   * A Telegram login button. Authenticates the user via Telegram Login Widget.
   * Not encoded in callback_data — passed directly as login_url field.
   * @example Button.login('Sign in', 'https://auth.example.com/telegram')
   */
  login(
    text: string,
    url: string,
    options?: { forwardText?: string; botUsername?: string; requestWriteAccess?: boolean },
  ): LoginButtonDescriptor {
    const descriptor: LoginButtonDescriptor = { kind: 'login', text, url };
    if (options?.forwardText !== undefined) {
      return { ...descriptor, forwardText: options.forwardText, ...options };
    }
    return options ? { ...descriptor, ...options } : descriptor;
  },

  /**
   * A button with arbitrary, pre-encoded callback_data.
   * The KeyboardBuilder passes it through as-is, bypassing the encoder.
   * Use for custom integration tokens that the bot handles outside the navigation engine.
   * @example Button.raw('Pick date', 'datepicker:2024-01-01')
   */
  raw(text: string, callbackData: string): RawButtonDescriptor {
    return { kind: 'raw', text, callbackData };
  },

  /**
   * A wizard "go to previous step" button.
   * The navigation engine intercepts this callback and calls prevStep on the active wizard.
   * @example Button.prevStep('← Back')
   */
  prevStep(text: string): PrevStepButtonDescriptor {
    return { kind: 'prevStep', text };
  },

  /**
   * A wizard cancel button.
   * Clears the active wizard state, then navigates to `navigateTo` or calls back() if omitted.
   * @example Button.cancelWizard('✕ Cancel')
   * @example Button.cancelWizard('✕ Cancel', '/events')
   */
  cancelWizard(text: string, navigateTo?: string): CancelWizardButtonDescriptor {
    const base: CancelWizardButtonDescriptor = { kind: 'cancelWizard', text };
    return navigateTo !== undefined ? { ...base, navigateTo } : base;
  },
} as const;

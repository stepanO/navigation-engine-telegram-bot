/**
 * Callback Data Encoder — encodes/decodes Telegram button callback_data.
 *
 * Telegram hard-limits callback_data to 64 bytes (UTF-8).
 *
 * Three token types are defined:
 *
 *   nav:/path?query=value     — navigate to a route
 *   nav:__back__              — go back in history
 *   action:name:p1:p2         — dispatch an action (Phase 5)
 *
 * Trade-offs discussed:
 *
 *   SimpleCallbackEncoder (this file, Phase 2):
 *     Pros:  human-readable, zero server round-trips, debuggable
 *     Cons:  limited to ~60 chars of path+query; deep paths with many params fail
 *
 *   CompactCallbackEncoder (planned, Phase 9):
 *     Stores route ID (2-byte int) + serialized params; the decoder looks up the
 *     route template from a registry. Fits far more data in 64 bytes but requires
 *     stable route IDs across deployments.
 *
 *   ServerStateEncoder (optional, Phase 9):
 *     Stores only a short random key; all navigation state lives server-side
 *     (Redis). Zero byte-budget issues; adds a round-trip on every button press.
 *
 * The CallbackDataEncoder interface lets callers swap strategies without
 * changing keyboard builders or the adapter.
 */

export const NAV_PREFIX = 'nav:' as const;
export const BACK_TOKEN = 'nav:__back__' as const;
export const ACTION_PREFIX = 'action:' as const;

/** Maximum byte length allowed by Telegram. */
export const CALLBACK_DATA_MAX_BYTES = 64;

export type DecodedCallback =
  | { readonly type: 'navigation'; readonly path: string }
  | { readonly type: 'back' }
  | { readonly type: 'action'; readonly name: string; readonly params: readonly string[] }
  | { readonly type: 'unknown' };

/** Thrown when an encoded callback_data string would exceed 64 bytes. */
export class CallbackDataTooLongError extends Error {
  constructor(public readonly encoded: string, public readonly byteLength: number) {
    super(
      `Encoded callback_data is ${byteLength} bytes (max ${CALLBACK_DATA_MAX_BYTES} bytes): "${encoded}". ` +
      `Consider using CompactCallbackEncoder (Phase 9) or shortening the path.`,
    );
    this.name = 'CallbackDataTooLongError';
  }
}

export interface CallbackDataEncoder {
  /** Encode a navigation path into callback_data. */
  encodeNavigation(path: string): string;
  /** Encode the back-navigation token. */
  encodeBack(): string;
  /** Encode an action invocation. Params must not contain ':'. */
  encodeAction(name: string, params?: readonly string[]): string;
  /** Decode any callback_data string produced by this encoder. */
  decode(data: string): DecodedCallback;
}

/**
 * SimpleCallbackEncoder — direct prefix encoding.
 *
 * Validates the byte length on encode and throws CallbackDataTooLongError
 * rather than silently truncating, which would produce corrupt navigation.
 */
export class SimpleCallbackEncoder implements CallbackDataEncoder {
  encodeNavigation(path: string): string {
    return this.validated(`${NAV_PREFIX}${path}`);
  }

  encodeBack(): string {
    return BACK_TOKEN;
  }

  encodeAction(name: string, params: readonly string[] = []): string {
    const all = [name, ...params].join(':');
    return this.validated(`${ACTION_PREFIX}${all}`);
  }

  decode(data: string): DecodedCallback {
    if (data === BACK_TOKEN) {
      return { type: 'back' };
    }

    if (data.startsWith(NAV_PREFIX)) {
      return { type: 'navigation', path: data.slice(NAV_PREFIX.length) };
    }

    if (data.startsWith(ACTION_PREFIX)) {
      const rest = data.slice(ACTION_PREFIX.length);
      const [name = '', ...params] = rest.split(':');
      return { type: 'action', name, params };
    }

    return { type: 'unknown' };
  }

  private validated(encoded: string): string {
    const bytes = Buffer.byteLength(encoded, 'utf8');
    if (bytes > CALLBACK_DATA_MAX_BYTES) {
      throw new CallbackDataTooLongError(encoded, bytes);
    }
    return encoded;
  }
}

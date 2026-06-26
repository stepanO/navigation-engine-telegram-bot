/**
 * ServerStateEncoder — server-side navigation state storage.
 *
 * Stores the full navigation path in a CallbackStore and puts only a short
 * key ('s:{6-char-id}' = 8 bytes) in callback_data. Eliminates 64-byte
 * budget pressure entirely at the cost of one store lookup per button press.
 *
 * Default store: InMemoryCallbackStore (Map-based, cleared on bot restart).
 * For production, inject a Redis- or database-backed CallbackStore.
 *
 * Token format:
 *   navigation: s:{6-char-base36-counter}
 *   back:       b
 *   action:     a:{name}:{p1}:{p2}
 *
 * Note: action params remain inline in callback_data since they are
 * typically short IDs (e.g. 'a:delete:42').
 */

import {
  type CallbackDataEncoder,
  type DecodedCallback,
  CallbackDataTooLongError,
  CALLBACK_DATA_MAX_BYTES,
} from './callback-encoder.js';

const SERVER_NAV_PREFIX = 's:';
const SERVER_BACK = 'b';
const SERVER_ACTION_PREFIX = 'a:';

/** Synchronous key-value store for server-side callback state. */
export interface CallbackStore {
  get(key: string): string | undefined;
  set(key: string, value: string): void;
}

/** Default in-memory implementation. State is lost on bot restart. */
export class InMemoryCallbackStore implements CallbackStore {
  private readonly map = new Map<string, string>();

  get(key: string): string | undefined {
    return this.map.get(key);
  }

  set(key: string, value: string): void {
    this.map.set(key, value);
  }
}

export class ServerStateEncoder implements CallbackDataEncoder {
  private readonly store: CallbackStore;
  private counter = 0;

  constructor(store?: CallbackStore) {
    this.store = store ?? new InMemoryCallbackStore();
  }

  encodeNavigation(path: string): string {
    const key = this.generateKey();
    this.store.set(key, path);
    return `${SERVER_NAV_PREFIX}${key}`;
  }

  encodeBack(): string {
    return SERVER_BACK;
  }

  encodeAction(name: string, params: readonly string[] = []): string {
    return this.validated(`${SERVER_ACTION_PREFIX}${[name, ...params].join(':')}`);
  }

  decode(data: string): DecodedCallback {
    if (data === SERVER_BACK) {
      return { type: 'back' };
    }

    if (data.startsWith(SERVER_NAV_PREFIX)) {
      const key = data.slice(SERVER_NAV_PREFIX.length);
      const path = this.store.get(key);
      if (path === undefined) {
        return { type: 'unknown' };
      }
      return { type: 'navigation', path };
    }

    if (data.startsWith(SERVER_ACTION_PREFIX)) {
      const rest = data.slice(SERVER_ACTION_PREFIX.length);
      const [name = '', ...params] = rest.split(':');
      return { type: 'action', name, params };
    }

    return { type: 'unknown' };
  }

  private generateKey(): string {
    return (this.counter++).toString(36).padStart(6, '0');
  }

  private validated(encoded: string): string {
    const bytes = Buffer.byteLength(encoded, 'utf8');
    if (bytes > CALLBACK_DATA_MAX_BYTES) {
      throw new CallbackDataTooLongError(encoded, bytes);
    }
    return encoded;
  }
}

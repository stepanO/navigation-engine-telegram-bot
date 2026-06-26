/**
 * CompactCallbackEncoder — route-ID-based encoding.
 *
 * Encodes navigation paths as a short route ID plus bare param values,
 * rather than including the full path template in callback_data. This
 * lets paths that fail SimpleCallbackEncoder's 64-byte limit fit comfortably.
 *
 * Usage:
 *   const encoder = new CompactCallbackEncoder();
 *   encoder.registerRoute('/events/:eventId'); // register before encoding
 *   encoder.encodeNavigation('/events/42');    // → 'c:01:42' (8 bytes)
 *
 * Token format:
 *   navigation: c:{id}:{param1}:{param2}:...:{key1}={val1}:{key2}={val2}
 *   back:       b
 *   action:     a:{name}:{p1}:{p2}
 *
 * Constraints:
 *   - Routes MUST be registered in the same order on every deployment
 *     (registration order determines route IDs, which are embedded in
 *     Telegram button callbacks that may outlive a bot restart).
 *   - Param values and query values must not contain ':'.
 *   - Query keys must not contain '='.
 *   - Wildcard routes ('*') are not supported.
 *   - Supports up to 1296 routes (base-36 two-char ID: 00–zz).
 */

import type { CompiledRoute } from '../core/interfaces/route.js';
import type { ScreenComponentConstructor } from '../core/interfaces/screen.js';
import { compileRoute, extractParams, splitPathAndQuery } from '../core/router/route-parser.js';
import {
  type CallbackDataEncoder,
  type DecodedCallback,
  CallbackDataTooLongError,
  CALLBACK_DATA_MAX_BYTES,
} from './callback-encoder.js';

const COMPACT_NAV_PREFIX = 'c:';
const COMPACT_BACK = 'b';
const COMPACT_ACTION_PREFIX = 'a:';

function toRouteId(n: number): string {
  return n.toString(36).padStart(2, '0');
}

function fromRouteId(s: string): number {
  return parseInt(s, 36);
}

export class CompactCallbackEncoder implements CallbackDataEncoder {
  private readonly byPath = new Map<string, { id: number; compiled: CompiledRoute }>();
  private readonly byId = new Map<number, CompiledRoute>();
  private nextId = 0;

  /**
   * Register a route path pattern. Must be called before encoding any
   * navigation to that path.
   *
   * When `stableId` is provided (a two-char base-36 string, e.g. 'a1'), the route
   * is pinned to that fixed numeric ID so that reordering routes across deployments
   * does not shift IDs and invalidate callbacks already sent to users.
   *
   * Without `stableId`, the next available auto-assigned ID is used, skipping any
   * IDs already reserved by explicit stableId values.
   *
   * Fluent — returns `this` for chaining.
   */
  registerRoute(path: string, stableId?: string): this {
    if (this.byPath.has(path)) return this;
    const compiled = compileRoute({
      path,
      component: null as unknown as ScreenComponentConstructor,
    });

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
      while (this.byId.has(this.nextId)) {
        this.nextId++;
      }
      id = this.nextId++;
    }

    this.byPath.set(path, { id, compiled });
    this.byId.set(id, compiled);
    return this;
  }

  encodeNavigation(path: string): string {
    const [pathOnly, queryMap] = splitPathAndQuery(path);

    for (const { id, compiled } of this.byPath.values()) {
      const match = compiled.pattern.exec(pathOnly);
      if (!match) continue;

      const params = extractParams(match, compiled.paramNames);
      const parts: string[] = [toRouteId(id)];

      for (const name of compiled.paramNames) {
        parts.push(params[name] ?? '');
      }
      for (const [key, value] of Object.entries(queryMap)) {
        parts.push(`${key}=${value}`);
      }

      return this.validated(`${COMPACT_NAV_PREFIX}${parts.join(':')}`);
    }

    throw new Error(
      `CompactCallbackEncoder: no registered route matches "${path}". ` +
      `Call registerRoute(path) for every route pattern before encoding.`,
    );
  }

  encodeBack(): string {
    return COMPACT_BACK;
  }

  encodeAction(name: string, params: readonly string[] = []): string {
    return this.validated(`${COMPACT_ACTION_PREFIX}${[name, ...params].join(':')}`);
  }

  decode(data: string): DecodedCallback {
    if (data === COMPACT_BACK) {
      return { type: 'back' };
    }

    if (data.startsWith(COMPACT_NAV_PREFIX)) {
      const rest = data.slice(COMPACT_NAV_PREFIX.length);
      const parts = rest.split(':');
      const routeId = fromRouteId(parts[0] ?? '');
      const compiled = this.byId.get(routeId);

      if (!compiled) {
        return { type: 'unknown' };
      }

      const paramCount = compiled.paramNames.length;
      const paramValues = parts.slice(1, 1 + paramCount);
      const queryParts = parts.slice(1 + paramCount);

      let pathOnly = compiled.definition.path;
      compiled.paramNames.forEach((name, i) => {
        pathOnly = pathOnly.replace(`:${name}`, paramValues[i] ?? '');
      });

      const fullPath = queryParts.length > 0
        ? `${pathOnly}?${queryParts.join('&')}`
        : pathOnly;

      return { type: 'navigation', path: fullPath };
    }

    if (data.startsWith(COMPACT_ACTION_PREFIX)) {
      const rest = data.slice(COMPACT_ACTION_PREFIX.length);
      const [name = '', ...params] = rest.split(':');
      return { type: 'action', name, params };
    }

    return { type: 'unknown' };
  }

  /** Number of registered routes. */
  get size(): number {
    return this.byPath.size;
  }

  private validated(encoded: string): string {
    const bytes = Buffer.byteLength(encoded, 'utf8');
    if (bytes > CALLBACK_DATA_MAX_BYTES) {
      throw new CallbackDataTooLongError(encoded, bytes);
    }
    return encoded;
  }
}

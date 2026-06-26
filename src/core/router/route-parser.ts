/**
 * Route parser — converts path pattern strings into RegExp matchers.
 *
 * Supported syntax:
 *   /events/:eventId          named parameter
 *   /events/:eventId/settings chained named parameters
 *   /files/*                  wildcard (matches any suffix)
 *   /                         root
 *
 * Design: compile once at registration, match many times. The RegExp is
 * anchored (^ … $) so partial matches are impossible.
 */

import type { CompiledRoute, RouteDefinition } from '../interfaces/route.js';

const PARAM_PATTERN = /:([a-zA-Z_][a-zA-Z0-9_]*)/g;
const WILDCARD_PATTERN = /\*/g;
const SLASH_PATTERN = /\//g;

/**
 * Compiles a RouteDefinition into a CompiledRoute ready for matching.
 *
 * @throws {TypeError} if the path is empty or does not start with '/'.
 */
export function compileRoute(definition: RouteDefinition): CompiledRoute {
  const { path } = definition;

  if (!path || path[0] !== '/') {
    throw new TypeError(`Route path must start with '/': "${path}"`);
  }

  const paramNames: string[] = [];

  // Escape forward slashes, then replace :param with a capture group.
  // Replace * with a greedy capture group at the end.
  const regexSource = path
    .replace(SLASH_PATTERN, '\\/')
    .replace(PARAM_PATTERN, (_, name: string) => {
      paramNames.push(name);
      // Param captures everything except the next slash segment.
      return '([^\\/]+)';
    })
    .replace(WILDCARD_PATTERN, '(.+)');

  const pattern = new RegExp(`^${regexSource}\\/?$`);

  return { definition, pattern, paramNames };
}

/**
 * Given a RegExp match result and the ordered list of param names,
 * builds the params map. match[0] is the full match; captures start at [1].
 */
export function extractParams(
  match: RegExpExecArray,
  paramNames: readonly string[],
): Record<string, string> {
  const params: Record<string, string> = {};
  for (let i = 0; i < paramNames.length; i++) {
    const name = paramNames[i];
    const value = match[i + 1];
    if (name !== undefined && value !== undefined) {
      params[name] = value;
    }
  }
  return params;
}

/**
 * Parses the query string portion of a path into a key-value map.
 * Handles percent-encoding via URL / URLSearchParams.
 *
 * @param path - Full path, optionally including query string.
 * @returns [pathOnly, queryParams]
 */
export function splitPathAndQuery(path: string): [string, Record<string, string>] {
  // Use URL constructor with a dummy base so we get proper parsing.
  // This handles edge cases like multiple values for the same key
  // (last one wins), encoded characters, etc.
  const url = new URL(path, 'https://bot');
  const pathOnly = url.pathname;
  const query: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    query[key] = value;
  });
  return [pathOnly, query];
}

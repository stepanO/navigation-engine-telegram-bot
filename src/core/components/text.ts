/**
 * Text UI components — pure functions that return HTML strings.
 *
 * Use with ScreenBuilder.section() or .html():
 *
 *   ScreenBuilder.create()
 *     .section(BreadcrumbsComponent(['Home', 'Events']))
 *     .section(TitleComponent('Summer Gala', 'July 2025'))
 *     .section(InfoBoxComponent('Registration closes Friday'))
 *     .build();
 *
 * Auto-escaping convention:
 *   - Functions that accept plain user text escape it automatically.
 *   - SectionComponent's `body` parameter is raw HTML (caller's responsibility),
 *     matching the same convention as ScreenBuilder.section().
 */

import { bold, italic, code, escapeHtml } from '../screen/html.js';

// ─── Heading ──────────────────────────────────────────────────────────────────

/**
 * Large title, optionally followed by a smaller subtitle on the next line.
 *
 * @example TitleComponent('Summer Gala')
 *          → <b>Summer Gala</b>
 *
 * @example TitleComponent('Summer Gala', 'July 2025')
 *          → <b>Summer Gala</b>\n<i>July 2025</i>
 */
export function TitleComponent(title: string, subtitle?: string): string {
  const parts: string[] = [bold(title)];
  if (subtitle !== undefined) {
    parts.push(italic(subtitle));
  }
  return parts.join('\n');
}

// ─── Labelled section ─────────────────────────────────────────────────────────

/**
 * Labelled content block: bold heading on one line, body below it.
 *
 * `heading` is HTML-escaped automatically.
 * `body` is passed through as raw HTML — the caller is responsible for escaping
 * any user-supplied content inside it (same convention as ScreenBuilder.section()).
 *
 * @example SectionComponent('Participants', participantListHtml)
 */
export function SectionComponent(heading: string, body: string): string {
  return `${bold(heading)}\n${body}`;
}

// ─── Status boxes ─────────────────────────────────────────────────────────────

/**
 * Informational notice prefixed with ℹ️.
 * Text is HTML-escaped.
 *
 * @example InfoBoxComponent('Registration closes on Friday')
 *          → ℹ️ Registration closes on Friday
 */
export function InfoBoxComponent(text: string): string {
  return `ℹ️ ${escapeHtml(text)}`;
}

/**
 * Warning notice prefixed with ⚠️.
 * Text is HTML-escaped.
 *
 * @example WarningBoxComponent('This action cannot be undone')
 *          → ⚠️ This action cannot be undone
 */
export function WarningBoxComponent(text: string): string {
  return `⚠️ ${escapeHtml(text)}`;
}

/**
 * Error notice prefixed with ❌.
 * Text is HTML-escaped.
 *
 * @example ErrorBoxComponent('Payment failed')
 *          → ❌ Payment failed
 */
export function ErrorBoxComponent(text: string): string {
  return `❌ ${escapeHtml(text)}`;
}

// ─── Empty state ──────────────────────────────────────────────────────────────

/**
 * Placeholder shown when a list or section has no items.
 * Message is HTML-escaped and rendered in italic.
 *
 * @example EmptyStateComponent('No participants yet')
 *          → <i>— No participants yet —</i>
 */
export function EmptyStateComponent(message: string): string {
  return italic(`— ${message} —`);
}

// ─── Metric ───────────────────────────────────────────────────────────────────

/**
 * A single metric: bold label, monospace value, optional delta annotation.
 *
 * All parameters are HTML-escaped.
 *
 * @example StatCardComponent('Total Events', 42)
 *          → <b>Total Events:</b> <code>42</code>
 *
 * @example StatCardComponent('Revenue', '$1,200', '+15%')
 *          → <b>Revenue:</b> <code>$1,200</code> +15%
 */
export function StatCardComponent(
  label: string,
  value: string | number,
  delta?: string,
): string {
  const deltaPart = delta !== undefined ? ` ${escapeHtml(delta)}` : '';
  return `${bold(label + ':')} ${code(String(value))}${deltaPart}`;
}

// ─── Inline tag ───────────────────────────────────────────────────────────────

/**
 * Inline `[label]` tag for status indicators or category badges.
 * Label is HTML-escaped.
 *
 * @example TagComponent('Active')     → [Active]
 * @example TagComponent('<New>')      → [&lt;New&gt;]
 */
export function TagComponent(label: string): string {
  return `[${escapeHtml(label)}]`;
}

// ─── Breadcrumbs ──────────────────────────────────────────────────────────────

/**
 * Navigation breadcrumb trail joined with ` › `.
 * Each crumb is HTML-escaped.
 *
 * @example BreadcrumbsComponent(['Home', 'Events', 'Summer Gala'])
 *          → Home › Events › Summer Gala
 */
export function BreadcrumbsComponent(crumbs: readonly string[]): string {
  return crumbs.map(c => escapeHtml(c)).join(' › ');
}

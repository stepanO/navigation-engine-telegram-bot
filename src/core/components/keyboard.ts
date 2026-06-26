/**
 * Keyboard UI components — pure functions that return KeyboardDefinition objects.
 *
 * Each component produces a self-contained keyboard (or keyboard+text for
 * ConfirmDialogComponent) that can be passed to ScreenBuilder.keyboard().
 *
 * Use mergeKeyboards() to combine multiple components into one keyboard:
 *
 *   ScreenBuilder.create()
 *     .title('Participants')
 *     .keyboard(mergeKeyboards(
 *       ActionRowComponent([Button.action('Add', 'addParticipant')]),
 *       PaginationComponent(2, 5, '/participants?page={page}'),
 *     ))
 *     .build();
 *
 * Path template convention for PaginationComponent:
 *   Use `{page}` as the placeholder: '/events?page={page}'
 */

import type { KeyboardDefinition } from '../interfaces/screen.js';
import type { ButtonDescriptor } from '../screen/button.js';
import { Button } from '../screen/button.js';
import { KeyboardBuilder } from '../screen/keyboard-builder.js';
import { bold } from '../screen/html.js';

// ─── Merge helper ─────────────────────────────────────────────────────────────

/**
 * Merge multiple KeyboardDefinition objects into a single keyboard by
 * concatenating their rows in order.
 *
 * @example
 * mergeKeyboards(
 *   PaginationComponent(2, 5, '/items?page={page}'),
 *   ActionRowComponent([Button.back()]),
 * )
 */
export function mergeKeyboards(...definitions: readonly KeyboardDefinition[]): KeyboardDefinition {
  return {
    inline_keyboard: definitions.flatMap(def => [...def.inline_keyboard]),
  };
}

// ─── Pagination ───────────────────────────────────────────────────────────────

/**
 * Prev / current / Next navigation row for paginated lists.
 *
 * - Shows `◀` (prev) only when current > 1.
 * - Shows `▶` (next) only when current < total.
 * - Always shows a `current / total` indicator button (navigates to current page,
 *   effectively a no-op that refreshes the screen).
 * - Path template must contain `{page}` which is replaced with the target page number.
 *
 * @example PaginationComponent(2, 5, '/events?page={page}')
 *   → [◀] [2 / 5] [▶]
 *
 * @example PaginationComponent(1, 5, '/events?page={page}')
 *   → [1 / 5] [▶]
 */
export function PaginationComponent(
  current: number,
  total: number,
  pathTemplate: string,
): KeyboardDefinition {
  const toPath = (page: number): string => pathTemplate.replace('{page}', String(page));

  const row: ButtonDescriptor[] = [];

  if (current > 1) {
    row.push(Button.navigate('◀', toPath(current - 1)));
  }

  row.push(Button.navigate(`${current} / ${total}`, toPath(current)));

  if (current < total) {
    row.push(Button.navigate('▶', toPath(current + 1)));
  }

  return new KeyboardBuilder().row(...row).build();
}

// ─── Confirm dialog ───────────────────────────────────────────────────────────

/** Combined text + keyboard returned by ConfirmDialogComponent. */
export interface ConfirmDialog {
  /** Bold question text — pass to ScreenBuilder.section(). */
  readonly text: string;
  /** Yes / No button row — pass to ScreenBuilder.keyboard(). */
  readonly keyboard: KeyboardDefinition;
}

/**
 * Confirmation dialog: formatted question text + a Yes / No button row.
 *
 * The returned object has both a `text` (bold question) and a `keyboard`
 * so you can place them in a ScreenBuilder independently:
 *
 * @example
 * const dialog = ConfirmDialogComponent(
 *   'Delete this event?',
 *   '/events/42/delete',
 *   '/events/42',
 * );
 * return ScreenBuilder.create()
 *   .title('Confirm')
 *   .section(dialog.text)
 *   .keyboard(dialog.keyboard)
 *   .build();
 */
export function ConfirmDialogComponent(
  question: string,
  confirmPath: string,
  cancelPath: string,
): ConfirmDialog {
  const keyboard = new KeyboardBuilder()
    .row(
      Button.navigate('✓ Yes', confirmPath),
      Button.navigate('✗ No', cancelPath),
    )
    .build();

  return { text: bold(question), keyboard };
}

// ─── Action row ───────────────────────────────────────────────────────────────

/**
 * A single keyboard row containing the provided buttons side-by-side.
 * Useful for a row of action or navigation buttons.
 *
 * @example
 * ActionRowComponent([
 *   Button.action('✏️ Edit', 'editEvent', ['42']),
 *   Button.action('🗑 Delete', 'deleteEvent', ['42']),
 * ])
 */
export function ActionRowComponent(actions: readonly ButtonDescriptor[]): KeyboardDefinition {
  return new KeyboardBuilder().row(...actions).build();
}

// ─── Button group ─────────────────────────────────────────────────────────────

/**
 * Arrange buttons in a grid with `columns` buttons per row.
 * Remaining buttons fill the last row even if shorter.
 *
 * @param buttons   Flat list of buttons to arrange in a grid.
 * @param columns   Buttons per row (default: 2).
 *
 * @example
 * ButtonGroupComponent(
 *   [Button.navigate('A', '/a'), Button.navigate('B', '/b'),
 *    Button.navigate('C', '/c'), Button.navigate('D', '/d')],
 *   2,
 * )
 * // Row 1: [A] [B]
 * // Row 2: [C] [D]
 */
export function ButtonGroupComponent(
  buttons: readonly ButtonDescriptor[],
  columns: number = 2,
): KeyboardDefinition {
  const builder = new KeyboardBuilder();
  for (let i = 0; i < buttons.length; i += columns) {
    builder.row(...buttons.slice(i, i + columns));
  }
  return builder.build();
}


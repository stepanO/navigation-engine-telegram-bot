import {
  mergeKeyboards,
  PaginationComponent,
  ConfirmDialogComponent,
  ActionRowComponent,
  ButtonGroupComponent,
} from '../keyboard.js';
import { Button } from '../../screen/button.js';
import type { KeyboardDefinition } from '../../interfaces/screen.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rows(kb: KeyboardDefinition) {
  return kb.inline_keyboard;
}

function row(kb: KeyboardDefinition, index: number) {
  return rows(kb)[index]!;
}

function btn(kb: KeyboardDefinition, rowIdx: number, colIdx: number) {
  return row(kb, rowIdx)[colIdx]!;
}

// ─── mergeKeyboards ───────────────────────────────────────────────────────────

describe('mergeKeyboards', () => {
  it('concatenates rows from multiple keyboards', () => {
    const a: KeyboardDefinition = { inline_keyboard: [[{ text: 'A', callback_data: 'a' }]] };
    const b: KeyboardDefinition = { inline_keyboard: [[{ text: 'B', callback_data: 'b' }]] };
    const merged = mergeKeyboards(a, b);
    expect(rows(merged)).toHaveLength(2);
    expect(row(merged, 0)[0]!.text).toBe('A');
    expect(row(merged, 1)[0]!.text).toBe('B');
  });

  it('returns empty keyboard when called with no arguments', () => {
    expect(rows(mergeKeyboards())).toHaveLength(0);
  });

  it('handles a single keyboard without modification', () => {
    const kb: KeyboardDefinition = { inline_keyboard: [[{ text: 'X', callback_data: 'x' }]] };
    expect(rows(mergeKeyboards(kb))).toHaveLength(1);
  });

  it('preserves row order across multiple keyboards', () => {
    const a: KeyboardDefinition = {
      inline_keyboard: [
        [{ text: '1', callback_data: '1' }],
        [{ text: '2', callback_data: '2' }],
      ],
    };
    const b: KeyboardDefinition = { inline_keyboard: [[{ text: '3', callback_data: '3' }]] };
    const merged = mergeKeyboards(a, b);
    expect(row(merged, 0)[0]!.text).toBe('1');
    expect(row(merged, 1)[0]!.text).toBe('2');
    expect(row(merged, 2)[0]!.text).toBe('3');
  });
});

// ─── PaginationComponent ──────────────────────────────────────────────────────

describe('PaginationComponent', () => {
  it('shows prev, indicator, and next on a middle page', () => {
    const kb = PaginationComponent(3, 5, '/items?page={page}');
    const buttons = row(kb, 0);
    expect(buttons).toHaveLength(3);
    expect(buttons[0]!.text).toBe('◀');
    expect(buttons[1]!.text).toBe('3 / 5');
    expect(buttons[2]!.text).toBe('▶');
  });

  it('omits prev button on first page', () => {
    const kb = PaginationComponent(1, 5, '/items?page={page}');
    const buttons = row(kb, 0);
    expect(buttons).toHaveLength(2);
    expect(buttons[0]!.text).toBe('1 / 5');
    expect(buttons[1]!.text).toBe('▶');
  });

  it('omits next button on last page', () => {
    const kb = PaginationComponent(5, 5, '/items?page={page}');
    const buttons = row(kb, 0);
    expect(buttons).toHaveLength(2);
    expect(buttons[0]!.text).toBe('◀');
    expect(buttons[1]!.text).toBe('5 / 5');
  });

  it('shows only indicator on single-page result', () => {
    const kb = PaginationComponent(1, 1, '/items?page={page}');
    const buttons = row(kb, 0);
    expect(buttons).toHaveLength(1);
    expect(buttons[0]!.text).toBe('1 / 1');
  });

  it('encodes correct navigation paths', () => {
    const kb = PaginationComponent(2, 4, '/events?page={page}');
    const buttons = row(kb, 0);
    expect(buttons[0]!.callback_data).toContain('/events?page=1');
    expect(buttons[1]!.callback_data).toContain('/events?page=2');
    expect(buttons[2]!.callback_data).toContain('/events?page=3');
  });

  it('replaces {page} in path template', () => {
    const kb = PaginationComponent(2, 3, '/page/{page}/items');
    const buttons = row(kb, 0);
    expect(buttons[0]!.callback_data).toContain('/page/1/items');
  });
});

// ─── ConfirmDialogComponent ───────────────────────────────────────────────────

describe('ConfirmDialogComponent', () => {
  it('returns an object with text and keyboard', () => {
    const dialog = ConfirmDialogComponent('Delete event?', '/events/42/delete', '/events/42');
    expect(typeof dialog.text).toBe('string');
    expect(dialog.keyboard).toBeDefined();
  });

  it('text is the question in bold', () => {
    const dialog = ConfirmDialogComponent('Are you sure?', '/yes', '/no');
    expect(dialog.text).toBe('<b>Are you sure?</b>');
  });

  it('escapes HTML in the question', () => {
    const dialog = ConfirmDialogComponent('Delete <event>?', '/yes', '/no');
    expect(dialog.text).toContain('&lt;event&gt;');
  });

  it('keyboard has a single row with Yes and No buttons', () => {
    const dialog = ConfirmDialogComponent('Sure?', '/yes', '/no');
    const buttons = row(dialog.keyboard, 0);
    expect(buttons).toHaveLength(2);
    expect(buttons[0]!.text).toBe('✓ Yes');
    expect(buttons[1]!.text).toBe('✗ No');
  });

  it('Yes button encodes confirmPath', () => {
    const dialog = ConfirmDialogComponent('Sure?', '/events/42/delete', '/events/42');
    const yesBtn = btn(dialog.keyboard, 0, 0);
    expect(yesBtn.callback_data).toContain('/events/42/delete');
  });

  it('No button encodes cancelPath', () => {
    const dialog = ConfirmDialogComponent('Sure?', '/events/42/delete', '/events/42');
    const noBtn = btn(dialog.keyboard, 0, 1);
    expect(noBtn.callback_data).toContain('/events/42');
  });
});

// ─── ActionRowComponent ───────────────────────────────────────────────────────

describe('ActionRowComponent', () => {
  it('places all buttons in a single row', () => {
    const kb = ActionRowComponent([
      Button.action('Edit', 'edit', ['42']),
      Button.action('Delete', 'delete', ['42']),
    ]);
    expect(rows(kb)).toHaveLength(1);
    expect(row(kb, 0)).toHaveLength(2);
  });

  it('encodes action button callback_data', () => {
    const kb = ActionRowComponent([Button.action('Delete', 'deleteEvent', ['99'])]);
    const button = btn(kb, 0, 0);
    expect(button.text).toBe('Delete');
    expect(button.callback_data).toMatch(/^action:deleteEvent:99$/);
  });

  it('works with navigate and back buttons too', () => {
    const kb = ActionRowComponent([Button.navigate('Go', '/home'), Button.back()]);
    expect(row(kb, 0)).toHaveLength(2);
  });

  it('produces empty keyboard for empty action list', () => {
    const kb = ActionRowComponent([]);
    expect(rows(kb)).toHaveLength(0);
  });
});

// ─── ButtonGroupComponent ─────────────────────────────────────────────────────

describe('ButtonGroupComponent', () => {
  const makeButtons = (n: number) =>
    Array.from({ length: n }, (_, i) => Button.navigate(`B${i}`, `/b${i}`));

  it('splits buttons into rows of the given column count', () => {
    const kb = ButtonGroupComponent(makeButtons(4), 2);
    expect(rows(kb)).toHaveLength(2);
    expect(row(kb, 0)).toHaveLength(2);
    expect(row(kb, 1)).toHaveLength(2);
  });

  it('default column count is 2', () => {
    const kb = ButtonGroupComponent(makeButtons(4));
    expect(rows(kb)).toHaveLength(2);
  });

  it('handles odd number of buttons — last row is shorter', () => {
    const kb = ButtonGroupComponent(makeButtons(3), 2);
    expect(rows(kb)).toHaveLength(2);
    expect(row(kb, 0)).toHaveLength(2);
    expect(row(kb, 1)).toHaveLength(1);
  });

  it('handles single column', () => {
    const kb = ButtonGroupComponent(makeButtons(3), 1);
    expect(rows(kb)).toHaveLength(3);
    rows(kb).forEach(r => expect(r).toHaveLength(1));
  });

  it('produces empty keyboard for empty button list', () => {
    const kb = ButtonGroupComponent([]);
    expect(rows(kb)).toHaveLength(0);
  });

  it('preserves button order across rows', () => {
    const kb = ButtonGroupComponent(makeButtons(4), 2);
    expect(btn(kb, 0, 0).text).toBe('B0');
    expect(btn(kb, 0, 1).text).toBe('B1');
    expect(btn(kb, 1, 0).text).toBe('B2');
    expect(btn(kb, 1, 1).text).toBe('B3');
  });
});

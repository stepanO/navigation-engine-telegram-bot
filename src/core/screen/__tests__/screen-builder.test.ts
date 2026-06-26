import { ScreenBuilder } from '../screen-builder.js';
import { KeyboardBuilder } from '../keyboard-builder.js';
import { Button } from '../button.js';

describe('ScreenBuilder', () => {
  describe('create()', () => {
    it('returns a new ScreenBuilder instance', () => {
      expect(ScreenBuilder.create()).toBeInstanceOf(ScreenBuilder);
    });

    it('each call returns a distinct instance', () => {
      expect(ScreenBuilder.create()).not.toBe(ScreenBuilder.create());
    });
  });

  describe('build()', () => {
    it('throws when no content has been added', () => {
      expect(() => ScreenBuilder.create().build()).toThrow('no content');
    });

    it('includes parseMode HTML by default', () => {
      const view = ScreenBuilder.create().section('text').build();
      expect(view.parseMode).toBe('HTML');
    });

    it('has no keyboard by default', () => {
      const view = ScreenBuilder.create().section('text').build();
      expect(view.keyboard).toBeUndefined();
    });
  });

  // ── title ─────────────────────────────────────────────────────────────────

  describe('title()', () => {
    it('wraps text in <b> tags', () => {
      const view = ScreenBuilder.create().title('My Event').build();
      expect(view.text).toBe('<b>My Event</b>');
    });

    it('HTML-escapes special characters', () => {
      const view = ScreenBuilder.create().title('A & B <C>').build();
      expect(view.text).toBe('<b>A &amp; B &lt;C&gt;</b>');
    });
  });

  // ── subtitle ──────────────────────────────────────────────────────────────

  describe('subtitle()', () => {
    it('wraps text in <i> tags', () => {
      const view = ScreenBuilder.create().subtitle('March 2025').build();
      expect(view.text).toBe('<i>March 2025</i>');
    });

    it('HTML-escapes special characters', () => {
      const view = ScreenBuilder.create().subtitle('A & B').build();
      expect(view.text).toContain('&amp;');
    });
  });

  // ── section ───────────────────────────────────────────────────────────────

  describe('section()', () => {
    it('passes text through unchanged', () => {
      const view = ScreenBuilder.create().section('Hello world').build();
      expect(view.text).toBe('Hello world');
    });

    it('does not escape HTML in section (raw pass-through)', () => {
      const view = ScreenBuilder.create().section('<b>Bold</b>').build();
      expect(view.text).toBe('<b>Bold</b>');
    });
  });

  // ── text / html ───────────────────────────────────────────────────────────

  describe('text()', () => {
    it('is an alias for section()', () => {
      const a = ScreenBuilder.create().section('foo').build().text;
      const b = ScreenBuilder.create().text('foo').build().text;
      expect(a).toBe(b);
    });
  });

  describe('html()', () => {
    it('inserts raw HTML', () => {
      const view = ScreenBuilder.create().html('<tg-spoiler>secret</tg-spoiler>').build();
      expect(view.text).toBe('<tg-spoiler>secret</tg-spoiler>');
    });
  });

  // ── divider / spacer ──────────────────────────────────────────────────────

  describe('divider()', () => {
    it('adds a visible separator line', () => {
      const view = ScreenBuilder.create()
        .section('before')
        .divider()
        .section('after')
        .build();
      expect(view.text).toContain('─');
    });
  });

  describe('spacer()', () => {
    it('adds an empty string part, creating extra vertical space', () => {
      const view = ScreenBuilder.create()
        .section('a')
        .spacer()
        .section('b')
        .build();
      // spacer() inserts an empty string → joined as 'a\n\n\n\nb'
      expect(view.text).toContain('\n\n\n\n');
    });
  });

  // ── rich text helpers ─────────────────────────────────────────────────────

  describe('bold()', () => {
    it('wraps text in <b>', () => {
      const view = ScreenBuilder.create().bold('Important').build();
      expect(view.text).toBe('<b>Important</b>');
    });
  });

  describe('italic()', () => {
    it('wraps text in <i>', () => {
      const view = ScreenBuilder.create().italic('Note').build();
      expect(view.text).toBe('<i>Note</i>');
    });
  });

  describe('code()', () => {
    it('wraps text in <code> and escapes HTML', () => {
      const view = ScreenBuilder.create().code('x < y').build();
      expect(view.text).toBe('<code>x &lt; y</code>');
    });
  });

  describe('pre()', () => {
    it('wraps text in <pre> and escapes HTML', () => {
      const view = ScreenBuilder.create().pre('let x = 1;').build();
      expect(view.text).toBe('<pre>let x = 1;</pre>');
    });

    it('adds language class when provided', () => {
      const view = ScreenBuilder.create().pre('const x = 1', 'typescript').build();
      expect(view.text).toContain('language-typescript');
    });
  });

  describe('link()', () => {
    it('produces an anchor tag', () => {
      const view = ScreenBuilder.create().link('Open', 'https://example.com').build();
      expect(view.text).toBe('<a href="https://example.com">Open</a>');
    });

    it('HTML-escapes the link text', () => {
      const view = ScreenBuilder.create().link('A & B', 'https://x.com').build();
      expect(view.text).toContain('A &amp; B');
    });
  });

  // ── data display ──────────────────────────────────────────────────────────

  describe('badge()', () => {
    it('formats as bold label + value', () => {
      const view = ScreenBuilder.create().badge('Status', 'Active').build();
      expect(view.text).toBe('<b>Status:</b> Active');
    });

    it('accepts numeric values', () => {
      const view = ScreenBuilder.create().badge('Count', 42).build();
      expect(view.text).toBe('<b>Count:</b> 42');
    });

    it('HTML-escapes both label and value', () => {
      const view = ScreenBuilder.create().badge('A & B', '<value>').build();
      expect(view.text).toContain('A &amp; B');
      expect(view.text).toContain('&lt;value&gt;');
    });
  });

  describe('list()', () => {
    it('formats items as bullet points', () => {
      const view = ScreenBuilder.create().list(['Alice', 'Bob', 'Carol']).build();
      expect(view.text).toBe('• Alice\n• Bob\n• Carol');
    });

    it('HTML-escapes item content', () => {
      const view = ScreenBuilder.create().list(['A & B']).build();
      expect(view.text).toContain('A &amp; B');
    });

    it('adds nothing for an empty array', () => {
      const view = ScreenBuilder.create().section('only').list([]).build();
      expect(view.text).toBe('only');
    });
  });

  // ── keyboard ──────────────────────────────────────────────────────────────

  describe('keyboard()', () => {
    it('attaches the keyboard to the ScreenView', () => {
      const kb = new KeyboardBuilder().row(Button.back()).build();
      const view = ScreenBuilder.create().section('text').keyboard(kb).build();
      expect(view.keyboard).toBe(kb);
    });

    it('keyboard is absent when not set', () => {
      const view = ScreenBuilder.create().section('text').build();
      expect(view.keyboard).toBeUndefined();
    });
  });

  // ── parseMode ─────────────────────────────────────────────────────────────

  describe('parseMode()', () => {
    it('overrides the default HTML mode', () => {
      const view = ScreenBuilder.create().section('text').parseMode('MarkdownV2').build();
      expect(view.parseMode).toBe('MarkdownV2');
    });
  });

  // ── section joining ───────────────────────────────────────────────────────

  describe('multi-section joining', () => {
    it('joins sections with \\n\\n', () => {
      const view = ScreenBuilder.create()
        .title('Title')
        .section('Body')
        .build();
      expect(view.text).toBe('<b>Title</b>\n\nBody');
    });

    it('joins three sections correctly', () => {
      const view = ScreenBuilder.create()
        .title('A')
        .section('B')
        .section('C')
        .build();
      expect(view.text).toBe('<b>A</b>\n\nB\n\nC');
    });
  });

  // ── fluent chaining ───────────────────────────────────────────────────────

  describe('chaining', () => {
    it('all methods return this for chaining', () => {
      const builder = ScreenBuilder.create();
      const result = builder
        .title('Title')
        .subtitle('Sub')
        .section('Section')
        .text('Text')
        .html('<b>Raw</b>')
        .divider()
        .spacer()
        .bold('Bold')
        .italic('Italic')
        .code('code')
        .pre('pre')
        .link('link', 'https://x.com')
        .badge('L', 'V')
        .list(['a'])
        .keyboard(new KeyboardBuilder().build())
        .parseMode('HTML');

      expect(result).toBe(builder);
    });
  });

  // ── integration ───────────────────────────────────────────────────────────

  describe('full screen example', () => {
    it('produces the expected ScreenView', () => {
      const kb = new KeyboardBuilder()
        .row(Button.navigate('Participants', '/events/42/participants'))
        .row(Button.back())
        .build();

      const view = ScreenBuilder.create()
        .title('Summer Conference 2025')
        .badge('Status', 'Active')
        .badge('Participants', 120)
        .divider()
        .section('Registration closes on June 30th.')
        .keyboard(kb)
        .build();

      expect(view.text).toContain('<b>Summer Conference 2025</b>');
      expect(view.text).toContain('<b>Status:</b> Active');
      expect(view.text).toContain('─');
      expect(view.keyboard).toBeDefined();
      expect(view.parseMode).toBe('HTML');
    });
  });
});

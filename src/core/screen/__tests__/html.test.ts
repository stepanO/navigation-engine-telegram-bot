import {
  escapeHtml,
  bold,
  italic,
  underline,
  strikethrough,
  code,
  pre,
  link,
  spoiler,
} from '../html.js';

describe('HTML helpers', () => {
  describe('escapeHtml()', () => {
    it('escapes &, <, >', () => {
      expect(escapeHtml('a & b')).toBe('a &amp; b');
      expect(escapeHtml('<tag>')).toBe('&lt;tag&gt;');
      expect(escapeHtml('a<b>&c')).toBe('a&lt;b&gt;&amp;c');
    });

    it('returns unchanged strings with no special chars', () => {
      expect(escapeHtml('hello world')).toBe('hello world');
    });
  });

  describe('bold()', () => {
    it('wraps text in <b> tags and auto-escapes', () => {
      expect(bold('Hello')).toBe('<b>Hello</b>');
      expect(bold('<b>raw</b>')).toBe('<b>&lt;b&gt;raw&lt;/b&gt;</b>');
    });
  });

  describe('italic()', () => {
    it('wraps text in <i> tags and auto-escapes', () => {
      expect(italic('Hello')).toBe('<i>Hello</i>');
      expect(italic('<i>test</i>')).toBe('<i>&lt;i&gt;test&lt;/i&gt;</i>');
    });
  });

  describe('underline()', () => {
    it('wraps text in <u> tags and auto-escapes', () => {
      expect(underline('underlined')).toBe('<u>underlined</u>');
      expect(underline('a & b')).toBe('<u>a &amp; b</u>');
    });
  });

  describe('strikethrough()', () => {
    it('wraps text in <s> tags and auto-escapes', () => {
      expect(strikethrough('deleted')).toBe('<s>deleted</s>');
      expect(strikethrough('<del>')).toBe('<s>&lt;del&gt;</s>');
    });
  });

  describe('code()', () => {
    it('wraps text in <code> tags and auto-escapes', () => {
      expect(code('const x = 1')).toBe('<code>const x = 1</code>');
      expect(code('<script>')).toBe('<code>&lt;script&gt;</code>');
    });
  });

  describe('pre()', () => {
    it('wraps text in <pre> tags without language', () => {
      expect(pre('code block')).toBe('<pre>code block</pre>');
    });

    it('wraps text in <pre><code class="language-X"> with language', () => {
      expect(pre('const x = 1', 'typescript')).toBe(
        '<pre><code class="language-typescript">const x = 1</code></pre>',
      );
    });

    it('auto-escapes the content', () => {
      expect(pre('<>&')).toBe('<pre>&lt;&gt;&amp;</pre>');
    });
  });

  describe('link()', () => {
    it('creates an anchor tag with escaped text and raw URL', () => {
      expect(link('Click <here>', 'https://example.com')).toBe(
        '<a href="https://example.com">Click &lt;here&gt;</a>',
      );
    });
  });

  describe('spoiler()', () => {
    it('wraps rawHtml in <tg-spoiler> tags without escaping', () => {
      expect(spoiler('hidden <b>content</b>')).toBe(
        '<tg-spoiler>hidden <b>content</b></tg-spoiler>',
      );
    });
  });
});

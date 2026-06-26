import {
  TitleComponent,
  SectionComponent,
  InfoBoxComponent,
  WarningBoxComponent,
  ErrorBoxComponent,
  EmptyStateComponent,
  StatCardComponent,
  TagComponent,
  BreadcrumbsComponent,
} from '../text.js';

describe('TitleComponent', () => {
  it('renders title in bold', () => {
    expect(TitleComponent('Summer Gala')).toBe('<b>Summer Gala</b>');
  });

  it('appends subtitle in italic on the next line', () => {
    expect(TitleComponent('Summer Gala', 'July 2025')).toBe(
      '<b>Summer Gala</b>\n<i>July 2025</i>',
    );
  });

  it('escapes HTML special chars in title and subtitle', () => {
    expect(TitleComponent('A & B', '<Draft>')).toBe(
      '<b>A &amp; B</b>\n<i>&lt;Draft&gt;</i>',
    );
  });

  it('omits subtitle line when not provided', () => {
    expect(TitleComponent('Hello')).not.toContain('\n');
  });
});

describe('SectionComponent', () => {
  it('renders heading in bold followed by body', () => {
    expect(SectionComponent('Participants', 'Alice, Bob')).toBe(
      '<b>Participants</b>\nAlice, Bob',
    );
  });

  it('escapes HTML in heading', () => {
    expect(SectionComponent('Q&A', 'some text')).toContain('<b>Q&amp;A</b>');
  });

  it('passes body through as raw HTML (no escaping)', () => {
    const rawHtml = '<b>already bold</b>';
    expect(SectionComponent('Title', rawHtml)).toContain(rawHtml);
  });
});

describe('InfoBoxComponent', () => {
  it('prefixes text with ℹ️', () => {
    expect(InfoBoxComponent('Check your email')).toBe('ℹ️ Check your email');
  });

  it('escapes HTML special chars', () => {
    expect(InfoBoxComponent('A < B & C > D')).toBe('ℹ️ A &lt; B &amp; C &gt; D');
  });
});

describe('WarningBoxComponent', () => {
  it('prefixes text with ⚠️', () => {
    expect(WarningBoxComponent('Low balance')).toBe('⚠️ Low balance');
  });

  it('escapes HTML special chars', () => {
    expect(WarningBoxComponent('<danger>')).toBe('⚠️ &lt;danger&gt;');
  });
});

describe('ErrorBoxComponent', () => {
  it('prefixes text with ❌', () => {
    expect(ErrorBoxComponent('Payment failed')).toBe('❌ Payment failed');
  });

  it('escapes HTML special chars', () => {
    expect(ErrorBoxComponent('Error: 500 <Internal>')).toBe('❌ Error: 500 &lt;Internal&gt;');
  });
});

describe('EmptyStateComponent', () => {
  it('wraps message in italic em-dashes', () => {
    expect(EmptyStateComponent('No participants yet')).toBe(
      '<i>— No participants yet —</i>',
    );
  });

  it('escapes HTML special chars in message', () => {
    const result = EmptyStateComponent('No <events> found');
    expect(result).toContain('&lt;events&gt;');
    expect(result).toMatch(/^<i>.*<\/i>$/);
  });
});

describe('StatCardComponent', () => {
  it('renders label in bold followed by value in code', () => {
    expect(StatCardComponent('Events', 42)).toBe('<b>Events:</b> <code>42</code>');
  });

  it('appends delta when provided', () => {
    expect(StatCardComponent('Revenue', '$1,200', '+15%')).toBe(
      '<b>Revenue:</b> <code>$1,200</code> +15%',
    );
  });

  it('escapes HTML in label, value, and delta', () => {
    const result = StatCardComponent('A&B', '<value>', '<delta>');
    expect(result).toContain('<b>A&amp;B:</b>');
    expect(result).toContain('<code>&lt;value&gt;</code>');
    expect(result).toContain('&lt;delta&gt;');
  });

  it('accepts string value', () => {
    expect(StatCardComponent('Status', 'active')).toBe('<b>Status:</b> <code>active</code>');
  });

  it('omits delta part when not provided', () => {
    const result = StatCardComponent('Count', 5);
    expect(result).not.toMatch(/\+/);
    expect(result).toMatch(/<\/code>$/);
  });
});

describe('TagComponent', () => {
  it('wraps label in square brackets', () => {
    expect(TagComponent('Active')).toBe('[Active]');
  });

  it('escapes HTML special chars in label', () => {
    expect(TagComponent('<New>')).toBe('[&lt;New&gt;]');
  });

  it('handles ampersand', () => {
    expect(TagComponent('Q&A')).toBe('[Q&amp;A]');
  });
});

describe('BreadcrumbsComponent', () => {
  it('joins crumbs with › separator', () => {
    expect(BreadcrumbsComponent(['Home', 'Events', 'Summer Gala'])).toBe(
      'Home › Events › Summer Gala',
    );
  });

  it('escapes HTML special chars in each crumb', () => {
    expect(BreadcrumbsComponent(['Home', 'A & B', '<Events>'])).toBe(
      'Home › A &amp; B › &lt;Events&gt;',
    );
  });

  it('returns empty string for empty array', () => {
    expect(BreadcrumbsComponent([])).toBe('');
  });

  it('returns single crumb without separator', () => {
    expect(BreadcrumbsComponent(['Home'])).toBe('Home');
  });
});

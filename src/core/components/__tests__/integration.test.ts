/**
 * Integration test: compose multiple Phase 6 components into a complete ScreenView
 * using ScreenBuilder.
 */

import { ScreenBuilder } from '../../screen/screen-builder.js';
import {
  TitleComponent,
  SectionComponent,
  InfoBoxComponent,
  WarningBoxComponent,
  EmptyStateComponent,
  StatCardComponent,
  TagComponent,
  BreadcrumbsComponent,
} from '../text.js';
import {
  mergeKeyboards,
  PaginationComponent,
  ConfirmDialogComponent,
  ActionRowComponent,
  ButtonGroupComponent,
} from '../keyboard.js';
import { Button } from '../../screen/button.js';

describe('Phase 6 integration — compose components into a complete screen', () => {
  it('builds an event detail screen from multiple text components', () => {
    const view = ScreenBuilder.create()
      .section(BreadcrumbsComponent(['Home', 'Events', 'Summer Gala']))
      .section(TitleComponent('Summer Gala', 'July 2025'))
      .section(SectionComponent('Status', 'Registration open'))
      .section(StatCardComponent('Participants', 42, '+5 this week'))
      .section(InfoBoxComponent('Event starts at 18:00'))
      .build();

    expect(view.text).toContain('Home › Events › Summer Gala');
    expect(view.text).toContain('<b>Summer Gala</b>');
    expect(view.text).toContain('<i>July 2025</i>');
    expect(view.text).toContain('<b>Status</b>');
    expect(view.text).toContain('<code>42</code>');
    expect(view.text).toContain('+5 this week');
    expect(view.text).toContain('ℹ️ Event starts at 18:00');
    expect(view.parseMode).toBe('HTML');
  });

  it('builds a paginated events list screen', () => {
    const view = ScreenBuilder.create()
      .section(TitleComponent('Events'))
      .list(['Summer Gala', 'Winter Ball', 'Spring Fête'])
      .keyboard(
        mergeKeyboards(
          ActionRowComponent([Button.action('➕ New', 'createEvent')]),
          PaginationComponent(2, 5, '/events?page={page}'),
          ActionRowComponent([Button.back()]),
        ),
      )
      .build();

    expect(view.text).toContain('<b>Events</b>');
    expect(view.text).toContain('• Summer Gala');
    expect(view.keyboard).toBeDefined();

    const rows = view.keyboard!.inline_keyboard;
    expect(rows).toHaveLength(3); // action row + pagination + back row
    // action row has 1 button, pagination has 3 (prev/indicator/next), back has 1
    expect(rows[0]).toHaveLength(1);
    expect(rows[1]).toHaveLength(3);
    expect(rows[2]).toHaveLength(1);
  });

  it('builds a confirm dialog screen', () => {
    const dialog = ConfirmDialogComponent(
      'Delete "Summer Gala"?',
      '/events/42/delete',
      '/events/42',
    );

    const view = ScreenBuilder.create()
      .section(WarningBoxComponent('This action cannot be undone'))
      .section(dialog.text)
      .keyboard(dialog.keyboard)
      .build();

    expect(view.text).toContain('⚠️');
    // escapeHtml escapes &, <, > — quotes are left as-is
    expect(view.text).toContain('<b>Delete "Summer Gala"?</b>');
  });

  it('builds an empty participants screen', () => {
    const view = ScreenBuilder.create()
      .section(TitleComponent('Participants'))
      .section(EmptyStateComponent('No participants yet'))
      .keyboard(ActionRowComponent([Button.back()]))
      .build();

    expect(view.text).toContain('<b>Participants</b>');
    expect(view.text).toContain('<i>— No participants yet —</i>');
    expect(view.keyboard).toBeDefined();
  });

  it('builds a settings screen with a button grid', () => {
    const view = ScreenBuilder.create()
      .section(TitleComponent('Settings'))
      .section(
        [
          TagComponent('Pro'),
          TagComponent('Verified'),
        ].join(' '),
      )
      .keyboard(
        mergeKeyboards(
          ButtonGroupComponent(
            [
              Button.navigate('👤 Profile', '/settings/profile'),
              Button.navigate('🔔 Notifications', '/settings/notifications'),
              Button.navigate('🔒 Privacy', '/settings/privacy'),
              Button.navigate('💳 Billing', '/settings/billing'),
            ],
            2,
          ),
          ActionRowComponent([Button.back()]),
        ),
      )
      .build();

    expect(view.text).toContain('[Pro]');
    expect(view.text).toContain('[Verified]');
    expect(view.keyboard).toBeDefined();

    const rows = view.keyboard!.inline_keyboard;
    expect(rows).toHaveLength(3); // 2 grid rows + back row
    expect(rows[0]).toHaveLength(2);
    expect(rows[1]).toHaveLength(2);
    expect(rows[2]).toHaveLength(1);
  });

  it('HTML-escapes user content in all text components', () => {
    const view = ScreenBuilder.create()
      .section(TitleComponent('Q&A <Session>'))
      .section(InfoBoxComponent('Use <b>bold</b> tags'))
      .section(TagComponent('A & B'))
      .section(BreadcrumbsComponent(['Home', '<Events>']))
      .build();

    expect(view.text).toContain('Q&amp;A &lt;Session&gt;');
    expect(view.text).toContain('ℹ️ Use &lt;b&gt;bold&lt;/b&gt; tags');
    expect(view.text).toContain('[A &amp; B]');
    expect(view.text).toContain('&lt;Events&gt;');
    // No raw < or > from user input (except the HTML wrapper tags from our components)
  });
});

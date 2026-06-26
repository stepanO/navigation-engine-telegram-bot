import { GrammYRenderer } from '../grammy-renderer.js';
import { GrammyError } from 'grammy';
import type { Api } from 'grammy';
import type { RenderTarget } from '../../../core/interfaces/renderer.js';
import type { ScreenView } from '../../../core/interfaces/screen.js';

// ─── Fake API ─────────────────────────────────────────────────────────────────

function makeMockApi(overrides: Partial<{
  editMessageText: jest.Mock;
  sendMessage: jest.Mock;
  answerCallbackQuery: jest.Mock;
}> = {}): Api {
  return {
    editMessageText: overrides.editMessageText ?? jest.fn().mockResolvedValue(true),
    sendMessage: overrides.sendMessage ?? jest.fn().mockResolvedValue({ message_id: 99 }),
    answerCallbackQuery: overrides.answerCallbackQuery ?? jest.fn().mockResolvedValue(true),
  } as unknown as Api;
}

function makeGrammyError(description: string): GrammyError {
  const err = new GrammyError(description, { ok: false, error_code: 400, description }, '', {});
  return err;
}

const simpleView: ScreenView = { text: 'Hello' };

const viewWithKeyboard: ScreenView = {
  text: 'Choose:',
  keyboard: {
    inline_keyboard: [[{ text: 'Events', callback_data: 'nav:/events' }]],
  },
};

const targetWithMessage: RenderTarget = { chatId: 100, userId: 1, messageId: 42, callbackQueryId: 'cq1' };
const targetNoMessage: RenderTarget = { chatId: 100, userId: 1, callbackQueryId: 'cq1' };

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GrammYRenderer', () => {
  describe('render() — edit path', () => {
    it('calls editMessageText when messageId is present', async () => {
      const editMessageText = jest.fn().mockResolvedValue(true);
      const renderer = new GrammYRenderer(makeMockApi({ editMessageText }));

      await renderer.render(simpleView, targetWithMessage);

      expect(editMessageText).toHaveBeenCalledWith(
        100, 42, 'Hello', expect.anything(),
      );
    });

    it('returns empty RenderResult on successful edit', async () => {
      const renderer = new GrammYRenderer(makeMockApi());
      const result = await renderer.render(simpleView, targetWithMessage);
      expect(result).toEqual({});
    });

    it('passes keyboard markup to editMessageText', async () => {
      const editMessageText = jest.fn().mockResolvedValue(true);
      const renderer = new GrammYRenderer(makeMockApi({ editMessageText }));

      await renderer.render(viewWithKeyboard, targetWithMessage);

      const options = editMessageText.mock.calls[0][3];
      expect(options.reply_markup).toBeDefined();
      expect(options.reply_markup.inline_keyboard[0][0].callback_data).toBe('nav:/events');
    });

    it('does not include parse_mode when not set', async () => {
      const editMessageText = jest.fn().mockResolvedValue(true);
      const renderer = new GrammYRenderer(makeMockApi({ editMessageText }));
      await renderer.render(simpleView, targetWithMessage);
      const options = editMessageText.mock.calls[0][3];
      expect(options.parse_mode).toBeUndefined();
    });

    it('passes parse_mode when set', async () => {
      const editMessageText = jest.fn().mockResolvedValue(true);
      const renderer = new GrammYRenderer(makeMockApi({ editMessageText }));
      await renderer.render({ text: '<b>Bold</b>', parseMode: 'HTML' }, targetWithMessage);
      const options = editMessageText.mock.calls[0][3];
      expect(options.parse_mode).toBe('HTML');
    });
  });

  describe('render() — "message is not modified" error', () => {
    it('silently ignores the error and returns empty result', async () => {
      const editMessageText = jest.fn().mockRejectedValue(
        makeGrammyError('Bad Request: message is not modified'),
      );
      const renderer = new GrammYRenderer(makeMockApi({ editMessageText }));

      const result = await renderer.render(simpleView, targetWithMessage);
      expect(result).toEqual({});
    });
  });

  describe('render() — "message to edit not found" error', () => {
    it('falls back to sendMessage and returns new messageId', async () => {
      const editMessageText = jest.fn().mockRejectedValue(
        makeGrammyError('Bad Request: message to edit not found'),
      );
      const sendMessage = jest.fn().mockResolvedValue({ message_id: 55 });
      const renderer = new GrammYRenderer(makeMockApi({ editMessageText, sendMessage }));

      const result = await renderer.render(simpleView, targetWithMessage);

      expect(sendMessage).toHaveBeenCalled();
      expect(result.messageId).toBe(55);
    });
  });

  describe('render() — unexpected error', () => {
    it('rethrows non-recoverable GrammyErrors', async () => {
      const editMessageText = jest.fn().mockRejectedValue(
        makeGrammyError('Forbidden: bot was blocked by the user'),
      );
      const renderer = new GrammYRenderer(makeMockApi({ editMessageText }));
      await expect(renderer.render(simpleView, targetWithMessage)).rejects.toThrow(GrammyError);
    });

    it('rethrows non-GrammyErrors', async () => {
      const editMessageText = jest.fn().mockRejectedValue(new Error('network error'));
      const renderer = new GrammYRenderer(makeMockApi({ editMessageText }));
      await expect(renderer.render(simpleView, targetWithMessage)).rejects.toThrow('network error');
    });
  });

  describe('render() — send path', () => {
    it('calls sendMessage when messageId is absent', async () => {
      const sendMessage = jest.fn().mockResolvedValue({ message_id: 77 });
      const renderer = new GrammYRenderer(makeMockApi({ sendMessage }));

      const result = await renderer.render(simpleView, targetNoMessage);

      expect(sendMessage).toHaveBeenCalledWith(100, 'Hello', expect.anything());
      expect(result.messageId).toBe(77);
    });

    it('returns new messageId in RenderResult', async () => {
      const sendMessage = jest.fn().mockResolvedValue({ message_id: 123 });
      const renderer = new GrammYRenderer(makeMockApi({ sendMessage }));
      const result = await renderer.render(simpleView, targetNoMessage);
      expect(result.messageId).toBe(123);
    });
  });

  describe('render() — keyboard diffing', () => {
    it('skips editMessageText when the view is unchanged', async () => {
      const editMessageText = jest.fn().mockResolvedValue(true);
      const renderer = new GrammYRenderer(makeMockApi({ editMessageText }));

      await renderer.render(simpleView, targetWithMessage);  // first render — calls API
      await renderer.render(simpleView, targetWithMessage);  // same view  — must skip

      expect(editMessageText).toHaveBeenCalledTimes(1);
    });

    it('calls editMessageText when the view text changes', async () => {
      const editMessageText = jest.fn().mockResolvedValue(true);
      const renderer = new GrammYRenderer(makeMockApi({ editMessageText }));

      await renderer.render(simpleView, targetWithMessage);
      await renderer.render({ text: 'Different' }, targetWithMessage);

      expect(editMessageText).toHaveBeenCalledTimes(2);
    });

    it('calls editMessageText when the keyboard changes', async () => {
      const editMessageText = jest.fn().mockResolvedValue(true);
      const renderer = new GrammYRenderer(makeMockApi({ editMessageText }));

      await renderer.render(simpleView, targetWithMessage);
      await renderer.render(viewWithKeyboard, targetWithMessage);

      expect(editMessageText).toHaveBeenCalledTimes(2);
    });

    it('caches per messageId — different messages are independent', async () => {
      const editMessageText = jest.fn().mockResolvedValue(true);
      const renderer = new GrammYRenderer(makeMockApi({ editMessageText }));

      const target1: RenderTarget = { chatId: 100, userId: 1, messageId: 10 };
      const target2: RenderTarget = { chatId: 100, userId: 1, messageId: 20 };

      await renderer.render(simpleView, target1);  // caches for msg 10
      await renderer.render(simpleView, target1);  // skipped
      await renderer.render(simpleView, target2);  // different message — not skipped

      expect(editMessageText).toHaveBeenCalledTimes(2);
    });

    it('caches the view fingerprint after sendNew so next edit is skipped', async () => {
      const editMessageText = jest.fn().mockResolvedValue(true);
      const sendMessage = jest.fn().mockResolvedValue({ message_id: 99 });
      const renderer = new GrammYRenderer(makeMockApi({ editMessageText, sendMessage }));

      // First render: no messageId → sendNew, returns messageId 99
      const result = await renderer.render(simpleView, targetNoMessage);
      expect(result.messageId).toBe(99);
      expect(sendMessage).toHaveBeenCalledTimes(1);

      // Second render: same view, now with the returned messageId
      const target = { ...targetWithMessage, messageId: 99 };
      await renderer.render(simpleView, target);

      expect(editMessageText).not.toHaveBeenCalled();
    });

    it('caches fingerprint after "message is not modified" error', async () => {
      const editMessageText = jest.fn()
        .mockRejectedValueOnce(makeGrammyError('Bad Request: message is not modified'))
        .mockResolvedValue(true);
      const renderer = new GrammYRenderer(makeMockApi({ editMessageText }));

      await renderer.render(simpleView, targetWithMessage); // error → cached
      await renderer.render(simpleView, targetWithMessage); // same view → skipped

      expect(editMessageText).toHaveBeenCalledTimes(1);
    });
  });

  describe('answerCallbackQuery()', () => {
    it('calls answerCallbackQuery when callbackQueryId is present', async () => {
      const answerCallbackQuery = jest.fn().mockResolvedValue(true);
      const renderer = new GrammYRenderer(makeMockApi({ answerCallbackQuery }));

      await renderer.answerCallbackQuery(targetWithMessage, 'Done!');

      expect(answerCallbackQuery).toHaveBeenCalledWith('cq1', { text: 'Done!' });
    });

    it('does not call answerCallbackQuery when callbackQueryId is absent', async () => {
      const answerCallbackQuery = jest.fn();
      const renderer = new GrammYRenderer(makeMockApi({ answerCallbackQuery }));

      await renderer.answerCallbackQuery({ chatId: 100, userId: 1 });

      expect(answerCallbackQuery).not.toHaveBeenCalled();
    });

    it('omits text argument when no text is provided', async () => {
      const answerCallbackQuery = jest.fn().mockResolvedValue(true);
      const renderer = new GrammYRenderer(makeMockApi({ answerCallbackQuery }));

      await renderer.answerCallbackQuery(targetWithMessage);

      expect(answerCallbackQuery).toHaveBeenCalledWith('cq1', undefined);
    });
  });
});

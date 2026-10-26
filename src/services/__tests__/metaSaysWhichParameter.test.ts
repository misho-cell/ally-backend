import { graphErrorLine } from '../whatsappSetup.service';

/** 26 Oct: Meta refused the templates with a bare „Invalid parameter"; its detail names the field. */
describe("Meta's error keeps its detail", () => {
  it('adds the user title, message and subcode', () => {
    expect(
      graphErrorLine(400, {
        message: 'Invalid parameter',
        error_subcode: 2388040,
        error_user_title: 'Language not supported',
        error_user_msg: 'Use a supported language code',
      }),
    ).toBe(
      'WhatsApp 400: Invalid parameter (subcode 2388040) — Language not supported — Use a supported language code',
    );
  });

  it('stays the short line when Meta gives no detail', () => {
    expect(graphErrorLine(500, undefined)).toBe('WhatsApp 500: unknown error');
  });
});

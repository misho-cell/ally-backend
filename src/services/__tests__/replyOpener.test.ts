import { stripProcessOpener } from '../replyOpener';

// A long, multi-paragraph body so only the opener decides the outcome.
const BODY =
  'პირველი აბზაცი პასუხით: რვა დეველოპერი მოიძებნა, წილებით და წყაროებით.\n\n' +
  'მეორე აბზაცი დეტალებით. '.repeat(40);

const spyLog = jest.spyOn(console, 'log').mockImplementation(() => undefined);

afterEach(() => {
  spyLog.mockClear();
  delete process.env.OPENER_STRIP;
});

describe('stripProcessOpener', () => {
  // The four live phrasings the prompt could not unlearn (threads 9104, 9118, 9125, 9123).
  it.each([
    'ახლა სრული სურათი მაქვს.',
    'ახლა სურათი მკვეთრი გახდა.',
    'კარგი, სურათი ახლა სრულია.',
    'ახლა სრული სურათი გამიჩნდა.',
  ])('strips the live failure opener: %s', (opener) => {
    const result = stripProcessOpener(`${opener} ${BODY}`, 42);
    expect(result.startsWith('პირველი აბზაცი')).toBe(true);
    expect(spyLog).toHaveBeenCalledWith(expect.stringContaining('[opener-strip] thread 42'));
  });

  it('strips a question compliment', () => {
    const result = stripProcessOpener(`კარგი კითხვაა! ${BODY}`, 7);
    expect(result.startsWith('პირველი აბზაცი')).toBe(true);
  });

  it('strips "I looked at network + web" narration', () => {
    const result = stripProcessOpener(`ქსელი და ვები ორივე გავიარე. ${BODY}`, 7);
    expect(result.startsWith('პირველი აბზაცი')).toBe(true);
  });

  it('never touches a short reply', () => {
    const short = 'ახლა სრული სურათი მაქვს. აი პასუხი:\nმოკლე პასუხი.';
    expect(stripProcessOpener(short, 7)).toBe(short);
  });

  it('never touches a single-paragraph reply', () => {
    const flat = `ახლა სრული სურათი მაქვს. ${'გრძელი ტექსტი პასუხით. '.repeat(40)}`.trim();
    expect(stripProcessOpener(flat, 7)).toBe(flat);
  });

  it('keeps an opener that carries a number (a finding, not process talk)', () => {
    const withFinding = `სურათი ახლა სრულია: 8 დეველოპერი მოიძებნა. ${BODY}`;
    expect(stripProcessOpener(withFinding, 7)).toBe(withFinding);
  });

  it('keeps an ordinary content-bearing first sentence', () => {
    const content = `ბესო ორთოიძე არის Arci-ის დამფუძნებელი. ${BODY}`;
    expect(stripProcessOpener(content, 7)).toBe(content);
  });

  it('removes at most ONE sentence even when two process sentences open the reply', () => {
    const twoOpeners = `ახლა სრული სურათი მაქვს. ვაჯამებ შედეგებს. ${BODY}`;
    const result = stripProcessOpener(twoOpeners, 7);
    expect(result.startsWith('ვაჯამებ შედეგებს.')).toBe(true);
  });

  it('never strips when the sentence is the whole reply', () => {
    const only = `ახლა სრული სურათი მაქვს და ეს არის ძალიან გრძელი წინადადება ${'ა'.repeat(600)}.\n\n`;
    expect(stripProcessOpener(only, 7)).toBe(only);
  });

  it('is inert when OPENER_STRIP=off', () => {
    process.env.OPENER_STRIP = 'off';
    const reply = `ახლა სრული სურათი მაქვს. ${BODY}`;
    expect(stripProcessOpener(reply, 7)).toBe(reply);
  });
});

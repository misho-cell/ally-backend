import {
  foundThroughBridges,
  foundThroughFirstLinks,
  introductionFromFound,
  KNOWS_LINE_ON,
  knowsLine,
} from '../introTargetSentence';

/**
 * #5149 D (Giorgi's OK, 16 Oct, G-065): after the plan sentence, one sentence
 * saying whom the go-between knows, with the role only when it may be told.
 */
describe('the line saying whom the go-between knows', () => {
  const levan = { name: 'ლევან ჯაფარიძე', phone: '995599000856' };
  const row = (extra: Record<string, unknown>): Record<string, unknown> => ({
    name: 'ზურაბ ქობულაძე',
    ownership: 'second_degree',
    via_contacts: [{ phone: '995599000856' }],
    ...extra,
  });

  it("is on since Misho's yes", () => {
    expect(KNOWS_LINE_ON).toBe(true);
    const intro = introductionFromFound([levan], foundThroughBridges({ results: [row({})] }));
    expect(knowsLine(intro!)).toBe('ლევან ჯაფარიძე ზურაბ ქობულაძეს იცნობს.');
  });

  it('names the role when two members said it', () => {
    const found = foundThroughBridges({
      results: [row({ jobPosition: 'ნოტარიუსი', role_sources: 2 })],
    });
    expect(knowsLine(introductionFromFound([levan], found)!, true)).toBe(
      'ლევან ჯაფარიძე ზურაბ ქობულაძეს იცნობს — ზურაბ ქობულაძე ნოტარიუსია.',
    );
  });

  it('leaves out a role one member wrote, or a label word', () => {
    for (const extra of [
      { jobPosition: 'ნოტარიუსი', role_sources: 1 },
      { jobPosition: 'ნოტარიუსი', role_source: 'label' },
    ]) {
      const found = foundThroughBridges({ results: [row(extra)] });
      expect(knowsLine(introductionFromFound([levan], found)!, true)).toBe(
        'ლევან ჯაფარიძე ზურაბ ქობულაძეს იცნობს.',
      );
    }
  });

  it('is never said of a far chain, whose first link does not know them', () => {
    const far = foundThroughFirstLinks([
      { name: 'ზურაბ ქობულაძე', firstLinkPhone: '995599000856' },
    ]);
    expect(knowsLine(introductionFromFound([levan], far)!, true)).toBeNull();
  });
});

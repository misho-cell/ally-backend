/**
 * Misho, 24 Nov (the app is retired): a long answer was cut at WhatsApp's
 * 4,096 characters and the rest lost. It now goes whole, in several messages,
 * each cut where a paragraph, else a line, else a word ends.
 */
import { textParts } from '../whatsappChannel.service';

describe('a long WhatsApp answer is sent whole', () => {
  it('sends a short one as it is', () => {
    expect(textParts('  short  ')).toEqual(['short']);
    expect(textParts('')).toEqual([]);
  });

  it('cuts at a paragraph, keeping every word', () => {
    const one = 'a'.repeat(30);
    const two = 'b'.repeat(30);
    const parts = textParts(`${one}\n\n${two}`, 40);
    expect(parts).toEqual([one, two]);
  });

  it('falls back to a line, then a word, then the limit', () => {
    expect(textParts(`${'a'.repeat(30)}\n${'b'.repeat(30)}`, 40)).toEqual([
      'a'.repeat(30),
      'b'.repeat(30),
    ]);
    expect(textParts(`${'a'.repeat(30)} ${'b'.repeat(30)}`, 40)).toEqual([
      'a'.repeat(30),
      'b'.repeat(30),
    ]);
    expect(textParts('c'.repeat(90), 40)).toEqual(['c'.repeat(40), 'c'.repeat(40), 'c'.repeat(10)]);
  });

  it('never makes a part longer than WhatsApp takes', () => {
    const answer = Array.from(
      { length: 200 },
      (_, i) => `${i + 1}. ნინო ბერიძე — არქიტექტორი`,
    ).join('\n');
    const parts = textParts(answer);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((p) => p.length <= 4_096)).toBe(true);
    expect(parts.join('\n')).toBe(answer);
  });
});

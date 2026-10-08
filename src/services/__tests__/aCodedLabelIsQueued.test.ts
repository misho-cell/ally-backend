import { readFileSync } from 'fs';
import { join } from 'path';
import { looksCoded } from '../labelParser.service';

const queue = readFileSync(join(__dirname, '..', 'curiosityQueue.service.ts'), 'utf8');
const parser = readFileSync(join(__dirname, '..', 'labelParser.service.ts'), 'utf8');

/**
 * 3271 (MASTER TEST RUN, 2 of 2): „ხხ7 ძვ." never reached the unresolved
 * labels: two words, under the three a label needs. A short label that is
 * plainly not a name is queued as well.
 */
describe('a short label that is plainly not a name', () => {
  it.each(['ხხ7 ძვ.', 'ბ2', 'დირ. ლევანი'])('is coded: %s', (alias) => {
    expect(looksCoded(alias)).toBe(true);
  });

  it.each(['ნინო ბერიძე', 'Nino Beridze', 'ლევანი', 'Dr Who'])('a name is not: %s', (alias) => {
    expect(looksCoded(alias)).toBe(false);
  });
});

describe('where it is used', () => {
  it('the parser queues a coded label however few words it has', () => {
    expect(parser).toContain(
      'wordsOf(row.alias).length >= MIN_QUEUE_WORDS || looksCoded(row.alias)',
    );
  });

  it("the day's question never names a person by a coded label", () => {
    expect(queue).toContain('if (label !== null && looksCoded(label)) continue;');
  });
});

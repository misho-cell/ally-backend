import { readFileSync } from 'fs';
import { join } from 'path';
import { unheardAnswerOf, unheardPartOf } from '../answerAddition';

/**
 * #7195 / #7459 retest (tester 74813): the asker's assistant was woken with the
 * first answer again and called the helper's addition „nothing new", 3/3.
 */
describe('what the asker has not heard yet', () => {
  it('is only the lines after the answer that already reached them', () => {
    expect(unheardPartOf('კი, ვიცნობ ბესოს.\nსამშაბათს თავისუფალია.', 'კი, ვიცნობ ბესოს.')).toBe(
      'სამშაბათს თავისუფალია.',
    );
  });

  it('is both additions when two came before the first was delivered', () => {
    expect(unheardPartOf('A\nB\nC', 'A')).toBe('B\nC');
  });

  it('is the whole answer when nothing reached them yet', () => {
    expect(unheardPartOf('A', null)).toBe('A');
    expect(unheardPartOf('A', '')).toBe('A');
  });

  it('is the whole answer when it no longer starts with what was delivered', () => {
    expect(unheardPartOf('B\nC', 'A')).toBe('B\nC');
    // A prefix of a line is not a delivered line.
    expect(unheardPartOf('AB\nC', 'A')).toBe('AB\nC');
  });

  it('is the whole answer when nothing came after it', () => {
    expect(unheardPartOf('A\n', 'A')).toBe('A\n');
  });
});

describe('the server keeps what was delivered and wakes with the rest', () => {
  const asks = readFileSync(join(__dirname, '..', 'taskAsks.service.ts'), 'utf8');
  const engine = readFileSync(join(__dirname, '..', 'taskEngine.service.ts'), 'utf8');

  it('snapshots the answer only when it had reached the asker', () => {
    expect(asks).toContain(
      'delivered_answer = CASE WHEN wake_delivered_at IS NOT NULL THEN answer ELSE delivered_answer END',
    );
    expect(asks).toContain('ta.delivered_answer');
  });

  it('wakes the asker with the unheard part', () => {
    expect(engine).toContain('answer: unheardAnswerOf(ask),');
    expect(unheardAnswerOf({ answer: 'A\nB', delivered_answer: 'A' })).toBe('B');
    expect(unheardAnswerOf({ answer: null })).toBe('');
  });
});

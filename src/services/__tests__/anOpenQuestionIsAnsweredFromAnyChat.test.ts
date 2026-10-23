/**
 * #991 reopened (tester 74020, 23 Oct; Misho's yes): a helper answered an open
 * question from a new chat and nothing reached the asker. The answer is routed
 * to the open question whose asker he names.
 */
import { askThreadForName } from '../askThreadByName';

const open = [
  { askThreadId: 63856, askerName: 'Lasha Kurashvili' },
  { askThreadId: 64001, askerName: 'ნინო ბერიძე' },
];

describe('which open question an answer from another chat belongs to', () => {
  it('finds the asker by a name in the other script', () => {
    expect(askThreadForName(open, 'ლაშა კურაშვილი')).toBe(63856);
    expect(askThreadForName(open, 'ლაშას')).toBe(63856);
  });

  it('finds the asker by the name as saved', () => {
    expect(askThreadForName(open, 'Nino')).toBe(64001);
  });

  it('gives nothing for a name with no open question', () => {
    expect(askThreadForName(open, 'Giorgi')).toBeNull();
  });

  it('needs a name when more than one question is open', () => {
    expect(askThreadForName(open, '')).toBeNull();
  });

  it('takes the only open question when no name is given', () => {
    expect(askThreadForName([open[0]], '')).toBe(63856);
  });
});

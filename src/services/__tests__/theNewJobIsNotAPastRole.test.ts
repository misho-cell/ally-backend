import { clauseOf, correctTense } from '../factExtraction.service';

/** Seats 182796/182797: „…ბანკიდან წამოვიდა, ახლა …ლოჯისტიკაში მუშაობს" stored the new job as past_role. */
describe('the tense of a job, read from its own clause', () => {
  const line = 'ბახვა „სანიმუშო ბანკიდან“ წამოვიდა, ახლა „საცდელ ლოჯისტიკაში“ მუშაობს.';

  it('keeps the new job present', () => {
    expect(clauseOf('საცდელი ლოჯისტიკა', line)).toContain('ლოჯისტიკაში');
    expect(correctTense('employer', 'საცდელი ლოჯისტიკა', line)).toBe('employer');
  });

  it('makes the job that ended a past role', () => {
    expect(correctTense('employer', 'სანიმუშო ბანკი', line)).toBe('past_role');
  });

  it('reads a value it cannot place by the value alone, not by the whole line', () => {
    expect(correctTense('employer', 'TBC', line)).toBe('employer');
    expect(correctTense('employer', 'ყოფილი TBC', line)).toBe('past_role');
  });

  it('leaves fields that are not a job alone', () => {
    expect(correctTense('city', 'ბათუმი', 'ბათუმიდან წამოვიდა')).toBe('city');
  });
});

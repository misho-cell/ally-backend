jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));
jest.mock('../contactFacts.service', () => ({
  __esModule: true,
  retractOwnFacts: jest.fn(() => Promise.resolve({ retracted: 1 })),
  submitContactFact: jest.fn(() => Promise.resolve({ saved: true })),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import { retractOwnFacts, submitContactFact } from '../contactFacts.service';
import { keepEndedJob } from '../factCorrections.service';
import { correctionIsAJobThatEnded } from '../jobEnded';

/** 3235 (ME-024): „left the bank, now at logistics" deleted the bank instead of keeping it as history. */
describe('a job the owner says ended', () => {
  it.each([
    'ბახვა გამოგონილი „სანიმუშო ბანკიდან" წამოვიდა, ახლა „საცდელ ლოჯისტიკაში" მუშაობს.',
    'ნინო აღარ მუშაობს TBC-ში',
    'Levan left Colliers last month',
    'Гия больше не работает в банке',
  ])('is read in „%s"', (line) => {
    expect(correctionIsAJobThatEnded(line, 'employer')).toBe(true);
    expect(correctionIsAJobThatEnded(line, undefined)).toBe(true);
  });

  it('is not read in a plain correction, or for a field that is not a job', () => {
    expect(correctionIsAJobThatEnded('ნინო ბუღალტერი არ არის, იურისტია', 'occupation')).toBe(false);
    expect(correctionIsAJobThatEnded('ბახვა ბათუმიდან წამოვიდა', 'city')).toBe(false);
  });

  it('keeps the old job as past_role and writes no veto', async () => {
    const outcome = await keepEndedJob('171', '+995599000001', 'სანიმუშო ბანკი', 'employer');
    expect(outcome).toEqual({ corrected: true, retracted: 1, past_role: 'სანიმუშო ბანკი' });
    expect(retractOwnFacts).toHaveBeenCalledWith('171', expect.any(String), {
      fieldType: 'employer',
      valueFragment: 'სანიმუშო ბანკი',
    });
    expect(submitContactFact).toHaveBeenCalledWith(
      '171',
      expect.any(String),
      'past_role',
      'სანიმუშო ბანკი',
      'chat',
      'stated',
    );
    expect(query).not.toHaveBeenCalled();
  });

  it('is what correct_contact_fact does when the owner said the job ended', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    const at = chat.indexOf("case 'correct_contact_fact': {");
    const body = chat.slice(at, at + 1200);
    expect(body).toContain('correctionIsAJobThatEnded(');
    expect(body.indexOf('keepEndedJob(')).toBeLessThan(body.indexOf('correctContactFact('));
  });
});

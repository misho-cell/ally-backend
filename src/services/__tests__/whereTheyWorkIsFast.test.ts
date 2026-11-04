import { readFileSync } from 'fs';
import { join } from 'path';
import { lookupAnswersIt, nameAskedWhereTheyWork, whereTheyWorkSection } from '../whereTheyWork';

const FOUND = {
  found: true,
  results: [
    {
      name: 'ნიკა ბერიძე',
      saved_as: 'ნიკა',
      phone: '+995555000111',
      tags: ['TBC'],
      employer: 'TBC Bank',
      jobPosition: 'analyst',
    },
  ],
};

/** #8524: „სად მუშაობს ნიკა?" took 27–35 s. */
describe('where does X work (#8524)', () => {
  it.each([
    ['სად მუშაობს ნიკა?', 'ნიკა'],
    ['ნიკა ბერიძე სად მუშაობს?', 'ნიკა ბერიძე'],
    ['Where does Nika work?', 'Nika'],
  ])('reads the name out of %s', (line, name) => {
    expect(nameAskedWhereTheyWork(line)).toBe(name);
  });

  it('leaves other questions alone', () => {
    expect(nameAskedWhereTheyWork('ვინ მუშაობს თიბისიში?')).toBeNull();
    expect(
      nameAskedWhereTheyWork('სად მუშაობს ის ადამიანი რომელიც გუშინ გავიცანი ბათუმში?'),
    ).toBeNull();
  });

  it('answers from an exact match with a job, never passing the phone on', () => {
    expect(lookupAnswersIt(FOUND)).toBe(true);
    const section = whereTheyWorkSection('ნიკა', FOUND);
    expect(section).toContain('TBC Bank');
    expect(section).not.toContain('995555000111');
  });

  it('does not answer from approximate matches or empty rows', () => {
    expect(
      lookupAnswersIt({
        found: true,
        results: [{ name: 'ნინო', approximate: true, employer: 'X' }],
      }),
    ).toBe(false);
    expect(lookupAnswersIt({ found: false })).toBe(false);
  });
});

/** #8524 (tester 82699: 11.2 / 60.6 / 14.5 s): where the time went, and the 60 s run. */
describe('#8524: the lookup starts with the run, and its retry stays a short text', () => {
  const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

  it('starts the lookup the moment an owner’s run starts', () => {
    expect(chat).toContain('if (!ownerAbsent) startLookupAhead(runId, userId, userMessage);');
    expect(chat).toContain('await lookupFor(runId, userId, jobName)');
  });

  it('keeps the blank-answer retry to text, short, on a lookup', () => {
    const retry = chat.slice(chat.indexOf('first answer was blank'));
    expect(retry.slice(0, 600)).toContain('...lookupTurn,');
  });
});

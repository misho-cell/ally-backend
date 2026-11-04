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

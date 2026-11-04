import { wayInSample } from '../openingSearch.service';

/** #8648 (the tester's 82639): the way-in check's hits and empties are a line the trace shows. */
describe('the way-in outcome in the trace', () => {
  it('says how many were found', () => {
    expect(wayInSample({ failure: null, tied: 2, passes: 3, unfinished: 0 })).toBe(
      'found 2 (3 passes)',
    );
  });

  it('says none were found, and how many passes timed out', () => {
    expect(wayInSample({ failure: null, tied: 0, passes: 3, unfinished: 1 })).toBe(
      'none found (3 passes, 1 timed out)',
    );
  });

  it('tells a time-out and an error apart from an empty result', () => {
    expect(wayInSample({ failure: null, tied: 0, passes: 2, unfinished: 2 })).toBe(
      'timed out (2 passes)',
    );
    expect(wayInSample({ failure: 'db', tied: 0, passes: 2, unfinished: 0 })).toBe(
      'error (2 passes)',
    );
  });
});

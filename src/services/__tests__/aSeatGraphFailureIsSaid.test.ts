import { mirrorSeatGraph } from '../seatGraph.service';

/** 3104: a graph that could not be written is said (null, logged), never fatal to the seat route. */
describe('the graph write after a seat route', () => {
  it('returns the count when it worked', async () => {
    expect(await mirrorSeatGraph('172101', () => Promise.resolve(3))).toBe(3);
  });

  it('returns null and logs when it did not', async () => {
    const log = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(
      await mirrorSeatGraph('172101', () => Promise.reject(new Error('graph down'))),
    ).toBeNull();
    expect(log).toHaveBeenCalledTimes(1);
    log.mockRestore();
  });
});

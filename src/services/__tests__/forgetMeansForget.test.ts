import { readFileSync } from 'fs';
import { join } from 'path';
import { ownerLineOrdersTheForget } from '../forgetOnTheOwnersWord';

/**
 * #8521 (the tester's 80752 item 7, case 109): „forget this fact" asked
 * „confirm?" and deleted nothing.
 */
describe('the owner’s own order to forget', () => {
  it('is the confirmation, in every language the app speaks', () => {
    expect(ownerLineOrdersTheForget('დაივიწყე ეს ფაქტი სალომეზე, ყავის აპარატებზე')).toBe(true);
    expect(ownerLineOrdersTheForget('წაშალე ეს ჩანაწერი')).toBe(true);
    expect(ownerLineOrdersTheForget('forget that she sells coffee machines')).toBe(true);
    expect(ownerLineOrdersTheForget('забудь это')).toBe(true);
    expect(ownerLineOrdersTheForget('borra ese dato')).toBe(true);
  });

  it('is not a line that says not to, asks, or names nothing to forget', () => {
    expect(ownerLineOrdersTheForget('არ წაშალო ეს')).toBe(false);
    expect(ownerLineOrdersTheForget("don't delete it")).toBe(false);
    expect(ownerLineOrdersTheForget('დაივიწყო?')).toBe(false);
    expect(ownerLineOrdersTheForget('სალომე ყავის აპარატებს ყიდის')).toBe(false);
    expect(ownerLineOrdersTheForget(undefined)).toBe(false);
    expect(ownerLineOrdersTheForget('')).toBe(false);
  });

  it('lets the delete through without a second yes', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    const handler = chat.slice(chat.indexOf("case 'forget_contact_fact': {"));
    expect(handler.slice(0, 400)).toContain('ownerLineOrdersTheForget(runOwnerLine.get(runId))');
    expect(handler.slice(0, 400)).toContain("input['confirmed'] !== true && !ownerOrdered");
  });
});

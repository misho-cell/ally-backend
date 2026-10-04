import { readFileSync } from 'fs';
import { join } from 'path';
import { withoutDanglingLeadIn } from '../replyGuards';

/** The tester's 1133 (V9, 36568): „ნოდარისთვის პასუხად ვგზავნი:" and nothing after it. */
describe('a step that only leads in to words not shown', () => {
  it('is not published', () => {
    expect(withoutDanglingLeadIn('ნოდარისთვის პასუხად ვგზავნი:')).toBe('');
    expect(withoutDanglingLeadIn('Sending this to Nodar:  ')).toBe('');
  });

  it('leaves a step that says something', () => {
    expect(withoutDanglingLeadIn('ნანას ვეძებ კონტაქტებში.')).toBe('ნანას ვეძებ კონტაქტებში.');
  });

  it('is applied at both places a step is saved', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat.split('withoutDanglingLeadIn(').length - 1).toBe(2);
  });
});

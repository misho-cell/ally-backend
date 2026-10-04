import { readFileSync } from 'fs';
import { join } from 'path';
import {
  asksForAnInvite,
  asksWhichRoute,
  INVITE_NOT_ASKED,
  withoutClosingApprovalAsk,
} from '../replyGuards';

/** The tester's 1145 (37808): an invitation nobody asked for, and „which route?" with no button. */
describe('an invitation', () => {
  it('is asked for in the owner’s words, or not', () => {
    expect(asksForAnInvite('თემოს ნეტაიზე მოვიწვევ')).toBe(true);
    expect(asksForAnInvite('ანას მოსაწვევი ტექსტი მომეცი')).toBe(true);
    expect(asksForAnInvite('Invite Ana, please')).toBe(true);
    expect(asksForAnInvite('ჩემი კაფესთვის ლოგო მინდა. გრაფიკული დიზაინერი მჭირდება.')).toBe(false);
  });

  it('is refused in an owner’s run that did not ask or approve; a system run is left alone', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    const handler = chat.slice(chat.indexOf("case 'invite_contact': {"));
    expect(handler.slice(0, 700)).toContain(
      'const ownerLine = runId === undefined ? undefined : runOwnerLine.get(runId);',
    );
    expect(handler.slice(0, 700)).toContain('ownerLine !== undefined &&');
    expect(handler.slice(0, 700)).toContain('!isApproveChoice(ownerLine.trim())');
    expect(handler.slice(0, 700)).toContain('return { invited: false, error: INVITE_NOT_ASKED };');
    expect(INVITE_NOT_ASKED).toContain('prepare it only on their word');
  });
});

describe('a closing „which route?" with no button to answer it', () => {
  it('is recognised', () => {
    expect(asksWhichRoute('რომელი გზა წავიღო?')).toBe(true);
    expect(asksWhichRoute('Which route should I take?')).toBe(true);
    expect(asksWhichRoute('ანა დიზაინერია.')).toBe(false);
  });

  it('goes with the approval question, and the answer before it stays', () => {
    expect(withoutClosingApprovalAsk('ვიპოვე ანა დიზაინერი.\n\nრომელი გზა წავიღო?')).toBe(
      'ვიპოვე ანა დიზაინერი.',
    );
  });
});

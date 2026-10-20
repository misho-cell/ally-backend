import { readFileSync } from 'fs';
import { join } from 'path';
import { linesNotShownBefore, openAskLines } from '../askStatusSection';

/** #6356 (Giorgi, G-095, goal 29308). */
const BESO_SENT = 'ბესო: კითხვა მიუვიდა, პასუხს ველოდები';
const TORNIKE_SENT = 'თორნიკე: კითხვა მიუვიდა, პასუხს ველოდები';
const TORNIKE_SEEN = 'თორნიკე: ნახა, პასუხს ველოდები';

describe('#6356: a waiting line is said once, and again only when it changes', () => {
  it('drops a line this conversation already showed', () => {
    const earlier = [`ლიკა თანახმაა.\n\n${BESO_SENT}\n${TORNIKE_SENT}`];
    expect(linesNotShownBefore([BESO_SENT, TORNIKE_SENT], earlier)).toEqual([]);
  });

  it('keeps the line of a person whose status moved', () => {
    const earlier = [`${BESO_SENT}\n${TORNIKE_SENT}`];
    expect(linesNotShownBefore([BESO_SENT, TORNIKE_SEEN], earlier)).toEqual([TORNIKE_SEEN]);
  });

  it('keeps every line the first time', () => {
    expect(linesNotShownBefore([BESO_SENT, TORNIKE_SENT], ['გეგმა დამტკიცდა.'])).toEqual([
      BESO_SENT,
      TORNIKE_SENT,
    ]);
  });

  it('reads what was shown before it appends', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain(
      'return withAskLines(cleaned, linesNotShownBefore(under, await earlierReplies(threadId)));',
    );
  });

  // #6356 reopened (G-167): Giorgi saved Lika as „… Ally"; the stored reply has no „Ally".
  it('names the person without the old app’s word, so the stored reply matches', () => {
    const now = new Date('2026-10-20T21:50:00Z');
    const asks = [
      {
        to_user_id: 5,
        to_name: 'Lika Osepashvili Ally',
        status: 'sent',
        seen_at: now.toISOString(),
      },
    ];
    const lines = openAskLines(asks as never, [], 'ka', now);
    expect(lines).toEqual(['Lika Osepashvili: ნახა, პასუხს ველოდები']);
    expect(linesNotShownBefore(lines, [`კითხვა გავუგზავნე.\n\n${lines[0]}`])).toEqual([]);
  });
});

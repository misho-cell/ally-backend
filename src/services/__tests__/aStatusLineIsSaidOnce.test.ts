import { readFileSync } from 'fs';
import { join } from 'path';
import { linesNotShownBefore, openAskLines } from '../askStatusSection';
import { georgianScriptName } from '../georgianScriptName';

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
    expect(lines[0]).not.toContain('Ally');
    expect(linesNotShownBefore(lines, [`კითხვა გავუგზავნე.\n\n${lines[0]}`])).toEqual([]);
  });

  // #7231 (audit, 63431): one person, one name — the sent line's Georgian script, not the Latin label.
  it('names the person in Georgian script in a Georgian reply, as the sent line does', () => {
    const now = new Date('2026-10-22T12:15:00Z');
    const asks = [{ to_user_id: 7, to_name: 'Tamuna Kovziridze', status: 'sent', seen_at: null }];
    const [line] = openAskLines(asks as never, [], 'ka', now);
    expect(line).toBe(
      `${georgianScriptName('Tamuna Kovziridze')}: კითხვა მიუვიდა, პასუხს ველოდები`,
    );
    expect(line).not.toMatch(/[A-Za-z]/u);
  });

  it('keeps the saved spelling in an English reply', () => {
    const now = new Date('2026-10-22T12:15:00Z');
    const asks = [
      { to_user_id: 7, to_name: 'Tamuna Kovziridze Ally', status: 'sent', seen_at: null },
    ];
    const [line] = openAskLines(asks as never, [], 'en', now);
    expect(line.startsWith('Tamuna Kovziridze')).toBe(true);
  });
});

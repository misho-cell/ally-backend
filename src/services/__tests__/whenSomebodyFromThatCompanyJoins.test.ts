jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));
jest.mock('../pendingUpdates.service', () => ({
  __esModule: true,
  queueResult: jest.fn().mockResolvedValue({ id: 1 }),
}));

import { readFileSync } from 'fs';
import { join } from 'path';

import { query } from '../../db/postgres/client';
import { queueResult } from '../pendingUpdates.service';
import {
  canonicalPhone,
  goalsThisMemberMightUnblock,
  tellOwnersANewMemberFitsAGoal,
} from '../newMemberForGoal.service';
import { renderPendingMessage } from '../pendingMessages';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockQueue = queueResult as jest.MockedFunction<typeof queueResult>;

/**
 * ROW 262 — D498 option B, and Misho's „as you said" on the same night.
 *
 * A contact opens Netai, and one of the owner's open goals is about the
 * organisation that contact is tagged with.
 *
 * ⚠️ THE NARROWNESS IS THE FEATURE, and it was bought with a measurement.
 * „Any tag in any open goal" gave 1,550 pairs and 19 hits, and READING them
 * showed most were noise — „lisi" is inside „tbilisi". The three that were
 * right shared one shape: the tag was an ORGANISATION the goal named. 40%
 * noise in a message to a real person was not mine to accept.
 *
 * ⚠️ AND THE SHAPE HAD TO BE MEASURED TWICE. Against the goal's TITLE alone it
 * returned zero, and I almost reported the row as unsupported by the data. The
 * organisation is named in the BRIEF — where the goal's own work is written
 * down — not in the sentence somebody typed. What survives today is one goal:
 * a bathroom tiler whose brief reads „close friend at Arci construction … ask
 * about a trusted tiler through Arci's contractor network", and seventeen
 * contacts tagged `arci`.
 */
const rows = (data: unknown[]): { rows: unknown[]; rowCount: number } => ({
  rows: data,
  rowCount: data.length,
});

beforeEach(() => jest.clearAllMocks());

describe('the match is an organisation, whole-word, in the goal’s own text', () => {
  it('asks for the tag as a whole word, not as a substring', async () => {
    mockQuery.mockResolvedValue(rows([]) as never);

    await goalsThisMemberMightUnblock('+995555000000');

    const [sql] = mockQuery.mock.calls[0] as [string];
    // The words are reduced to single-spaced alphanumerics and the tag is
    // looked for WITH ITS SPACES AROUND IT. „lisi" cannot match „tbilisi".
    expect(sql).toContain("LIKE '% ' || tg.tag || ' %'");
    expect(sql).toContain("'[^[:alnum:]]+', ' ', 'g'");
  });

  /** The brief, not just the title — the zero that nearly closed this row. */
  it('reads the brief as well as the title', async () => {
    mockQuery.mockResolvedValue(rows([]) as never);

    await goalsThisMemberMightUnblock('+995555000000');

    const [sql] = mockQuery.mock.calls[0] as [string];
    expect(sql).toContain("COALESCE(t.title, '')");
    expect(sql).toContain("COALESCE(t.brief, '')");
  });

  /** A tag that is not an organisation anybody has recorded is not a match. */
  it('requires the tag to be an organisation in the fact vocabulary', async () => {
    mockQuery.mockResolvedValue(rows([]) as never);

    await goalsThisMemberMightUnblock('+995555000000');

    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('JOIN organisations o ON o.name = tg.tag');
    expect(params[2]).toEqual(['employer', 'industry']);
  });

  it('only looks at goals that are still open', async () => {
    mockQuery.mockResolvedValue(rows([]) as never);

    await goalsThisMemberMightUnblock('+995555000000');

    expect((mockQuery.mock.calls[0] as [string])[0]).toContain("t.status = 'open'");
  });
});

/**
 * ⚠️ NO PATTERN IS EVER BUILT FROM A TAG. This is not caution, it is the same
 * day's scar: a regex assembled from a user's own label took a search down
 * this afternoon with „parentheses not balanced". A tag is text a person
 * typed, and here it is only ever DATA.
 */
describe('a label somebody typed cannot become a pattern', () => {
  const source = readFileSync(join(__dirname, '..', 'newMemberForGoal.service.ts'), 'utf8');

  it('matches with LIKE on padded text, never with a regex over the tag', () => {
    // The tag appears in the SQL only as a bound value and inside a LIKE.
    expect(source).not.toMatch(/~\s*\(\s*'\\\\m'\s*\|\|/);
    expect(source).toContain("LIKE '% ' || tg.tag || ' %'");
  });

  it('refuses a tag that is not letters, digits and spaces', () => {
    expect(source).toContain("TRIM(ut.tag) ~ '^[[:alnum:] ]+$'");
  });

  it('passes the phone as a parameter, not spliced in', () => {
    expect(source).toContain('ut.phone = $1');
    expect(source).not.toMatch(/ut\.phone = '\$\{/);
  });
});

describe('what the owner is shown, and what it does not do', () => {
  const match = {
    task_id: 5678,
    user_id: '501',
    goal: 'I need a good tiler in Tbilisi for a bathroom',
    organisation: 'arci',
    who: 'Tinatin Ratiani',
  };

  it('queues one card per goal and tells nobody anything', async () => {
    mockQuery.mockResolvedValueOnce(rows([match]) as never).mockResolvedValue(rows([]) as never);

    expect(await tellOwnersANewMemberFitsAGoal('+995555000000')).toBe(1);

    const [userId, taskId, kind, payload] = mockQueue.mock.calls[0];
    expect(userId).toBe('501');
    expect(taskId).toBe(5678);
    expect(kind).toBe('new_member_for_goal');
    // ⚠️ The instruction must not authorise writing to the new person. The
    // owner's yes is what does that, and it has not been given yet.
    expect(String((payload as Record<string, unknown>).instruction)).toContain('If they say yes');
    expect(String((payload as Record<string, unknown>).instruction)).toContain(
      'do not write to this person at all',
    );
  });

  /** A second person from the same company must not produce a second card. */
  it('does not raise the same organisation on the same goal twice', async () => {
    mockQuery
      .mockResolvedValueOnce(rows([match]) as never)
      .mockResolvedValueOnce(rows([{ id: 99 }]) as never);

    expect(await tellOwnersANewMemberFitsAGoal('+995555000000')).toBe(0);
    expect(mockQueue).not.toHaveBeenCalled();
  });

  /**
   * The card says WHY it is on the screen. „Nino has joined" is a
   * notification; naming the tag and the goal lets the owner see at a glance
   * whether the match is any good — which on a matched card is the only
   * defence they have.
   */
  it('names the person, the organisation and the goal', () => {
    const card = renderPendingMessage(
      {
        kind: 'new_member_for_goal',
        task_id: 5678,
        payload: { who: 'Tinatin Ratiani', organisation: 'Arci', goal_title: 'a tiler in Tbilisi' },
      },
      'ka',
    );

    expect(card?.text).toContain('Tinatin Ratiani');
    expect(card?.text).toContain('Arci');
    expect(card?.text).toContain('a tiler in Tbilisi');
    // Yes / no / later — and nothing is sent by the card itself.
    expect(card?.choices).toHaveLength(3);
  });

  it('says nothing at all when it cannot say which goal or which organisation', () => {
    expect(
      renderPendingMessage(
        { kind: 'new_member_for_goal', task_id: 1, payload: { who: 'X' } },
        'ka',
      ),
    ).toBeNull();
  });

  /** It is queued from the one place a person becomes reachable. */
  it('runs when somebody registers, and cannot fail the registration', () => {
    const auth = readFileSync(join(__dirname, '..', 'auth.service.ts'), 'utf8');
    const hook = auth.slice(auth.indexOf('void tellOwnersANewMemberFitsAGoal('));

    expect(hook.slice(0, 500)).toContain('.catch(');
    expect(auth).toContain('void tellOwnersANewMemberFitsAGoal(cleanPhone)');
  });
});

/**
 * ⚠️ IT THREW ON EVERY CALL, AND NO TEST HERE COULD SEE IT.
 *
 * The tester's first use of the dry run, 23:24 UTC: four inputs, four 500s.
 * The log said `column u.phone does not exist`. `"User"` has no phone — a
 * phone lives in `"UserPhone"` — and `LEFT JOIN "User" u ON u.phone = $1`
 * typechecks, because SQL is a string, and threw the moment it ran. The live
 * registration hook was broken too, not only the dry run; nobody had
 * registered since, so nothing had said so.
 *
 * Exactly the shape of `updated_at` on `introduction_requests` earlier the
 * same day. Every test in this file mocks `query`, so every one of them passed
 * against a statement the database refuses. A mock cannot check a column name.
 * What a test CAN do is pin the join to the table that actually holds the
 * column, which is what these do.
 */
describe('the columns it reads exist', () => {
  const source = readFileSync(join(__dirname, '..', 'newMemberForGoal.service.ts'), 'utf8');

  it('reads a phone from UserPhone, never from User', () => {
    // SQL comments stripped first: the note above the join QUOTES the broken
    // line to explain it, and a test that reads prose tests the wrong thing.
    const sql = source.replace(/^\s*--.*$/gm, '');

    expect(sql).toContain('LEFT JOIN "UserPhone" up ON up.phone = $1');
    expect(sql).toContain('LEFT JOIN "User" u ON u.id = up."userId"');
    expect(sql).not.toMatch(/\bu\.phone\b/);
  });
});

/**
 * ⚠️ ONE SPELLING OF A NUMBER. `auth.service` says in capitals why: an exact
 * string compare on a phone „created a DUPLICATE user on re-login when the
 * client sent a different format", and the old account silently disappeared
 * for its owner. The tester tried four spellings of the same number.
 */
describe('a number typed four ways is one number', () => {
  it('brings any spelling to the shape the labels are stored in', () => {
    expect(canonicalPhone('+995500000001')).toBe('+995500000001');
    expect(canonicalPhone('995500000001')).toBe('+995500000001');
    expect(canonicalPhone(' 995 500 00-00-01 ')).toBe('+995500000001');
    expect(canonicalPhone('')).toBe('');
    expect(canonicalPhone('   ')).toBe('');
  });

  it('asks the database nothing when there is no number to ask about', async () => {
    mockQuery.mockResolvedValue(rows([]) as never);

    expect(await goalsThisMemberMightUnblock('  ')).toEqual([]);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('matches on the canonical form, not on what was typed', async () => {
    mockQuery.mockResolvedValue(rows([]) as never);

    await goalsThisMemberMightUnblock('995500000001');

    expect((mockQuery.mock.calls[0] as [string, unknown[]])[1][0]).toBe('+995500000001');
  });
});

/**
 * ⚠️ TWO THINGS THE DRY RUN FOUND THE MOMENT IT WAS POINTED AT REAL DATA.
 *
 * Run against goal 5678's actual case, it came back naming TORNIKE — the
 * goal's own owner. Not a join bug: the number tagged `arci` in his phonebook
 * is his own. People keep their own number in their own contacts and tag it
 * with where they work. Without a guard the card reads „Tornike Abuladze has
 * just opened Netai" to Tornike.
 *
 * And the guard itself was wrong on its first writing. `WHERE A OR B AND C`
 * binds as `A OR (B AND C)`, so an unregistered number — the ordinary case for
 * this feature — would have skipped the tag test and matched EVERY open goal
 * the person had. Parentheses are the whole fix and the reason is worth a test
 * of its own, because the flat version reads correctly in English.
 */
describe('it does not tell somebody they have joined', () => {
  const source = readFileSync(join(__dirname, '..', 'newMemberForGoal.service.ts'), 'utf8');
  const sql = source.replace(/^\s*--.*$/gm, '');

  it('skips a phone that belongs to the goal owner', () => {
    expect(sql).toContain('up."userId"::text <> tg.user_id');
  });

  /** The condition is bracketed, so OR cannot swallow the tag match. */
  it('brackets the owner test so it cannot widen the match', () => {
    expect(sql).toContain('WHERE (up."userId" IS NULL OR up."userId"::text <> tg.user_id)');
    expect(sql).toMatch(/\)\s*AND ' ' \|\| REGEXP_REPLACE/);
  });

  /** An unregistered number is the ORDINARY case and must still be matched. */
  it('still matches a number with no account yet', () => {
    expect(sql).toContain('up."userId" IS NULL OR');
  });
});

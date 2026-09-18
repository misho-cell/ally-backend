jest.mock('../../db/postgres/client', () => ({
  poolPressure: () => ({ total: 0, idle: 0, waiting: 0 }),
  __esModule: true,
  query: jest.fn(),
  default: {},
}));
jest.mock('../../config/anthropic', () => ({ __esModule: true, default: {} }));

import { buildRequestThreadSection } from '../chat.service';

/**
 * Ticket 20 row 211 — the middle person pulled back in after her final yes.
 *
 * Lika's thread 17723, 18 September. Title „Salome Parkosadze → ნინია
 * აბრამიშვილი", carrying request 1090, which names both of them and has done
 * since 13:35:49.
 *
 *   13:41:02  she accepts — and the request leaves her prompt, because the one
 *             read that carried it filters on status = 'pending'
 *   13:45:55  „კი. სალომე გააცანი"
 *   13:46:07  „რომელი სალომეს გულისხმობ?" with FOUR buttons
 *   13:47:28  and the direction reversed — she is told she will be introducing
 *             Ninia TO Salome, and has to correct it at 13:48:10
 *
 * She had done her part. She was made to disambiguate a name the system
 * already held, and then to correct the system about who was asking whom.
 *
 * The run was not careless: by 13:45 it genuinely did not know, so searching
 * her contacts for „სალომე" and finding three was the right move for a run
 * that has been told nothing. This section is what tells it.
 */
const ACCEPTED = {
  id: 1090,
  requester_name: 'Salome Parkosadze',
  target_name: 'ნინია აბრამიშვილი',
  message: 'სალომეს აქსელის ქსელთან დაკავშირებით რჩევა სჭირდება და გაცნობა სთხოვა',
  status: 'accepted',
  responded_at: '2026-09-18T13:41:02.000Z',
  mediator_response: null,
  direct: false,
};

describe('what a request thread tells the run about itself', () => {
  it('names both people and which way the request runs', () => {
    const text = buildRequestThreadSection(ACCEPTED);
    expect(text).toContain('Salome Parkosadze');
    expect(text).toContain('ნინია აბრამიშვილი');
    // The reversal at 13:47:28 is the one this line exists for.
    expect(text).toContain('არასოდეს შეატრიალო');
  });

  it('says the owner has ALREADY answered, and that nothing more is wanted', () => {
    const text = buildRequestThreadSection(ACCEPTED);
    expect(text).toContain('უკვე დათანხმდა');
    expect(text).toContain('ხელახლა ნუ ჰკითხავ');
    // The date is carried, never „today" — row 208's rule, and this string
    // sits in a prompt that is rebuilt and re-read for days.
    expect(text).toContain('2026-09-18T13:41:02.000Z');
    expect(text).not.toMatch(/დღეს|today/i);
  });

  it('tells a run not to go looking for a name that is written above it', () => {
    const text = buildRequestThreadSection(ACCEPTED);
    expect(text).toContain('ნუ ეძებ');
    expect(text).toMatch(/რომელი/);
  });

  it('hardcodes nobody from the incident it was written for', () => {
    // The first draft of this section said „თუ მფლობელი ახსენებს „სალომეს"" —
    // one real person's name, from one real thread, in every request prompt
    // the product would ever build.
    const other = buildRequestThreadSection({
      ...ACCEPTED,
      requester_name: 'გიორგი',
      target_name: 'ეკა',
      message: null,
    });
    expect(other).not.toContain('სალომე');
    expect(other).not.toContain('ნინია');
    expect(other).toContain('გიორგი');
    expect(other).toContain('ეკა');
  });

  it('still says there is a question to answer while the request is pending', () => {
    const text = buildRequestThreadSection({ ...ACCEPTED, status: 'pending', responded_at: null });
    expect(text).toContain('ჯერ არ უპასუხია');
    expect(text).not.toContain('უკვე დათანხმდა');
  });

  it('says a decline is final, and closes it in the owner’s name', () => {
    const text = buildRequestThreadSection({ ...ACCEPTED, status: 'declined' });
    expect(text).toContain('უარი თქვა');
    expect(text).toContain('მეტი არაფერი კეთდება');
  });

  it('carries the reason the asker wrote, and survives its absence', () => {
    expect(buildRequestThreadSection(ACCEPTED)).toContain('აქსელის');
    const noReason = buildRequestThreadSection({ ...ACCEPTED, message: null });
    expect(noReason).toContain('Salome Parkosadze');
    expect(noReason).not.toContain('მიზეზი');
  });

  it('names the asker honestly when the account has no name on it', () => {
    const anonymous = buildRequestThreadSection({ ...ACCEPTED, requester_name: null });
    expect(anonymous).toContain('Netai-ს მომხმარებელი');
    // And never an empty gap where a person should be.
    expect(anonymous).not.toMatch(/\s{2,}სთხოვს/);
  });

  it('says whether the owner is the go-between or the person being asked', () => {
    expect(buildRequestThreadSection(ACCEPTED)).toContain('შუამავალია');
    expect(buildRequestThreadSection({ ...ACCEPTED, direct: true })).toContain('პირდაპირ');
  });
});

import { readFileSync } from 'fs';
import { join } from 'path';

/** #7591 WAR ROOM MVP steps 1, 2 and 4: the admin routes and what they refuse. */
const route = readFileSync(join(__dirname, '..', 'admin.routes.ts'), 'utf8');
const cut = (from: string, to: string): string =>
  route.slice(route.indexOf(from), route.indexOf(to));

describe('the war-room routes', () => {
  it('lists one person’s conversations', () => {
    const fn = cut("  '/users/:id/threads',", "  '/war-room/cards',");
    expect(fn).toContain("param('id').isInt({ min: 1 })");
    expect(fn).toContain('threadsOfUser(Number(req.params.id))');
  });

  it('builds the cards anew on every read and filters by a known status', () => {
    const fn = cut("  '/war-room/cards',", "  '/war-room/cards/:id',");
    expect(fn).toContain("queryParam('status')");
    expect(fn).toContain('.isIn([...CARD_STATUSES])');
    expect(fn).toContain('await buildWarRoomCards();');
  });

  it('saves an instruction or a status, refuses an empty change, 404s an unknown card', () => {
    const fn = cut("  '/war-room/cards/:id',", "  '/war-room/cards/:id/send',");
    expect(fn).toContain(
      'instruction === undefined && draft === undefined && status === undefined',
    );
    expect(fn).toContain("error: 'No such card, or it was already sent.'");
    expect(fn).toContain('.isLength({ min: 1, max: MAX_CARD_INSTRUCTION_CHARS })');
  });

  it('sends on approval with the right refusals', () => {
    const fn = cut(
      "  '/war-room/cards/:id/send',",
      '/**\n *   GET /admin/users/:id/netai-messages',
    );
    expect(fn).toContain('sendWarRoomCard(Number(req.params.id), by, text)');
    expect(route).toContain('[SendRefusal.AlreadySent]: { code: 409');
    expect(route).toContain('[SendRefusal.NoText]: { code: 400');
  });
});

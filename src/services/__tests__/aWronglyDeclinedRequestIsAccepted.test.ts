import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Misho, 25 Oct (thread 65521): on his word, a request the go-between declined
 * by our mistake becomes the yes it was, through the ordinary accept.
 */
describe('a wrongly declined request accepted for its go-between', () => {
  const service = readFileSync(join(__dirname, '..', 'introduction.service.ts'), 'utf8');
  const body = service.slice(service.indexOf('export async function acceptDeclinedForMediator'));
  const routes = readFileSync(
    join(__dirname, '..', '..', 'api', 'routes', 'admin.routes.ts'),
    'utf8',
  );
  const handler = routes.slice(routes.indexOf("'/introductions/:id/accept-for-mediator'"));

  it('touches only a request its own go-between declined', () => {
    expect(body).toContain(
      "WHERE id = $1 AND status = 'declined' AND responded_by_user_id = mediator_user_id",
    );
  });

  it('goes through the ordinary accept, as that go-between, inside the same window', () => {
    expect(body).toContain(
      "return resolveIntroductionRequest(String(row.mediator_user_id), { requestId }, 'accept', {",
    );
    expect(service).toContain('AND responded_at > NOW() - make_interval(hours => $7::int)');
  });

  it('is a POST behind the admin router that needs confirm', () => {
    expect(routes).toContain("adminRouter.post(\n  '/introductions/:id/accept-for-mediator'");
    expect(handler).toContain("body('confirm').equals('true')");
    expect(handler.indexOf('res.status(400)')).toBeLessThan(handler.indexOf('res.status(200)'));
  });
});

import { readFileSync } from 'fs';
import { join } from 'path';

/** Iro, 26 Oct: the address opened as a page showed the bare 405. */
describe('the connector address opened in a browser', () => {
  const routes = readFileSync(
    join(__dirname, '..', '..', '..', 'api', 'routes', 'mcp.routes.ts'),
    'utf8',
  );

  it('shows how to add the connector to a browser, and keeps the 405 for clients', () => {
    expect(routes).toContain("(req.headers.accept ?? '').includes('text/html')");
    expect(routes).toContain('Add custom connector');
    expect(routes).toContain('https://api.netai.guru/mcp');
    expect(routes).toContain('res.status(405).json(');
    expect(routes).toContain("router.get('/', methodNotAllowed);");
  });
});

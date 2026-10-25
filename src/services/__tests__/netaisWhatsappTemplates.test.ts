import { readFileSync } from 'fs';
import { join } from 'path';
import { NETAI_TEMPLATES, businessAccountId, createNetaiTemplates } from '../whatsappSetup.service';

const fetchMock = jest.fn();

function answer(body: object, ok = true): object {
  return { ok, status: ok ? 200 : 400, json: async () => body };
}

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
  process.env.WHATSAPP_TOKEN = 'token';
  delete process.env.WHATSAPP_WABA_ID;
});

/** Misho, 25 Oct: „შენით დაამატე ტექსტი … და ჩართე". */
describe("Netai's WhatsApp templates", () => {
  it('never start or end a body with a parameter, and give an example for each', () => {
    for (const t of NETAI_TEMPLATES) {
      expect(t.body.trim().startsWith('{{')).toBe(false);
      expect(t.body.trim().endsWith('}}')).toBe(false);
      expect((t.body.match(/\{\{\d\}\}/gu) ?? []).length).toBe(t.example.length);
    }
  });

  it('finds the business account the token manages', async () => {
    fetchMock.mockResolvedValueOnce(
      answer({
        data: {
          granular_scopes: [
            { scope: 'whatsapp_business_messaging', target_ids: ['1'] },
            { scope: 'whatsapp_business_management', target_ids: ['77'] },
          ],
        },
      }),
    );
    await expect(businessAccountId()).resolves.toBe('77');
  });

  it('submits only the templates Meta does not have yet', async () => {
    process.env.WHATSAPP_WABA_ID = '77';
    fetchMock
      .mockResolvedValueOnce(answer({ data: [{ name: 'netai_notify', status: 'APPROVED' }] }))
      .mockResolvedValueOnce(answer({ id: 't2' }))
      .mockResolvedValueOnce(
        answer({
          data: [
            { name: 'netai_notify', status: 'APPROVED' },
            { name: 'netai_welcome', status: 'PENDING' },
          ],
        }),
      );
    const state = await createNetaiTemplates();
    const posted = fetchMock.mock.calls.filter((c) => c[1]?.method === 'POST');
    expect(posted).toHaveLength(1);
    expect(JSON.parse(String(posted[0][1].body)).name).toBe('netai_welcome');
    expect(state.templates.map((t) => t.status)).toEqual(['APPROVED', 'PENDING']);
  });

  it('are behind the admin login, the switch an admin flag', () => {
    const routes = readFileSync(
      join(__dirname, '..', '..', 'api', 'routes', 'admin.routes.ts'),
      'utf8',
    );
    expect(routes).toContain("adminRouter.get('/whatsapp'");
    expect(routes).toContain("'/whatsapp/templates',\n  body('confirm').equals('true'),");
    expect(routes).toContain('  WHATSAPP_CHANNEL_FLAG,\n] as const;');
  });
});

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
  process.env.WHATSAPP_PHONE_ID = 'phone-1';
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
    fetchMock.mockResolvedValueOnce(answer({ data: [{ id: 'phone-1' }] }));
    await expect(businessAccountId()).resolves.toBe('77');
  });

  it('finds it through the business when the token names no account (live, 25 Oct)', async () => {
    process.env.WHATSAPP_PHONE_ID = 'phone-1';
    fetchMock
      .mockResolvedValueOnce(
        answer({
          data: {
            granular_scopes: [
              { scope: 'business_management', target_ids: ['900'] },
              { scope: 'whatsapp_business_management' },
            ],
          },
        }),
      )
      .mockResolvedValueOnce(answer({ data: [{ id: '70' }, { id: '71' }] }))
      .mockResolvedValueOnce(answer({ data: [] }))
      .mockResolvedValueOnce(answer({ data: [{ id: 'phone-9' }] }))
      .mockResolvedValueOnce(answer({ data: [{ id: 'phone-1' }] }));
    await expect(businessAccountId()).resolves.toBe('71');
    expect(String(fetchMock.mock.calls[1][0])).toContain('/900/owned_whatsapp_business_accounts');
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
    expect(routes).toMatch(/ {2}WHATSAPP_CHANNEL_FLAG,\n[^\]]*\] as const;/u);
  });
});

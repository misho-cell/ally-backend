jest.mock('../../middleware/auth.middleware', () => ({
  __esModule: true,
  authenticateJwt: (req: { user?: unknown }, _res: unknown, next: () => void): void => {
    req.user = { userId: '171' };
    next();
  },
  requireUserRole: (_req: unknown, _res: unknown, next: () => void): void => next(),
}));
jest.mock('../../middleware/rateLimit.middleware', () => ({
  __esModule: true,
  rateLimit:
    () =>
    (_req: unknown, _res: unknown, next: () => void): void =>
      next(),
}));
jest.mock('../../middleware/subscription.middleware', () => ({
  __esModule: true,
  requireSubscription: (_req: unknown, _res: unknown, next: () => void): void => next(),
}));
jest.mock('../../middleware/deviceFingerprint.middleware', () => ({
  __esModule: true,
  captureDeviceFingerprint: (_req: unknown, _res: unknown, next: () => void): void => next(),
}));
jest.mock('../../../db/neo4j/client', () => ({ __esModule: true, getSession: jest.fn() }));
jest.mock('../../../db/postgres/client', () => ({
  __esModule: true,
  default: {},
  query: jest.fn(),
}));
jest.mock('../../../services/contacts.service', () => ({
  __esModule: true,
  importContacts: jest.fn(),
  parseVcf: jest.fn(),
}));
jest.mock('../../../services/contactImportState.service', () => ({
  __esModule: true,
  contactImportState: jest.fn(),
  setContactImportReminder: jest.fn(),
}));

import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import contactsRouter from '../contacts.routes';
import {
  contactImportState,
  setContactImportReminder,
} from '../../../services/contactImportState.service';

const mockState = contactImportState as jest.MockedFunction<typeof contactImportState>;
const mockSet = setContactImportReminder as jest.MockedFunction<typeof setContactImportReminder>;

const STATE = {
  last_import_at: '2026-10-01T09:00:00Z',
  last_import_count: 412,
  count: 420,
  monthly_reminder: false,
};

let server: Server;
let base: string;

beforeAll((done) => {
  const app = express();
  app.use(express.json());
  app.use('/contacts', contactsRouter);
  server = app.listen(0, () => {
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/contacts/import-state`;
    done();
  });
});
afterAll((done) => {
  server.close(() => done());
});
beforeEach(() => jest.clearAllMocks());

/** The frontend's 06:30Z item 7: the contact sync page. */
describe('GET /contacts/import-state', () => {
  it('answers the signed-in person’s import state', async () => {
    mockState.mockResolvedValue(STATE);
    const res = await fetch(base);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { data: unknown }).data).toEqual(STATE);
    expect(mockState).toHaveBeenCalledWith(171);
  });

  it('says 500 without the database error', async () => {
    mockState.mockRejectedValue(new Error('relation import_attempts is locked'));
    const res = await fetch(base);
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('relation');
  });
});

describe('PUT /contacts/import-state', () => {
  const put = (body: unknown): Promise<Response> =>
    fetch(base, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  it('saves the switch and answers the new state', async () => {
    mockState.mockResolvedValue({ ...STATE, monthly_reminder: true });
    const res = await put({ monthly_reminder: true });
    expect(res.status).toBe(200);
    expect(mockSet).toHaveBeenCalledWith(171, true);
    expect(((await res.json()) as { data: typeof STATE }).data.monthly_reminder).toBe(true);
  });

  it.each([{}, { monthly_reminder: 'yes' }, { monthly_reminder: 1 }])(
    'refuses %j with 400 and saves nothing',
    async (body) => {
      expect((await put(body)).status).toBe(400);
      expect(mockSet).not.toHaveBeenCalled();
    },
  );
});

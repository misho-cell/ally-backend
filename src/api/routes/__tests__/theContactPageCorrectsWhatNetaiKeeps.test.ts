jest.mock('../../middleware/auth.middleware', () => ({
  __esModule: true,
  authenticateJwt: (req: { user?: unknown }, _res: unknown, next: () => void): void => {
    req.user = { userId: '171' };
    next();
  },
  requireUserRole: (_req: unknown, _res: unknown, next: () => void): void => next(),
}));
jest.mock('../../middleware/subscription.middleware', () => ({
  __esModule: true,
  requireSubscription: (_req: unknown, _res: unknown, next: () => void): void => next(),
}));
jest.mock('../../middleware/rateLimit.middleware', () => ({
  __esModule: true,
  rateLimit:
    () =>
    (_req: unknown, _res: unknown, next: () => void): void =>
      next(),
}));
jest.mock('../../../services/contactPage.service', () => ({
  __esModule: true,
  contactPageFor: jest.fn(),
  ownContactPhone: jest.fn(),
  ownFacts: jest.fn(),
}));
jest.mock('../../../services/contactEdits.service', () => ({
  ...jest.requireActual('../../../services/contactEdits.service'),
  addOwnFact: jest.fn(),
  correctOwnFact: jest.fn(),
  forgetOwnFact: jest.fn(),
  removeOwnExclusion: jest.fn(),
  removeFromNetwork: jest.fn(),
  markDeceased: jest.fn(),
}));

import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import contactsRouter from '../contacts.routes';
import { ownContactPhone, ownFacts } from '../../../services/contactPage.service';
import {
  addOwnFact,
  correctOwnFact,
  EditOutcome,
  forgetOwnFact,
  markDeceased,
  removeFromNetwork,
  removeOwnExclusion,
} from '../../../services/contactEdits.service';

const mockPhone = ownContactPhone as jest.MockedFunction<typeof ownContactPhone>;
const mockFacts = ownFacts as jest.MockedFunction<typeof ownFacts>;
const mockAdd = addOwnFact as jest.MockedFunction<typeof addOwnFact>;
const mockCorrect = correctOwnFact as jest.MockedFunction<typeof correctOwnFact>;
const mockForget = forgetOwnFact as jest.MockedFunction<typeof forgetOwnFact>;
const mockExclusion = removeOwnExclusion as jest.MockedFunction<typeof removeOwnExclusion>;
const mockRemove = removeFromNetwork as jest.MockedFunction<typeof removeFromNetwork>;
const mockDeceased = markDeceased as jest.MockedFunction<typeof markDeceased>;

const FACTS = [{ id: 7, field: 'note', value: 'plays chess', saved_at: '2026-10-14' }];
const PHONE = '+995500000001';

let server: Server;
let base: string;

beforeAll((done) => {
  const app = express();
  app.use(express.json());
  app.use('/contacts', contactsRouter);
  server = app.listen(0, () => {
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/contacts`;
    done();
  });
});
afterAll((done) => {
  server.close(done);
});
beforeEach(() => {
  jest.resetAllMocks();
  mockPhone.mockResolvedValue(PHONE);
  mockFacts.mockResolvedValue(FACTS);
});

async function call(
  method: string,
  path: string,
  body?: object,
): Promise<{ status: number; json: { success: boolean; data?: unknown } }> {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json()) as { success: boolean; data?: unknown } };
}

/** The frontend's 14 Oct 14:10Z item 1: the contact's page corrects what Netai keeps. */
describe('the contact page’s writes', () => {
  it('lists the person’s own facts with their ids', async () => {
    const res = await call('GET', '/c_ref/facts');
    expect(res.status).toBe(200);
    expect(res.json.data).toEqual({ facts: FACTS });
  });

  it('adds a typed fact and answers 201 with the facts', async () => {
    const res = await call('POST', '/c_ref/facts', { text: ' plays chess ' });
    expect(res.status).toBe(201);
    expect(mockAdd).toHaveBeenCalledWith(171, PHONE, 'plays chess');
  });

  it('refuses an empty or overlong text with 400 and writes nothing', async () => {
    expect((await call('POST', '/c_ref/facts', { text: '' })).status).toBe(400);
    expect((await call('POST', '/c_ref/facts', { text: 'x'.repeat(501) })).status).toBe(400);
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it('corrects and forgets by id, and says 404 for a fact that is not theirs', async () => {
    mockCorrect.mockResolvedValueOnce(EditOutcome.Done);
    expect((await call('PATCH', '/c_ref/facts/7', { text: 'plays go' })).status).toBe(200);
    expect(mockCorrect).toHaveBeenCalledWith(171, PHONE, 7, 'plays go');

    mockForget.mockResolvedValueOnce(EditOutcome.NotFound);
    expect((await call('DELETE', '/c_ref/facts/8')).status).toBe(404);
  });

  it('takes an exclusion back by its id', async () => {
    mockExclusion.mockResolvedValueOnce(EditOutcome.Done);
    expect((await call('DELETE', '/c_ref/exclusions/3')).status).toBe(200);
    expect(mockExclusion).toHaveBeenCalledWith(171, PHONE, 3);
  });

  it('removes from the network and marks as passed away', async () => {
    mockRemove.mockResolvedValueOnce(true);
    mockDeceased.mockResolvedValueOnce(true);
    expect((await call('POST', '/c_ref/remove')).status).toBe(200);
    expect((await call('POST', '/c_ref/deceased')).status).toBe(200);
  });

  it('is 404 for a contact that is not the person’s own, and writes nothing', async () => {
    mockPhone.mockResolvedValue(null);
    expect((await call('POST', '/c_other/facts', { text: 'x' })).status).toBe(404);
    expect((await call('POST', '/c_other/remove')).status).toBe(404);
    expect(mockAdd).not.toHaveBeenCalled();
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it('is 400 for an id that is not a number', async () => {
    expect((await call('DELETE', '/c_ref/facts/abc')).status).toBe(400);
  });
});

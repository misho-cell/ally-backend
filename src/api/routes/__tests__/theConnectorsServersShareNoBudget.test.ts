jest.mock('../../../db/postgres/client', () => ({
  __esModule: true,
  query: jest.fn(),
  backgroundQuery: jest.fn(),
  default: { end: jest.fn() },
}));
jest.mock('../../../services/whatsapp.service', () => ({ sendWhatsAppMessage: jest.fn() }));

import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import oauthRouter from '../oauth.routes';

/** One more than the person's budget of 60 in five minutes. */
const OVER_PERSON_BUDGET = 61;
const TOO_MANY = 429;

let server: Server;
let base: string;

beforeAll((done) => {
  const app = express();
  app.use('/oauth', oauthRouter);
  server = app.listen(0, () => {
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/oauth`;
    done();
  });
});
afterAll((done) => {
  server.close(() => done());
});

async function statuses(send: () => Promise<Response>): Promise<number[]> {
  const out: number[] = [];
  for (let i = 0; i < OVER_PERSON_BUDGET; i += 1) out.push((await send()).status);
  return out;
}

/**
 * Nika, 21 Oct (launch): the OTP was accepted twice and the connector showed
 * the OTP page again. Both authorisation codes were never exchanged — the
 * exchange comes from the connector's servers, which every user shares, and
 * it drew on the same 60 as one person's sign-in pages.
 */
describe('the OAuth rate limits', () => {
  it('does not refuse the code exchange after one person’s worth of requests', async () => {
    const codes = await statuses(() =>
      fetch(`${base}/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'grant_type=authorization_code',
      }),
    );
    expect(codes).not.toContain(TOO_MANY);
  });

  it('still limits the sign-in pages a browser opens', async () => {
    const codes = await statuses(() => fetch(`${base}/authorize?response_type=token`));
    expect(codes[codes.length - 1]).toBe(TOO_MANY);
  });
});

import express from 'express';
import { Server } from 'http';
import { AddressInfo } from 'net';
import connectorAssetsRouter, { NETAI_ICON_PATH } from '../connectorAssets.routes';

let server: Server;
let base: string;

beforeAll((done) => {
  const app = express();
  app.use('/assets', connectorAssetsRouter);
  server = app.listen(0, () => {
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/assets`;
    done();
  });
});
afterAll((done) => {
  server.close(() => done());
});

/** #5677 (the tester's 67148): ChatGPT's form wants a PNG of at most 10 KB, 256×256. */
describe('GET /assets/netai-icon-256.png', () => {
  it('serves a PNG of 256×256 under 10 KB, with no login', async () => {
    const res = await fetch(`${base}${NETAI_ICON_PATH}`);
    const body = Buffer.from(await res.arrayBuffer());

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(body.length).toBeLessThanOrEqual(10_000);
    expect(body.subarray(1, 4).toString('ascii')).toBe('PNG');
    expect(body.readUInt32BE(16)).toBe(256);
    expect(body.readUInt32BE(20)).toBe(256);
  });
});

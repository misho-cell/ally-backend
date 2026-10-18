const mockOpen = jest.fn();
const mockUpload = jest.fn();
jest.mock('../../../services/contactUploadLinks.service', () => {
  class UploadLinkClosedError extends Error {}
  class EmptyVcfError extends Error {}
  return {
    UPLOAD_PATH: '/contacts-upload',
    UploadLinkClosedError,
    EmptyVcfError,
    isUploadLinkOpen: (...a: unknown[]) => mockOpen(...a),
    startUploadThroughLink: (...a: unknown[]) => mockUpload(...a),
  };
});
jest.mock('../../middleware/rateLimit.middleware', () => ({
  rateLimit: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

import express from 'express';
import { Server } from 'http';
import { AddressInfo } from 'net';
import contactUploadRouter from '../contactUpload.routes';
import { UploadLinkClosedError } from '../../../services/contactUploadLinks.service';

let server: Server;
let base: string;
const TOKEN = 'a'.repeat(32);

beforeAll((done) => {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use('/contacts-upload', contactUploadRouter);
  server = app.listen(0, () => {
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/contacts-upload`;
    done();
  });
});
afterAll((done) => {
  server.close(() => done());
});
beforeEach(() => jest.clearAllMocks());

const post = (body: unknown): Promise<Response> =>
  fetch(`${base}/${TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

/** #5744 (A): the page the link opens, and the upload it takes. */
describe('the contacts upload page', () => {
  it('shows the file field for an open link', async () => {
    mockOpen.mockResolvedValue(true);
    const res = await fetch(`${base}/${TOKEN}`);
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(html).toContain('type="file"');
    expect(html).toContain('/contacts-upload/' + TOKEN);
  });

  it('says the link no longer works when it is used or expired', async () => {
    mockOpen.mockResolvedValue(false);
    const res = await fetch(`${base}/${TOKEN}`);

    expect(res.status).toBe(410);
    expect(await res.text()).toContain('ბმული აღარ მოქმედებს');
  });

  it('answers at once with the file’s count, the load running in the background', async () => {
    mockUpload.mockResolvedValue({ inFile: 1900 });
    const res = await post({ vcfContent: 'BEGIN:VCARD\nEND:VCARD' });

    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ success: true, data: { inFile: 1900, loading: true } });
  });

  it('answers 410 for a used link and 400 for no file', async () => {
    mockUpload.mockRejectedValue(new UploadLinkClosedError('used'));
    expect((await post({ vcfContent: 'BEGIN:VCARD' })).status).toBe(410);
    expect((await post({})).status).toBe(400);
  });
});

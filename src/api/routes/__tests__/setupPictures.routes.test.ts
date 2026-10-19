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
jest.mock('../../../services/setupPictures.service', () => ({
  ...jest.requireActual('../../../services/setupPictures.service'),
  picturesFor: jest.fn(),
  pictureFile: jest.fn(),
}));

import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import setupRouter from '../setup.routes';
import { pictureFile, picturesFor } from '../../../services/setupPictures.service';

const mockList = picturesFor as jest.MockedFunction<typeof picturesFor>;
const mockFile = pictureFile as jest.MockedFunction<typeof pictureFile>;

let server: Server;
let base: string;

beforeAll((done) => {
  const app = express();
  app.use('/setup', setupRouter);
  server = app.listen(0, () => {
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/setup`;
    done();
  });
});
afterAll((done) => {
  server.close(() => done());
});
beforeEach(() => jest.clearAllMocks());

/** #6139 (task 1882, B4+B6): the step card shows the real screen, picture by picture. */
describe('the setup pictures', () => {
  it('lists a step’s pictures in tap order, each with its caption and file', async () => {
    mockList.mockResolvedValue([
      { id: 7, position: 1, caption: 'გახსენი netai.guru', version: '1760860800' },
      { id: 8, position: 2, caption: 'დააჭირე ···', version: '1760860800' },
    ]);
    const res = await fetch(`${base}/pictures?gadget=iphone&step=install`);
    expect(res.status).toBe(200);
    expect(mockList).toHaveBeenCalledWith('iphone', 'install');
    const body = (await res.json()) as { data: { pictures: unknown[] } };
    expect(body.data.pictures).toEqual([
      { position: 1, caption: 'გახსენი netai.guru', url: '/setup/pictures/7/image?v=1760860800' },
      { position: 2, caption: 'დააჭირე ···', url: '/setup/pictures/8/image?v=1760860800' },
    ]);
  });

  it('refuses an unknown gadget or step', async () => {
    expect((await fetch(`${base}/pictures?gadget=nokia&step=install`)).status).toBe(400);
    expect((await fetch(`${base}/pictures?gadget=mac&step=fly`)).status).toBe(400);
  });

  it('serves the file with its own type', async () => {
    mockFile.mockResolvedValue({ contentType: 'image/png', bytes: Buffer.from([137, 80, 78, 71]) });
    const res = await fetch(`${base}/pictures/7/image`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(Buffer.from(await res.arrayBuffer())).toEqual(Buffer.from([137, 80, 78, 71]));
  });

  it('answers 404 for a picture that is gone', async () => {
    mockFile.mockResolvedValue(null);
    expect((await fetch(`${base}/pictures/99/image`)).status).toBe(404);
  });
});

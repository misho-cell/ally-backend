jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn() }));

import { query } from '../../db/postgres/client';
import {
  MAX_PICTURE_BYTES,
  PictureTooLargeError,
  putPicture,
  removePicture,
} from '../setupPictures.service';
import { Gadget, SetupStep } from '../setupState.service';

const mockQuery = query as jest.MockedFunction<typeof query>;

/** #6139: a picture is swapped from the admin without a deploy. */
describe('the setup picture store', () => {
  beforeEach(() => jest.clearAllMocks());

  it('replaces the picture at its place rather than adding a second', async () => {
    mockQuery.mockResolvedValue({ rows: [{ id: 7 }], rowCount: 1 } as never);
    const id = await putPicture(
      Gadget.Iphone,
      SetupStep.Install,
      1,
      { contentType: 'image/png', bytes: Buffer.from('png') },
      'გახსენი netai.guru',
    );
    expect(id).toBe(7);
    const [sql] = mockQuery.mock.calls[0] as [string];
    expect(sql).toContain('ON CONFLICT (gadget, step, position) DO UPDATE');
  });

  it('refuses a file over the cap', async () => {
    await expect(
      putPicture(
        Gadget.Mac,
        SetupStep.Contacts,
        1,
        {
          contentType: 'image/png',
          bytes: Buffer.alloc(MAX_PICTURE_BYTES + 1),
        },
        '',
      ),
    ).rejects.toBeInstanceOf(PictureTooLargeError);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('says whether a removed picture was there', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as never);
    expect(await removePicture(Gadget.Mac, SetupStep.Contacts, 3)).toBe(false);
  });
});

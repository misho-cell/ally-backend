const mockCreate = jest.fn();
jest.mock('../../config/anthropic', () => ({
  __esModule: true,
  default: { messages: { create: (...a: unknown[]) => mockCreate(...a) } },
}));
jest.mock('../costLedger.service', () => ({
  __esModule: true,
  recordClaudeUsage: jest.fn().mockResolvedValue(undefined),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { contactFromCard, readBusinessCard } from '../businessCard.service';

beforeEach(() => jest.clearAllMocks());

/** #374 way 3: a person met in the street, added from a photo of their card. */
describe('a business card becomes a contact', () => {
  it('reads the printed name and numbers, and saves nothing itself', async () => {
    mockCreate.mockResolvedValueOnce({
      usage: {},
      content: [
        {
          type: 'tool_use',
          input: {
            name: ' Nino Beridze ',
            phones: ['+995 555 00 00 00', 'fax'],
            employer: 'Instinct',
            jobPosition: '',
          },
        },
      ],
    });
    const contact = await readBusinessCard('abc', 'image/jpeg', '501');
    expect(contact).toEqual({
      name: 'Nino Beridze',
      phones: ['+995 555 00 00 00'],
      email: undefined,
      employer: 'Instinct',
      jobPosition: undefined,
      city: undefined,
    });
    const [request] = mockCreate.mock.calls[0] as [{ messages: { content: { type: string }[] }[] }];
    expect(request.messages[0]?.content[0]?.type).toBe('image');
    const service = readFileSync(join(__dirname, '..', 'businessCard.service.ts'), 'utf8');
    expect(service).not.toContain('importContacts');
  });

  it('gives nothing when the card has no name or no number', () => {
    expect(contactFromCard({ name: 'Nino', phones: [] })).toBeNull();
    expect(contactFromCard({ name: '', phones: ['555000000'] })).toBeNull();
  });

  it('is behind its own rate limit and checks the image first', () => {
    const routes = readFileSync(
      join(__dirname, '..', '..', 'api', 'routes', 'contacts.routes.ts'),
      'utf8',
    );
    expect(routes).toContain("'/card-read',\n  cardReadLimit,");
    expect(routes).toContain("body('media_type').isIn([...CARD_MEDIA_TYPES])");
  });
});

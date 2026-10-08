/**
 * 2907 (the tester's 46235, 0 of 2): the helper tapped her own saved dentist and
 * the owner read only the name and the trade — not the clinic or the district
 * she had saved. What she saved is now shown beside the name before the tap, and
 * a tap on the name is read as the name with it (D648: only what she approved).
 */
jest.mock('../../db/postgres/client', () => ({
  poolPressure: () => ({ total: 0, idle: 0, waiting: 0 }),
  query: jest.fn(),
  __esModule: true,
}));
jest.mock('../tools/searchByTag', () => ({ __esModule: true, ownMatchesFor: jest.fn() }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from '../../db/postgres/client';
import {
  AskChoice,
  ChoiceMeaning,
  parseAskChoices,
  tappedPersonText,
  withPeopleDetails,
} from '../askChoices';
import { bridgePicker } from '../bridgePicker';
import { ownMatchesFor } from '../tools/searchByTag';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockMatches = ownMatchesFor as jest.MockedFunction<typeof ownMatchesFor>;
const asks = readFileSync(join(__dirname, '..', 'taskAsks.service.ts'), 'utf8');
const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

const NINO = { phone: '+995500000001', name: 'ნინო სტომატოლოგი' };
const LEVAN = { phone: '+995500000002', name: 'ლევან კბილი' };
const PERSON: AskChoice = {
  label: 'ნინო სტომატოლოგი',
  means: ChoiceMeaning.Answer,
  detail: 'კლინიკა ღიმილი, ვაკე, თბილისი',
};

beforeEach(() => {
  mockQuery.mockReset();
  mockMatches.mockReset();
});

describe('the picker shows what she saved about each person', () => {
  it('puts her own place of work and city beside the name, and keeps them', async () => {
    mockMatches.mockResolvedValueOnce([NINO, LEVAN]);
    mockQuery.mockResolvedValueOnce({
      rows: [
        { phone: NINO.phone, field_type: 'employer', value: 'კლინიკა ღიმილი' },
        { phone: NINO.phone, field_type: 'city', value: 'ვაკე, თბილისი' },
      ],
    } as never);

    const picker = await bridgePicker('179956', { need: 'სტომატოლოგი' }, 'ka');

    expect(picker?.line).toContain('ნინო სტომატოლოგი (კლინიკა ღიმილი, ვაკე, თბილისი), ლევან კბილი');
    expect(picker?.details).toEqual({ 'ნინო სტომატოლოგი': 'კლინიკა ღიმილი, ვაკე, თბილისი' });
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('submitted_by_user_id = $1');
    expect(sql).toContain('retracted_at IS NULL');
    expect(sql).toContain('LIMIT $4');
    expect(params[2]).toEqual(['employer', 'city']);
  });

  it('a failed read leaves the names as they were', async () => {
    mockMatches.mockResolvedValueOnce([NINO]);
    mockQuery.mockRejectedValueOnce(new Error('timeout'));
    const quiet = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const picker = await bridgePicker('179956', { need: 'სტომატოლოგი' }, 'ka');

    expect(picker?.names).toEqual(['ნინო სტომატოლოგი']);
    expect(picker?.details).toEqual({});
    quiet.mockRestore();
  });
});

describe('the buttons carry it and a tap reads it', () => {
  it('only her own people get the detail', () => {
    const choices = withPeopleDetails(
      [
        { label: 'ნინო სტომატოლოგი', means: ChoiceMeaning.Answer },
        { label: 'არა', means: ChoiceMeaning.No },
      ],
      { 'ნინო სტომატოლოგი': PERSON.detail ?? '', არა: 'x' },
    );
    expect(choices).toEqual([PERSON, { label: 'არა', means: ChoiceMeaning.No }]);
  });

  it('survives the round trip through the stored column', () => {
    expect(parseAskChoices(JSON.parse(JSON.stringify([PERSON])))).toEqual([PERSON]);
  });

  it('a tap on the name is the name with what she was shown; anything else is nothing', () => {
    expect(tappedPersonText(' ნინო სტომატოლოგი ', [PERSON])).toBe(
      'ნინო სტომატოლოგი (კლინიკა ღიმილი, ვაკე, თბილისი)',
    );
    expect(tappedPersonText('ნინო', [PERSON])).toBeNull();
    expect(
      tappedPersonText('ლევან კბილი', [{ label: 'ლევან კბილი', means: ChoiceMeaning.Answer }]),
    ).toBeNull();
  });

  it('the ask stores the details and shows the line after an editor rewrite', () => {
    expect(asks).toContain('const choices = withPeopleDetails(');
    expect(asks).toContain(
      '...(picker && (!edited.edited || picker.names.length > 0) && said === language',
    );
  });

  it('the helper run reads the tap as the text she was shown', () => {
    expect(chat).toContain(
      "thread.type === 'incoming_ask' ? await tappedPersonOnThread(threadId, userMessage) : null;",
    );
    expect(chat).toContain("{ role: 'user', content: personTapped ?? userMessage },");
  });
});

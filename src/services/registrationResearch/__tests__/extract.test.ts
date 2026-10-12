jest.mock('../../../config/anthropic', () => ({
  __esModule: true,
  default: { messages: { create: jest.fn() } },
}));
jest.mock('../../costLedger.service', () => ({
  __esModule: true,
  recordClaudeUsage: jest.fn().mockResolvedValue(undefined),
}));

import anthropic from '../../../config/anthropic';
import { extractFacts, extractInput, factsFromReply, REGISTRATION_EXTRACT_BRIEF } from '../extract';

const mockCreate = anthropic.messages.create as unknown as jest.Mock;
const PERSON = { name: 'Nino Satsdeli', city: 'Tbilisi' };
const HIT = {
  url: 'https://a.ge/x',
  title: 'Nino',
  text: 'Nino Satsdeli, auditor at Bank A',
  isPage: false,
};

/** 4126 item 1: the extractor reads only what it is given and returns sourced work facts. */
describe('registration research extractor', () => {
  beforeEach(() => mockCreate.mockReset());

  it('asks for work facts only, with sources, and nothing when unsure who it is', () => {
    expect(REGISTRATION_EXTRACT_BRIEF).toContain('never guess');
    expect(REGISTRATION_EXTRACT_BRIEF).toContain('same_person to false');
    expect(REGISTRATION_EXTRACT_BRIEF).toContain('never family, health, religion, politics');
  });

  it('puts each text under its URL, with the person and the city given', () => {
    const input = extractInput(PERSON, [HIT]);
    expect(input).toContain('Person: Nino Satsdeli, city given: Tbilisi');
    expect(input).toContain('URL: https://a.ge/x');
  });

  it('reads the facts from the JSON reply', () => {
    const reply =
      'Here: {"same_person": true, "facts": [{"key": "employer", "value": "Bank A", ' +
      '"sources": ["https://a.ge/x"], "date": null}]}';
    expect(factsFromReply(reply)).toEqual([
      { key: 'employer', value: 'Bank A', sources: ['https://a.ge/x'], date: null },
    ]);
  });

  it('gives nothing when it is not the same person, or the reply is not JSON', () => {
    expect(factsFromReply('{"same_person": false, "facts": [{"key": "employer"}]}')).toEqual([]);
    expect(factsFromReply('no json here')).toEqual([]);
    expect(factsFromReply('{broken')).toEqual([]);
  });

  it('makes no call when there is nothing to read', async () => {
    expect(await extractFacts(7, PERSON, [])).toEqual([]);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('calls the model once with the brief and returns its facts', async () => {
    mockCreate.mockResolvedValueOnce({
      usage: {},
      content: [
        {
          type: 'text',
          text: '{"same_person": true, "facts": [{"key": "city", "value": "Tbilisi", "sources": ["https://a.ge/x"], "date": null}]}',
        },
      ],
    });
    expect(await extractFacts(7, PERSON, [HIT])).toHaveLength(1);
    expect(mockCreate.mock.calls[0][0].system).toBe(REGISTRATION_EXTRACT_BRIEF);
  });
});

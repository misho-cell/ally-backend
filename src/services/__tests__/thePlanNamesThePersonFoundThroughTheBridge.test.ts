import { readFileSync } from 'fs';
import { join } from 'path';

import {
  foundThroughBridges,
  introductionFromFound,
  introTargetSentence,
} from '../introTargetSentence';

/**
 * 4297 [c]/[d] (the tester's 59902, threads 52283/85/87): the second-circle
 * lawyer was found through Temo, the plan named Temo and no introduction, and
 * the server's sentence said only „თემო ჩხეიძის ასისტენტს დაველაპარაკები…".
 */
const TEMO_PHONE = '+995 555 00 00 01';
const TEMO = { name: 'თემო ჩხეიძე', phone: TEMO_PHONE };
const PLAN_WITHOUT_INTRODUCTION = { routes: [{ name: 'თემოს კავშირი', status: 'waiting' }] };

function lawyerRow(name: string, viaPhone: string): Record<string, unknown> {
  return {
    phone: '+995 555 00 00 99',
    name,
    ownership: 'second_degree',
    via_contacts: [{ name: 'თემო ჩხეიძე', phone: viaPhone }],
  };
}

describe('the people a search found through a bridge', () => {
  it('reads each named second-circle row with its bridges’ phones and its own (69268)', () => {
    const result = { results: [lawyerRow('ნინო იურისტი', TEMO_PHONE)] };
    expect(foundThroughBridges(result)).toEqual([
      { name: 'ნინო იურისტი', viaPhones: [TEMO_PHONE], phone: '+995 555 00 00 99' },
    ]);
  });

  it('skips own contacts, nameless rows, rows with no bridge, and non-results', () => {
    const result = {
      results: [
        { ...lawyerRow('ნინო', TEMO_PHONE), ownership: 'own' },
        lawyerRow('', TEMO_PHONE),
        { ...lawyerRow('ლევანი', TEMO_PHONE), via_contacts: [] },
      ],
    };
    expect(foundThroughBridges(result)).toEqual([]);
    expect(foundThroughBridges(null)).toEqual([]);
    expect(foundThroughBridges({ results: 'none' })).toEqual([]);
  });
});

describe('the introduction taken from what the run found', () => {
  const found = [{ name: 'ნინო იურისტი', viaPhones: ['995555000001'] }];

  it('names the one person found through the plan’s one go-between', () => {
    expect(introductionFromFound([TEMO], found)).toEqual({
      via: 'თემო ჩხეიძე',
      to: 'ნინო იურისტი',
      knowsThem: true,
    });
  });

  it('names nobody when two people were found through that go-between', () => {
    const two = [...found, { name: 'ლევან იურისტი', viaPhones: [TEMO_PHONE] }];
    expect(introductionFromFound([TEMO], two)).toBeNull();
  });

  it('names nobody found through someone else, or for two go-betweens or an unreachable one', () => {
    const elsewhere = [{ name: 'ნინო იურისტი', viaPhones: ['+995 555 00 00 02'] }];
    expect(introductionFromFound([TEMO], elsewhere)).toBeNull();
    expect(introductionFromFound([TEMO, { name: 'გია', phone: '+1' }], found)).toBeNull();
    expect(introductionFromFound([{ ...TEMO, reach: 'never_opened' }], found)).toBeNull();
  });
});

describe('the server’s plan sentence', () => {
  const found = [{ name: 'ნინო იურისტი', viaPhones: [TEMO_PHONE] }];

  it('names whom the go-between introduces when only the search says it', () => {
    const sentence = introTargetSentence(PLAN_WITHOUT_INTRODUCTION, [TEMO], 'ka', found);
    expect(sentence).toContain('ნინო იურისტი');
    expect(sentence).toContain('ასისტენტს დაველაპარაკები');
  });

  it('keeps the plan’s own introduction ahead of the search', () => {
    const planned = {
      routes: [
        {
          name: 'გაცნობა',
          status: 'waiting',
          introduction: { via_phone: TEMO_PHONE, to_name: 'სოფო' },
        },
      ],
    };
    expect(introTargetSentence(planned, [TEMO], 'ka', found)).toContain('სოფო');
  });

  it('stays the D663 sentence with nothing found, and outside Georgian', () => {
    expect(introTargetSentence(PLAN_WITHOUT_INTRODUCTION, [TEMO], 'ka')).toBeNull();
    expect(introTargetSentence(PLAN_WITHOUT_INTRODUCTION, [TEMO], 'en', found)).toBeNull();
  });

  it('is given the run’s finds where the plan is noted for the reply', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    expect(chat).toContain('(runId && runFoundThroughBridges.get(runId)) || [],');
    expect(chat).toContain('runFoundThroughBridges.delete(runId);');
  });
});

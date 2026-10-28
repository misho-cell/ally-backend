jest.mock('../instructedAsk', () => ({
  __esModule: true,
  oneContactNamed: jest.fn(),
  ownersLabel: jest.fn(),
}));
jest.mock('../tools/requestIntroduction', () => ({
  __esModule: true,
  requestIntroduction: jest.fn(),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { oneContactNamed, ownersLabel } from '../instructedAsk';
import {
  introductionSentence,
  introductionTarget,
  introductionThroughNamedBridge,
  isThePersonToMeet,
  personToMeetFromLines,
  personToMeetIn,
  introSentSentence,
  nominativeBeforeTan,
  SERVER_INTRODUCTION_ON,
  serverIntroduces,
  dormantSentence,
} from '../introFallback';
import { ownerAsksForIntroduction } from '../introInstruction';
import { requestIntroduction } from '../tools/requestIntroduction';

/**
 * 2311 (box 55934, 0 of 6 after 0190): a typed introduction the run left undone
 * went out as the owner's plain question, or not at all. The server makes the
 * introduction itself; OFF until Misho's yes on the owner's sentence.
 */
const mockNamed = oneContactNamed as jest.MockedFunction<typeof oneContactNamed>;
const mockLabel = ownersLabel as jest.MockedFunction<typeof ownersLabel>;
const mockIntro = requestIntroduction as jest.MockedFunction<typeof requestIntroduction>;
const OWNER = '183807';
const GIORGI_PHONE = '+995500000901';

describe('every wording of an introduction is an introduction (2311)', () => {
  it.each([
    'სთხოვე ლევან საცდელაძეს, დამაკავშიროს თამთა ნიმუშაძესთან.',
    'მაია გამოგონილს თხოვე ბახვა ფიქტიურთან დაკავშირება.',
    'სთხოვე ნანას, შემაერთოს გურამთან.',
    'ნანა გამოგონილაძეს სთხოვე, გამაცნოს გურამ ფიქციაშვილი.',
  ])('reads „%s" as an introduction', (line) => {
    expect(ownerAsksForIntroduction([line])).toBe(true);
  });

  it.each([
    'ჰკითხე ბექა ნიმუშაშვილს, შემაერთებს თუ არა ირმა გამოგონილთან.',
    'ჰკითხე გიას, გამაცნობს თუ არა ნინოს.',
    'დამაკავშირდი ხვალ.',
    'ჰკითხე ნინოს, კარგ სტომატოლოგს თუ იცნობს.',
  ])('keeps „%s" a question', (line) => {
    expect(ownerAsksForIntroduction([line])).toBe(false);
  });
});

describe('the person the owner wants to meet', () => {
  it.each([
    ['სთხოვე გიორგი ტესტაძეს, დამაკავშიროს ნინო ნიმუშაძე-თან.', 'ნინო ნიმუშაძე'],
    ['სთხოვე გიორგი ტესტაძეს, დამაკავშიროს ნინო საცდელთან.', 'ნინო საცდელი'],
    ['ნანა გამოგონილაძეს სთხოვე, გამაცნოს გურამ ფიქციაშვილი.', 'გურამ ფიქციაშვილი'],
    ['მაია გამოგონილს თხოვე ბახვა ფიქტიურთან დაკავშირება.', 'ბახვა ფიქტიური'],
    ['მაიას თხოვე ბახვასთან დაკავშირება.', 'ბახვა'],
    ['სთხოვე ნანას, შემაერთოს გურამთან.', 'გურამი'],
  ])('„%s" → „%s"', (line, target) => {
    expect(introductionTarget(line)).toBe(target);
  });

  it('puts a name before -თან back in the nominative', () => {
    expect(nominativeBeforeTan('X-')).toBe('X');
    expect(nominativeBeforeTan('ნინოს')).toBe('ნინო');
    expect(nominativeBeforeTan('ბოლქვაძეს')).toBe('ბოლქვაძე');
    expect(nominativeBeforeTan('საცდელ')).toBe('საცდელი');
  });

  it('finds the introduction sentence among the owner’s other sentences', () => {
    expect(introductionSentence('გამარჯობა. სთხოვე ნანას, გამაცნოს გურამი. მადლობა!')).toBe(
      'სთხოვე ნანას, გამაცნოს გურამი.',
    );
    expect(introductionSentence('ჰკითხე ნინოს, კარგ სტომატოლოგს თუ იცნობს.')).toBeNull();
  });
});

describe('the server makes the introduction', () => {
  const LINE = 'სთხოვე გიორგი ტესტაძეს, დამაკავშიროს ნინო ნიმუშაძე-თან.';

  beforeEach(() => {
    jest.clearAllMocks();
    mockNamed.mockResolvedValue(GIORGI_PHONE);
    mockLabel.mockResolvedValue('გიორგი ტესტაძე');
    mockIntro.mockResolvedValue({ success: true });
  });

  it('is ON since Misho’s yes on the owner’s sentence (CE, §139)', () => {
    expect(SERVER_INTRODUCTION_ON).toBe(true);
  });

  it('sends one introduction request: the named go-between, the target, the goal and the thread', async () => {
    const made = await serverIntroduces(OWNER, LINE, {
      requesterTaskId: 25060,
      originThreadId: 50783,
    });
    expect(made).toEqual({ mediator: 'გიორგი ტესტაძე', target: 'ნინო ნიმუშაძე' });
    expect(mockIntro).toHaveBeenCalledTimes(1);
    expect(mockIntro).toHaveBeenCalledWith(
      OWNER,
      'გიორგი ტესტაძე',
      'ნინო ნიმუშაძე',
      undefined,
      GIORGI_PHONE,
      undefined,
      undefined,
      'intro',
      false,
      { requesterTaskId: 25060, originThreadId: 50783 },
    );
  });

  it('makes nothing when the go-between is not exactly one saved contact', async () => {
    mockNamed.mockResolvedValue(null);
    expect(await serverIntroduces(OWNER, LINE, {})).toBeNull();
    expect(mockIntro).not.toHaveBeenCalled();
  });

  it('makes nothing for a line that is no introduction', async () => {
    expect(
      await serverIntroduces(OWNER, 'ჰკითხე ნინოს, კარგ სტომატოლოგს თუ იცნობს.', {}),
    ).toBeNull();
    expect(mockIntro).not.toHaveBeenCalled();
  });

  it('names the go-between who never opened the app, so the owner can decide (§140)', async () => {
    mockIntro.mockResolvedValue({ success: false, reason: 'dormant_account', error: 'x' });
    const found = await serverIntroduces(OWNER, LINE, {});
    expect(found).toEqual({ dormant: 'გიორგი ტესტაძე' });
    expect(dormantSentence({ dormant: 'გიორგი ტესტაძე' }, 'ka')).toBe(
      'გიორგი ტესტაძე Netai-ზე რეგისტრირებულია, მაგრამ აპი ჯერ არ გაუხსნია, ამიტომ თხოვნას ვერ ნახავს, სანამ არ შემოვა. მაინც გავუგზავნო?',
    );
    expect(dormantSentence({ dormant: 'Giorgi' }, 'en')).toBe(
      "Giorgi is on Netai but hasn't opened the app yet, so they won't see the request until they do. Send it anyway?",
    );
  });

  it('says nothing went when requestIntroduction refuses', async () => {
    mockIntro.mockResolvedValue({ success: false, error: 'blocked' });
    expect(await serverIntroduces(OWNER, LINE, {})).toBeNull();
  });

  it('tells the owner who was asked to introduce them to whom', () => {
    const made = { mediator: 'გიორგი ტესტაძე', target: 'ნინო ნიმუშაძე' };
    expect(introSentSentence(made, 'ka')).toBe(
      'გიორგი ტესტაძის ასისტენტს თხოვნა გავუგზავნე, რომ გიორგი ტესტაძემ ნინო ნიმუშაძე გაგაცნოს. როგორც კი პასუხი მოვა, მაშინვე მოგწერ.',
    );
    expect(introSentSentence(made, 'en')).toBe(
      "I sent გიორგი ტესტაძე's assistant a request for გიორგი ტესტაძე to introduce you to ნინო ნიმუშაძე. I will tell you as soon as the answer comes.",
    );
  });
});

describe('the fallback, wired', () => {
  const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
  const fn = chat.slice(chat.indexOf('async function serverSendsOrSaysSo('));
  const body = fn.slice(0, fn.indexOf('\n}\n'));

  it('tries the introduction before the plain question, and never says „not sent" for it', () => {
    expect(body.indexOf('serverIntroductionOrNull(userId, threadId, runId)')).toBeGreaterThan(-1);
    expect(body.indexOf('serverIntroductionOrNull(userId, threadId, runId)')).toBeLessThan(
      body.indexOf('await sendInstructedAsk(userId, threadId'),
    );
    expect(body).not.toContain('an introduction, not sent as a question');
  });

  it('is behind one switch, so off is what main did before', () => {
    expect(chat).toContain('on: boolean = SERVER_INTRODUCTION_ON,');
    expect(chat).toContain('if (!on || !ownerAsksForIntroduction([ownerLine])) return null;');
  });
});

describe('the bridge named after the person asked for (#6304, tester 77511)', () => {
  it('reads „X-ის გაცნობა მინდა" for the person, in the nominative', () => {
    expect(personToMeetIn('გიორგი ხატიაშვილის გაცნობა მინდა')).toBe('გიორგი ხატიაშვილი');
    expect(personToMeetIn('ნინოს გაცნობა მჭირდება')).toBe('ნინო');
    expect(personToMeetIn('ნოტარიუსი მჭირდება')).toBeNull();
  });

  it('makes „ლიკას სთხოვე" after it one introduction through Lika', () => {
    const line = introductionThroughNamedBridge('ლიკას სთხოვე', [
      'რამე სხვა',
      'გიორგი ხატიაშვილის გაცნობა მინდა',
    ]);
    expect(line).toBe('ლიკას სთხოვე, გამაცნოს გიორგი ხატიაშვილი');
    expect(introductionTarget(line ?? '')).toBe('გიორგი ხატიაშვილი');
  });

  it('leaves a line that is already an introduction, or names no bridge, alone', () => {
    const earlier = ['გიორგი ხატიაშვილის გაცნობა მინდა'];
    expect(introductionThroughNamedBridge('სთხოვე ნინოს, გამაცნოს რეზო', earlier)).toBeNull();
    expect(introductionThroughNamedBridge('კარგი', earlier)).toBeNull();
    expect(introductionThroughNamedBridge('ლიკას სთხოვე', ['ნოტარიუსი მჭირდება'])).toBeNull();
  });
});

describe('a question to a bridge on a goal to meet someone (#6304, tester 77587)', () => {
  it('reads the person from a goal title in both forms', () => {
    expect(personToMeetIn('გიორგი ხატიაშვილის გაცნობა (ლიკა ცინცაძის მეშვეობით)')).toBe(
      'გიორგი ხატიაშვილი',
    );
    expect(personToMeetIn('ირაკლი ლაცაბიძესთან გაცნობა ბიზნეს წინადადებისთვის')).toBe(
      'ირაკლი ლაცაბიძე',
    );
    expect(personToMeetIn('გიორგი ხატიაშვილთან გაცნობა')).toBe('გიორგი ხატიაშვილი');
    expect(personToMeetIn('მისი გაცნობა მინდა')).toBeNull();
    expect(personToMeetFromLines(['ლიკას სთხოვე', 'გიორგი ხატიაშვილის გაცნობა'])).toBe(
      'გიორგი ხატიაშვილი',
    );
  });

  it('tells the bridge from the person to meet', () => {
    expect(isThePersonToMeet('ლიკა ლომსაძე', 'გიორგი ხატიაშვილი')).toBe(false);
    expect(isThePersonToMeet('გიორგი ხატიაშვილი (TBC)', 'გიორგი ხატიაშვილი')).toBe(true);
  });

  it('is wired into ask_contact before the question checks', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    const at = chat.indexOf('const routed = await askOnAReachGoalAsIntroduction(');
    expect(at).toBeGreaterThan(chat.indexOf("case 'ask_contact': {"));
    expect(chat.slice(at, at + 400)).toContain('if (routed !== null) return routed;');
  });
});

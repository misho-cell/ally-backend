import { readFileSync } from 'fs';
import { join } from 'path';
import { languageOfConversation } from '../runLanguage';
import { RULE_268_QUIET_DAY_ONE } from '../testerRules';

/**
 * Board #388: after quiet days Netai tries a new route, in the owner's
 * language. Done when the wake brings one useful step, in English for an
 * English user. The wake event itself is Georgian (it is addressed to the
 * model), so the language must come from the conversation, not from it.
 */
const engine = readFileSync(join(__dirname, '..', 'taskEngine.service.ts'), 'utf8');
const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
const silentSweep = engine.slice(
  engine.indexOf('export async function sweepSilentGoals'),
  engine.indexOf('async function nightlyReview'),
);

describe('the quiet-day wake', () => {
  it('asks for one new step, told to the owner in one line in their language', () => {
    expect(silentSweep).toContain('RULE_268_QUIET_DAY_ONE,');
    expect(RULE_268_QUIET_DAY_ONE).toContain('Take one new step the same turn');
    expect(RULE_268_QUIET_DAY_ONE).toContain("in the owner's language, what new step you took");
  });

  it('never ends in „nobody else can help" without a search that said so', () => {
    expect(RULE_268_QUIET_DAY_ONE).toContain(
      'Never say „nobody else can help" unless a search in this turn returned nobody',
    );
  });
});

describe('an English owner gets the quiet-day step in English', () => {
  const englishReply =
    'I wrote to Anna and Ben about the accountant; I will tell you the moment someone answers.';

  it('takes the language from the newest real message, not from the Georgian event', () => {
    expect(languageOfConversation(englishReply, [], 'ka')).toBe('en');
  });

  it('finds English behind a short last line', () => {
    expect(languageOfConversation('Ok', [englishReply], 'ka')).toBe('en');
  });

  it('keeps a Georgian owner in Georgian', () => {
    expect(languageOfConversation('ანას და ბენს მივწერე ბუღალტერზე, პასუხს ველი.', [], 'en')).toBe(
      'ka',
    );
  });

  it('lets the newest real message decide on an engine run', () => {
    expect(chat).toContain(
      'const decidesLanguage = ownerAbsent ? (spokenBefore[0] ?? userMessage) : userMessage;',
    );
  });
});

import { DAY_ONE_EVENT, PLAN_PROPOSAL_EVENT, introOutcomeEvent } from '../taskEngine.events';

/**
 * The engine's events are stored with role „user", so to the model they ARE the
 * owner's words — and they were Georgian in every language.
 *
 * The seat's read, 18 September, thread 17563, „I need a good tailor in Tbilisi
 * for a suit.", each line one stored message with Georgian characters against
 * Latin:
 *
 *   0  user       message     0 geo /  33 lat
 *   1  assistant  message     0 geo / 109 lat
 *   2  assistant  message     0 geo / 165 lat
 *   3  user       EVENT     514 geo /  44 lat   <- this text
 *   4  assistant  message   250 geo / 125 lat   <- the plan card, now Georgian
 *
 * Three clean English messages, one Georgian event, and the assistant switches.
 * It is obeying the rule it was given — answer in the language the user typed —
 * and the last thing the „user" typed was five hundred characters of Georgian
 * that we wrote. Two of their three threads went wrong on exactly the message
 * after an event; the third, where no event fired, stayed clean. That is also
 * why the fault looked intermittent all day and was never the same component
 * twice: whether a run leaked depended on whether an event happened to fire.
 */
describe('the engine events the model reads as the owner', () => {
  const EVERY = [
    ['day one', DAY_ONE_EVENT],
    ['plan proposal', PLAN_PROPOSAL_EVENT],
  ] as const;

  it.each(EVERY)('%s exists in all four languages', (_name, event) => {
    for (const language of ['ka', 'en', 'ru', 'es'] as const) {
      expect(event[language].length).toBeGreaterThan(100);
    }
  });

  it.each(EVERY)('%s carries no Georgian outside the Georgian one', (_name, event) => {
    for (const language of ['en', 'ru', 'es'] as const) {
      expect(event[language]).not.toMatch(/[Ⴀ-ჿ]/);
    }
  });

  /**
   * These two clauses are load-bearing and were fought over before. D119 is
   * what makes an approved plan the consent to write to the people in it; the
   * „write to nobody" rule is the one that, on 16 September, three goals broke
   * by naming people in a first plan after the owner had asked us not to. A
   * translation that loses either is worse than the Georgian it replaced.
   */
  it('keeps D119 named in every language, so the rule can be traced', () => {
    for (const language of ['ka', 'en', 'ru', 'es'] as const) {
      expect(DAY_ONE_EVENT[language]).toContain('D119');
    }
  });

  it('keeps the tool names, which are not words to translate', () => {
    for (const language of ['ka', 'en', 'ru', 'es'] as const) {
      expect(DAY_ONE_EVENT[language]).toContain('set_task_wake');
      expect(PLAN_PROPOSAL_EVENT[language]).toContain('propose_task_plan');
      expect(PLAN_PROPOSAL_EVENT[language]).toContain('present_choices');
      expect(PLAN_PROPOSAL_EVENT[language]).toContain('people_to_involve');
    }
  });

  it('keeps the write-to-nobody rule in every language', () => {
    // Its shape: the owner said not to write, so the list stays EMPTY and the
    // people found are named in the message as leads instead.
    const empties: Record<string, RegExp> = {
      ka: /ცარიელი/,
      en: /stays empty/i,
      ru: /пустым/i,
      es: /vacío/i,
    };
    for (const language of ['ka', 'en', 'ru', 'es'] as const) {
      expect(PLAN_PROPOSAL_EVENT[language]).toMatch(empties[language]);
    }
  });

  it('names the buttons the product actually offers today', () => {
    // The Georgian text said „დამტკიცებულია" — the OLD approve label, replaced
    // by „ვამტკიცებ". It was telling the model to offer a wording the product
    // no longer uses, which is how unrecognised labels reach a plan card.
    expect(PLAN_PROPOSAL_EVENT.ka).toContain('ვამტკიცებ');
    expect(PLAN_PROPOSAL_EVENT.ka).not.toContain('დამტკიცებულია');
    expect(PLAN_PROPOSAL_EVENT.en).toContain('I approve');
    expect(PLAN_PROPOSAL_EVENT.ru).toContain('Подтверждаю');
    expect(PLAN_PROPOSAL_EVENT.es).toContain('Lo apruebo');
  });
});

/**
 * Ticket 20 row 210 — the answer that would not walk.
 *
 * Salome asked at 13:35 to be introduced to Ninia, Lika agreed at 13:41, and
 * Salome's own goal said nothing until she typed „arapheria akhali?" at
 * 14:06:46 and was told at 14:07:09. Nothing had failed: her push went twice
 * and the request's own thread was written to. The GOAL was never told,
 * because nothing tied a request to the goal it came out of.
 *
 * This is the text that tells it. Unlike its two neighbours it has to name a
 * person and say which way the answer went, which is the only reason it is a
 * function.
 */
describe('the introduction outcome event', () => {
  const LANGUAGES = ['ka', 'en', 'ru', 'es'] as const;
  const ACCEPTED = introOutcomeEvent('ნინია აბრამიშვილი', true);
  const DECLINED = introOutcomeEvent('ნინია აბრამიშვილი', false);

  it('exists in all four languages, both ways', () => {
    for (const language of LANGUAGES) {
      expect(ACCEPTED[language].length).toBeGreaterThan(100);
      expect(DECLINED[language].length).toBeGreaterThan(80);
    }
  });

  it('names the person in every language — the name is the point of the message', () => {
    for (const language of LANGUAGES) {
      expect(ACCEPTED[language]).toContain('ნინია აბრამიშვილი');
      expect(DECLINED[language]).toContain('ნინია აბრამიშვილი');
    }
  });

  it('carries no Georgian of OURS outside the Georgian one', () => {
    // The name is the owner's data and travels as written; the instruction
    // around it must not. Checked by stripping the name first, which is the
    // only way this assertion can mean anything on a Georgian contact.
    for (const language of ['en', 'ru', 'es'] as const) {
      expect(ACCEPTED[language].replace('ნინია აბრამიშვილი', '')).not.toMatch(/[Ⴀ-ჿ]/);
      expect(DECLINED[language].replace('ნინია აბრამიშვილი', '')).not.toMatch(/[Ⴀ-ჿ]/);
    }
  });

  it('never carries a phone number (D149) — the thread already has it', () => {
    const withNumber = introOutcomeEvent('ნინია აბრამიშვილი', true);
    for (const language of LANGUAGES) {
      expect(withNumber[language]).not.toMatch(/\d{4}/);
    }
  });

  it('tells a decline apart from an accept, and does not re-ask on a decline', () => {
    const noRepeat: Record<string, RegExp> = {
      ka: /ნუ გაიმეორებ/,
      en: /do not repeat/i,
      ru: /не повторяй/i,
      es: /no repitas/i,
    };
    for (const language of LANGUAGES) {
      expect(DECLINED[language]).toMatch(noRepeat[language]);
      expect(ACCEPTED[language]).not.toMatch(noRepeat[language]);
    }
  });
});

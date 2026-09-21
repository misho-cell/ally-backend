import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * The seat's 339, and it is bigger than the guard they were testing.
 *
 * They signed in as the mediator, answered a waiting request with one word,
 * and the channel item 5 built never appeared: no three buttons, no
 * `needs_channel`, the request answered and closed. Their diagnosis was
 * upstream of everything I shipped this morning:
 *
 *   thread 19505   type: "incoming_ask"   introduction_request_id: null
 *
 * It was never an introduction. Four threads on four accounts over two days,
 * every one worded as plainly as a person can word it — „Would you introduce
 * me to Netai Test 4?" — and every one filed as an ordinary question.
 *
 * WHAT THE BASE SAYS, and this is the part that makes it a regression rather
 * than a design. `introduction_requests`, by week, for the whole life of the
 * table:
 *
 *   15 Jun  6     22 Jun  2     29 Jun  7     06 Jul  4
 *   13 Jul  4     20 Jul  4     10 Aug  1     17 Aug  4
 *   24 Aug  7     31 Aug  3     07 Sep  0     14 Sep  1
 *
 * Three to seven a week for three months, then nothing. And in the five days
 * `tool_call_log` covers: ask_contact 119, request_introduction 1,
 * respond_to_introduction ZERO.
 *
 * THE TOOL WAS NEVER UNAVAILABLE — it is in ALWAYS_ON_TOOLS and has been all
 * along. The model simply stopped choosing it, and the descriptions say why.
 * `ask_contact` grew through the plan work of early September into 1,700
 * characters of consent machinery that reads as THE way to reach a person;
 * `request_introduction` stayed at 450 and never said, in the user's own
 * words, what it is for. Neither said anything about the other.
 *
 * Read as text: these strings are consumed by a model and there is no return
 * value to assert on. Joined back up first, because prettier decides where
 * they wrap and a phrase that fits one line today straddles `' +` tomorrow.
 *
 * WHETHER THIS ACTUALLY WORKED IS NOT ESTABLISHED, and the commit that shipped
 * it claimed more than the evidence carries. One introduction was created
 * after it — request 1123, 20 September 13:01, the first in fourteen days —
 * and it differs from all four failures in TWO ways at once:
 *
 *   18746/18747  19 Sep   171870 -> Netai Test 3   not a contact   incoming_ask
 *   19505        20 Sep   171871 -> Netai Test 4   not a contact   incoming_ask
 *   1123         20 Sep   171870 -> Netai Test 4   A CONTACT       introduction_request
 *
 * Every failure had a target the requester did not already hold; the one
 * success had one. So „the descriptions did it" and „the model always routed
 * this correctly for a known contact" fit the data equally well, and the
 * seat's hypothesis was the better-tested of the two.
 *
 * THE EXPERIMENT THAT SEPARATES THEM is one sentence: from 171870, ask for an
 * introduction to Netai Test 3 — not in their phonebook — through any
 * mediator. That is the exact shape that failed twice on the 19th. Until it
 * runs, these assertions hold that the words are PRESENT, and nothing more.
 */
const SOURCE = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
const joined = (from: string, to: string): string => {
  const start = SOURCE.indexOf(from);
  // `to` must be found AFTER the start — `input_schema` occurs sixty times in
  // this file and the first one is nowhere near either tool.
  return SOURCE.slice(start, SOURCE.indexOf(to, start)).replace(/'\s*\+\s*'/g, '');
};

const REQUEST_INTRO = joined("name: 'request_introduction'", 'input_schema');
const ASK_CONTACT = joined("name: 'ask_contact'", 'input_schema');

describe('an introduction is not a question, and both tools say so', () => {
  it('request_introduction says what it is FOR, in the words a user uses', () => {
    expect(REQUEST_INTRO).toContain('I WANT TO MEET X');
    expect(REQUEST_INTRO).toContain('ASK Y TO INTRODUCE ME TO X');
  });

  it('ask_contact says what it is NOT, and what happens if it is used anyway', () => {
    expect(ASK_CONTACT).toContain('NOT FOR AN INTRODUCTION');
    // The cost, named: this is what the seat actually observed.
    expect(ASK_CONTACT).toContain('no introduction is created');
    expect(ASK_CONTACT).toContain('nobody is ever connected');
  });

  it('each points at the other by name, so neither can be read alone', () => {
    expect(REQUEST_INTRO).toContain('ask_contact is the wrong one');
    expect(ASK_CONTACT).toContain('that is request_introduction, not this');
  });

  /**
   * The discriminator has to be usable on a sentence, because both kinds of
   * request begin with „ask". „Ask Gio whether he knows a plumber" and „Ask
   * Gio to introduce me to Nino" differ only in what the user wants at the
   * end, so that is what both descriptions are taught to look at.
   */
  it('gives a discriminator rather than a list of phrasings', () => {
    for (const text of [REQUEST_INTRO, ASK_CONTACT]) {
      expect(text).toContain('what the user wants at the end');
    }
    expect(REQUEST_INTRO).toContain('both sentences begin with "ask"');
  });

  /** Nothing that was already there may be lost — this is an addition. */
  it('keeps what each tool already said', () => {
    expect(REQUEST_INTRO).toContain('only after the user explicitly confirms');
    expect(REQUEST_INTRO).toContain('DIRECT case');
    expect(ASK_CONTACT).toContain('the approved plan IS the consent');
    expect(ASK_CONTACT).toContain('Never promise to pass something on before you have actually');
  });
});

/**
 * THE CONNECTOR NEVER GOT ANY OF THIS, and that is row 220's remaining half.
 *
 * The descriptions above live in `chat.service.ts` — the in-app chat. The
 * connector serves its own copies from `mcp/texts.ts`, and until 21 September
 * those still named `ask_contact` as the warm-intro route in three separate
 * places (get_contact_profile, search_roster, find_warm_path). 63 of the 150
 * relayed asks in the table's whole life came through that surface.
 *
 * Exactly the shape of the accept-channel fault recorded in
 * `docs/ADMIN_WRITE_OPERATIONS.md` §16: „the guard lives in the chat tool, the
 * mediator pressed the app's button".
 */
const TEXTS = readFileSync(join(__dirname, '..', 'mcp', 'texts.ts'), 'utf8');
const mcpText = (name: string): string => {
  const start = TEXTS.indexOf(`  ${name}: {`);
  return TEXTS.slice(start, TEXTS.indexOf('\n  },', start)).replace(/'\s*\+\s*'/g, '');
};

describe('the connector says the same thing as the chat', () => {
  it('its request_introduction names what it is for', () => {
    expect(mcpText('request_introduction')).toContain('I WANT TO MEET X');
    expect(mcpText('request_introduction')).toContain('ask_contact is the wrong one');
  });

  it('its ask_contact names what it is not, and the share-contact case too', () => {
    const askContact = mcpText('ask_contact');
    expect(askContact).toContain('NOT FOR AN INTRODUCTION');
    expect(askContact).toContain('nobody is ever connected');
    // Read as source, so the apostrophe is still escaped here.
    expect(askContact).toContain("ask Y to send me X\\'s contact");
  });

  /**
   * The three routing sentences, which are what actually produced the
   * behaviour: a model following them was not misbehaving, it was obeying.
   */
  it('no tool text routes an introduction through ask_contact any more', () => {
    for (const name of ['get_contact_profile', 'search_roster', 'find_warm_path']) {
      expect(mcpText(name)).not.toMatch(/\(ask_contact \/ a warm intro\)/);
    }
    expect(mcpText('get_contact_profile')).toContain('never ask_contact');
    expect(mcpText('search_roster')).toContain('"request_introduction" to MEET them');
  });

  /**
   * `find_warm_path` keeps ask_contact for hops 2 and 3 and this is not an
   * oversight: `requestIntroduction` resolves the mediator out of the
   * REQUESTER's own `UserAlias` rows, so it cannot be addressed to a bridge
   * the user does not hold. Saying „always request_introduction" there would
   * name a tool that returns „not in your contacts".
   */
  it('keeps ask_contact for the hops request_introduction cannot address', () => {
    const warmPath = mcpText('find_warm_path');
    expect(warmPath).toContain('Only a LONGER path uses ask_contact');
    expect(warmPath).toContain('can only be addressed to the user’s own contact');
  });
});

/**
 * The seat's 396, counted rather than reported: every introduction raised from
 * a seat today — 1189, 1222, 1255, 1256 — carries `message` NULL, and the
 * mediator's GET /requests row shows "message": null.
 *
 * The tool's PROSE has said „saved verbatim so the eventual reply keeps its
 * context" for weeks. Its SCHEMA said „Optional context message for the
 * mediator" and left it out of `required`. A schema wins that argument every
 * time, and the one line that lets a person say yes never left the app.
 *
 * The connector required it all along — `z.string()` with no `.optional()`.
 * Same split as the three routing sentences above.
 */
describe('the why reaches the mediator', () => {
  it('the chat tool requires message, as the connector already did', () => {
    // Comments stripped: the block above this test quotes the old wording, and
    // a plain search would go green against my own note about the fix rather
    // than against the fix. That has happened here before.
    const code = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    const schema = code.slice(code.indexOf("name: 'request_introduction'"));
    expect(schema).toContain("required: ['mediator_name', 'target_name', 'message']");
    expect(schema).not.toContain('Optional context message');
  });

  it('says what the line is for, not only that it is needed', () => {
    const schema = SOURCE.slice(SOURCE.indexOf("name: 'request_introduction'"));
    expect(schema).toContain('the line that lets the mediator say yes');
    expect(schema).toContain('ask them before calling this');
  });
});

import { withoutLeadingSelfNote } from '../leadingSelfNote';
import { withClosingQuestion } from '../chat.service';

/**
 * Task #432 — the tester's 1033, thread 30500, 11:59:32Z. The reply the owner
 * read, as stored:
 */
const NOTE =
  'every ask carries sender\'s name automatically, no "send without my name" option. Answer accordingly.';
const ANSWER =
  'კი, ასეა, ყველა შეკითხვას შენი სახელი ახლავს, Netai-ზე ანონიმური შეკითხვა არ არსებობს.';
const QUESTION = 'დავიწყო?';

describe('a working note the model wrote to itself', () => {
  it('is taken off the top of a Georgian reply', () => {
    expect(withoutLeadingSelfNote(`${NOTE}\n\n${ANSWER}`, 'ka')).toBe(ANSWER);
  });

  it('leaves an English reply alone — there is no tell there', () => {
    const english = `${NOTE}\n\nYes, every ask carries your name.`;
    expect(withoutLeadingSelfNote(english, 'en')).toBe(english);
  });

  it('leaves a page link or a firm name on its own line in place', () => {
    const link = `https://www.yell.ge/company.php?lan=geo&id=1 Kutaisi Dental Center\n\n${ANSWER}`;
    expect(withoutLeadingSelfNote(link, 'ka')).toBe(link);
    const firm = `GeoDentalTour LLC\n\n${ANSWER}`;
    expect(withoutLeadingSelfNote(firm, 'ka')).toBe(firm);
  });

  it('leaves a reply that is all in another script alone', () => {
    expect(withoutLeadingSelfNote(`${NOTE}\n\nAnother English paragraph.`, 'ka')).toBe(
      `${NOTE}\n\nAnother English paragraph.`,
    );
  });

  it('only ever looks at the first paragraph', () => {
    const middle = `${ANSWER}\n\n${NOTE}\n\n${ANSWER}`;
    expect(withoutLeadingSelfNote(middle, 'ka')).toBe(middle);
  });
});

describe('the closing question', () => {
  it('is said once when the model wrote it twice', () => {
    expect(withClosingQuestion(`${ANSWER}\n\n${QUESTION}\n\n${QUESTION}`, 'ka')).toBe(
      `${ANSWER}\n\n${QUESTION}`,
    );
  });

  it('is left as it was when it is there once', () => {
    expect(withClosingQuestion(`${ANSWER}\n\n${QUESTION}`, 'ka')).toBe(`${ANSWER}\n\n${QUESTION}`);
  });
});

import { buildShownAnswersWakeEvent } from '../taskAsks.service';
import {
  OWNER_WORDS_ANSWER_NOTE,
  OWNER_WORDS_ANSWER_ON,
  ownerWordsAnswerNote,
} from '../ownerWordsAnswer';

/** 4423 / 1688 part 1 (box 52772): the helper asks what the owner already said. */
const HELPER_ASKS = [
  {
    answer: 'ნიკა გეკითხება, ერთჯერადი სამუშაოა თუ მომავალშიც მოვლა დასჭირდება ელექტრიკოსს.',
    fromName: 'ნიკა დამხმარელი',
    verbatim: false,
  },
];

describe('4423: the owner’s own words answer a helper’s question', () => {
  it('stays OFF until Misho says yes to the exact text', () => {
    expect(OWNER_WORDS_ANSWER_ON).toBe(false);
  });

  it('leaves the answer-wake note exactly as it was while OFF', () => {
    expect(buildShownAnswersWakeEvent(HELPER_ASKS)).toContain(
      'ადამიანი პასუხს ელოდება. არასდროს თქვა',
    );
    expect(buildShownAnswersWakeEvent(HELPER_ASKS)).not.toContain('ask_contact-ით');
  });

  it('when ON, tells the run to answer from the owner’s words and only them', () => {
    expect(ownerWordsAnswerNote(true)).toBe(OWNER_WORDS_ANSWER_NOTE);
    expect(OWNER_WORDS_ANSWER_NOTE).toContain('მხოლოდ მისი ნათქვამით');
    expect(ownerWordsAnswerNote(false)).toBe('');
  });
});

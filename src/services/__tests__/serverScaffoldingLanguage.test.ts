import { isServerScaffolding, RUN_EVENT_PREFIX } from '../chat.service';
import { languageOfConversation } from '../runLanguage';

/**
 * The seat's 297, goal 6370 — the model's own prose flipped to Georgian
 * mid-conversation on an entirely English account, and flipped back later.
 *
 * The two approvals in that one thread are the experiment, four minutes apart:
 *
 *   19:42:44  „I approve"   ->  19:43:03  the reply, in English
 *   19:43:42  a Georgian system note enters the thread, stored role „user"
 *   19:46:19  „I approve"   ->  19:46:29  the reply, in GEORGIAN
 *
 * Identical word, identical path. The only thing that changed between them is
 * that the SERVER had written one of its own Georgian lines into the history.
 *
 * „I approve" is nine Latin characters, below the threshold that may move a
 * conversation — deliberately, since row 155, so that „Ok" cannot flip a
 * Georgian thread. So the fallback looks for the newest earlier message
 * carrying a script, and found ours.
 *
 * The rule already existed for the message in hand: an engine event never
 * decides the language. It had never been applied to the fallback list, which
 * is the only place it can matter — the fallback is consulted exactly when the
 * message in hand says nothing.
 */
const SYSTEM_NOTE = '(სისტემური შენიშვნა: მოკლედ აცნობე მომხმარებელს სად ხარ.)';
const WAKE_EVENT = `${RUN_EVENT_PREFIX} The plan has just been approved — this is day one.`;

describe('what counts as the server talking to itself', () => {
  it('knows a wake event and a system note', () => {
    expect(isServerScaffolding(WAKE_EVENT)).toBe(true);
    expect(isServerScaffolding(SYSTEM_NOTE)).toBe(true);
    // Leading whitespace must not smuggle one past.
    expect(isServerScaffolding(`\n  ${SYSTEM_NOTE}`)).toBe(true);
  });

  it('leaves the owner’s own words alone, including Georgian ones', () => {
    expect(isServerScaffolding('I approve')).toBe(false);
    expect(isServerScaffolding('მჭირდება სანტექნიკოსი')).toBe(false);
    // A person writing about an event is not an event.
    expect(isServerScaffolding('what happened with that event?')).toBe(false);
  });
});

describe('the fallback that decides an ambiguous message’s language', () => {
  const englishHistory = [
    'Also ask Netai Test 1 the same question about a plumber.',
    'I need a plumber in Tbilisi. Please ask my contacts.',
  ];

  it('is English before the server writes anything, which is the 19:43 case', () => {
    expect(languageOfConversation('I approve', englishHistory)).toBe('en');
  });

  it('WAS Georgian once a system note sat in the list — the 19:46 case', () => {
    // The bug, pinned: this is what the unfiltered history produced.
    expect(languageOfConversation('I approve', [SYSTEM_NOTE, ...englishHistory])).toBe('ka');
  });

  it('stays English once the scaffolding is filtered out', () => {
    const owned = [SYSTEM_NOTE, WAKE_EVENT, ...englishHistory].filter(
      (text) => !isServerScaffolding(text),
    );
    expect(languageOfConversation('I approve', owned)).toBe('en');
  });

  it('still lets the owner’s OWN Georgian decide, which row 155 is about', () => {
    // The filter must not make a Georgian thread answer in English: „Ok" in a
    // Georgian conversation has to find Georgian behind it.
    const georgian = [SYSTEM_NOTE, 'მჭირდება სანტექნიკოსი თბილისში'].filter(
      (text) => !isServerScaffolding(text),
    );
    expect(languageOfConversation('Ok', georgian)).toBe('ka');
  });
});

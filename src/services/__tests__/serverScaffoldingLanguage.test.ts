import { readFileSync } from 'fs';
import { join } from 'path';
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

const CHAT_SERVICE = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');

/**
 * THE FIX THAT DID NOT HOLD, AND WHY THE SECOND ONE IS A DIFFERENT SHAPE.
 *
 * The first attempt filtered the server's own sentences out of the history
 * list by their opening words. It shipped at 20:35 and the seat reproduced the
 * flip at 21:29 on the fixed build. The rule was right and the SOURCE was
 * unusable: `loadHistory` wraps an engine turn in server-turn markers, so its
 * text no longer begins with anything identifying, and `mergeAdjacentSameRole`
 * folds adjacent user rows into one block array, so a note and a real message
 * stop being separable at all. Both transformations are correct for the model.
 * They just make that list the wrong place to ask this question.
 *
 * So the vote reads the database instead — `kind = 'message'`, which excludes
 * an engine turn by what the row IS rather than by how its text starts.
 */
describe('where the language vote gets the owner’s words', () => {
  /**
   * The STATEMENT, not the region — the comment above it quotes the old
   * mechanism by name, and a region-wide assertion would forbid explaining
   * what was wrong.
   */
  const VOTE = CHAT_SERVICE.slice(
    CHAT_SERVICE.indexOf('const spokenBefore'),
    CHAT_SERVICE.indexOf(';', CHAT_SERVICE.indexOf('const spokenBefore')) + 1,
  );

  it('reads the owner’s stored messages, not the model’s history', () => {
    expect(VOTE).toContain('ownerMessages(threadId)');
    expect(VOTE).not.toContain('history');
  });

  it('does not try to identify the server’s sentences by their opening words', () => {
    // The whole class: after framing and merging there is nothing left to
    // prefix-test, so the vote must not contain one. Scoped to the vote rather
    // than to the file, because this test's own comments name the thing.
    expect(VOTE).not.toContain('startsWith');
    expect(VOTE).not.toContain('PREFIX');
  });

  it('fails towards the owner’s words rather than towards none', () => {
    // A failed read must not silently make every short message decide for
    // itself — but it also must not take the thread down. Empty list, and the
    // message in hand decides, which is the pre-existing behaviour.
    expect(VOTE).toContain('.catch(() => [] as string[])');
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

  it('stays English when the list holds only the owner’s own messages', () => {
    // Which is what ownerMessages returns: the note and the wake event are
    // `kind = 'event'` rows and never appear in it.
    expect(languageOfConversation('I approve', englishHistory)).toBe('en');
  });

  it('still lets the owner’s OWN Georgian decide, which row 155 is about', () => {
    // The fix must not make a Georgian thread answer in English: „Ok" in a
    // Georgian conversation has to find Georgian behind it.
    expect(languageOfConversation('Ok', ['მჭირდება სანტექნიკოსი თბილისში'])).toBe('ka');
  });
});

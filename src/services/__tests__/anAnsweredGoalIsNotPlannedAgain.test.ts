import { readFileSync } from 'fs';
import { join } from 'path';
import { offersTheFinishCard } from '../chat.service';
import { withoutEarlySolvedCard } from '../answerCardGuard';

/**
 * The tester's 962, Batumi 28943: the run answered from the web and ended on
 * the finish card; 50 seconds later the plan wake drew a plan that wrote to
 * nobody, repeated the answer and asked „ამ გეგმას მივყვე და ვიმოქმედო?".
 */
describe('a goal answered on screen is not sent back for a plan', () => {
  it('reads the finish card in the model’s own words', () => {
    expect(offersTheFinishCard(['მოგვარებულია', 'ჯერ არა, სხვასაც ჰკითხე'])).toBe(true);
    expect(offersTheFinishCard(['Solved', 'Not yet'])).toBe(true);
    expect(offersTheFinishCard(['ვამტკიცებ', 'შევცვალოთ'])).toBe(false);
    expect(offersTheFinishCard(null)).toBe(false);
  });

  it('is checked by the plan wake, on the newest reply of the goal’s thread', () => {
    const engine = readFileSync(join(__dirname, '..', 'taskEngine.service.ts'), 'utf8');
    const gate = engine.slice(engine.indexOf('export async function nothingToPlanYet'));
    expect(gate.slice(0, 4000)).toContain('await goalWasAnsweredOnScreen(task.thread_id)');
    const read = engine.slice(engine.indexOf('async function goalWasAnsweredOnScreen'));
    expect(read.slice(0, 600)).toContain("role = 'assistant' AND kind = 'message'");
    expect(read.slice(0, 600)).toContain('ORDER BY created_at DESC LIMIT 1');
  });
});

/** The same thread: Claude's step was put in front of GPT's rewrite of it. */
describe('a rewritten final is not doubled by its own step', () => {
  it('promotes a buried step only over Claude’s own final, or an empty one', () => {
    const chat = readFileSync(join(__dirname, '..', 'chat.service.ts'), 'utf8');
    const buried = chat.slice(chat.indexOf('const buriedAnswer ='));
    expect(buried.slice(0, 300)).toContain('(finalText.length === 0 ||');
    expect(buried.slice(0, 300)).toContain('(!finalIsRewrite &&');
    expect(chat).toContain('finalIsRewrite = true;');
  });
});

/** 28944: „ჯერ არა, სხვასაც ჰკითხე" was left alone when its partner went. */
describe('the not-yet half of a finish card goes with it', () => {
  const isSolved = (label: string): boolean => label === 'მოგვარებულია';

  it('however the model went on after „ჯერ არა"', () => {
    const guarded = withoutEarlySolvedCard(
      'პასუხი ბარათზეა.',
      ['მოგვარებულია', 'ჯერ არა, სხვასაც ჰკითხე'],
      'ka',
      isSolved,
    );
    expect(guarded?.choices).toBeUndefined();
  });

  it('keeps a button that only begins with the same letters', () => {
    const guarded = withoutEarlySolvedCard('x', ['მოგვარებულია', 'ჯერარავის ვწერ'], 'ka', isSolved);
    expect(guarded?.choices).toEqual(['ჯერარავის ვწერ']);
  });
});

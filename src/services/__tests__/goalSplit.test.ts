import { splitOpeningLine } from '../goalSplit';

/**
 * Ticket 20 row 33. The tester's read of 15812: a second need typed into the
 * catering thread opened goal 3702 on thread 15814, and that thread then held
 * the plan and nothing else. The empty-thread half is fixed; this is the line
 * that says why the conversation exists at all.
 */
describe('the first line of a goal split out of another chat', () => {
  it('names the goal that was already running, so the split has a reason', () => {
    const line = splitOpeningLine('ქეითერინგი ოფისში', 'ka');

    expect(line).toContain('ქეითერინგი ოფისში');
    expect(line).toContain('ცალკე მიზნად');
  });

  it('follows the conversation’s language, like every other fixed string', () => {
    expect(splitOpeningLine('office catering', 'en')).toContain('a goal of its own');
    expect(splitOpeningLine('кейтеринг', 'ru')).toContain('отдельную цель');
    expect(splitOpeningLine('catering', 'es')).toContain('meta aparte');
  });

  it('carries no em dash and no bold, because it skips the storage scrubber', () => {
    // Ticket 11 Task 1 strips these from a reply on its way to the row. This
    // line is written straight to the thread and never passes that function.
    for (const lang of ['ka', 'en', 'ru', 'es'] as const) {
      const line = splitOpeningLine('X', lang);
      expect(line).not.toMatch(/—|\*\*|^#/m);
    }
  });

  it('survives a goal title that is empty, rather than writing a dangling quote', () => {
    // A title is required by create_task, but the line must not become
    // „already working on „"" if one ever arrives blank.
    expect(splitOpeningLine('', 'ka').length).toBeGreaterThan(40);
  });
});

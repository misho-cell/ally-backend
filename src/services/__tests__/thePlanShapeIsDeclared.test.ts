import { ALWAYS_ON_TOOLS } from '../chat.service';

/**
 * ROW 244(b) — THE FOUR STATUS WORDS WERE DESCRIBED AND NEVER DECLARED.
 *
 * The tester measured every plan proposal on the test seats since 22 September
 * 13:00 — 136 of them, 6 refused — and THREE of the six were „route status must
 * be one of running, waiting, done, dropped". The model had written „active",
 * „pending" and „open". The four words were in the tool's description, in
 * prose, and nowhere in the schema; nothing checked them until the server did,
 * and then it refused the whole plan and cost the owner a turn.
 *
 * Prose in a tool description is the same thing as prose in a prompt, and this
 * codebase says five times over what that is worth. A declared enum is checked
 * where the call is made.
 *
 * The tester offered me the alternative — have the server map near-words onto
 * the four — and I did not take it. Mapping „open" onto „running" is a guess
 * about what somebody meant, and the plan the owner then reads would carry a
 * status nobody chose. Declaring the set costs nothing and guesses nothing.
 */
const planSchema = (): Record<string, unknown> => {
  const tool = ALWAYS_ON_TOOLS.find((t) => t.name === 'propose_task_plan');
  if (!tool) throw new Error('propose_task_plan is not in the tool list');
  return tool.input_schema.properties.plan as unknown as Record<string, unknown>;
};

describe('the plan argument declares its shape instead of describing it', () => {
  it('names the four route statuses as a closed set', () => {
    const props = (planSchema().properties ?? {}) as Record<
      string,
      { items?: { properties?: Record<string, { enum?: string[] }> } }
    >;
    const status = props.routes?.items?.properties?.status;

    expect(status?.enum).toEqual(['running', 'waiting', 'done', 'dropped']);
  });

  /** The three words the model actually guessed must not be accepted. */
  it.each(['active', 'pending', 'open'])('does not allow %s', (word) => {
    const props = (planSchema().properties ?? {}) as Record<
      string,
      { items?: { properties?: Record<string, { enum?: string[] }> } }
    >;

    expect(props.routes?.items?.properties?.status?.enum).not.toContain(word);
  });

  /** And the rest of the shape is declared too, or the next guess is a field name. */
  it('declares the fields the server will read', () => {
    const plan = planSchema();
    const props = (plan.properties ?? {}) as Record<string, unknown>;

    expect(Object.keys(props).sort()).toEqual(
      ['never_contact', 'people_to_involve', 'routes', 'solved_when'].sort(),
    );
    expect(plan.required).toEqual(['solved_when', 'routes']);
  });

  /**
   * THE PROSE STAYS. It carries the thing a schema cannot: that „running" means
   * something has actually run, which is row 140 and a claim about the world
   * rather than a type.
   */
  it('keeps the sentence a schema cannot express', () => {
    expect(String(planSchema().description)).toContain('only once something has actually run');
  });
});

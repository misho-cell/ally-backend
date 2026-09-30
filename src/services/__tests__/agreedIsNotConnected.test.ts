jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn(), default: {} }));

import { buildAnswerWakeEvent, buildRelayAnswerWakeEvent } from '../taskAsks.service';
import { introOutcomeEvent } from '../taskEngine.events';

/**
 * Rows 314, 315, 317. Giorgi was told his introduction „took place" when the
 * bridge had only agreed; on fictional seats, Test 44's „…დავაკავშირებ, თუ
 * გინდა" was followed at once by „ეს გითვლი მოგვარებულად?" and nothing was
 * done to make the connection. Both answer events now say what a yes-to-
 * connect is — the middle, not the end — and what the next step is.
 */
describe('an agreement to connect is a stage, not a result', () => {
  const events = {
    direct: buildAnswerWakeEvent(
      'კი, ბახვა კარგი ბუღალტერია. დავაკავშირებ, თუ გინდა.',
      'Netai Test 44',
    ),
    relay: buildRelayAnswerWakeEvent('კი, დაგაკავშირებ.', 'Netai Test 16', 'Netai Test 44'),
  };

  it.each(Object.entries(events))('%s: names the stage and forbids „connected"', (_kind, event) => {
    expect(event).toMatch(/„დათანხმდა", არა „დაკავშირდნენ"/);
    expect(event).toMatch(/კონტაქტი ჯერ არ გადაცემულა/);
    expect(event).toMatch(/არასდროს თქვა „დაგაკავშირეთ", „შედგა"/);
  });

  it.each(Object.entries(events))(
    '%s: does not ask „solved?" at this stage (315)',
    (_kind, event) => {
      expect(event).toMatch(/ამ ეტაპზე ნუ ჰკითხავ, მოგვარდა თუ არა/);
      expect(event).toMatch(/„მოგვარდა\?" მხოლოდ მაშინ იკითხე, როცა კონტაქტი გადაცემულია/);
    },
  );

  it.each(Object.entries(events))(
    '%s: drives the connection and checks the next day (317)',
    (_kind, event) => {
      expect(event).toMatch(/request_introduction/);
      expect(event).toMatch(/რა დარჩა/);
      expect(event).toMatch(/set_task_wake 24 საათზე/);
    },
  );

  it('still carries the answer itself verbatim, between the tags', () => {
    expect(events.direct).toContain(
      '<answer>\nკი, ბახვა კარგი ბუღალტერია. დავაკავშირებ, თუ გინდა.\n</answer>',
    );
  });
});

/**
 * Row 315, the acceptance half — the seat's 855: after an introduction was
 * ACCEPTED (and the contact could not be passed), the owner was asked at once
 * „მიზანი შენთვის მოგვარებულად ითვლება?". The acceptance event itself said
 * „then check whether this solves the goal".
 */
describe('an accepted introduction does not ask „solved?" either', () => {
  const states = ['handed_over', 'kept_by_mediator', 'not_found'] as const;

  it.each(states)('%s: no longer invites the solved question, in any language', (state) => {
    const event = introOutcomeEvent('Baxva', true, state);
    expect(event.en).not.toMatch(/check whether this solves the goal/);
    expect(event.en).toMatch(/Do NOT ask whether the goal is solved yet/);
    expect(event.ka).toMatch(/ახლა ნუ ჰკითხავ, მოგვარდა თუ არა/);
    expect(event.ru).toMatch(/НЕ спрашивай пока, решена ли цель/);
    expect(event.es).toMatch(/NO preguntes todavía si la meta está resuelta/);
  });

  it.each(states)('%s: sets the 24-hour check that they spoke', (state) => {
    for (const text of Object.values(introOutcomeEvent('Baxva', true, state)))
      expect(text).toMatch(/set_task_wake/);
  });
});

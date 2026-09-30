jest.mock('../../db/postgres/client', () => ({ __esModule: true, query: jest.fn(), default: {} }));

import { buildAnswerWakeEvent, buildRelayAnswerWakeEvent } from '../taskAsks.service';

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

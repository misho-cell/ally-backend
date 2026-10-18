import {
  appInputFrom,
  AppTool,
  connectorInputShape,
  connectorOutputOf,
  takesAnotherNumber,
} from '../appToolShape';

const WHO_HELPED: AppTool = {
  name: 'record_who_helped',
  description: 'Remember who solved it.',
  input_schema: {
    properties: {
      phone: { type: 'string', description: "The helper's phone id." },
      what_was_solved: { type: 'string', description: 'How it was solved.' },
      task_id: { type: 'number', description: 'The goal.' },
    },
    required: ['phone', 'what_was_solved'],
  },
};

describe('#5677: an app tool as the connector takes it', () => {
  it('asks for an opaque contact_ref where the app asks for a phone', () => {
    const shape = connectorInputShape(WHO_HELPED, 'The stable id from a search result.');

    expect(Object.keys(shape).sort()).toEqual(['contact_ref', 'task_id', 'what_was_solved']);
    expect(shape.contact_ref.safeParse('c_x').success).toBe(true);
    expect(shape.contact_ref.safeParse(undefined).success).toBe(false);
    expect(shape.task_id.safeParse(undefined).success).toBe(true);
  });

  it('keeps enums, arrays and nested objects', () => {
    const shape = connectorInputShape(
      {
        name: 't',
        description: 'd',
        input_schema: {
          properties: {
            mode: { type: 'string', enum: ['add', 'replace'] },
            items: {
              type: 'array',
              items: { type: 'object', properties: { label: { type: 'string' } } },
            },
          },
          required: ['mode'],
        },
      },
      'ref',
    );

    expect(shape.mode.safeParse('add').success).toBe(true);
    expect(shape.mode.safeParse('other').success).toBe(false);
    expect(shape.items.safeParse([{ label: 'a' }]).success).toBe(true);
  });

  it('is not shared when another argument carries a number', () => {
    expect(takesAnotherNumber(WHO_HELPED)).toBe(false);
    expect(
      takesAnotherNumber({
        ...WHO_HELPED,
        input_schema: { properties: { for_phone: { type: 'string' } }, required: [] },
      }),
    ).toBe(true);
  });

  it('turns the ref back into the phone, and refuses a ref that is not this user’s', () => {
    const decode = (ref: string): string | null => (ref === 'c_ok' ? '+995500000000' : null);

    expect(appInputFrom({ contact_ref: 'c_ok', what_was_solved: 'x' }, decode)).toEqual({
      phone: '+995500000000',
      what_was_solved: 'x',
    });
    expect(appInputFrom({ contact_ref: 'c_bad' }, decode)).toBeNull();
    expect(appInputFrom({ limit: 5 }, decode)).toEqual({ limit: 5 });
  });

  it('turns every …phone field of the result into a ref, at any depth', () => {
    const encode = (phone: string): string => `ref(${phone.slice(-2)})`;

    expect(
      connectorOutputOf(
        {
          found: true,
          contacts: [{ name: 'Nino', phone: '+995500000012', helper_phone: '+995500000034' }],
        },
        encode,
      ),
    ).toEqual({
      found: true,
      contacts: [{ name: 'Nino', contact_ref: 'ref(12)', helper_contact_ref: 'ref(34)' }],
    });
  });
});

import { z } from 'zod';

/**
 * #5677 (the founder's D818, 18 Oct): an app tool, as the connector reads it.
 * The app's tools are written for the in-app agent, which works with phone ids;
 * the connector never lets a number reach Claude or ChatGPT (contactRef.ts). So
 * a `phone` argument becomes an opaque `contact_ref` on the way in, and every
 * `…phone` field becomes a ref on the way out.
 */
export interface AppToolProperty {
  readonly type: string;
  readonly description?: string;
  readonly items?: AppToolProperty;
  readonly enum?: readonly string[];
  readonly properties?: Readonly<Record<string, AppToolProperty>>;
  readonly required?: readonly string[];
}

export interface AppTool {
  readonly name: string;
  readonly description: string;
  readonly input_schema: {
    readonly properties: Readonly<Record<string, AppToolProperty>>;
    readonly required: readonly string[];
  };
}

export const PHONE_ARG = 'phone';
export const REF_ARG = 'contact_ref';
const PHONE_KEY_RE = /phone$/u;
const PHONE_WORD_RE = /phone/u;

/** Does the tool take a number in any argument but its one `phone`? Such a tool is not shared. */
export function takesAnotherNumber(tool: AppTool): boolean {
  const walk = (props: Readonly<Record<string, AppToolProperty>>, top: boolean): boolean =>
    Object.entries(props).some(
      ([key, prop]) =>
        (PHONE_WORD_RE.test(key) && !(top && key === PHONE_ARG)) ||
        (prop.properties !== undefined && walk(prop.properties, false)) ||
        (prop.items?.properties !== undefined && walk(prop.items.properties, false)),
    );
  return walk(tool.input_schema.properties, true);
}

function zodOf(prop: AppToolProperty): z.ZodType {
  const described = (schema: z.ZodType): z.ZodType =>
    prop.description === undefined ? schema : schema.describe(prop.description);
  switch (prop.type) {
    case 'string':
      return described(
        prop.enum !== undefined && prop.enum.length > 0
          ? z.enum(prop.enum as [string, ...string[]])
          : z.string(),
      );
    case 'number':
    case 'integer':
      return described(z.number());
    case 'boolean':
      return described(z.boolean());
    case 'array':
      return described(z.array(prop.items === undefined ? z.unknown() : zodOf(prop.items)));
    case 'object':
      return described(
        prop.properties === undefined
          ? z.record(z.string(), z.unknown())
          : z.object(shapeOf(prop.properties, prop.required ?? [])),
      );
    default:
      return described(z.unknown());
  }
}

function shapeOf(
  props: Readonly<Record<string, AppToolProperty>>,
  required: readonly string[],
): Record<string, z.ZodType> {
  return Object.fromEntries(
    Object.entries(props).map(([key, prop]) => {
      const schema = zodOf(prop);
      return [key, required.includes(key) ? schema : schema.optional()];
    }),
  );
}

/** The connector's argument shape: the app's, with `phone` as an opaque contact ref. */
export function connectorInputShape(
  tool: AppTool,
  refDescription: string,
): Record<string, z.ZodType> {
  const { properties, required } = tool.input_schema;
  const shape = shapeOf(properties, required);
  if (!(PHONE_ARG in properties)) return shape;
  const rest = Object.fromEntries(Object.entries(shape).filter(([key]) => key !== PHONE_ARG));
  const ref = z.string().describe(refDescription);
  return { ...rest, [REF_ARG]: required.includes(PHONE_ARG) ? ref : ref.optional() };
}

export type RefDecoder = (ref: string) => string | null;
export type PhoneEncoder = (phone: string) => string;

/** The app's arguments from the connector's; null when a contact ref is not this user's. */
export function appInputFrom(
  args: Readonly<Record<string, unknown>>,
  decode: RefDecoder,
): Record<string, unknown> | null {
  const { [REF_ARG]: ref, ...rest } = args;
  if (ref === undefined) return { ...rest };
  const phone = typeof ref === 'string' ? decode(ref) : null;
  return phone === null ? null : { ...rest, [PHONE_ARG]: phone };
}

/** The app's result with every `…phone` field turned into a contact ref, at any depth. */
export function connectorOutputOf(value: unknown, encode: PhoneEncoder): unknown {
  if (Array.isArray(value)) return value.map((item) => connectorOutputOf(item, encode));
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, field]) =>
      PHONE_KEY_RE.test(key) && typeof field === 'string' && field !== ''
        ? [key.replace(PHONE_KEY_RE, REF_ARG), encode(field)]
        : [key, connectorOutputOf(field, encode)],
    ),
  );
}

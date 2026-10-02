import { body, ValidationChain } from 'express-validator';

/** #504: a link is a web address, and nothing longer than a person would type. */
export const MAX_LINK_CHARS = 300;

/** Any scheme at all, „https:" or „javascript:", but not „host:8080". */
const HAS_SCHEME_RE = /^[a-z][a-z0-9+.-]*:(?!\d)/i;

/**
 * The frontend's question of 2 October: „linkedin.com/in/name" is what people
 * type, because it is what a business card prints. With no scheme it is given
 * https:// and then validated like any other address. A value that names a
 * scheme keeps it, so „javascript:…" still reaches the http(s) check and is
 * refused there.
 */
export function withWebScheme(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const typed = value.trim();
  if (typed === '' || HAS_SCHEME_RE.test(typed)) return typed;
  return `https://${typed}`;
}

export function profileLinkRule(): ValidationChain {
  return body('link')
    .optional({ nullable: true })
    .isString()
    .customSanitizer(withWebScheme)
    .isLength({ max: MAX_LINK_CHARS })
    .isURL({ protocols: ['http', 'https'], require_protocol: true });
}

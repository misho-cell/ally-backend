/**
 * Rounding for numbers that leave the server (ticket 9 task 31.4).
 *
 * `0.45 + 0.3 + 0.1 - 0.175` is `0.6749999999999999` in binary floating point,
 * and that is exactly what the admin screens have been showing. The seventeen
 * digits are not precision; they are the absence of rounding, and they make a
 * score look like a measurement to three decimal places when it is a weighted
 * guess to one.
 *
 * Round at the EDGE, never during the arithmetic: rounding a part before it is
 * combined changes the ranking, which is the one thing a display fix must not
 * do.
 */

/** Decimals kept on a 0..1 score. Enough to order rows, few enough to read. */
export const SCORE_DECIMALS = 3;

export function roundTo(value: number, decimals: number = SCORE_DECIMALS): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Board #378: a plain greeting took 37 seconds to the first word, so a bare
 * greeting got one short turn with no tools. #8779 group 4 (the founder,
 * 4 Nov): the greeting is no longer picked out by a word list and takes the
 * ordinary turn. The length cap stays for the one short text-only turn that
 * remains — the „other, I'll write it" tap.
 */
export const GREETING_MAX_TOKENS = 350;

/**
 * Said on the one re-ask after a blank first answer (task 695, tester 1076,
 * conversation 31886): the re-ask used to send the same input to the same
 * model, and a second blank followed in 3 seconds. The note goes at the
 * uncached end of the system prompt, like the greeting note, so nothing
 * cached changes.
 */
export const BLANK_RETRY_NOTE =
  '\n\n## This turn\nYour previous attempt at this turn returned nothing. ' +
  "Answer the owner's last message now, in their language; use a tool if the answer needs one.";

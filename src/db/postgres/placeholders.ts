/**
 * Does a statement ask for more parameters than it was given?
 *
 * WHY IT IS HERE AND NOT LEFT TO POSTGRES. 20 September, `54af32f`: I deleted
 * two captions from the run reaper's statement, which removed the `$1` and
 * `$2` they were bound to, and left the interval reading `$3` over a
 * one-element array. Postgres numbers parameters by the HIGHEST one
 * referenced, so it wanted three, got one, and said
 *
 *   could not determine data type of parameter $1     (SQLSTATE 42P18)
 *
 * — a sentence that names the wrong parameter, does not name the query, and
 * arrives inside a `catch` that logs and carries on. `sweepOrphanedRuns` threw
 * on every twenty-second sweep for four hours and nothing in the product
 * looked any different, because a reaper that finds nothing and a reaper that
 * cannot run are the same thing seen from outside.
 *
 * The tests could not have caught it: they mock the database client, so the
 * SQL text is the one thing they never execute. The binding was only ever
 * checked at the far end, by the database, in a vendor string. So it is
 * checked here instead, before anything is sent, in a sentence that says which
 * query and what is missing.
 *
 * ITS OWN MODULE so a test can import it while `client` is mocked — which is
 * the exact condition it was written for.
 */

/** How much of a statement goes into an error message. */
const SQL_ERROR_PREFIX_CHARS = 160;

/**
 * A `$n` that is not a parameter: inside a string literal, a comment, or a
 * dollar-quoted body. `'$1 seconds'` never reaches the binder, and a check
 * that counted it would refuse queries that work — which would be a worse bug
 * than the one this prevents, because it would refuse at runtime what the
 * database accepts.
 */
const SQL_NOISE = /--[^\n]*|\/\*[\s\S]*?\*\/|'(?:[^']|'')*'|\$\$[\s\S]*?\$\$/g;

function forError(queryText: string): string {
  const oneLine = queryText.replace(/\s+/g, ' ').trim();
  return oneLine.length > SQL_ERROR_PREFIX_CHARS
    ? `${oneLine.slice(0, SQL_ERROR_PREFIX_CHARS)}…`
    : oneLine;
}

/**
 * Throws rather than warns. The statement cannot succeed — Postgres is about
 * to refuse it — so the only question left is whether the failure is legible.
 *
 * More parameters than placeholders is legal and stays legal; only a reference
 * with nothing behind it is refused.
 */
export function assertPlaceholdersMatchParams(
  queryText: string,
  params: unknown[] | undefined,
): void {
  const bare = queryText.replace(SQL_NOISE, ' ');
  let highest = 0;
  for (const match of bare.matchAll(/\$(\d+)/g)) {
    highest = Math.max(highest, Number(match[1]));
  }
  const given = params?.length ?? 0;
  if (highest > given) {
    throw new Error(
      `SQL asks for $${highest} but only ${given} parameter(s) were passed — ` +
        `Postgres would report this as a data type it cannot determine. Query: ${forError(queryText)}`,
    );
  }
}

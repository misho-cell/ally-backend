import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * A SQUARE BRACKET IN A RAILWAY LOG FILTER MATCHES NOTHING, AND IT RETURNS
 * NOTHING QUIETLY.
 *
 * Every log tag in this codebase is written `[cliffhanger]`, `[otp-sms]`,
 * `[login]` — so the tag itself is the filter anybody writes, and Railway's
 * filter has its own query syntax in which a bracket means something else.
 * The reply is an empty list, which reads exactly like „that never happened".
 *
 * MEASURED, 27 September, on one deployment, one minute apart:
 *
 *   filter "[cliffhanger]"  ->  0 lines      filter "cliffhanger"  ->  2 lines
 *   filter "[task-engine]"  ->  0 lines      filter "task-engine"  ->  2 lines
 *
 * The two cliffhanger lines were mine, deployed ninety minutes earlier to
 * settle row 273, and the first check said they were not there. `sms.sh` had
 * carried the same mistake since 25 September — the one script written to
 * prove an SMS outage could not see its own lines — and the two-hourly login
 * watchdog since 24 September, so three days of „nobody has tried yet" came
 * from a filter that could never have matched.
 *
 * This file is the gate. A comment saying „do not use brackets" is a warning,
 * and a warning is not a gate; only something that declines to pass is.
 */
const OPS = join(__dirname, '..', '..', '..', 'scripts', 'ops');

const shellScripts = readdirSync(OPS).filter((name) => name.endsWith('.sh'));

/** A line that is only a comment can say „[otp-sms]" — that is how it warns. */
const isComment = (line: string): boolean => line.trimStart().startsWith('#');

/**
 * `logs.sh`'s own synopsis names its optional arguments the way every usage
 * line does — `[limit] [filter]` — and those brackets are punctuation for a
 * reader, not a filter. It is the only such line, and naming it exactly is
 * cheaper than a clever rule that would also excuse a real one.
 *
 * A printed SUGGESTION is NOT excused, on purpose: `outage.sh` ends by telling
 * somebody which command to paste, and a bracketed filter there fails just as
 * silently once a human runs it.
 */
const isUsageSynopsis = (line: string): boolean => line.includes('usage: logs.sh');

/** Every line that actually calls `logs.sh logs`, across all of scripts/ops. */
const callSites = (): readonly { readonly script: string; readonly line: string }[] =>
  shellScripts.flatMap((script) =>
    readFileSync(join(OPS, script), 'utf8')
      .split('\n')
      .filter(
        (line) => !isComment(line) && !isUsageSynopsis(line) && /logs\.sh["']?\s+logs\b/.test(line),
      )
      .map((line) => ({ script, line: line.trim() })),
  );

describe('no ops script asks the log a question it cannot answer', () => {
  it('finds the call sites at all, so an empty sweep cannot pass for a clean one', () => {
    expect(callSites().length).toBeGreaterThan(0);
  });

  it('passes no bracketed filter to logs.sh', () => {
    const bracketed = callSites().filter(({ line }) => /\[|\]/.test(line));

    expect(bracketed).toEqual([]);
  });
});

describe('logs.sh refuses rather than returning nothing', () => {
  const logs = readFileSync(join(OPS, 'logs.sh'), 'utf8');

  it('declines a filter containing a bracket, and exits „I could not look"', () => {
    const guard = logs.slice(logs.indexOf('case "${4:-}" in'), logs.indexOf('    esac'));

    expect(guard).toContain("*'['*|*']'*");
    expect(guard).toContain('exit 2');
    expect(guard).toContain('would match NOTHING');
  });

  /**
   * ⚠️ AND IT MUST NOT TIDY THE FILTER UP. `cliffhanger] run` also matches
   * nothing, so a stripped filter can still miss while looking like it
   * searched — a tool quietly answering a different question, which is the
   * fault the whole directory exists against. Exit 2 is the honest answer.
   */
  it('does not strip the brackets and search anyway', () => {
    expect(logs).not.toMatch(/tr\s+-d\s+["']?\[/);
    expect(logs).not.toMatch(/sed[^\n]*s\/\\?\[/);
    expect(logs).toContain('STRIPPING THE BRACKETS WOULD BE WORSE');
  });

  it('keeps the measurement that proved it, so nobody re-derives it', () => {
    expect(logs).toContain('filter "[cliffhanger]"  →  0 lines');
    expect(logs).toContain('filter "cliffhanger"    →  2 lines');
  });
});

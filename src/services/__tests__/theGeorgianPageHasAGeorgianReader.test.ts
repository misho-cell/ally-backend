import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * ROW 274 SHIPPED WITH NO WAY TO READ IT FROM HERE, AND THAT IS HOW THE
 * ENGLISH PARAGRAPHS SURVIVED A DAY ON A GEORGIAN PAGE.
 *
 * `pilot.sh` could read `/admin/pilot/report` — row 256 — and nothing else.
 * `/admin/pilot/outcomes` had no named capability at all, so the only reader
 * the page ever had was the tester's eyes on a screen. They found it, on
 * 27 September, twenty-two hours after it went out: a Georgian heading over
 * four English explanations. That is a person doing a script's job.
 *
 * ⚠️ AND THE SCRIPT WOULD HAVE BEEN USELESS BY DEFAULT. `python3 -m json.tool`
 * — which is what every other branch of that file pipes into — escapes
 * non-ASCII, so Georgian prints as მხო... A reader checking
 * „does this page read in Georgian" would have seen backslashes either way
 * and learned exactly nothing. The question the command exists to answer is
 * the question its default output cannot answer, which is the shape of the
 * whole day: THE MEASUREMENT WAS RIGHT AND THE QUESTION WAS DIFFERENT.
 *
 * So what is pinned here is not that the command exists. It is that the
 * command can see what it was added to see.
 */
const PILOT = readFileSync(join(__dirname, '..', '..', '..', 'scripts', 'ops', 'pilot.sh'), 'utf8');

const OUTCOMES = PILOT.slice(PILOT.indexOf('\n  outcomes)'), PILOT.indexOf('\n  keys)'));

/**
 * The comment in that branch NAMES `json.tool` in order to say why it is
 * wrong, so an assertion that the branch does not use it has to read the code
 * and not the prose. The first version of this test failed on my own
 * explanation of the thing it was checking for.
 */
const CODE = OUTCOMES.split('\n')
  .filter((line) => !line.trim().startsWith('#'))
  .join('\n');

describe('the page written for a Georgian reader can be read as one', () => {
  it('reads the outcomes route, which is not the report route', () => {
    expect(CODE).toContain('/admin/pilot/outcomes');
    expect(CODE).not.toContain('/admin/pilot/report');
  });

  /** The one line that decides whether the output answers the question. */
  it('prints Georgian as Georgian and not as escapes', () => {
    expect(CODE).toContain('ensure_ascii=False');
    expect(CODE).not.toContain('json.tool');
  });

  /**
   * Said in the file rather than remembered, because the next person to tidy
   * this will reach for `json.tool` to match the branches around it.
   */
  it('says in the script why json.tool is wrong here', () => {
    expect(PILOT).toContain('escapes non-ASCII');
  });

  /**
   * The two routes answer different questions — ACTIVITY per day against
   * OUTCOMES per person — and the reason they were never merged is written on
   * the service. A reader of the script gets the same warning.
   */
  it('warns that the two pilot routes are not the same question', () => {
    expect(PILOT).toContain('ACTIVITY PER DAY');
    expect(PILOT).toContain('OUTCOMES PER PERSON');
  });

  /** `days` is passed through, so a window can be moved without editing this. */
  it('takes the window as an argument', () => {
    expect(CODE).toContain('days=${2:-28}');
  });
});

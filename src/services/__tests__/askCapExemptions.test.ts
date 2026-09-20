/**
 * The seat's 336 — five fictional accounts with full mailboxes, and every
 * send-side row on the plate untestable because of it.
 *
 * They asked for the cap to be raised „for the six test accounts only". It is
 * not per-account: both caps are environment variables read once at boot, so
 * raising either raises it for every real person at the same time. This is the
 * narrow version — named accounts stop being protected and nobody else moves.
 *
 * The module reads the environment at import, so each case reloads it in an
 * isolated registry with the value it is about.
 */
function withEnv<T>(
  value: string | undefined,
  read: (m: typeof import('../askCapExemptions')) => T,
): T {
  const before = process.env.ASK_CAP_EXEMPT_USER_IDS;
  if (value === undefined) delete process.env.ASK_CAP_EXEMPT_USER_IDS;
  else process.env.ASK_CAP_EXEMPT_USER_IDS = value;
  let out: T;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    out = read(require('../askCapExemptions') as typeof import('../askCapExemptions'));
  });
  if (before === undefined) delete process.env.ASK_CAP_EXEMPT_USER_IDS;
  else process.env.ASK_CAP_EXEMPT_USER_IDS = before;
  return out!;
}

describe('the receiving caps stay on unless somebody names an account', () => {
  it('is empty and inert when the variable is unset — the production case', () => {
    expect(withEnv(undefined, (m) => m.receivingCapsAreOff(171870))).toBe(false);
    expect(withEnv(undefined, (m) => m.exemptAccountIds())).toEqual([]);
  });

  it('is empty and inert for an empty string, which is how a var gets cleared', () => {
    expect(withEnv('', (m) => m.receivingCapsAreOff(171870))).toBe(false);
  });

  it('lifts the cap only for the accounts named', () => {
    const ids = '171870,171871,171872';
    expect(withEnv(ids, (m) => m.receivingCapsAreOff(171871))).toBe(true);
    // Everybody else — every real person in the base — is untouched.
    expect(withEnv(ids, (m) => m.receivingCapsAreOff(501))).toBe(false);
    expect(withEnv(ids, (m) => m.receivingCapsAreOff(160584))).toBe(false);
  });

  it('reads a number and a string as the same account', () => {
    expect(withEnv('171870', (m) => m.receivingCapsAreOff(171870))).toBe(true);
    expect(withEnv('171870', (m) => m.receivingCapsAreOff('171870'))).toBe(true);
  });

  it('survives the spacing a person actually types', () => {
    expect(withEnv(' 171870 , 171871 ,', (m) => m.receivingCapsAreOff(171871))).toBe(true);
    expect(withEnv(' 171870 , 171871 ,', (m) => m.exemptAccountIds())).toEqual([
      '171870',
      '171871',
    ]);
  });

  it('never matches an empty id, which is what a stray comma would produce', () => {
    // '' as a user id would be a set member that String(undefined-ish) could
    // hit. It must not exist at all.
    expect(withEnv('171870,,', (m) => m.exemptAccountIds())).toEqual(['171870']);
    expect(withEnv('171870,,', (m) => m.receivingCapsAreOff(''))).toBe(false);
  });
});

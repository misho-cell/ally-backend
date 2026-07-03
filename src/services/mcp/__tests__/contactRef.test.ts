import { decodeContactRef, encodeContactRef } from '../contactRef';

const USER_A = '7';
const USER_B = '8';
const PHONE = '+995599123456';

beforeAll(() => {
  process.env.MCP_REF_SECRET = 'test-secret-for-contact-refs';
});

describe('contactRef', () => {
  it('round-trips a phone for the same user', () => {
    const ref = encodeContactRef(USER_A, PHONE);
    expect(ref.startsWith('c_')).toBe(true);
    expect(ref).not.toContain(PHONE);
    expect(decodeContactRef(USER_A, ref)).toBe(PHONE);
  });

  it('is deterministic — the same contact always gets the same ref', () => {
    expect(encodeContactRef(USER_A, PHONE)).toBe(encodeContactRef(USER_A, PHONE));
  });

  it('rejects a ref minted for another user', () => {
    const ref = encodeContactRef(USER_A, PHONE);
    expect(decodeContactRef(USER_B, ref)).toBeNull();
  });

  it('rejects tampered and garbage refs', () => {
    const ref = encodeContactRef(USER_A, PHONE);
    const tampered = ref.slice(0, -2) + (ref.endsWith('AA') ? 'BB' : 'AA');
    expect(decodeContactRef(USER_A, tampered)).toBeNull();
    expect(decodeContactRef(USER_A, 'c_not-a-real-ref')).toBeNull();
    expect(decodeContactRef(USER_A, PHONE)).toBeNull();
    expect(decodeContactRef(USER_A, '')).toBeNull();
  });
});

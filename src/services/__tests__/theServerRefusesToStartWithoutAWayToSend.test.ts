/**
 * ⚠️ A CONFIGURATION THAT FAILS AT BOOT INSTEAD OF ON SOMEBODY'S FIRST LOGIN.
 *
 * Block-mode sabotage, 27 September: the credential check at the top of
 * `whatsapp.service.ts` falsified, and 4,993 tests stayed green.
 *
 * WhatsApp is how a one-time code reaches a person who is signing in. Without
 * this throw the module loads happily with no credentials, the URL is built
 * with `undefined` in it, the Authorization header says „Bearer undefined",
 * and the failure arrives at the moment A REAL PERSON IS WAITING FOR A CODE.
 *
 * That is the 25 September SMS story with a different provider: the founder's
 * first real invitation went to somebody without WhatsApp, the SMS account was
 * inactive, and the first anybody knew of it was the locked-out stranger
 * saying so. The lesson written down that day was that a missing credential
 * must announce itself where we can see it, not where a person meets it.
 *
 * So the value of this line is entirely about WHEN it fails. A server that
 * will not start is a deploy that goes red in front of us; a server that
 * starts and cannot send is a person who cannot get in, and nothing on our
 * side saying why.
 *
 * ⚠️ AND THAT IS A COUPLING WORTH SEEING CLEARLY: the whole product refuses to
 * boot without WhatsApp credentials. That is the existing decision and this
 * test HOLDS it rather than argues for it — if somebody decides a missing
 * WhatsApp should degrade instead of stopping the boot, this test is the place
 * that says what is being traded away.
 */
describe('whatsapp.service refuses to load without credentials', () => {
  const PHONE = process.env.WHATSAPP_PHONE_ID;
  const TOKEN = process.env.WHATSAPP_TOKEN;

  afterEach(() => {
    if (PHONE === undefined) delete process.env.WHATSAPP_PHONE_ID;
    else process.env.WHATSAPP_PHONE_ID = PHONE;
    if (TOKEN === undefined) delete process.env.WHATSAPP_TOKEN;
    else process.env.WHATSAPP_TOKEN = TOKEN;
    jest.resetModules();
  });

  it.each([
    ['neither', false, false],
    ['no phone id', false, true],
    ['no token', true, false],
  ])('throws at import with %s', async (_name, phone, token) => {
    if (phone) process.env.WHATSAPP_PHONE_ID = 'x';
    else delete process.env.WHATSAPP_PHONE_ID;
    if (token) process.env.WHATSAPP_TOKEN = 'y';
    else delete process.env.WHATSAPP_TOKEN;
    jest.resetModules();

    await expect(import('../whatsapp.service')).rejects.toThrow(
      'WHATSAPP_PHONE_ID and WHATSAPP_TOKEN must be set in environment variables',
    );
  });

  /** And it loads when both are there, or the test above would pass on a typo. */
  it('loads when both are set', async () => {
    process.env.WHATSAPP_PHONE_ID = 'x';
    process.env.WHATSAPP_TOKEN = 'y';
    jest.resetModules();

    const mod = await import('../whatsapp.service');

    expect(typeof mod.sendWhatsAppMessage).toBe('function');
  });
});

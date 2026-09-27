import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * ⚠️ THE AVATAR'S CONTENT TYPE IS STORED FROM THE UPLOAD AND SENT BACK AS THE
 * RESPONSE HEADER. THE ALLOW-LIST IS THE ONLY THING BETWEEN THOSE TWO FACTS.
 *
 * Block-mode sabotage of `profile.routes.ts`, 27 September:
 * `if (!ALLOWED_AVATAR_MIME.has(mime)) {` falsified, and 4,989 tests stayed
 * green. Nothing else in the path repeats the check — the INSERT stores
 * whatever `mime` it is handed, and `GET /profile/photo` does:
 *
 *     res.status(200).set('Content-Type', row.mime)
 *     res.send(row.data)
 *
 * So with that line dead, a person can upload `text/html` — or
 * `image/svg+xml`, which is why it is deliberately NOT on the list — and the
 * API serves their bytes from our own origin under that type. That is stored
 * cross-site scripting with the server doing the serving, and it is one `if`
 * away.
 *
 * ⚠️ FOLLOWED DOWN A LAYER BEFORE WRITING THIS, because most survivors of that
 * sweep are „a worse error message" rather than a hole. Here there is no layer
 * below: the insert does not validate, the read does not validate, and the
 * header is taken from the row.
 *
 * These are source assertions — the handler is a closure and this repository
 * has no supertest — and they assert the whole `if (...) {`, never the
 * condition alone. The precedent and the reason are in
 * `theTypedStopIsReadFirst` and in the sweep's own header.
 */
const routes = readFileSync(join(__dirname, '..', 'profile.routes.ts'), 'utf8');

describe('the avatar upload refuses a type it will later serve', () => {
  it('holds the condition itself', () => {
    expect(routes).toContain('if (!ALLOWED_AVATAR_MIME.has(mime)) {');
  });

  /**
   * THE LIST IS THREE IMAGE TYPES, AND SVG IS NOT ONE OF THEM. An SVG is a
   * document that can carry script; accepting it would pass the „is an image"
   * reading of this rule and defeat its purpose.
   */
  it('allows three raster types and not SVG', () => {
    expect(routes).toContain(
      "const ALLOWED_AVATAR_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);",
    );
    expect(routes).not.toContain('image/svg');
  });

  /** Refused before anything is stored — a row written is a row that will be served. */
  it('refuses before the insert', () => {
    const guardAt = routes.indexOf('if (!ALLOWED_AVATAR_MIME.has(mime)) {');
    const insertAt = routes.indexOf('INSERT INTO user_avatars');

    expect(guardAt).toBeGreaterThan(0);
    expect(insertAt).toBeGreaterThan(guardAt);
  });

  /**
   * AND THE REASON THE GUARD CANNOT BE DROPPED, pinned where somebody will
   * read it: the stored value becomes the response header. If this ever stops
   * being true — a fixed `image/jpeg` on the way out, say — this assertion
   * fails and whoever changed it updates the note above.
   */
  it('serves the stored type straight back, which is why the list matters', () => {
    expect(routes).toContain("res.status(200).set('Content-Type', row.mime)");
  });
});

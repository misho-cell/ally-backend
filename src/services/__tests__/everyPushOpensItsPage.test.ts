import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { AI_NOTIFICATION_PUSH_URL } from '../aiNotification.service';

/**
 * #1816: a tap on a notification opens the app on the conversation or card it
 * is about. A push without `url` lands wherever the app defaults, and the AI
 * engagement push was the one sender left without it. Every call must carry
 * its page; a call that passes a helper's result names the helper here.
 */
const SRC = join(__dirname, '..', '..');
/** Helpers that build a whole payload; each is tested where it lives. */
const PAYLOAD_HELPERS = ['syncReminderPush('];
/** How far into a call its object literal can reach. */
const CALL_WINDOW_LINES = 14;
const CALL_RE = /sendPushNotification\(/u;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : sourceFiles(path);
    return path.endsWith('.ts') ? [path] : [];
  });
}

function callsWithoutUrl(path: string): string[] {
  const lines = readFileSync(path, 'utf8').split('\n');
  return lines.flatMap((line, at) => {
    if (!CALL_RE.test(line) || /function sendPushNotification/u.test(line)) return [];
    const call = lines.slice(at, at + CALL_WINDOW_LINES).join('\n');
    const carriesUrl = /\burl\b/u.test(call) || PAYLOAD_HELPERS.some((h) => call.includes(h));
    return carriesUrl ? [] : [`${path}:${at + 1}`];
  });
}

describe('every push opens its own page (#1816)', () => {
  it('no call to sendPushNotification goes without a url', () => {
    expect(sourceFiles(SRC).flatMap(callsWithoutUrl)).toEqual([]);
  });

  it('the engagement push lands on the conversation', () => {
    expect(AI_NOTIFICATION_PUSH_URL).toBe('/chat');
  });
});

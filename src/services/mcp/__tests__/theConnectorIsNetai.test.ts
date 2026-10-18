import { readFileSync } from 'fs';
import { join } from 'path';
import { MCP_SERVER_NAME, MCP_SERVER_TITLE } from '../texts';
import { NETAI_LOOP_VIDEO_URL, NETAI_STILL_IMAGE_URL } from '../netaiFigure';

const SERVER = readFileSync(join(__dirname, '..', 'mcpServer.ts'), 'utf8');
const PAGES = readFileSync(
  join(__dirname, '..', '..', '..', 'api', 'routes', 'oauthPages.ts'),
  'utf8',
);

/** #5677 (the founder's D818 / D819): the connector is Netai, and shows her. */
describe('the connector carries the product’s name and figure', () => {
  it('is named Netai, never Ally', () => {
    expect(MCP_SERVER_NAME).toBe('Netai');
    expect(MCP_SERVER_TITLE).toBe('Netai');
  });

  it('offers her still image as the icon a client draws', () => {
    expect(NETAI_STILL_IMAGE_URL).toMatch(/^https:\/\/www\.netai\.guru\/.+\.jpg$/u);
    expect(SERVER).toContain('icons: [{ src: NETAI_STILL_IMAGE_URL');
  });

  it('shows her moving on the sign-in page we own, with a still poster', () => {
    expect(NETAI_LOOP_VIDEO_URL).toMatch(/\.mp4$/u);
    expect(PAGES).toContain('autoplay muted loop playsinline');
    expect(PAGES).toContain('poster="${NETAI_LOOP_POSTER_URL}"');
    expect(PAGES).not.toContain('LOGO_SVG');
  });
});

describe('the connector’s texts say Netai and are the app’s (Misho’s „კი", 12:22Z)', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const texts = require('../texts') as typeof import('../texts');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const chat = require('../../chat.service') as typeof import('../../chat.service');

  it('names Ally only for the legacy accounts', () => {
    const withoutLegacy = texts.MCP_SERVER_INSTRUCTIONS.replace(/old Ally account/gu, '');
    expect(withoutLegacy).not.toMatch(/\bAlly\b/u);
    for (const text of Object.values(texts.TOOL_TEXTS)) {
      expect(text.description.replace(/old Ally\s*'?\s*\+?\s*'?\s*account/gu, '')).not.toMatch(
        /\bAlly\b(?!_)/u,
      );
    }
  });

  it('gives a tool the app also has the app’s own text, with the ref sentence where it speaks of a phone', () => {
    expect(texts.connectorDescription('get_my_tasks')).toBe(chat.toolDescription('get_my_tasks'));
    expect(texts.connectorDescription('block_contact')).toContain(
      chat.toolDescription('block_contact'),
    );
    expect(texts.connectorDescription('block_contact')).toContain('contact_ref');
  });

  it('keeps its own text for a tool only the connector has', () => {
    expect(texts.connectorDescription('search_contacts')).toBe(
      texts.TOOL_TEXTS.search_contacts.description,
    );
  });
});

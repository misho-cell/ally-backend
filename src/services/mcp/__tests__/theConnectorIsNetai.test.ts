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

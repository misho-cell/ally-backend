/**
 * #5677 (D819, 18 Oct): Netai herself (D702), as the app serves her. A still
 * image wherever a client takes only an icon; her loop wherever we own the page.
 */
const NETAI_ASSETS = 'https://www.netai.guru/assets/ally';
export const NETAI_STILL_IMAGE_URL = `${NETAI_ASSETS}/ally-avatar.jpg`;
/** The founder's 67142: the app's own clip — her walk, as the home card plays it (AnimFigure). */
export const NETAI_LOOP_VIDEO_URL = `${NETAI_ASSETS}/anim/ally-walk.mp4`;
export const NETAI_LOOP_POSTER_URL = `${NETAI_ASSETS}/anim/ally-walk-poster.jpg`;
/** The same figure as a 256×256 PNG under 10 KB, served by this backend (connectorAssets.routes). */
export const NETAI_ICON_URL = 'https://api.netai.guru/assets/netai-icon-256.png';

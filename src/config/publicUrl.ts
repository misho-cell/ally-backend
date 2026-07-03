// Public origin of this backend — used for OAuth discovery metadata and the
// URLs claude.ai redirects through. Override with PUBLIC_BASE_URL when the
// deployment moves (custom domain, staging).
const DEFAULT_PUBLIC_BASE_URL = 'https://ally-backend-production.up.railway.app';

export const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL ?? DEFAULT_PUBLIC_BASE_URL).replace(
  /\/+$/,
  '',
);

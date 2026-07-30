// Public origin of this backend — used for OAuth discovery metadata and the
// URLs claude.ai redirects through. Override with PUBLIC_BASE_URL when the
// deployment moves (custom domain, staging). The old default pointed at a
// Railway domain that has since been deleted — the fallback must always be
// the CURRENT canonical API host.
const DEFAULT_PUBLIC_BASE_URL = 'https://api.netai.guru';

export const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL ?? DEFAULT_PUBLIC_BASE_URL).replace(
  /\/+$/,
  '',
);

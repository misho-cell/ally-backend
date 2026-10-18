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

/**
 * #5677 (the tester's 67142, 18 Oct): people who added the connector as „Ally"
 * reach it at the old host, api.allyapp.one, which still serves this backend.
 * RFC 9728 has a client refuse resource metadata whose `resource` is not the
 * address it called — and the old host answered with the new one's. So each
 * known host gets its own resource address; the authorization server stays one.
 */
const CONNECTOR_HOSTS: ReadonlySet<string> = new Set(['api.netai.guru', 'api.allyapp.one']);

/** The origin a connector called us at, when it is one of ours; the canonical one otherwise. */
export function connectorOriginFor(host: string | undefined): string {
  const name = (host ?? '').trim().toLowerCase();
  return CONNECTOR_HOSTS.has(name) ? `https://${name}` : PUBLIC_BASE_URL;
}

import { NETAI_LOOP_POSTER_URL, NETAI_LOOP_VIDEO_URL } from '../../services/mcp/netaiFigure';

// Server-rendered pages for the OAuth authorize flow (phone → WhatsApp code),
// styled to match the Netai app: warm off-white background, rounded card, sage
// green button, Netai's figure. No client JS beyond form posts; everything
// user-controlled is escaped.

export interface AuthorizePageParams {
  readonly clientId: string;
  readonly redirectUri: string;
  readonly state: string;
  readonly codeChallenge: string;
  readonly scope: string;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * #5677 (D819): the sign-in page shows Netai herself, moving as in the app — a
 * muted loop with her still image as its poster, so a browser that will not
 * play it still shows her.
 */
const NETAI_FIGURE = `<video class="figure" src="${NETAI_LOOP_VIDEO_URL}" poster="${NETAI_LOOP_POSTER_URL}"
  autoplay muted loop playsinline aria-hidden="true"></video>`;

function page(body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Netai — Sign in</title>
<style>
  body { font-family: system-ui, -apple-system, sans-serif; background: #FAF9F5; margin: 0;
         display: flex; flex-direction: column; justify-content: center; align-items: center;
         min-height: 100vh; color: #22302A; }
  .logo { display: flex; align-items: center; gap: 10px; margin-bottom: 28px; }
  .logo span { font-size: 28px; font-weight: 700; letter-spacing: -0.5px; }
  .figure { width: 64px; height: 64px; border-radius: 50%; object-fit: cover; }
  .card { background: #fff; border: 1px solid #E8E5DA; border-radius: 24px;
          padding: 36px; max-width: 400px; width: calc(90% - 72px);
          box-shadow: 0 2px 12px rgba(34, 48, 42, 0.04); }
  h1 { font-size: 19px; margin: 0 0 6px; }
  p { color: #6E7268; font-size: 14px; line-height: 1.5; margin: 0 0 22px; }
  input[type=text], input[type=tel] { width: 100%; box-sizing: border-box; padding: 14px 16px;
          font-size: 16px; border: 1px solid #DCD9CE; border-radius: 12px;
          margin-bottom: 16px; background: #fff; color: #22302A; }
  input:focus { outline: none; border-color: #5C8B68; }
  button { width: 100%; padding: 14px; font-size: 16px; font-weight: 600; border: 0;
          border-radius: 14px; background: #5C8B68; color: #fff; cursor: pointer; }
  button:hover { background: #517B5C; }
  .error { color: #B4483E; font-size: 14px; margin: 0 0 16px; }
</style>
</head>
<body>
<div class="logo">${NETAI_FIGURE}<span>Netai</span></div>
<div class="card">${body}</div>
</body>
</html>`;
}

function hiddenFields(params: AuthorizePageParams): string {
  const fields: [string, string][] = [
    ['client_id', params.clientId],
    ['redirect_uri', params.redirectUri],
    ['state', params.state],
    ['code_challenge', params.codeChallenge],
    ['scope', params.scope],
  ];
  return fields
    .map(([name, value]) => `<input type="hidden" name="${name}" value="${escapeHtml(value)}">`)
    .join('\n');
}

export function renderPhonePage(params: AuthorizePageParams, error?: string): string {
  return page(`
<h1>Connect Claude to Netai</h1>
<p>Claude is requesting access to your Netai network. Enter your phone number — we'll send a code to your WhatsApp.</p>
${error ? `<p class="error">${escapeHtml(error)}</p>` : ''}
<form method="post" action="/oauth/authorize/send-code">
${hiddenFields(params)}
<input type="tel" name="phone" placeholder="+995 5XX XXX XXX" autocomplete="tel" required>
<button type="submit">Send code</button>
</form>`);
}

export function renderCodePage(params: AuthorizePageParams, phone: string, error?: string): string {
  return page(`
<h1>Enter the code</h1>
<p>We sent a code to your WhatsApp (${escapeHtml(phone)}).</p>
${error ? `<p class="error">${escapeHtml(error)}</p>` : ''}
<form method="post" action="/oauth/authorize/verify">
${hiddenFields(params)}
<input type="hidden" name="phone" value="${escapeHtml(phone)}">
<input type="text" name="code" placeholder="Code" inputmode="numeric" autocomplete="one-time-code" required>
<button type="submit">Verify</button>
</form>`);
}

export function renderErrorPage(message: string): string {
  return page(`<h1>Something went wrong</h1><p class="error">${escapeHtml(message)}</p>`);
}

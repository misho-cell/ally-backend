// Server-rendered pages for the OAuth authorize flow (phone → WhatsApp code).
// No client JS beyond form posts; everything user-controlled is escaped.

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

function page(body: string): string {
  return `<!doctype html>
<html lang="ka">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Ally — შესვლა</title>
<style>
  body { font-family: system-ui, sans-serif; background: #f5f5f7; margin: 0;
         display: flex; justify-content: center; align-items: center; min-height: 100vh; }
  .card { background: #fff; border-radius: 16px; padding: 32px; max-width: 360px; width: 90%;
          box-shadow: 0 4px 24px rgba(0,0,0,.08); }
  h1 { font-size: 20px; margin: 0 0 4px; }
  p { color: #555; font-size: 14px; margin: 0 0 20px; }
  input[type=text], input[type=tel] { width: 100%; box-sizing: border-box; padding: 12px;
          font-size: 16px; border: 1px solid #ccc; border-radius: 8px; margin-bottom: 14px; }
  button { width: 100%; padding: 12px; font-size: 16px; border: 0; border-radius: 8px;
          background: #111; color: #fff; cursor: pointer; }
  .error { color: #c0392b; font-size: 14px; margin: 0 0 14px; }
</style>
</head>
<body><div class="card">${body}</div></body>
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
<h1>Ally-სთან დაკავშირება</h1>
<p>Claude ითხოვს წვდომას შენს Ally-ქსელზე. შესასვლელად ჩაწერე ტელეფონის ნომერი — WhatsApp-ზე კოდი მოგივა.</p>
${error ? `<p class="error">${escapeHtml(error)}</p>` : ''}
<form method="post" action="/oauth/authorize/send-code">
${hiddenFields(params)}
<input type="tel" name="phone" placeholder="+995 5XX XXX XXX" autocomplete="tel" required>
<button type="submit">კოდის გამოგზავნა</button>
</form>`);
}

export function renderCodePage(params: AuthorizePageParams, phone: string, error?: string): string {
  return page(`
<h1>კოდი გამოგზავნილია</h1>
<p>WhatsApp-ზე (${escapeHtml(phone)}) მიღებული კოდი ჩაწერე.</p>
${error ? `<p class="error">${escapeHtml(error)}</p>` : ''}
<form method="post" action="/oauth/authorize/verify">
${hiddenFields(params)}
<input type="hidden" name="phone" value="${escapeHtml(phone)}">
<input type="text" name="code" placeholder="კოდი" inputmode="numeric" autocomplete="one-time-code" required>
<button type="submit">დადასტურება</button>
</form>`);
}

export function renderErrorPage(message: string): string {
  return page(`<h1>შეცდომა</h1><p class="error">${escapeHtml(message)}</p>`);
}

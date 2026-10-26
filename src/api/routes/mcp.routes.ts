import { NextFunction, Request, Response, Router } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { connectorOriginFor } from '../../config/publicUrl';
import { query } from '../../db/postgres/client';
import { verifyToken } from '../../services/auth.service';
import { isOAuthAccessToken, validateAccessToken } from '../../services/oauth.service';
import { buildConnectorServer } from '../../services/mcp/mcpServer';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { requireSubscription } from '../middleware/subscription.middleware';
import { rateLimit } from '../middleware/rateLimit.middleware';

// claude.ai custom connector endpoint (MCP Streamable HTTP). Bearer is either
// an OAuth access token (claude.ai flow) or the app's own user JWT (internal
// testing). Stateless — a fresh server+transport per request, no session ids;
// GET (SSE resume) and DELETE (session close) don't apply.

const router = Router();

const MCP_FLAG = 'mcp_enabled';
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_REQUESTS = 60;
const JSONRPC_INTERNAL_ERROR = -32603;
const JSONRPC_SERVER_ERROR = -32000;

// Per MCP auth spec the 401 points the client at the resource metadata, which
// leads it to our authorization server for the OAuth flow.
function sendUnauthorized(req: Request, res: Response): void {
  res.setHeader(
    'WWW-Authenticate',
    `Bearer resource_metadata="${connectorOriginFor(req.get('host'))}/.well-known/oauth-protected-resource"`,
  );
  res.status(401).json({ success: false, error: 'Authorization required' });
}

async function authenticateMcp(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    sendUnauthorized(req, res);
    return;
  }
  const token = header.split(' ')[1];

  if (isOAuthAccessToken(token)) {
    try {
      const userId = await validateAccessToken(token);
      if (userId === null) {
        sendUnauthorized(req, res);
        return;
      }
      (req as AuthenticatedRequest).user = { userId, role: 'user' };
      next();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[mcp] token validation failed:', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
    return;
  }

  try {
    const payload = verifyToken(token);
    if (payload.role !== 'user') {
      res.status(403).json({
        success: false,
        error: 'ეს სესია ადმინისტრატორისაა — MCP მხოლოდ მომხმარებლის ანგარიშით მუშაობს',
        reason: 'admin_token_on_user_endpoint',
      });
      return;
    }
    (req as AuthenticatedRequest).user = payload;
    next();
  } catch {
    sendUnauthorized(req, res);
  }
}

async function requireMcpEnabled(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await query<{ enabled: boolean }>(
      'SELECT enabled FROM app_flags WHERE flag = $1 LIMIT 1',
      [MCP_FLAG],
    );
    if (result.rows[0]?.enabled !== true) {
      res
        .status(403)
        .json({ success: false, error: 'MCP კონექტორი ჯერ გამორთულია', reason: 'mcp_disabled' });
      return;
    }
    next();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[mcp] flag check failed:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

async function handleMcpPost(req: Request, res: Response): Promise<void> {
  const userId = (req as AuthenticatedRequest).user.userId;
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  try {
    const server = await buildConnectorServer(userId);
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[mcp] request failed:', err);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: JSONRPC_INTERNAL_ERROR, message: 'Internal server error' },
        id: null,
      });
    }
  }
}

/**
 * Iro, 26 Oct: a person asked an AI chat to „connect Netai's MCP", the chat
 * opened this address like a page and showed him the bare 405 below. A browser
 * (Accept: text/html) is shown how to add the connector instead; a client still
 * gets the 405 the protocol expects.
 */
const HOW_TO_CONNECT_PAGE = `<!doctype html><html lang="ka"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Netai — კონექტორი</title>
<style>body{font-family:system-ui,sans-serif;max-width:560px;margin:24px auto;padding:0 16px;line-height:1.5}</style>
</head><body><h1>Netai-ს დაკავშირება Claude-თან</h1>
<p>ეს მისამართი გვერდად არ იხსნება — ის Claude-ში კონექტორად ემატება.</p>
<ol><li>ბრაუზერში გახსენი <b>claude.ai</b> და შედი (აპლიკაციაში კონექტორი არ ემატება).</li>
<li>მენიუ → <b>Customize</b> → <b>Connectors</b> → <b>Add custom connector</b>.</li>
<li>Name: <b>Netai</b> · URL: <b>https://api.netai.guru/mcp</b> → <b>Add</b>.</li>
<li><b>Connect</b> → ჩაწერე შენი ნომერი და მოსული კოდი.</li></ol>
<p>მზადაა — ამის მერე Claude-ის აპლიკაციაშიც ჩანს.</p></body></html>`;

function methodNotAllowed(req: Request, res: Response): void {
  if (req.method === 'GET' && (req.headers.accept ?? '').includes('text/html')) {
    res.status(200).type('html').send(HOW_TO_CONNECT_PAGE);
    return;
  }
  res.status(405).json({
    jsonrpc: '2.0',
    error: {
      code: JSONRPC_SERVER_ERROR,
      message: 'Method not allowed — this MCP server is stateless; use POST.',
    },
    id: null,
  });
}

router.post(
  '/',
  authenticateMcp,
  rateLimit({ windowMs: RATE_WINDOW_MS, max: RATE_MAX_REQUESTS }),
  requireMcpEnabled,
  requireSubscription,
  handleMcpPost,
);
router.get('/', methodNotAllowed);
router.delete('/', methodNotAllowed);

export default router;

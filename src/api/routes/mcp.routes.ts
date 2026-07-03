import { NextFunction, Request, Response, Router } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { PUBLIC_BASE_URL } from '../../config/publicUrl';
import { query } from '../../db/postgres/client';
import { verifyToken } from '../../services/auth.service';
import { isOAuthAccessToken, validateAccessToken } from '../../services/oauth.service';
import { buildMcpServer } from '../../services/mcp/mcpServer';
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
function sendUnauthorized(res: Response): void {
  res.setHeader(
    'WWW-Authenticate',
    `Bearer resource_metadata="${PUBLIC_BASE_URL}/.well-known/oauth-protected-resource"`,
  );
  res.status(401).json({ success: false, error: 'Authorization required' });
}

async function authenticateMcp(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    sendUnauthorized(res);
    return;
  }
  const token = header.split(' ')[1];

  if (isOAuthAccessToken(token)) {
    try {
      const userId = await validateAccessToken(token);
      if (userId === null) {
        sendUnauthorized(res);
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
    sendUnauthorized(res);
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
  const server = buildMcpServer(userId);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  res.on('close', () => {
    void transport.close();
    void server.close();
  });
  try {
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

function methodNotAllowed(req: Request, res: Response): void {
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

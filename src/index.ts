import dotenv from 'dotenv';
import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import authRouter from './api/routes/auth.routes';
import chatRouter from './api/routes/chat.routes';
import adminRouter from './api/routes/admin.routes';
import contactsRouter from './api/routes/contacts.routes';
import notificationsRouter from './api/routes/notifications.routes';
import threadsRouter from './api/routes/threads.routes';
import requestsRouter from './api/routes/requests.routes';
import tasksRouter from './api/routes/tasks.routes';
import privacyRouter from './api/routes/privacy.routes';
import webhooksRouter from './api/routes/webhooks.routes';
import billingRouter from './api/routes/billing.routes';
import profileRouter from './api/routes/profile.routes';
import mcpRouter from './api/routes/mcp.routes';
import roQueryRouter from './api/routes/roQuery.routes';
import oauthRouter, { wellKnownRouter } from './api/routes/oauth.routes';
import { setupSwagger } from './swagger';
import { runMigrations } from './db/postgres/migrate';
import { checkCriticalIndexes } from './db/postgres/indexSanity';
import { EnrichmentJob } from './services/enrichment.job';
import { startSubscriptionCron } from './services/subscription.cron';
import { startAiNotificationCron } from './services/aiNotification.cron';
import { startChorusCampaignCron } from './services/chorusCampaign.cron';
import { startLabReportCron } from './services/labReport.cron';
import { startIdentityScanCron } from './services/identityScan.cron';
import { startRunReaper } from './services/runReaper.service';
import { startTaskTicker } from './services/taskEngine.service';
import { ApiResponse } from './types';

dotenv.config();

// Domain migration (29 Jul): netai.guru is the new home; allyapp.one stays
// allowed through the transition (installed PWAs keep working until the
// redirect ships), then gets removed. The retired Vercel origin stays out.
const ALLOWED_ORIGINS = [
  'https://netai.guru',
  'https://www.netai.guru',
  'https://allyapp.one',
  'https://www.allyapp.one',
];

// claude.ai (and other clients) derive the custom-connector icon from the
// API domain's favicon — serve the app's own logo instead of a 404.
const FAVICON_URL = 'https://netai.guru/favicon.ico';

const app = express();
// Behind Railway's proxy — trust X-Forwarded-For so req.ip is the real client.
app.set('trust proxy', 1);
// exposedHeaders lets the browser read Retry-After on 429 rate-limit responses.
app.use(cors({ origin: ALLOWED_ORIGINS, exposedHeaders: ['Retry-After'] }));

app.get('/favicon.ico', (req: Request, res: Response) => {
  res.redirect(FAVICON_URL);
});

// Webhook route must use raw body BEFORE express.json() to allow signature verification
app.use('/webhooks', express.raw({ type: 'application/json' }), webhooksRouter);

app.use(express.json({ limit: '10mb' }));
app.use('/auth', authRouter);
app.use('/chat', chatRouter);
app.use('/admin', adminRouter);
app.use('/contacts', contactsRouter);
app.use('/notifications', notificationsRouter);
app.use('/threads', threadsRouter);
app.use('/requests', requestsRouter);
app.use('/tasks', tasksRouter);
app.use('/privacy', privacyRouter);
app.use('/billing', billingRouter);
app.use('/profile', profileRouter);
app.use('/mcp', mcpRouter);
// Key-gated, read-only SQL window for the development assistant — exists only
// while RO_SQL_KEY + DATABASE_RO_URL are set on the server (see the route file).
app.use('/internal/ro-sql', roQueryRouter);
app.use('/oauth', oauthRouter);
app.use('/.well-known', wellKnownRouter);
setupSwagger(app);

app.use((req: Request, res: Response<ApiResponse<unknown>>) => {
  res.status(404).json({ success: false, error: 'Route not found' });
});

app.use((error: Error, req: Request, res: Response<ApiResponse<unknown>>, _next: NextFunction) => {
  // eslint-disable-next-line no-console
  console.error(error);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

const port = Number(process.env.PORT ?? 4000);

runMigrations()
  .then(() => {
    const server = app.listen(port, () => {
      // eslint-disable-next-line no-console
      console.log(`Server listening on port ${port}`);
    });
    server.timeout = 5 * 60 * 1000;
    // Ticket 7 task 12 item 2 — the intermittent 502s under concurrent MCP
    // calls (26 Aug 22:30–22:33, five origin_bad_gateway, always with 3–6
    // calls in flight, every retry clean): Node's DEFAULT keepAliveTimeout is
    // 5s, shorter than the edge proxy's idle window, so Node closes a
    // kept-alive socket at the exact moment the proxy assigns it a new
    // request — the proxy sees a reset and reports the origin bad. The
    // server-side close must come LATER than the proxy's: keep-alive well
    // above the edge idle timeout, and headersTimeout above keepAliveTimeout
    // so a socket can never out-live its header clock.
    server.keepAliveTimeout = 95_000;
    server.headersTimeout = 100_000;
    EnrichmentJob.startCron();
    startSubscriptionCron();
    startAiNotificationCron();
    startRunReaper();
    startTaskTicker();
    startChorusCampaignCron();
    startLabReportCron();
    startIdentityScanCron();
    // Fire-and-forget: warns in logs if a search-critical index is missing.
    void checkCriticalIndexes();
  })
  .catch((err: unknown) => {
    // eslint-disable-next-line no-console
    console.error('[migrate] FATAL: migration failed, server will not start', err);
    process.exit(1);
  });

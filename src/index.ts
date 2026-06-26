import dotenv from 'dotenv';
import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import authRouter from './api/routes/auth.routes';
import chatRouter from './api/routes/chat.routes';
import adminRouter from './api/routes/admin.routes';
import contactsRouter from './api/routes/contacts.routes';
import notificationsRouter from './api/routes/notifications.routes';
import threadsRouter from './api/routes/threads.routes';
import webhooksRouter from './api/routes/webhooks.routes';
import billingRouter from './api/routes/billing.routes';
import profileRouter from './api/routes/profile.routes';
import { setupSwagger } from './swagger';
import { runMigrations } from './db/postgres/migrate';
import { EnrichmentJob } from './services/enrichment.job';
import { startSubscriptionCron } from './services/subscription.cron';
import { startAiNotificationCron } from './services/aiNotification.cron';
import { ApiResponse } from './types';

dotenv.config();

const ALLOWED_ORIGINS = [
  'https://allyapp.one',
  'https://www.allyapp.one',
  'https://ally-frontend-tau.vercel.app',
];

const app = express();
app.use(cors({ origin: ALLOWED_ORIGINS }));

// Webhook route must use raw body BEFORE express.json() to allow signature verification
app.use('/webhooks', express.raw({ type: 'application/json' }), webhooksRouter);

app.use(express.json({ limit: '10mb' }));
app.use('/auth', authRouter);
app.use('/chat', chatRouter);
app.use('/admin', adminRouter);
app.use('/contacts', contactsRouter);
app.use('/notifications', notificationsRouter);
app.use('/threads', threadsRouter);
app.use('/billing', billingRouter);
app.use('/profile', profileRouter);
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
    EnrichmentJob.startCron();
    startSubscriptionCron();
    startAiNotificationCron();
  })
  .catch((err: unknown) => {
    // eslint-disable-next-line no-console
    console.error('[migrate] FATAL: migration failed, server will not start', err);
    process.exit(1);
  });

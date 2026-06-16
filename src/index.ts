import dotenv from 'dotenv';
import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import authRouter from './api/routes/auth.routes';
import chatRouter from './api/routes/chat.routes';
import adminRouter from './api/routes/admin.routes';
import { ApiResponse } from './types';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use('/auth', authRouter);
app.use('/chat', chatRouter);
app.use('/admin', adminRouter);

const MIGRATION_SECRET = process.env.MIGRATION_SECRET ?? '';
app.get('/run-migration-003', async (req: Request, res: Response) => {
  if (!MIGRATION_SECRET || req.query.secret !== MIGRATION_SECRET) {
    res.status(403).json({ success: false, error: 'forbidden' });
    return;
  }
  const { query } = await import('./db/postgres/client');
  try {
    await query('DROP TABLE IF EXISTS conversations');
    await query(`CREATE TABLE conversations (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id    INTEGER NOT NULL,
      role       VARCHAR(10) NOT NULL CHECK (role IN ('user', 'assistant')),
      content    TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )`);
    await query('CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id, created_at DESC)');
    res.json({ success: true, message: 'migration 003 done' });
  } catch (e) {
    res.status(500).json({ success: false, error: e instanceof Error ? e.message : String(e) });
  }
});

app.use((req: Request, res: Response<ApiResponse<unknown>>) => {
  res.status(404).json({ success: false, error: 'Route not found' });
});

app.use((error: Error, req: Request, res: Response<ApiResponse<unknown>>, _next: NextFunction) => {
  // eslint-disable-next-line no-console
  console.error(error);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Server listening on port ${port}`);
});

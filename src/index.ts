import dotenv from 'dotenv';
import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import authRouter from './api/routes/auth.routes';
import chatRouter from './api/routes/chat.routes';
import adminRouter from './api/routes/admin.routes';
import contactsRouter from './api/routes/contacts.routes';
import { ApiResponse } from './types';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use('/auth', authRouter);
app.use('/chat', chatRouter);
app.use('/admin', adminRouter);
app.use('/contacts', contactsRouter);

app.use((req: Request, res: Response<ApiResponse<unknown>>) => {
  res.status(404).json({ success: false, error: 'Route not found' });
});

app.use((error: Error, req: Request, res: Response<ApiResponse<unknown>>, _next: NextFunction) => {
  // eslint-disable-next-line no-console
  console.error(error);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

const port = Number(process.env.PORT ?? 4000);
const server = app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Server listening on port ${port}`);
});

server.timeout = 5 * 60 * 1000; // 5 minutes

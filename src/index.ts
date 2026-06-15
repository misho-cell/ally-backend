import dotenv from 'dotenv';
import express, { NextFunction, Request, Response } from 'express';
import authRouter from './api/routes/auth.routes';
import chatRouter from './api/routes/chat.routes';
import adminRouter from './api/routes/admin.routes';
import { ApiResponse } from './types';

dotenv.config();

const app = express();
app.use(express.json());
app.use('/auth', authRouter);
app.use('/chat', chatRouter);
app.use('/admin', adminRouter);

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

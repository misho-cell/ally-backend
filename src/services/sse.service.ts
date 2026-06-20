import { EventEmitter } from 'events';
import { Response } from 'express';

const emitter = new EventEmitter();
emitter.setMaxListeners(0);

const KEEPALIVE_INTERVAL_MS = 30_000;

export function subscribeUserEvents(userId: string, res: Response): () => void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const keepalive = setInterval(() => {
    res.write(': ping\n\n');
  }, KEEPALIVE_INTERVAL_MS);

  const eventName = `user:${userId}`;

  function onEvent(data: unknown): void {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }

  emitter.on(eventName, onEvent);

  return (): void => {
    clearInterval(keepalive);
    emitter.off(eventName, onEvent);
  };
}

export function emitThreadCreated(userId: string, thread: unknown): void {
  emitter.emit(`user:${userId}`, { event: 'thread_created', thread });
}

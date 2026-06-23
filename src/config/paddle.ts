import { Paddle, Environment } from '@paddle/paddle-node-sdk';

const apiKey = process.env.PADDLE_API_KEY;
if (!apiKey) throw new Error('PADDLE_API_KEY environment variable is not set');

const paddle = new Paddle(apiKey, {
  environment: process.env.NODE_ENV === 'production' ? Environment.production : Environment.sandbox,
});

export default paddle;

import { Request, Response, Router } from 'express';
import { NETAI_ICON_PNG_BASE64 } from '../../services/mcp/netaiIconPng';

/**
 * #5677: Netai's connector icon at a public address, for the ChatGPT and
 * Claude forms that take an uploaded image rather than the server's icon.
 */
export const NETAI_ICON_PATH = '/netai-icon-256.png';
const ONE_DAY_SECONDS = 86_400;
const ICON = Buffer.from(NETAI_ICON_PNG_BASE64, 'base64');

const connectorAssetsRouter = Router();

connectorAssetsRouter.get(NETAI_ICON_PATH, (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', `public, max-age=${ONE_DAY_SECONDS}`);
  res.status(200).send(ICON);
});

export default connectorAssetsRouter;

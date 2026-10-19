import {createAdminRouter} from './routes/admin.js';
import { startReconciliationWorker } from './services/reconciliationWorker.js';
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { prisma } from './database/prisma.js';
import { createApiRouter } from './routes/api.js';
import { assertCloudConfiguration } from './config/cloudConfig.js';
import {firebaseAuth} from './config/firebaseAdmin.js';
import {configurePublicHosting} from './config/publicHosting.js';
import { HttpError, route } from './http.js';
import { errorHandler } from './http.js';

export function createApp() {
  const origins=configurePublicHosting(process.env);
  const app = express();
  let cloudConfigError = '';
  try { assertCloudConfiguration(process.env); } catch (error) { cloudConfigError = error instanceof Error ? error.message : 'Konfigurasi cloud belum siap'; }
  app.disable('x-powered-by');
  const proxyHops = Number(process.env.TRUST_PROXY_HOPS ?? 0);
  if (!Number.isInteger(proxyHops) || proxyHops < 0 || proxyHops > 5) throw new Error('Invalid TRUST_PROXY_HOPS');
  if (proxyHops) app.set('trust proxy', proxyHops);
  app.use(cors({ origin: origins, allowedHeaders: ['Content-Type', 'Authorization'] }));
  app.get('/api/health', (_req, res) => { res.setHeader('Cache-Control','no-store'); res.json({status:'ok'}); });
  app.use(express.json({ limit: '256kb' }));
  app.get('/health', (_req, res) => res.json({ status: 'PROCESS_ONLINE', cloud: cloudConfigError ? 'BLOCKED' : 'READINESS_CHECK_REQUIRED' }));
  app.get('/health/ready', route(async (_req, res) => {
    if (cloudConfigError) throw new HttpError(503, cloudConfigError);
    await prisma.$queryRaw`SELECT 1`;
    await firebaseAuth().listUsers(1);
    res.json({ status: 'READY', database: 'ONLINE', firebaseAuth: 'ONLINE' });
  }));
  app.use('/api', (_req, res, next) => {
    if (cloudConfigError) { res.status(503).json({ success: false, message: cloudConfigError }); return; }
    next();
  });
  app.use('/api/admin',createAdminRouter(prisma));
  app.use('/api/v1', createApiRouter(prisma));
  app.use('/api', createApiRouter(prisma));
  app.use((_req, res) => res.status(404).json({ success: false, message: 'Endpoint tidak ditemukan' }));
  app.use(errorHandler);
  return app;
}
const app = createApp();
if (process.env.NODE_ENV !== 'test') {
  if (!process.env.PUBLIC_API_URL) console.error('PUBLIC_API_URL belum diatur; pembayaran belum dapat dicatat.');
  const stopReconciliation = startReconciliationWorker(prisma);
  const port=Number(process.env.PORT??5000);
  if(!Number.isInteger(port)||port<1||port>65535)throw new Error('PORT tidak valid');
  const server = app.listen(port,'0.0.0.0');
  for (const signal of ['SIGTERM', 'SIGINT'] as const) process.once(signal, () => {
    stopReconciliation();
    server.close(() => { void prisma.$disconnect().then(() => process.exit(0)); });
  });
}
export default app;

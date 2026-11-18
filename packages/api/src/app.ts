import { computeCeiling, type Scale } from '@goldsmith/shared';
import express, { type Express } from 'express';
import type { Config } from './config.js';

/** One 0.0001 g scale; one weighing on it has a ceiling of half a step = 5 units. */
const PROBE_SCALE: Scale = { id: 'probe', name: 'Probe scale', readabilityG: 0.0001, capacityG: 1 };

/** True when the shared domain rules load and answer as expected. */
export function sharedRulesOk(): boolean {
  return computeCeiling([{ scaleId: PROBE_SCALE.id }], [PROBE_SCALE]).ceilingU === 5;
}

export function createApp(config: Config): Express {
  const app = express();
  app.disable('x-powered-by');

  app.get('/health', (_req, res) => {
    const shared = sharedRulesOk();
    res.status(shared ? 200 : 500).json({
      status: shared ? 'ok' : 'error',
      service: 'api',
      env: config.appEnv,
      shared: shared ? 'ok' : 'error',
    });
  });

  return app;
}

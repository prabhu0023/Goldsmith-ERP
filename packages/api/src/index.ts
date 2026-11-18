import { createApp } from './app.js';
import { ConfigError, loadConfig } from './config.js';

function start(): void {
  let config: ReturnType<typeof loadConfig>;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(`[api] ${err.message}`);
      process.exit(1);
    }
    throw err;
  }

  const server = createApp(config).listen(config.port, () => {
    console.log(`[api] ready on http://localhost:${config.port} (APP_ENV=${config.appEnv})`);
  });
  server.on('error', (err) => {
    console.error(`[api] could not start: ${err.message}`);
    process.exit(1);
  });
}

start();

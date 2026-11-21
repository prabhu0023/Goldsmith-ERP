/**
 * The only place the api reads configuration. Every value comes from environment variables
 * (set by the host in staging and production, or loaded from the git-ignored local `.env` by
 * `npm run dev`). Values are never logged; errors name the variable, not its value.
 *
 * Every variable listed here must also appear in the root `.env.example` (a test enforces it).
 */

export const APP_ENVS = ['development', 'staging', 'production'] as const;
export type AppEnv = (typeof APP_ENVS)[number];

export interface EnvVarSpec {
  name: string;
  /** Required now: the api refuses to start without it. */
  required: boolean;
}

export const ENV_VARS = [
  { name: 'APP_ENV', required: true },
  { name: 'APP_URL', required: true },
  { name: 'SESSION_SECRET', required: true },
  { name: 'API_PORT', required: false },
  { name: 'API_MAX_BODY_BYTES', required: false },
  { name: 'IDEMPOTENCY_RETENTION_HOURS', required: false },
  { name: 'CLOUD_REGION', required: false },
  { name: 'DATABASE_URL', required: false },
  { name: 'STORAGE_BUCKET', required: false },
  { name: 'STORAGE_ACCESS_KEY_ID', required: false },
  { name: 'STORAGE_SECRET_ACCESS_KEY', required: false },
  { name: 'WHATSAPP_PHONE_NUMBER_ID', required: false },
  { name: 'WHATSAPP_ACCESS_TOKEN', required: false },
  { name: 'EMAIL_IMAP_HOST', required: false },
  { name: 'EMAIL_IMAP_USER', required: false },
  { name: 'EMAIL_IMAP_PASSWORD', required: false },
  { name: 'GEMINI_API_KEY', required: false },
] as const satisfies readonly EnvVarSpec[];

export type EnvVarName = (typeof ENV_VARS)[number]['name'];

export const DEFAULT_API_PORT = 4000;
/** Largest request body the api parses (EP-03-S2): 100 kB. */
export const DEFAULT_MAX_BODY_BYTES = 102400;
/** How long a create's idempotency key is kept (EP-03-S8): 24 hours. */
export const DEFAULT_IDEMPOTENCY_RETENTION_HOURS = 24;
const MIN_SESSION_SECRET_LENGTH = 32;

export interface Config {
  appEnv: AppEnv;
  appUrl: string;
  sessionSecret: string;
  port: number;
  /** Request bodies larger than this are refused before parsing. */
  maxBodyBytes: number;
  /** Hours an idempotency key and its result id are kept before cleanup removes them. */
  idempotencyRetentionHours: number;
  /** Hosting region (D10: an India region; the exact name follows the D1a provider). */
  cloudRegion?: string;
  /** Optional until the epic that uses them (database EP-02, storage, WhatsApp, email, LLM). */
  databaseUrl?: string;
  storageBucket?: string;
  storageAccessKeyId?: string;
  storageSecretAccessKey?: string;
  whatsappPhoneNumberId?: string;
  whatsappAccessToken?: string;
  emailImapHost?: string;
  emailImapUser?: string;
  emailImapPassword?: string;
  geminiApiKey?: string;
}

export class ConfigError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Invalid api configuration:\n  - ${problems.join('\n  - ')}\nSee .env.example for every variable.`);
    this.name = 'ConfigError';
  }
}

type Env = Record<string, string | undefined>;

/** Read and validate the configuration. Throws a ConfigError naming every bad or missing variable. */
export function loadConfig(env: Env = process.env): Config {
  const problems: string[] = [];
  const read = (name: EnvVarName): string | undefined => {
    const v = env[name]?.trim();
    return v ? v : undefined;
  };

  for (const spec of ENV_VARS) {
    if (spec.required && read(spec.name) === undefined) {
      problems.push(`${spec.name} is required but missing or empty`);
    }
  }

  const appEnv = read('APP_ENV');
  if (appEnv !== undefined && !(APP_ENVS as readonly string[]).includes(appEnv)) {
    problems.push(`APP_ENV must be one of ${APP_ENVS.join(', ')}`);
  }

  const appUrl = read('APP_URL');
  if (appUrl !== undefined && !URL.canParse(appUrl)) {
    problems.push('APP_URL must be an absolute URL, e.g. http://localhost:3000');
  }

  const sessionSecret = read('SESSION_SECRET');
  if (sessionSecret !== undefined && sessionSecret.length < MIN_SESSION_SECRET_LENGTH) {
    problems.push(`SESSION_SECRET must be at least ${MIN_SESSION_SECRET_LENGTH} characters`);
  }

  const portText = read('API_PORT');
  const port = portText === undefined ? DEFAULT_API_PORT : Number(portText);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    problems.push('API_PORT must be an integer between 0 and 65535');
  }

  const maxBodyText = read('API_MAX_BODY_BYTES');
  const maxBodyBytes = maxBodyText === undefined ? DEFAULT_MAX_BODY_BYTES : Number(maxBodyText);
  if (!Number.isSafeInteger(maxBodyBytes) || maxBodyBytes < 1) {
    problems.push('API_MAX_BODY_BYTES must be a positive integer (bytes)');
  }

  const retentionText = read('IDEMPOTENCY_RETENTION_HOURS');
  const idempotencyRetentionHours =
    retentionText === undefined ? DEFAULT_IDEMPOTENCY_RETENTION_HOURS : Number(retentionText);
  if (!Number.isSafeInteger(idempotencyRetentionHours) || idempotencyRetentionHours < 1) {
    problems.push('IDEMPOTENCY_RETENTION_HOURS must be a positive integer (hours)');
  }
  if (problems.length > 0) throw new ConfigError(problems);

  return {
    appEnv: appEnv as AppEnv,
    appUrl: appUrl as string,
    sessionSecret: sessionSecret as string,
    port,
    maxBodyBytes,
    idempotencyRetentionHours,
    cloudRegion: read('CLOUD_REGION'),
    databaseUrl: read('DATABASE_URL'),
    storageBucket: read('STORAGE_BUCKET'),
    storageAccessKeyId: read('STORAGE_ACCESS_KEY_ID'),
    storageSecretAccessKey: read('STORAGE_SECRET_ACCESS_KEY'),
    whatsappPhoneNumberId: read('WHATSAPP_PHONE_NUMBER_ID'),
    whatsappAccessToken: read('WHATSAPP_ACCESS_TOKEN'),
    emailImapHost: read('EMAIL_IMAP_HOST'),
    emailImapUser: read('EMAIL_IMAP_USER'),
    emailImapPassword: read('EMAIL_IMAP_PASSWORD'),
    geminiApiKey: read('GEMINI_API_KEY'),
  };
}

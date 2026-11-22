/**
 * The only place the api reads configuration. Every value comes from environment variables
 * (set by the host in staging and production, or loaded from the git-ignored local `.env` by
 * `npm run dev`). Values are never logged; errors name the variable, not its value.
 *
 * Every variable listed here must also appear in the root `.env.example` (a test enforces it).
 */
import { DEFAULT_API_PORT, laneApiPort, laneDatabaseUrl, readLane } from './lane.js';

export { DEFAULT_API_PORT };

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
  { name: 'LANE', required: false },
  { name: 'API_PORT', required: false },
  { name: 'API_MAX_BODY_BYTES', required: false },
  { name: 'IDEMPOTENCY_RETENTION_HOURS', required: false },
  { name: 'CLOUD_REGION', required: false },
  { name: 'DATABASE_URL', required: false },
  { name: 'DATABASE_CONNECT_TIMEOUT_MS', required: false },
  { name: 'DATABASE_QUERY_TIMEOUT_MS', required: false },
  { name: 'STORAGE_BUCKET', required: false },
  { name: 'STORAGE_ACCESS_KEY_ID', required: false },
  { name: 'STORAGE_SECRET_ACCESS_KEY', required: false },
  { name: 'WHATSAPP_PHONE_NUMBER_ID', required: false },
  { name: 'WHATSAPP_ACCESS_TOKEN', required: false },
  { name: 'EMAIL_IMAP_HOST', required: false },
  { name: 'EMAIL_IMAP_USER', required: false },
  { name: 'EMAIL_IMAP_PASSWORD', required: false },
  { name: 'GEMINI_API_KEY', required: false },
  { name: 'JOBS_ENABLED', required: false },
  { name: 'JOBS_POLL_INTERVAL_MS', required: false },
  { name: 'ACCOUNT_EMAIL_MODE', required: false },
  { name: 'SESSION_IDLE_MINUTES', required: false },
  { name: 'AUTH_RATE_WINDOW_MINUTES', required: false },
  { name: 'AUTH_SIGN_IN_PER_PHONE', required: false },
  { name: 'AUTH_SIGN_IN_PER_DEVICE', required: false },
  { name: 'AUTH_RESET_PER_PHONE', required: false },
  { name: 'AUTH_RESET_PER_DEVICE', required: false },
] as const satisfies readonly EnvVarSpec[];

export type EnvVarName = (typeof ENV_VARS)[number]['name'];

/** Largest request body the api parses (EP-03-S2): 100 kB. */
export const DEFAULT_MAX_BODY_BYTES = 102400;
/** How long a create's idempotency key is kept (EP-03-S8): 24 hours. */
export const DEFAULT_IDEMPOTENCY_RETENTION_HOURS = 24;
/** Give up opening a database connection or waiting for a free pool slot after 5 s. */
export const DEFAULT_DATABASE_CONNECT_TIMEOUT_MS = 5000;
/** Cancel a database statement after 30 s. */
export const DEFAULT_DATABASE_QUERY_TIMEOUT_MS = 30000;
/** A session ends after 720 minutes (12 h) without an accepted operation (EP-04-S11). */
export const DEFAULT_SESSION_IDLE_MINUTES = 720;
/** Sign-in and reset request limits per window (EP-04-S9). */
export const DEFAULT_AUTH_LIMITS: AuthLimitsConfig = {
  windowMinutes: 15,
  signInPerPhone: 10,
  signInPerDevice: 30,
  resetPerPhone: 3,
  resetPerDevice: 10,
};
const MIN_SESSION_SECRET_LENGTH = 32;
/** The scheduler looks for due jobs every 15 s, so a due job starts within a minute (EP-10-S1). */
export const DEFAULT_JOBS_POLL_INTERVAL_MS = 15000;
const JOBS_POLL_INTERVAL_RANGE_MS = [1000, 60000] as const;
/** How account emails (activation, reset) are sent: the dev stub, or not at all (EP-04-S4). */
export type AccountEmailMode = 'stub' | 'disabled';
export interface AuthLimitsConfig {
  windowMinutes: number;
  signInPerPhone: number;
  signInPerDevice: number;
  resetPerPhone: number;
  resetPerDevice: number;
}

export interface Config {
  appEnv: AppEnv;
  appUrl: string;
  sessionSecret: string;
  /** Development lane (LANE), or undefined for the default single-developer setup. */
  lane?: string;
  port: number;
  /** Request bodies larger than this are refused before parsing. */
  maxBodyBytes: number;
  /** Hours an idempotency key and its result id are kept before cleanup removes them. */
  idempotencyRetentionHours: number;
  /** Hosting region (D10: an India region; the exact name follows the D1a provider). */
  cloudRegion?: string;
  /** Optional until the epic that uses them (database EP-02, storage, WhatsApp, email, LLM). */
  databaseUrl?: string;
  /** Connect / slot-wait timeout of the api's database pool, ms. */
  databaseConnectTimeoutMs: number;
  /** Statement and query timeout of the api's database pool, ms. */
  databaseQueryTimeoutMs: number;
  storageBucket?: string;
  storageAccessKeyId?: string;
  storageSecretAccessKey?: string;
  whatsappPhoneNumberId?: string;
  whatsappAccessToken?: string;
  emailImapHost?: string;
  emailImapUser?: string;
  emailImapPassword?: string;
  geminiApiKey?: string;
  /** Run the background job scheduler in this process (EP-10). */
  jobsEnabled: boolean;
  /** How often the scheduler looks for due jobs, ms. */
  jobsPollIntervalMs: number;
  /** `stub` keeps account emails in memory for the dev mailbox; `disabled` refuses to send. */
  accountEmailMode: AccountEmailMode;
  /** Minutes without an accepted operation after which a session ends. */
  sessionIdleMinutes: number;
  /** Fixed-window limits on sign-in and reset requests per phone and per device. */
  authLimits: AuthLimitsConfig;
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

  let lane: string | undefined;
  try {
    lane = readLane(env);
  } catch (e) {
    problems.push((e as Error).message);
  }
  const portText = read('API_PORT');
  const port = portText === undefined ? laneApiPort(lane) : Number(portText);
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
  const positiveMs = (name: EnvVarName, fallback: number): number => {
    const text = read(name);
    const ms = text === undefined ? fallback : Number(text);
    if (!Number.isSafeInteger(ms) || ms < 1) problems.push(`${name} must be a positive integer (milliseconds)`);
    return ms;
  };
  const databaseConnectTimeoutMs = positiveMs('DATABASE_CONNECT_TIMEOUT_MS', DEFAULT_DATABASE_CONNECT_TIMEOUT_MS);
  const databaseQueryTimeoutMs = positiveMs('DATABASE_QUERY_TIMEOUT_MS', DEFAULT_DATABASE_QUERY_TIMEOUT_MS);
  const databaseUrl = read('DATABASE_URL');
  const jobsEnabledText = read('JOBS_ENABLED');
  if (jobsEnabledText !== undefined && jobsEnabledText !== 'true' && jobsEnabledText !== 'false') {
    problems.push('JOBS_ENABLED must be true or false');
  }
  const pollText = read('JOBS_POLL_INTERVAL_MS');
  const jobsPollIntervalMs = pollText === undefined ? DEFAULT_JOBS_POLL_INTERVAL_MS : Number(pollText);
  const [minPoll, maxPoll] = JOBS_POLL_INTERVAL_RANGE_MS;
  if (!Number.isSafeInteger(jobsPollIntervalMs) || jobsPollIntervalMs < minPoll || jobsPollIntervalMs > maxPoll) {
    problems.push(`JOBS_POLL_INTERVAL_MS must be an integer between ${minPoll} and ${maxPoll} (milliseconds)`);
  }
  const positive = (name: EnvVarName, fallback: number, unit: string): number => {
    const text = read(name);
    const n = text === undefined ? fallback : Number(text);
    if (!Number.isSafeInteger(n) || n < 1) problems.push(`${name} must be a positive integer (${unit})`);
    return n;
  };
  const sessionIdleMinutes = positive('SESSION_IDLE_MINUTES', DEFAULT_SESSION_IDLE_MINUTES, 'minutes');
  const authLimits: AuthLimitsConfig = {
    windowMinutes: positive('AUTH_RATE_WINDOW_MINUTES', DEFAULT_AUTH_LIMITS.windowMinutes, 'minutes'),
    signInPerPhone: positive('AUTH_SIGN_IN_PER_PHONE', DEFAULT_AUTH_LIMITS.signInPerPhone, 'requests'),
    signInPerDevice: positive('AUTH_SIGN_IN_PER_DEVICE', DEFAULT_AUTH_LIMITS.signInPerDevice, 'requests'),
    resetPerPhone: positive('AUTH_RESET_PER_PHONE', DEFAULT_AUTH_LIMITS.resetPerPhone, 'requests'),
    resetPerDevice: positive('AUTH_RESET_PER_DEVICE', DEFAULT_AUTH_LIMITS.resetPerDevice, 'requests'),
  };
  const emailModeText = read('ACCOUNT_EMAIL_MODE');
  if (emailModeText !== undefined && emailModeText !== 'stub') {
    problems.push('ACCOUNT_EMAIL_MODE must be stub or unset');
  }
  if (emailModeText === 'stub' && appEnv === 'production') {
    problems.push('ACCOUNT_EMAIL_MODE=stub is not allowed in production');
  }
  const accountEmailMode: AccountEmailMode =
    emailModeText === undefined && appEnv === 'production' ? 'disabled' : 'stub';
  if (problems.length > 0) throw new ConfigError(problems);

  return {
    appEnv: appEnv as AppEnv,
    appUrl: appUrl as string,
    sessionSecret: sessionSecret as string,
    lane,
    port,
    maxBodyBytes,
    idempotencyRetentionHours,
    cloudRegion: read('CLOUD_REGION'),
    databaseUrl: databaseUrl === undefined ? undefined : laneDatabaseUrl(databaseUrl, lane),
    databaseConnectTimeoutMs,
    databaseQueryTimeoutMs,
    storageBucket: read('STORAGE_BUCKET'),
    storageAccessKeyId: read('STORAGE_ACCESS_KEY_ID'),
    storageSecretAccessKey: read('STORAGE_SECRET_ACCESS_KEY'),
    whatsappPhoneNumberId: read('WHATSAPP_PHONE_NUMBER_ID'),
    whatsappAccessToken: read('WHATSAPP_ACCESS_TOKEN'),
    emailImapHost: read('EMAIL_IMAP_HOST'),
    emailImapUser: read('EMAIL_IMAP_USER'),
    emailImapPassword: read('EMAIL_IMAP_PASSWORD'),
    geminiApiKey: read('GEMINI_API_KEY'),
    jobsEnabled: jobsEnabledText !== 'false',
    jobsPollIntervalMs,
    accountEmailMode,
    sessionIdleMinutes,
    authLimits,
  };
}

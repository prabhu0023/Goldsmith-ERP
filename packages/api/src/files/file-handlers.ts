/**
 * The file operations served by the generic operation router (EP-09). They need the link key
 * and lifetime, so the app builds them from config with `createFileHandlers` and merges them into
 * the production handlers when file storage is configured (src/app.ts).
 */
import type { contract } from '@goldsmith/shared';
import type { Handler, Handlers } from '../pipeline/registry.js';
import { readableFile } from './file-access.js';
import { linkKey, signLink } from './file-links.js';
import type { FileLog } from './store-file.js';

export interface FileHandlerDeps {
  /** SESSION_SECRET; links are signed with a key derived from it. */
  linkSecret: string;
  /** Seconds an issued link stays valid (FILE_LINK_TTL_SECONDS). */
  ttlSeconds: number;
  log: FileLog;
}

export function createFileHandlers(deps: FileHandlerDeps): Handlers<typeof contract> {
  const key = linkKey(deps.linkSecret);

  /** Signed links for up to 50 files at once (EP-09-S5); each passes the access check first (S6). */
  const readFileLinks: Handler<typeof contract.readFileLinks> = async (tx, ctx, input) => {
    const links = [];
    for (const item of input.files) {
      const file = await readableFile(tx.client, ctx.shop, ctx.by, item.fileId, deps.log);
      const link = signLink(key, file.code, item.size, ctx.at, deps.ttlSeconds);
      deps.log(`[files] link issued ${file.code} ${item.size} by ${ctx.by.id}`);
      links.push({ fileId: file.code, size: item.size, url: link.url, expiresAt: link.expiresAt.toISOString() });
    }
    return { ok: true, links };
  };

  return { readFileLinks };
}

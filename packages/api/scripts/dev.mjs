#!/usr/bin/env node
// Dev runner for the api: runs src/index.ts with tsx, restarts it when api or shared source
// changes, and exits when the api crashes, so `npm run dev` at the root stops web as well
// instead of leaving a half-running app (EP-01-S5). Watch-mode tools (tsx watch, node --watch)
// keep waiting after a crash, which is why this small runner exists.
import { spawn } from 'node:child_process';
import { watch } from 'node:fs';

const nodeArgs = [
  '--conditions=@goldsmith/source', // use @goldsmith/shared's TypeScript source
  '--env-file-if-exists=../../.env', // local, git-ignored environment file
  '--import',
  'tsx',
  'src/index.ts',
];
const watched = ['src', '../shared/src'];

let child;
let restarting = false;
let timer;

function start() {
  restarting = false;
  child = spawn(process.execPath, nodeArgs, { stdio: 'inherit' });
  child.on('exit', (code, signal) => {
    if (restarting) return start();
    console.error(`[api] stopped (${signal ?? `exit code ${code}`}); ending the dev command`);
    process.exit(code || 1);
  });
}

function restart(file) {
  clearTimeout(timer);
  timer = setTimeout(() => {
    console.log(`[api] change in ${file}, restarting`);
    restarting = true;
    child.kill('SIGTERM');
  }, 100);
}

for (const dir of watched) {
  watch(dir, { recursive: true }, (_event, file) => restart(`${dir}/${file}`));
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    child.removeAllListeners('exit');
    child.kill(signal);
    process.exit(0);
  });
}

start();

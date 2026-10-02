import { spawn } from 'node:child_process';
import path from 'node:path';
import { existsSync, mkdirSync, openSync, closeSync } from 'node:fs';
const root = process.cwd();
if (!existsSync('.venv/bin/python'))
  throw new Error('Run pnpm setup:dev first');
mkdirSync('.runtime/logs', { recursive: true });
const children = [];
function start(name, cmd, args, cwd = root) {
  const log = openSync(`.runtime/logs/${name}.log`, 'a');
  const child = spawn(cmd, args, {
    cwd,
    env: {
      ...process.env,
      NEXT_TELEMETRY_DISABLED: '1',
      STORAGE_DIR: path.resolve(process.env.STORAGE_DIR || '.runtime/uploads'),
      FIXTURE_DIR: path.resolve('services/inference/fixtures'),
    },
    stdio: ['ignore', log, log],
    detached: true,
  });
  closeSync(log);
  children.push(child);
  child.on('exit', (code) => {
    console.log(`${name} exited (${code}); logs in .runtime/logs/${name}.log`);
    if (code && !stopping) stop(code);
  });
}
function signalGroup(child, signal) {
  try {
    process.kill(-child.pid, signal);
  } catch (e) {
    if (e.code !== 'ESRCH') throw e;
  }
}
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) signalGroup(child, 'SIGTERM');
  setTimeout(() => {
    for (const child of children) signalGroup(child, 'SIGKILL');
    process.exit(code);
  }, 2000).unref();
}
start(
  'inference',
  path.resolve(process.env.INFERENCE_PYTHON || '.venv/bin/python'),
  ['-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', '8001'],
  path.join(root, 'services/inference'),
);
start('api', 'pnpm', ['--filter', '@safesight/api', 'dev']);
start('web', 'pnpm', ['--filter', '@safesight/web', 'dev']);
start('proxy', 'node', ['scripts/proxy.mjs']);
console.log(
  'SafeSight starting at http://localhost:8080 · logs: .runtime/logs/ · credentials: .runtime/dev-credentials.json',
);
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());

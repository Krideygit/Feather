const { spawn, execFileSync } = require('node:child_process');
const path = require('node:path');

const root = path.join(__dirname, '..');
const electron = require('electron');

execFileSync(process.execPath, [path.join(__dirname, 'build-core.js')], { stdio: 'inherit' });
execFileSync(process.execPath, [path.join(__dirname, 'build-app.js')], { stdio: 'inherit' });

const watcher = spawn(process.execPath, [path.join(__dirname, 'build-app.js'), '--watch'], { stdio: 'inherit' });
const app = spawn(electron, ['.'], { cwd: root, stdio: 'inherit', env: { ...process.env, FEATHER_DEV: '1' } });

const stop = () => watcher.kill();
app.on('exit', (code) => {
  stop();
  process.exit(code ?? 0);
});
process.on('SIGINT', stop);

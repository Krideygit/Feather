const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const output = path.join(root, 'build', 'jre');

const tool = (name) => (process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin', name) : name);

const wanted = [
  'java.base',
  'java.logging',
  'java.net.http',
  'java.sql',
  'java.naming',
  'java.management',
  'java.xml',
  'java.security.sasl',
  'jdk.crypto.ec',
  'jdk.crypto.cryptoki',
  'jdk.unsupported',
  'jdk.zipfs',
];

let available;
try {
  available = new Set(
    execFileSync(tool('java'), ['--list-modules'], { encoding: 'utf8' })
      .split(/\r?\n/)
      .map((line) => line.split('@')[0].trim())
      .filter(Boolean),
  );
} catch {
  console.error('Java wurde nicht gefunden. Setze JAVA_HOME auf ein JDK ab Version 17.');
  process.exit(1);
}

const modules = wanted.filter((m) => available.has(m));
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(path.dirname(output), { recursive: true });

try {
  execFileSync(tool('jlink'), ['--add-modules', modules.join(','), '--strip-debug', '--no-header-files', '--no-man-pages', '--compress', 'zip-6', '--output', output], { stdio: 'inherit' });
} catch {
  console.error('Die Laufzeitumgebung konnte nicht erzeugt werden. Dafür wird ein JDK mit jlink benötigt.');
  process.exit(1);
}

const size = (dir) => fs.readdirSync(dir, { withFileTypes: true }).reduce((sum, e) => sum + (e.isDirectory() ? size(path.join(dir, e.name)) : fs.statSync(path.join(dir, e.name)).size), 0);
console.log(`build/jre erzeugt (${Math.round(size(output) / 1024 / 1024)} MB, ${modules.length} Module)`);

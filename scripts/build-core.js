const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const srcDir = path.join(root, 'core', 'src');
const outDir = path.join(root, 'core', 'out');
const jarFile = process.env.FEATHER_CORE_OUT || path.join(root, 'core', 'feather-core.jar');

function tool(name) {
  const javaHome = process.env.JAVA_HOME;
  return javaHome ? path.join(javaHome, 'bin', name) : name;
}

function javaSources(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? javaSources(p) : p.endsWith('.java') ? [p] : [];
  });
}

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

try {
  execFileSync(
    tool('javac'),
    ['--release', '17', '-encoding', 'UTF-8', '-Xlint:all,-serial', '-d', outDir, ...javaSources(srcDir)],
    { stdio: 'inherit' },
  );
  execFileSync(tool('jar'), ['--create', '--file', jarFile, '--main-class', 'feather.Main', '-C', outDir, '.'], {
    stdio: 'inherit',
  });
} catch (err) {
  console.error('\nJava-Core konnte nicht gebaut werden. Ist ein JDK (>= 17) installiert und in PATH / JAVA_HOME?');
  process.exit(1);
}
console.log('core/feather-core.jar gebaut');

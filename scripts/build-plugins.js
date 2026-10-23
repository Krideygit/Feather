const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const sources = path.join(root, 'plugins-src');
const coreClasses = path.join(root, 'core', 'out');
const dist = path.join(root, 'plugins-dist');

function tool(name) {
  return process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin', name) : name;
}

function javaFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? javaFiles(p) : p.endsWith('.java') ? [p] : [];
  });
}

if (!fs.existsSync(path.join(coreClasses, 'feather', 'api', 'FeatherPlugin.class'))) {
  console.error('Zuerst "npm run build:core" ausführen, das Plugin-API wird dafür gebraucht.');
  process.exit(1);
}

fs.mkdirSync(dist, { recursive: true });
for (const name of fs.readdirSync(sources)) {
  const dir = path.join(sources, name);
  if (!fs.statSync(dir).isDirectory()) continue;
  const classes = path.join(dist, `${name}.classes`);
  fs.rmSync(classes, { recursive: true, force: true });
  fs.mkdirSync(classes, { recursive: true });
  execFileSync(tool('javac'), ['--release', '17', '-encoding', 'UTF-8', '-cp', coreClasses, '-d', classes, ...javaFiles(path.join(dir, 'src'))], { stdio: 'inherit' });
  fs.copyFileSync(path.join(dir, 'feather-plugin.json'), path.join(classes, 'feather-plugin.json'));
  const jar = path.join(dist, `${name}.jar`);
  execFileSync(tool('jar'), ['--create', '--file', jar, '-C', classes, '.'], { stdio: 'inherit' });
  fs.rmSync(classes, { recursive: true, force: true });
  console.log(`${path.relative(root, jar)} gebaut`);
}

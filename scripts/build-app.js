const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');

const root = path.join(__dirname, '..');
const watch = process.argv.includes('--watch');
const rendererSrc = path.join(root, 'src', 'renderer');
const rendererOut = path.join(root, 'dist', 'renderer');
const mainOut = path.join(root, 'dist', 'main');
const tailwindBin = path.join(root, 'node_modules', '@tailwindcss', 'cli', 'dist', 'index.mjs');
const cssArgs = [tailwindBin, '-i', path.join(rendererSrc, 'styles.css'), '-o', path.join(rendererOut, 'styles.css')];

function copyStatic() {
  fs.mkdirSync(rendererOut, { recursive: true });
  fs.mkdirSync(mainOut, { recursive: true });
  fs.copyFileSync(path.join(rendererSrc, 'index.html'), path.join(rendererOut, 'index.html'));
  fs.copyFileSync(path.join(root, 'src', 'main', 'splash.html'), path.join(mainOut, 'splash.html'));
}

const common = { bundle: true, sourcemap: watch, logLevel: 'warning' };

const nodeBuild = {
  ...common,
  entryPoints: [path.join(root, 'src', 'main', 'main.ts'), path.join(root, 'src', 'main', 'preload.ts')],
  outdir: mainOut,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['electron'],
};

const rendererBuild = {
  ...common,
  entryPoints: { app: path.join(rendererSrc, 'main.tsx') },
  outdir: rendererOut,
  format: 'iife',
  target: 'chrome140',
  jsx: 'automatic',
  minify: !watch,
  define: { 'process.env.NODE_ENV': JSON.stringify(watch ? 'development' : 'production') },
};

async function main() {
  copyStatic();
  if (watch) {
    await (await esbuild.context(nodeBuild)).watch();
    await (await esbuild.context(rendererBuild)).watch();
    spawn(process.execPath, [...cssArgs, '--watch'], { stdio: 'inherit' });
    fs.watchFile(path.join(rendererSrc, 'index.html'), { interval: 500 }, copyStatic);
    console.log('watching renderer and main ...');
  } else {
    await esbuild.build(nodeBuild);
    await esbuild.build(rendererBuild);
    execFileSync(process.execPath, [...cssArgs, '--minify'], { stdio: 'inherit' });
    console.log('dist/ gebaut');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

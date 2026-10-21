const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { Feather } = require('lucide');

const inner = Feather.map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(' ')}/>`).join('');
const page = `<body style="margin:0;background:transparent">
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="112" fill="#0ea5e9"/>
  <g transform="translate(96 96) scale(13.33)" fill="none" stroke="#171717" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${inner}</g>
</svg></body>`;

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 512, height: 512, show: false, transparent: true, frame: false, useContentSize: true });
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(page)}`);
  await new Promise((r) => setTimeout(r, 300));
  const image = await win.webContents.capturePage();
  const out = path.join(__dirname, '..', 'build', 'icon.png');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, image.resize({ width: 512, height: 512 }).toPNG());
  console.log('wrote', out);
  app.quit();
});

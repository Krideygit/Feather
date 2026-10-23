const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { Server, utils } = require('ssh2');

const PASS = 'test-pass-123';
const USER = 'tester';

function startSshServer(serverRoot, hostKey, clientPublicKey, options = {}) {
  const state = { window: null, shells: 0 };
  const clients = new Set();
  const abs = (p) => path.join(serverRoot, ...p.split('/').filter(Boolean));
  const attrsOf = (st) => ({ mode: st.mode, uid: 1000, gid: 1000, size: st.size, atime: Math.floor(st.atimeMs / 1000), mtime: Math.floor(st.mtimeMs / 1000) });
  const { STATUS_CODE: S, OPEN_MODE: M } = utils.sftp;
  const errStatus = (err) => (err.code === 'ENOENT' ? S.NO_SUCH_FILE : err.code === 'EACCES' || err.code === 'EPERM' ? S.PERMISSION_DENIED : S.FAILURE);

  const server = new Server({ hostKeys: [hostKey] }, (client) => {
    clients.add(client);
    client.on('authentication', (ctx) => {
      if (ctx.username !== USER) return ctx.reject();
      if (ctx.method === 'password' && ctx.password === PASS) return ctx.accept();
      if (ctx.method === 'publickey' && clientPublicKey) {
        const ok = ctx.key.algo === clientPublicKey.type && crypto.timingSafeEqual(ctx.key.data, clientPublicKey.getPublicSSH()) && (!ctx.signature || clientPublicKey.verify(ctx.blob, ctx.signature, ctx.hashAlgo) === true);
        return ok ? ctx.accept() : ctx.reject();
      }
      ctx.reject(['password', 'publickey']);
    });
    client.on('error', () => {});
    client.on('tcpip', (accept, reject, info) => {
      if (!options.forward) return reject();
      const socket = require('node:net').connect(info.destPort, info.destIP);
      socket.once('connect', () => {
        const stream = accept();
        state.forwarded = (state.forwarded || 0) + 1;
        stream.pipe(socket).pipe(stream);
        stream.on('close', () => socket.destroy());
      });
      socket.once('error', () => reject());
    });
    client.on('ready', () => {
      client.on('session', (accept) => {
        const session = accept();
        session.on('pty', (acc) => acc && acc());
        session.on('window-change', (acc, _rej, info) => {
          state.window = info;
          acc && acc();
        });
        session.on('exec', (acc, rej, info) => {
          if (!options.exec) return rej();
          const stream = acc();
          const child = spawn('sh', ['-c', info.command], { env: options.exec.env(), cwd: options.exec.cwd });
          state.commands = state.commands || [];
          state.commands.push(info.command);
          state.maxCommand = Math.max(state.maxCommand || 0, info.command.length);
          stream.pipe(child.stdin);
          child.stdin.on('error', () => {});
          child.stdout.on('data', (d) => stream.write(d));
          child.stderr.on('data', (d) => stream.stderr.write(d));
          child.on('close', (code) => {
            stream.exit(code === null ? 1 : code);
            stream.end();
          });
        });
        session.on('shell', (acc) => {
          const stream = acc();
          state.shells++;
          const prompt = options.echo ? 'tester@fake:~$ ' : '$ ';
          stream.write(`Willkommen\r\n${prompt}`);
          let line = '';
          stream.on('data', (d) => {
            for (const ch of d.toString()) {
              if (ch === '\r' || ch === '\n') {
                if (line === 'exit') return stream.close();
                const reply = options.echo && /^(htop|ncdu|nope-\w+)$/.test(line) ? `-bash: ${line}: command not found` : `ECHO:${line}`;
                stream.write(`\r\n${reply}\r\n${prompt}`);
                line = '';
              } else if (options.echo && ch === '\x7f') {
                if (line) {
                  line = line.slice(0, -1);
                  stream.write('\b \b');
                }
              } else {
                line += ch;
                if (options.echo && ch >= ' ') stream.write(ch);
              }
            }
          });
        });
        session.on('sftp', (acc) => {
          const sftp = acc();
          const handles = new Map();
          let next = 0;
          const newHandle = (value) => {
            const id = Buffer.alloc(4);
            id.writeUInt32BE(next++);
            handles.set(id.readUInt32BE(0), value);
            return id;
          };
          const get = (h) => handles.get(h.readUInt32BE(0));
          const guard = (reqid, fn) => {
            try {
              fn();
            } catch (err) {
              sftp.status(reqid, errStatus(err));
            }
          };
          sftp.on('REALPATH', (reqid, p) => {
            const resolved = path.posix.resolve('/', p === '.' ? '/' : p);
            sftp.name(reqid, [{ filename: resolved, longname: resolved, attrs: {} }]);
          });
          const stat = (reqid, p) => guard(reqid, () => sftp.attrs(reqid, attrsOf(fs.statSync(abs(p)))));
          sftp.on('STAT', stat);
          sftp.on('LSTAT', (reqid, p) => guard(reqid, () => sftp.attrs(reqid, attrsOf(fs.lstatSync(abs(p))))));
          sftp.on('FSTAT', (reqid, h) => guard(reqid, () => sftp.attrs(reqid, attrsOf(fs.fstatSync(get(h).fd)))));
          sftp.on('OPENDIR', (reqid, p) =>
            guard(reqid, () => {
              const entries = fs.readdirSync(abs(p), { withFileTypes: true }).map((e) => e.name);
              sftp.handle(reqid, newHandle({ dir: abs(p), entries, sent: false }));
            }),
          );
          sftp.on('READDIR', (reqid, h) =>
            guard(reqid, () => {
              const d = get(h);
              if (d.sent) return sftp.status(reqid, S.EOF);
              d.sent = true;
              const list = d.entries.map((name) => {
                const st = fs.lstatSync(path.join(d.dir, name));
                const kind = st.isDirectory() ? 'd' : st.isSymbolicLink() ? 'l' : '-';
                return { filename: name, longname: `${kind}rw-r--r-- 1 tester tester ${st.size} Jan 1 00:00 ${name}`, attrs: attrsOf(st) };
              });
              if (!list.length) return sftp.status(reqid, S.EOF);
              sftp.name(reqid, list);
            }),
          );
          sftp.on('OPEN', (reqid, p, flags) =>
            guard(reqid, () => {
              const mode = flags & M.WRITE ? (flags & M.EXCL ? 'wx' : flags & M.TRUNC ? 'w' : flags & M.APPEND ? 'a' : 'r+') : 'r';
              const fd = fs.openSync(abs(p), flags & M.CREAT && mode === 'r+' ? 'w' : mode);
              sftp.handle(reqid, newHandle({ fd }));
            }),
          );
          sftp.on('READ', (reqid, h, offset, length) =>
            guard(reqid, () => {
              const buf = Buffer.alloc(length);
              const n = fs.readSync(get(h).fd, buf, 0, length, offset);
              if (n === 0) return sftp.status(reqid, S.EOF);
              sftp.data(reqid, buf.subarray(0, n));
            }),
          );
          sftp.on('WRITE', (reqid, h, offset, data) =>
            guard(reqid, () => {
              fs.writeSync(get(h).fd, data, 0, data.length, offset);
              sftp.status(reqid, S.OK);
            }),
          );
          sftp.on('CLOSE', (reqid, h) => {
            const v = get(h);
            if (v && v.fd !== undefined) fs.closeSync(v.fd);
            handles.delete(h.readUInt32BE(0));
            sftp.status(reqid, S.OK);
          });
          sftp.on('MKDIR', (reqid, p) => guard(reqid, () => (fs.mkdirSync(abs(p)), sftp.status(reqid, S.OK))));
          sftp.on('RMDIR', (reqid, p) => guard(reqid, () => (fs.rmdirSync(abs(p)), sftp.status(reqid, S.OK))));
          sftp.on('REMOVE', (reqid, p) => guard(reqid, () => (fs.unlinkSync(abs(p)), sftp.status(reqid, S.OK))));
          sftp.on('RENAME', (reqid, a, b) => guard(reqid, () => (fs.renameSync(abs(a), abs(b)), sftp.status(reqid, S.OK))));
          sftp.on('SETSTAT', (reqid, p, attrs) =>
            guard(reqid, () => {
              if (attrs.mode !== undefined) fs.chmodSync(abs(p), attrs.mode & 0o7777);
              sftp.status(reqid, S.OK);
            }),
          );
        });
      });
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port, state, dropAll: () => clients.forEach((c) => c.end()) })));
}

module.exports = { startSshServer, PASS, USER };

if (require.main === module) {
  const serverRoot = path.resolve(process.argv[2]);
  const portFile = process.argv[3];
  fs.mkdirSync(serverRoot, { recursive: true });
  const options = { forward: true, echo: process.argv[6] === 'echo' };
  if (process.argv[4]) {
    const fake = require('./fake-linux').createFakeLinux(path.resolve(process.argv[4]));
    if (process.argv[5] === 'sudo') Object.assign(fake.settings, { uid: '1000', user: 'deploy', sudo: 'password' });
    options.exec = { env: () => fake.env(), cwd: fake.root };
    console.log('Simuliertes Linux in', fake.root);
  }
  startSshServer(serverRoot, utils.generateKeyPairSync('ed25519').private, null, options).then(({ port }) => {
    if (portFile) fs.writeFileSync(portFile, String(port));
    console.log('SSH-Testserver auf Port', port);
  });
}

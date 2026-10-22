import crypto from 'node:crypto';
import fs from 'node:fs';
import { StringDecoder } from 'node:string_decoder';
import { Client as SshClient, utils, type ClientChannel, type ConnectConfig } from 'ssh2';
import { RemoteError, type RemoteEvents } from '../../shared/remote';
import { FtpFs, SftpFs, type RemoteFs } from './backends';
import { friendly } from './errors';
import * as vault from './vault';

export type Emit = <K extends keyof RemoteEvents>(name: K, data: RemoteEvents[K]) => void;

const fingerprintOf = (key: Buffer): string => `SHA256:${crypto.createHash('sha256').update(key).digest('base64').replace(/=+$/, '')}`;

const agentSocket = (): string | undefined => (process.platform === 'win32' ? '\\\\.\\pipe\\openssh-ssh-agent' : process.env.SSH_AUTH_SOCK);

export class Session {
  fs: RemoteFs | null = null;
  fingerprint: string | null = null;
  filesError: string | null = null;
  open = false;
  private ssh: SshClient | null = null;
  private shell: ClientChannel | null = null;
  private closing = false;

  constructor(
    readonly sid: string,
    readonly spec: vault.ResolvedHost,
    private readonly emit: Emit,
  ) {}

  get hasTerminal(): boolean {
    return this.spec.protocol === 'ssh';
  }

  async connect(trust?: string): Promise<void> {
    this.closing = false;
    this.filesError = null;
    try {
      if (this.spec.protocol === 'ftp') await this.connectFtp();
      else await this.connectSsh(trust);
    } catch (err) {
      this.teardown();
      throw friendly(err);
    }
    this.open = true;
  }

  private async connectFtp(): Promise<void> {
    const { host, port, username, password, secure, ignoreCertErrors } = this.spec;
    const anonymous = username === 'anonymous';
    if (!anonymous && !password) throw new RemoteError('Bitte gib das Passwort ein.', 'need-password');
    const ftp = new FtpFs({ host, port, user: username, password: anonymous && !password ? 'anonymous@' : password, secure, ignoreCertErrors });
    await ftp.connect();
    this.fs = ftp;
  }

  private authConfig(): Partial<ConnectConfig> {
    const { auth, password, passphrase, keyPath } = this.spec;
    if (auth === 'password') {
      if (!password) throw new RemoteError('Bitte gib das Passwort ein.', 'need-password');
      return { password };
    }
    if (auth === 'agent') {
      const agent = agentSocket();
      if (!agent) throw new RemoteError('Es wurde kein SSH-Agent gefunden. Starte einen Agenten oder wähle Passwort oder Schlüssel.');
      return { agent };
    }
    let privateKey: Buffer;
    try {
      privateKey = fs.readFileSync(keyPath);
    } catch {
      throw new RemoteError(`Die Schlüsseldatei „${keyPath}“ kann nicht gelesen werden.`);
    }
    const parsed = utils.parseKey(privateKey, passphrase || undefined);
    if (parsed instanceof Error) {
      if (/passphrase/i.test(parsed.message) && !passphrase) throw new RemoteError('Der Schlüssel ist mit einer Passphrase geschützt.', 'need-passphrase');
      throw new RemoteError(passphrase ? 'Die Passphrase ist falsch oder der Schlüssel ungültig.' : 'Die Schlüsseldatei hat kein gültiges Format.', passphrase ? 'need-passphrase' : 'generic');
    }
    return { privateKey, passphrase: passphrase || undefined };
  }

  private connectSsh(trust?: string): Promise<void> {
    const { host, port, username, password } = this.spec;
    const config: ConnectConfig = {
      host,
      port,
      username,
      readyTimeout: 20_000,
      keepaliveInterval: 15_000,
      keepaliveCountMax: 4,
      tryKeyboard: true,
      ...this.authConfig(),
    };

    return new Promise<void>((resolve, reject) => {
      const client = new SshClient();
      let issue: RemoteError | null = null;
      let ready = false;
      this.ssh = client;

      config.hostVerifier = (key: Buffer): boolean => {
        const fingerprint = fingerprintOf(key);
        this.fingerprint = fingerprint;
        const known = vault.knownFingerprint(host, port);
        if (known === fingerprint) return true;
        if (trust === fingerprint) {
          vault.trustFingerprint(host, port, fingerprint);
          return true;
        }
        issue = known
          ? new RemoteError('Der Schlüssel dieses Servers hat sich geändert. Das kann auf einen Angriff hindeuten.', 'hostkey-changed', { fingerprint, known })
          : new RemoteError('Dieser Server ist noch unbekannt.', 'hostkey-new', { fingerprint });
        return false;
      };

      client.on('keyboard-interactive', (_name, _instructions, _lang, prompts, finish) => finish(prompts.map(() => password)));
      client.on('error', (err) => {
        if (!ready) return reject(issue ?? err);
        this.drop(friendly(err).message);
      });
      client.on('close', () => {
        if (!ready) return reject(issue ?? new RemoteError('Die Verbindung wurde geschlossen, bevor die Anmeldung abgeschlossen war.'));
        this.drop('Die Verbindung wurde getrennt.');
      });
      client.on('ready', () => {
        ready = true;
        client.sftp((err, sftp) => {
          if (err) {
            if (this.spec.protocol === 'sftp') return reject(new RemoteError('Auf diesem Server ist SFTP nicht aktiviert.'));
            this.filesError = 'Auf diesem Server ist SFTP nicht aktiviert. Das Terminal funktioniert trotzdem.';
          } else {
            this.fs = new SftpFs(sftp);
          }
          resolve();
        });
      });
      client.connect(config);
    });
  }

  startShell(cols: number, rows: number): Promise<void> {
    const client = this.ssh;
    if (!client || !this.open) return Promise.reject(new RemoteError('Die Verbindung wurde getrennt.'));
    this.shell?.close();
    return new Promise((resolve, reject) => {
      client.shell({ term: 'xterm-256color', cols, rows, width: 0, height: 0 }, (err, stream) => {
        if (err) return reject(friendly(err));
        this.shell = stream;
        const out = new StringDecoder('utf8');
        const errOut = new StringDecoder('utf8');
        stream.on('data', (chunk: Buffer) => this.emit('term.data', { sid: this.sid, data: out.write(chunk) }));
        stream.stderr.on('data', (chunk: Buffer) => this.emit('term.data', { sid: this.sid, data: errOut.write(chunk) }));
        stream.on('close', () => {
          if (this.shell === stream) this.shell = null;
          if (!this.closing) this.emit('term.exit', { sid: this.sid });
        });
        resolve();
      });
    });
  }

  write(data: string): void {
    this.shell?.write(data);
  }

  resize(cols: number, rows: number): void {
    this.shell?.setWindow(rows, cols, 0, 0);
  }

  private drop(reason: string): void {
    if (this.closing || !this.open) return;
    this.open = false;
    this.teardown();
    this.emit('session.closed', { sid: this.sid, reason });
  }

  private teardown(): void {
    this.fs?.close();
    this.fs = null;
    this.shell = null;
    this.ssh?.end();
    this.ssh = null;
  }

  close(): void {
    this.closing = true;
    this.open = false;
    this.teardown();
  }
}

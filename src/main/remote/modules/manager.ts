import type { ControlAction, InstallOptions, JobStart, ModuleId, NewDbUser, NewSite, SystemInfo } from '../../../shared/modules';
import { RemoteError, type RemoteEvents } from '../../../shared/remote';
import type { Session } from '../session';
import { installPlan, uninstallPlan, validateMariaDb, waitReady, writeConfig, type Plan } from './install';
import * as maria from './mariadb';
import { detect, jobId, jobScript, run, system } from './shell';
import * as web from './web';

type Params = Record<string, unknown>;
type Emit = <K extends keyof RemoteEvents>(name: K, data: RemoteEvents[K]) => void;

const MODULE_IDS: ModuleId[] = ['mariadb', 'nginx', 'apache'];
const ACTIONS: ControlAction[] = ['start', 'stop', 'restart', 'reload', 'enable', 'disable'];

const FAILURES: [RegExp, string][] = [
  [/Could not get lock|dpkg frontend lock|Waiting for cache lock|Unable to lock the administration/i, 'Auf dem Server läuft gerade ein anderer Paketvorgang, zum Beispiel automatische Updates. Warte ein paar Minuten und versuche es erneut.'],
  [/Unable to locate package|No match for argument|Unable to find a match|nothing provides|target not found|no such package/i, 'Das Paket wurde in den Paketquellen nicht gefunden. Die Paketlisten sind evtl. veraltet, oder die Distribution wird nicht mehr unterstützt.'],
  [/Temporary failure resolving|Could not resolve host|Network is unreachable|Cannot find a valid baseurl|Failed to connect/i, 'Der Server hat keinen Internetzugang oder erreicht die Paketquellen nicht (DNS).'],
  [/No space left on device/i, 'Auf dem Server ist kein Speicherplatz mehr frei.'],
  [/MariaDB antwortet nicht/i, 'MariaDB wurde installiert, startet aber nicht. Schau im Log des Dienstes nach der Ursache.'],
];

export function explainFailure(lines: string[]): string {
  const text = lines.join('\n');
  for (const [pattern, message] of FAILURES) if (pattern.test(text)) return message;
  const last = [...lines].reverse().find((l) => l.trim() && !l.startsWith('##'));
  return last ? `Die Installation ist fehlgeschlagen: ${last.trim()}` : 'Die Installation ist fehlgeschlagen.';
}

function moduleOf(p: Params): ModuleId {
  const id = p.module;
  if (typeof id !== 'string' || !MODULE_IDS.includes(id as ModuleId)) throw new RemoteError('Unbekanntes Modul.');
  return id as ModuleId;
}

const str = (p: Params, key: string): string => {
  const value = p[key];
  if (typeof value !== 'string') throw new RemoteError(`Ungültige Angabe: ${key}`);
  return value;
};

const sudoOf = (p: Params): string | undefined => (typeof p.sudoPassword === 'string' && p.sudoPassword ? p.sudoPassword : undefined);

function webOf(module: ModuleId): 'nginx' | 'apache' {
  if (module === 'mariadb') throw new RemoteError('Dieses Modul ist kein Webserver.');
  return module;
}

export function createModuleMethods(getSession: (p: Params) => Session, emit: Emit): Record<string, (p: Params) => Promise<unknown> | unknown> {
  const running = new Set<string>();

  async function startJob(session: Session, module: ModuleId, kind: 'install' | 'uninstall', plan: Plan, sudoPassword?: string): Promise<JobStart> {
    const key = `${session.sid}:${module}`;
    if (running.has(key)) throw new RemoteError('Für dieses Modul läuft bereits ein Vorgang.');
    const preflight = await run(session, 'true', { admin: true, sudoPassword });
    if (preflight.code !== 0) throw new RemoteError('Administratorrechte konnten nicht aktiviert werden.');
    running.add(key);
    const id = jobId();
    const base = { sid: session.sid, jobId: id, module, kind, steps: plan.steps };
    emit('mod.job', { ...base, state: 'running', step: plan.steps[0] ?? '', error: null });

    void (async () => {
      let buffer = '';
      let exit = null as number | null;
      let current = plan.steps[0] ?? '';
      const recent: string[] = [];
      const onData = (text: string): void => {
        emit('mod.log', { sid: session.sid, jobId: id, text: text.replace(/##STEP:/g, '▶ ').replace(/##EXIT:\d+\r?\n?/g, '') });
        buffer += text;
        let i = buffer.indexOf('\n');
        while (i >= 0) {
          const line = buffer.slice(0, i).replace(/\r$/, '');
          buffer = buffer.slice(i + 1);
          if (line.startsWith('##STEP:')) {
            current = line.slice(7);
            emit('mod.job', { ...base, state: 'running', step: current, error: null });
          } else if (line.startsWith('##EXIT:')) {
            exit = Number(line.slice(7));
          } else {
            recent.push(line);
            if (recent.length > 60) recent.shift();
          }
          i = buffer.indexOf('\n');
        }
      };
      try {
        await run(session, jobScript(id, plan.script), { admin: true, payload: plan.payload, onData, bare: true });
        if (exit === null && buffer.startsWith('##EXIT:')) exit = Number(buffer.slice(7));
        await detect(session).catch(() => undefined);
        if (exit === 0) emit('mod.job', { ...base, state: 'done', step: 'Fertig', error: null });
        else if (exit !== null) emit('mod.job', { ...base, state: 'error', step: current, error: explainFailure(recent) });
        else emit('mod.job', { ...base, state: 'detached', step: current, error: 'Die Verbindung wurde unterbrochen. Die Installation läuft auf dem Server weiter. Verbinde dich neu und prüfe danach den Status.' });
      } catch (err) {
        emit('mod.job', { ...base, state: 'error', step: current, error: err instanceof Error ? err.message : String(err) });
      } finally {
        running.delete(key);
      }
    })();
    return { jobId: id, steps: plan.steps };
  }

  async function refreshed(session: Session): Promise<SystemInfo> {
    return detect(session);
  }

  return {
    'sys.detect': (p) => detect(getSession(p)),

    'mod.control': async (p) => {
      const session = getSession(p);
      const action = str(p, 'action') as ControlAction;
      if (!ACTIONS.includes(action)) throw new RemoteError('Unbekannte Aktion.');
      await web.control(session, moduleOf(p), action, sudoOf(p));
      return refreshed(session);
    },

    'mod.install': async (p) => {
      const session = getSession(p);
      const module = moduleOf(p);
      const sys = await system(session);
      if (sys.modules[module].installed) throw new RemoteError('Dieses Modul ist bereits installiert.');
      return startJob(session, module, 'install', installPlan(module, sys, (p.options ?? {}) as InstallOptions), sudoOf(p));
    },

    'mod.uninstall': async (p) => {
      const session = getSession(p);
      const module = moduleOf(p);
      const sys = await system(session);
      return startJob(session, module, 'uninstall', uninstallPlan(module, sys, p.purge === true), sudoOf(p));
    },

    'mod.logs': (p) => web.logs(getSession(p), moduleOf(p), (str(p, 'kind') as 'service' | 'error' | 'access') ?? 'service', Number(p.lines) || 200, sudoOf(p)),

    'db.settings': (p) => maria.settings(getSession(p), sudoOf(p)),
    'db.databases': (p) => maria.listDatabases(getSession(p), sudoOf(p)),
    'db.createDb': (p) => maria.createDatabase(getSession(p), str(p, 'name'), sudoOf(p)),
    'db.dropDb': (p) => maria.dropDatabase(getSession(p), str(p, 'name'), sudoOf(p)),
    'db.users': (p) => maria.listUsers(getSession(p), sudoOf(p)),
    'db.createUser': (p) => maria.createUser(getSession(p), p.user as NewDbUser, sudoOf(p)),
    'db.dropUser': (p) => maria.dropUser(getSession(p), str(p, 'name'), str(p, 'host'), sudoOf(p)),
    'db.userPassword': (p) => maria.setUserPassword(getSession(p), str(p, 'name'), str(p, 'host'), str(p, 'password'), sudoOf(p)),
    'db.configure': async (p) => {
      const session = getSession(p);
      const next = validateMariaDb({ port: Number(p.port), remote: p.remote === true, firewall: p.firewall !== false });
      const before = await maria.settings(session, sudoOf(p));
      let script = `set -e\n${writeConfig(next.port, next.remote)}NAME="$(pick_service mariadb mysql mysqld)"\nsvc restart "$NAME"\n${waitReady()}`;
      if (next.firewall) {
        if (before.remote && (!next.remote || before.port !== next.port)) script += `fw_deny ${before.port} || true\n`;
        if (next.remote) script += `fw_allow ${next.port}\n`;
      }
      const result = await run(session, script, { admin: true, sudoPassword: sudoOf(p) });
      if (result.code !== 0) throw new RemoteError(web.tidy(result.stderr || result.stdout) || 'Die Einstellungen konnten nicht übernommen werden.');
      return maria.settings(session, sudoOf(p));
    },

    'web.sites': (p) => web.listSites(getSession(p), webOf(moduleOf(p)), sudoOf(p)),
    'web.createSite': (p) => web.createSite(getSession(p), webOf(moduleOf(p)), p.site as NewSite, sudoOf(p)),
    'web.toggleSite': (p) => web.toggleSite(getSession(p), webOf(moduleOf(p)), str(p, 'name'), p.enable === true, sudoOf(p)),
    'web.deleteSite': (p) => web.deleteSite(getSession(p), webOf(moduleOf(p)), str(p, 'name'), sudoOf(p)),
    'web.test': (p) => web.configTest(getSession(p), webOf(moduleOf(p)), sudoOf(p)),
  };
}

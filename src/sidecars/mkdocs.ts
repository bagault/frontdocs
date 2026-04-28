// MkDocs sidecar runner. Bootstraps a per-vault Python venv with a pinned plugin set,
// then invokes `mkdocs build`. PyInstaller blob shipping is deferred (see AGENT.md).
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';

export interface SidecarOptions {
  vaultPath: string;
  outDir: string;        // <vault>/dist
  strict?: boolean;
}

const REQUIREMENTS = [
  'mkdocs>=1.6,<2',
  'mkdocs-material>=9.5,<10',
  'pymdown-extensions>=10,<11',
];

export async function ensureVenv(outDir: string): Promise<{ venvDir: string; python: string; mkdocs: string }> {
  const venvDir = join(outDir, '.frontdocs', 'venv');
  await mkdir(venvDir, { recursive: true });
  const isWin = process.platform === 'win32';
  const python = join(venvDir, isWin ? 'Scripts' : 'bin', isWin ? 'python.exe' : 'python');
  const mkdocs = join(venvDir, isWin ? 'Scripts' : 'bin', isWin ? 'mkdocs.exe' : 'mkdocs');

  if (!existsSync(python)) {
    const launcher = await findSystemPython();
    if (!launcher) {
      throw new Error(
        'No system Python 3 found. Install Python 3.10+ from python.org (Windows: enable "Add to PATH"; Linux: apt install python3 python3-venv) and retry.',
      );
    }
    await run(launcher.cmd, [...launcher.args, '-m', 'venv', venvDir], { stdio: 'inherit' });
  }
  // upgrade pip and install pinned packages if mkdocs is missing
  if (!existsSync(mkdocs)) {
    await run(python, ['-m', 'pip', 'install', '--upgrade', 'pip', '--disable-pip-version-check', '-q'], { stdio: 'inherit' });
    await run(python, ['-m', 'pip', 'install', '--disable-pip-version-check', '-q', ...REQUIREMENTS], { stdio: 'inherit' });
  }
  return { venvDir, python, mkdocs };
}

export async function buildWithMkdocs(opts: SidecarOptions): Promise<void> {
  const { mkdocs } = await ensureVenv(opts.outDir);
  const args = ['build'];
  if (opts.strict) args.push('--strict');
  await run(mkdocs, args, { cwd: opts.outDir, stdio: 'inherit' });
}

function run(cmd: string, args: string[], opts: { cwd?: string; stdio?: any } = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd: opts.cwd, stdio: opts.stdio ?? 'inherit' });
    p.on('error', reject);
    p.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited with code ${code}`));
    });
  });
}

async function findSystemPython(): Promise<{ cmd: string; args: string[] } | null> {
  // Windows: prefer the official launcher `py -3`. POSIX: prefer `python3`.
  const candidates: { cmd: string; args: string[] }[] = process.platform === 'win32'
    ? [
        { cmd: 'py', args: ['-3'] },
        { cmd: 'python', args: [] },
        { cmd: 'python3', args: [] },
      ]
    : [
        { cmd: 'python3', args: [] },
        { cmd: 'python', args: [] },
      ];
  for (const c of candidates) {
    if (await canRun(c.cmd, [...c.args, '--version'])) return c;
  }
  return null;
}

function canRun(cmd: string, args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { stdio: 'ignore' });
    p.on('error', () => resolve(false));
    p.on('close', (code) => resolve(code === 0));
  });
}

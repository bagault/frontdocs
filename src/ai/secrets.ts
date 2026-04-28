// Secret storage. Tries keytar (OS keychain) first, falls back to:
//   1. env var FRONTDOCS_AI_API_KEY
//   2. plaintext file at ~/.config/frontdocs/secrets.json (chmod 600 on POSIX)
import { homedir, platform } from 'node:os';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile, chmod } from 'node:fs/promises';

const SERVICE = 'frontdocs';

interface Keytar {
  getPassword(service: string, account: string): Promise<string | null>;
  setPassword(service: string, account: string, password: string): Promise<void>;
  deletePassword(service: string, account: string): Promise<boolean>;
}

let keytarMod: Keytar | null | undefined;

async function tryKeytar(): Promise<Keytar | null> {
  if (keytarMod !== undefined) return keytarMod;
  try {
    const m = await import('keytar');
    keytarMod = (m.default ?? m) as Keytar;
  } catch {
    keytarMod = null;
  }
  return keytarMod;
}

function configDir(): string {
  if (platform() === 'win32') {
    return join(process.env['APPDATA'] ?? join(homedir(), 'AppData', 'Roaming'), 'frontdocs');
  }
  return join(process.env['XDG_CONFIG_HOME'] ?? join(homedir(), '.config'), 'frontdocs');
}

function secretsPath(): string {
  return join(configDir(), 'secrets.json');
}

async function readFileSecrets(): Promise<Record<string, string>> {
  const p = secretsPath();
  if (!existsSync(p)) return {};
  try {
    return JSON.parse(await readFile(p, 'utf8')) as Record<string, string>;
  } catch {
    return {};
  }
}

async function writeFileSecrets(secrets: Record<string, string>): Promise<void> {
  const dir = configDir();
  await mkdir(dir, { recursive: true });
  const p = secretsPath();
  await writeFile(p, JSON.stringify(secrets, null, 2), 'utf8');
  if (platform() !== 'win32') {
    try { await chmod(p, 0o600); } catch {}
  }
}

export interface SecretLocation {
  backend: 'keychain' | 'file' | 'env' | 'none';
}

export async function getSecret(account: string): Promise<{ value: string | null; location: SecretLocation }> {
  // env wins for CI/automation
  const env = process.env['FRONTDOCS_AI_API_KEY'];
  if (env && env.length > 0) return { value: env, location: { backend: 'env' } };
  const k = await tryKeytar();
  if (k) {
    const v = await k.getPassword(SERVICE, account);
    if (v != null) return { value: v, location: { backend: 'keychain' } };
  }
  const file = await readFileSecrets();
  if (account in file) return { value: file[account], location: { backend: 'file' } };
  return { value: null, location: { backend: 'none' } };
}

export async function setSecret(account: string, value: string): Promise<SecretLocation> {
  const k = await tryKeytar();
  if (k) {
    await k.setPassword(SERVICE, account, value);
    return { backend: 'keychain' };
  }
  const file = await readFileSecrets();
  file[account] = value;
  await writeFileSecrets(file);
  return { backend: 'file' };
}

export async function deleteSecret(account: string): Promise<boolean> {
  const k = await tryKeytar();
  let removed = false;
  if (k) {
    try { removed = (await k.deletePassword(SERVICE, account)) || removed; } catch {}
  }
  const file = await readFileSecrets();
  if (account in file) {
    delete file[account];
    await writeFileSecrets(file);
    removed = true;
  }
  return removed;
}

export async function backendStatus(): Promise<'keychain' | 'file'> {
  const k = await tryKeytar();
  return k ? 'keychain' : 'file';
}

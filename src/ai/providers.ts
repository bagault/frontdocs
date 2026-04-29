// AI provider abstraction. Two providers:
//   - ollama  → POST {endpoint}/api/chat (no auth)
//   - custom  → POST {endpoint}/v1/chat/completions  (OpenAI-compatible, Bearer token)
//
// Both implement chat() returning a single text completion.
import { getSecret } from './secrets.js';

export interface AIProviderConfig {
  kind: 'ollama' | 'custom';
  endpoint: string;       // ollama: http://localhost:11434  | custom: https://api.example.com
  model: string;          // e.g. "llama3.2:3b" or "gpt-4o-mini"
  account?: string;       // keychain account; defaults to `${kind}:${endpoint}`
  // Optional knobs
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

export interface ChatMessage { role: 'system' | 'user' | 'assistant'; content: string }

export interface ChatResult {
  text: string;
  provider: AIProviderConfig['kind'];
  model: string;
  usage?: { prompt?: number; completion?: number; total?: number };
}

export function defaultAccount(cfg: AIProviderConfig): string {
  return cfg.account ?? `${cfg.kind}:${cfg.endpoint}`;
}

export async function chat(cfg: AIProviderConfig, messages: ChatMessage[]): Promise<ChatResult> {
  if (cfg.kind === 'ollama') return chatOllama(cfg, messages);
  return chatCustom(cfg, messages);
}

async function chatOllama(cfg: AIProviderConfig, messages: ChatMessage[]): Promise<ChatResult> {
  const url = trimTrailingSlash(cfg.endpoint) + '/api/chat';
  const body = {
    model: cfg.model,
    messages,
    stream: false,
    options: {
      ...(cfg.temperature != null ? { temperature: cfg.temperature } : {}),
      ...(cfg.maxTokens != null ? { num_predict: cfg.maxTokens } : {}),
    },
  };
  const res = await fetchWithTimeout(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }, cfg.timeoutMs ?? 120_000);
  if (!res.ok) throw new Error(`ollama HTTP ${res.status}: ${await safeText(res)}`);
  const j = await res.json() as { message?: { content?: string }; eval_count?: number; prompt_eval_count?: number };
  const text = j.message?.content ?? '';
  return {
    text,
    provider: 'ollama',
    model: cfg.model,
    usage: { prompt: j.prompt_eval_count, completion: j.eval_count, total: (j.prompt_eval_count ?? 0) + (j.eval_count ?? 0) },
  };
}

async function chatCustom(cfg: AIProviderConfig, messages: ChatMessage[]): Promise<ChatResult> {
  const account = defaultAccount(cfg);
  const { value: key } = await getSecret(account);
  if (!key) throw new Error(`No API key stored for "${account}". Run \`frontdocs ai login\` first.`);
  const url = trimTrailingSlash(cfg.endpoint) + '/v1/chat/completions';
  const body = {
    model: cfg.model,
    messages,
    ...(cfg.temperature != null ? { temperature: cfg.temperature } : {}),
    ...(cfg.maxTokens != null ? { max_tokens: cfg.maxTokens } : {}),
  };
  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  }, cfg.timeoutMs ?? 120_000);
  if (!res.ok) throw new Error(`custom HTTP ${res.status}: ${await safeText(res)}`);
  const j = await res.json() as { choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } };
  const text = j.choices?.[0]?.message?.content ?? '';
  return {
    text,
    provider: 'custom',
    model: cfg.model,
    usage: { prompt: j.usage?.prompt_tokens, completion: j.usage?.completion_tokens, total: j.usage?.total_tokens },
  };
}

export async function ping(cfg: AIProviderConfig): Promise<{ ok: boolean; detail: string }> {
  try {
    // Larger timeout than default chat: cold model loads (multi-GB) can take >2 min on first call.
    const r = await chat({ ...cfg, maxTokens: 8, timeoutMs: cfg.timeoutMs ?? 300_000 }, [
      { role: 'system', content: 'Reply with exactly the word "pong".' },
      { role: 'user', content: 'ping' },
    ]);
    return { ok: r.text.length > 0, detail: r.text.trim().slice(0, 80) };
  } catch (e) {
    return { ok: false, detail: (e as Error).message };
  }
}

function trimTrailingSlash(s: string): string {
  return s.endsWith('/') ? s.slice(0, -1) : s;
}

async function safeText(r: Response): Promise<string> {
  try { return (await r.text()).slice(0, 400); } catch { return ''; }
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const ctl = new AbortController();
  const id = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctl.signal });
  } finally {
    clearTimeout(id);
  }
}

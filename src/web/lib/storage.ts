/** localStorage that never throws (private windows and blocked storage fall back to memory). */
const memory = new Map<string, string>();

export function getItem(key: string): string | null {
  try {
    return localStorage.getItem(key) ?? memory.get(key) ?? null;
  } catch {
    return memory.get(key) ?? null;
  }
}

export function setItem(key: string, value: string): void {
  memory.set(key, value);
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable: memory copy is enough for this visit */
  }
}

/** True when this browser keeps what the app saves (false in some private windows or with site data blocked). */
export function canPersist(): boolean {
  try {
    const k = 'tt.probe';
    localStorage.setItem(k, '1');
    const ok = localStorage.getItem(k) === '1';
    localStorage.removeItem(k);
    return ok;
  } catch {
    return false;
  }
}

/** One random device token per browser. It is the only "identity": no accounts, no email. */
export function deviceToken(): string {
  const existing = getItem('tt.token');
  if (existing && /^[0-9a-f]{32,64}$/.test(existing)) return existing;
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const token = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  setItem('tt.token', token);
  return token;
}

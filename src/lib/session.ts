export type StoredSession = {
  code: string;
  playerId: string;
  token: string;
  name: string;
};

export function sessionKey(code: string) {
  return `passthephone:session:${code.toUpperCase()}`;
}

export function saveSession(session: StoredSession) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(sessionKey(session.code), JSON.stringify(session)); } catch { /* private mode */ }
}

export function loadSession(code: string): StoredSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(sessionKey(code));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    if (!parsed.token || !parsed.playerId || !parsed.code) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearSession(code: string) {
  if (typeof window === "undefined") return;
  try { localStorage.removeItem(sessionKey(code)); } catch { /* private mode */ }
}

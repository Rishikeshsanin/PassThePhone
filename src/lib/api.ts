import type { GameCategory, RoomState, SessionLength } from "@/types/game";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./supabase-public";

export type ApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string; details?: unknown };

const REQUEST_TIMEOUT_MS = 15_000;

export async function gameApi<T>(payload: Record<string, unknown>): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/pass_the_phone-game-api`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        apikey: SUPABASE_PUBLISHABLE_KEY,
        "x-client-info": "passthephone-web",
      },
      cache: "no-store",
      signal: controller.signal,
      body: JSON.stringify(payload),
    });
    const json = (await response.json().catch(() => ({
      ok: false,
      error: "Unexpected server response.",
    }))) as ApiResponse<T>;
    if (!response.ok || !json.ok) {
      throw new Error(json.ok ? "Request failed." : json.error || "Request failed.");
    }
    return json.data;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("That took too long. Check your connection and try again.");
    }
    if (error instanceof TypeError) {
      throw new Error("Could not reach the game server. Check your connection and try again.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

export type CreatedSession = { code: string; playerId: string; token: string; name: string };

export function createRoom(name: string) {
  return gameApi<CreatedSession>({ op: "create", name });
}

export function joinRoom(code: string, name: string) {
  return gameApi<CreatedSession>({ op: "join", code, name });
}

export function getRoomState(code: string, token: string) {
  return gameApi<RoomState>({ op: "state", code, token });
}

export function heartbeat(code: string, token: string) {
  return gameApi<RoomState>({ op: "heartbeat", code, token });
}

export function roomAction<T = { state?: RoomState }>(
  code: string,
  token: string,
  op: string,
  data: Record<string, unknown> = {},
) {
  return gameApi<T>({ op, code, token, ...data });
}

export function configureRoom(
  code: string,
  token: string,
  settings: Partial<{
    categories: GameCategory[];
    heat: number;
    sessionLength: SessionLength;
    allowSelf: boolean;
    chatEnabled: boolean;
  }>,
) {
  return roomAction<{ state: RoomState }>(code, token, "configure", settings);
}

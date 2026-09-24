import { NextRequest, NextResponse } from "next/server";
import { AccessToken } from "livekit-server-sdk";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/supabase-public";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RoomStateResponse = {
  ok: boolean;
  data?: {
    me?: { id?: string };
    room?: { code?: string; status?: string };
  };
};

function cleanCode(value: unknown) {
  return typeof value === "string"
    ? value.toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 5)
    : "";
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const code = cleanCode(body.code);
    const roomToken = typeof body.token === "string" ? body.token : "";

    if (code.length !== 5 || roomToken.length < 20) {
      return NextResponse.json({ error: "Invalid room session." }, { status: 401 });
    }

    const validation = await fetch(`${SUPABASE_URL}/functions/v1/pass_the_phone-game-api`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        apikey: SUPABASE_PUBLISHABLE_KEY,
        "x-client-info": "passthephone-livekit-token",
      },
      cache: "no-store",
      body: JSON.stringify({ op: "state", code, token: roomToken }),
    });

    const validated = (await validation.json().catch(() => null)) as RoomStateResponse | null;
    const participantId = validated?.ok ? validated.data?.me?.id : undefined;
    const validatedCode = validated?.ok ? validated.data?.room?.code : undefined;

    if (!validation.ok || !participantId || validatedCode !== code) {
      return NextResponse.json({ error: "Your PassThePhone room session is not valid." }, { status: 401 });
    }

    const serverUrl = process.env.LIVEKIT_URL?.trim();
    const apiKey = process.env.LIVEKIT_API_KEY?.trim();
    const apiSecret = process.env.LIVEKIT_API_SECRET?.trim();

    if (!serverUrl || !apiKey || !apiSecret) {
      return NextResponse.json(
        { error: "Voice/video is not configured yet.", configured: false },
        { status: 503 },
      );
    }

    const roomName = `passthephone-${code.toLowerCase()}`;
    const accessToken = new AccessToken(apiKey, apiSecret, {
      identity: participantId,
      ttl: "2h",
    });
    accessToken.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    return NextResponse.json({
      configured: true,
      serverUrl,
      participantToken: await accessToken.toJwt(),
      roomName,
    });
  } catch (error) {
    console.error("livekit-token", error);
    return NextResponse.json({ error: "Could not start the call." }, { status: 500 });
  }
}

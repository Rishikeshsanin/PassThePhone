"use client";

import { useState } from "react";
import { Headphones, Loader2, Phone, Video, X } from "lucide-react";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  StartAudio,
  VideoConference,
} from "@livekit/components-react";

type LiveKitCredentials = {
  configured: true;
  serverUrl: string;
  participantToken: string;
  roomName: string;
};

export function LiveCall({ code, token }: { code: string; token: string }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"voice" | "video" | null>(null);
  const [credentials, setCredentials] = useState<LiveKitCredentials | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function join(nextMode: "voice" | "video") {
    if (busy) return;
    try {
      setBusy(true);
      setError("");
      const response = await fetch("/api/livekit-token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ code, token }),
      });
      const data = (await response.json().catch(() => ({}))) as Partial<LiveKitCredentials> & { error?: string; configured?: boolean };
      if (!response.ok || !data.serverUrl || !data.participantToken) {
        throw new Error(
          data.configured === false
            ? "Voice/video needs the one-time LiveKit connection before it can go live."
            : data.error || "Could not join the call.",
        );
      }
      setMode(nextMode);
      setCredentials(data as LiveKitCredentials);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join the call.");
    } finally {
      setBusy(false);
    }
  }

  function resetCall() {
    setCredentials(null);
    setMode(null);
  }

  return (
    <>
      <button type="button" className="btn btn-secondary !min-h-11 !px-3" onClick={() => setOpen(true)}>
        <Phone size={18} />
        <span className="hidden sm:inline">Call</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-[95] bg-black/80 p-2 backdrop-blur-xl sm:p-4" onClick={() => !credentials && setOpen(false)}>
          <section
            className="glass mx-auto flex h-full w-full max-w-6xl flex-col overflow-hidden rounded-[28px]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3 sm:px-5">
              <div>
                <div className="font-black">{credentials ? (mode === "video" ? "Video room" : "Voice room") : "Talk to the room"}</div>
                <div className="mt-0.5 text-xs text-white/40">
                  {credentials ? "Call controls are private to your device." : "Optional for friends playing remotely."}
                </div>
              </div>
              <button
                type="button"
                className="btn btn-ghost !min-h-10 !w-10 !p-0"
                aria-label="Close call"
                onClick={() => {
                  if (credentials) resetCall();
                  setOpen(false);
                }}
              >
                <X size={18} />
              </button>
            </div>

            {!credentials ? (
              <div className="grid flex-1 place-items-center overflow-y-auto p-5 sm:p-8">
                <div className="w-full max-w-xl">
                  <div className="mx-auto grid h-16 w-16 place-items-center rounded-3xl border border-violet-400/15 bg-violet-500/10">
                    <Headphones className="text-violet-300" />
                  </div>
                  <h2 className="mt-5 text-center text-3xl font-black tracking-[-.04em]">Same game. Any distance.</h2>
                  <p className="mx-auto mt-3 max-w-md text-center text-sm leading-6 text-white/45">
                    Join audio or video without leaving the game. If everyone is physically together, keep calls off to avoid speaker feedback.
                  </p>

                  {error && (
                    <div className="mt-5 rounded-2xl border border-amber-300/15 bg-amber-300/[.06] p-4 text-sm leading-6 text-amber-50/75">
                      {error}
                    </div>
                  )}

                  <div className="mt-7 grid gap-3 sm:grid-cols-2">
                    <button type="button" className="btn btn-secondary min-h-16" disabled={busy} onClick={() => void join("voice")}>
                      {busy ? <Loader2 className="animate-spin" size={20} /> : <Headphones size={20} />}
                      Join voice
                    </button>
                    <button type="button" className="btn btn-primary min-h-16" disabled={busy} onClick={() => void join("video")}>
                      {busy ? <Loader2 className="animate-spin" size={20} /> : <Video size={20} />}
                      Join video
                    </button>
                  </div>

                  <p className="mt-5 text-center text-[11px] leading-5 text-white/25">
                    Microphone and camera permissions stay under your browser controls. You can mute, disable video, share your screen, or leave at any time.
                  </p>
                </div>
              </div>
            ) : (
              <div className="min-h-0 flex-1 bg-[#050509] p-1" data-lk-theme="default">
                <LiveKitRoom
                  token={credentials.participantToken}
                  serverUrl={credentials.serverUrl}
                  connect
                  audio
                  video={mode === "video"}
                  onDisconnected={resetCall}
                  onError={(nextError) => setError(nextError.message)}
                  options={{ adaptiveStream: true, dynacast: true }}
                  style={{ height: "100%" }}
                >
                  <VideoConference />
                  <RoomAudioRenderer />
                  <StartAudio label="Tap to enable call audio" />
                </LiveKitRoom>
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}

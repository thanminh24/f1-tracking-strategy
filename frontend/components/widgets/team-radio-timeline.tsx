"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../lib/api-client";
import { loadRadioMode, saveRadioMode, type RadioDisplayMode } from "../../lib/radio-mode";
import { useRaceStateStore } from "../../lib/race-state-store";
import { isLiveTimingSource } from "../../lib/session-source";
import { resolveLiveRadioUrl } from "../../lib/team-radio-url";
import { usePersistedPreference } from "../../lib/use-persisted-preference";
import { TeamRadioMessage } from "../../lib/types";

interface Props {
  sessionKey: string;
  asrAvailable?: boolean;
}

const DRIVER_CODE_COLORS: Record<string, string> = {
  HAM: "#27F4D2",
  RUS: "#27F4D2",
  VER: "#3671C6",
  PER: "#3671C6",
  LEC: "#E8002D",
  SAI: "#E8002D",
  NOR: "#FF8000",
  PIA: "#FF8000",
  ALO: "#229971",
  STR: "#229971",
  BOT: "#52E252",
  ZHO: "#52E252",
  MAG: "#B6BABD",
  HUL: "#B6BABD",
  GAS: "#6692FF",
  TSU: "#6692FF",
  OCO: "#FF87BC",
  GAR: "#64C4FF",
  ALB: "#64C4FF",
  LAW: "#64C4FF",
};

function getDriverColor(driverCode: string): string {
  return DRIVER_CODE_COLORS[driverCode.toUpperCase()] ?? "#707070";
}

function formatCaptureTime(tSessionS: number): string {
  if (!tSessionS) return "—";
  const date = new Date(tSessionS > 1_000_000_000_000 ? tSessionS : tSessionS * 1000);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function placeholderText(isLive: boolean): string {
  if (isLive) return "Live capture — no transcript from feed.";
  return "Archive capture — no transcript on file.";
}

function ModeToggle({
  mode,
  asrAvailable,
  onChange,
}: {
  mode: RadioDisplayMode;
  asrAvailable: boolean;
  onChange: (mode: RadioDisplayMode) => void;
}) {
  const options: Array<{ id: RadioDisplayMode; label: string; title: string }> = [
    { id: "text", label: "Text", title: "Show feed transcript or placeholder" },
    { id: "audio", label: "Audio", title: "Play team-radio clips when available" },
    {
      id: "transcribe",
      label: "Transcribe",
      title: asrAvailable
        ? "Auto speech-to-text via backend Whisper"
        : "Install backend ASR: uv sync --group asr",
    },
  ];

  return (
    <div className="flex shrink-0 items-center gap-1 rounded border border-f1-border bg-f1-bg/40 p-0.5">
      {options.map((opt) => {
        const disabled = opt.id === "transcribe" && !asrAvailable;
        const active = mode === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            title={opt.title}
            disabled={disabled}
            onClick={() => onChange(opt.id)}
            className={[
              "rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider transition-colors",
              active ? "bg-f1-red/90 text-white" : "text-f1-muted hover:text-f1-text",
              disabled ? "cursor-not-allowed opacity-40" : "",
            ].join(" ")}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export function TeamRadioTimeline({ sessionKey, asrAvailable = false }: Props) {
  const [messages, setMessages] = useState<TeamRadioMessage[]>([]);
  const [mode, handleModeChange] = usePersistedPreference(loadRadioMode, saveRadioMode);
  const [transcripts, setTranscripts] = useState<Record<string, string>>({});
  const [transcribing, setTranscribing] = useState<Record<string, boolean>>({});
  const inflight = useRef(new Set<string>());

  const source = useRaceStateStore((s) => s.source);
  const liveCaptures = useRaceStateStore((s) => s.state?.team_radio_captures);
  const sessionPath = useRaceStateStore((s) => s.state?.session_info?.Path);
  const driverList = useRaceStateStore((s) => s.state?.driver_list);
  const isLiveFeed = isLiveTimingSource(source);
  const [loading, setLoading] = useState(() => !isLiveFeed);
  const [error, setError] = useState(false);

  const liveMessages = useMemo<TeamRadioMessage[]>(() => {
    if (!isLiveFeed || !liveCaptures?.length) return [];
    return liveCaptures
      .slice(-200)
      .reverse()
      .map((capture) => {
        const driver = driverList?.[capture.RacingNumber];
        const code = driver?.Tla ?? capture.RacingNumber;
        const captureRecord = capture as { Message?: string; message?: string };
        const transcript = captureRecord.Message ?? captureRecord.message ?? null;
        return {
          lap: 0,
          t_session_s: Date.parse(capture.Utc) || 0,
          driver_code: code,
          msg: transcript,
          audio_url: resolveLiveRadioUrl(sessionPath, capture.Path),
        };
      });
  }, [driverList, isLiveFeed, liveCaptures, sessionPath]);

  useEffect(() => {
    if (isLiveFeed) return;
    let cancelled = false;
    Promise.resolve(api.teamRadio(sessionKey))
      .then((data) => {
        if (cancelled || !data) return;
        data.sort((a, b) => b.lap - a.lap || b.t_session_s - a.t_session_s);
        setMessages(data.slice(0, 200));
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isLiveFeed, sessionKey]);

  const visibleMessages = isLiveFeed ? liveMessages : messages;

  const requestTranscript = useCallback(async (audioUrl: string) => {
    if (inflight.current.has(audioUrl)) return;
    inflight.current.add(audioUrl);
    setTranscribing((prev) => ({ ...prev, [audioUrl]: true }));
    try {
      const result = await api.transcribeRadio(audioUrl);
      if (result.text) {
        setTranscripts((prev) => ({ ...prev, [audioUrl]: result.text as string }));
      }
    } catch {
      /* keep placeholder */
    } finally {
      inflight.current.delete(audioUrl);
      setTranscribing((prev) => ({ ...prev, [audioUrl]: false }));
    }
  }, []);

  useEffect(() => {
    if (mode !== "transcribe" || !asrAvailable) return;
    for (const msg of visibleMessages) {
      if (!msg.audio_url || msg.msg?.trim()) continue;
      if (transcripts[msg.audio_url] || inflight.current.has(msg.audio_url)) continue;
      void requestTranscript(msg.audio_url);
    }
  }, [asrAvailable, mode, requestTranscript, visibleMessages, transcripts]);

  const displayText = useCallback(
    (msg: TeamRadioMessage): string => {
      if (msg.msg?.trim()) return msg.msg.trim();
      if (mode === "transcribe" && msg.audio_url) {
        if (transcripts[msg.audio_url]) return transcripts[msg.audio_url];
        if (transcribing[msg.audio_url]) return "Transcribing…";
        if (!asrAvailable) return "ASR unavailable — install backend: uv sync --group asr";
        return "Queued for transcription…";
      }
      if (mode === "audio" && msg.audio_url) return "Audio clip — use player below.";
      return placeholderText(isLiveFeed);
    },
    [asrAvailable, isLiveFeed, mode, transcribing, transcripts],
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-2 text-xs">
      <div className="flex shrink-0 items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-widest text-f1-muted">Display</span>
        <ModeToggle mode={mode} asrAvailable={asrAvailable} onChange={handleModeChange} />
      </div>

      {loading ? <div className="text-f1-muted text-center py-2">Loading team radio log…</div> : null}
      {error ? <div className="text-red-500 text-center py-2">Failed to load team radio log</div> : null}

      {!loading && !error && visibleMessages.length === 0 ? (
        <div className="text-f1-muted text-center py-2">No team radio messages yet</div>
      ) : null}

      {!loading && !error && visibleMessages.length > 0 ? (
        <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin flex flex-col gap-1.5">
          {visibleMessages.map((msg, idx) => (
            <article
              key={`${msg.driver_code}-${msg.t_session_s}-${idx}`}
              className="rounded border border-f1-border bg-f1-surface/50 p-2"
            >
              <div className="mb-1 flex items-center gap-2 text-[10px] uppercase tracking-widest text-f1-muted">
                <span>{isLiveFeed ? "Live" : `Lap ${msg.lap || "—"}`}</span>
                <span>·</span>
                <span className="font-data normal-case tracking-normal">
                  {formatCaptureTime(msg.t_session_s)}
                </span>
              </div>
              <div className="flex items-start gap-2">
                <span
                  className="font-data text-sm font-bold shrink-0"
                  style={{ color: getDriverColor(msg.driver_code) }}
                >
                  {msg.driver_code}
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  {(mode === "text" || mode === "transcribe" || !msg.audio_url) && (
                    <p className="text-sm leading-relaxed text-f1-text">{displayText(msg)}</p>
                  )}
                  {mode === "audio" && msg.audio_url ? (
                    <audio
                      controls
                      preload="none"
                      className="h-8 w-full max-w-md"
                      src={msg.audio_url}
                    >
                      <track kind="captions" />
                    </audio>
                  ) : null}
                  {mode === "transcribe" && msg.audio_url ? (
                    <audio
                      controls
                      preload="none"
                      className="h-7 w-full max-w-md opacity-80"
                      src={msg.audio_url}
                    >
                      <track kind="captions" />
                    </audio>
                  ) : null}
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </div>
  );
}

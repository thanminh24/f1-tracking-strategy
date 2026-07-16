// Source-agnostic WebSocket client for /ws/feed/{sessionKey}.
// Drop-in replacement for ReplayWsClient — same control API, same store pushes.
// Adds source() / setSource() for archive ↔ live switching (phase 5).
import { API_BASE, WS_BASE } from "./api-client";
import { useLiveTelemetryStore } from "./live-telemetry-store";
import { usePredictionStore } from "./prediction-store";
import { useRaceStateStore } from "./race-state-store";
import type { RaceState, ReplayStatus, WsMessage } from "./types";
import { cancelWsFrameFlush, scheduleWsFrameFlush } from "./ws-frame-batcher";

export type ControlAction = "play" | "pause" | "speed" | "seek";

export class FeederClient {
  private ws: WebSocket | null = null;
  private closed = false;
  private retryMs = 1000;
  private pendingRaceState: RaceState | null = null;
  private pendingStatus: ReplayStatus | null = null;
  private readonly flushFrame = () => {
    const store = useRaceStateStore.getState();
    if (this.pendingRaceState) {
      store.setState(this.pendingRaceState);
      this.pendingRaceState = null;
    }
    if (this.pendingStatus) {
      store.setStatus(this.pendingStatus);
      this.pendingStatus = null;
    }
  };

  constructor(private sessionKey: string) {}

  connect(): void {
    this.closed = false;
    this.open();
  }

  private open(): void {
    const store = useRaceStateStore.getState();
    // Connect to the IFeeder-backed endpoint; /ws/replay alias still works too.
    this.ws = new WebSocket(`${WS_BASE}/ws/feed/${this.sessionKey}`);
    this.ws.onopen = () => {
      store.setConnected(true);
      this.retryMs = 1000;
    };
    this.ws.onmessage = (ev) => {
      let msg: WsMessage;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.type === "race_state") {
        this.pendingRaceState = msg.data;
        scheduleWsFrameFlush(this.flushFrame);
      } else if (msg.type === "replay_status") {
        this.pendingStatus = msg.data;
        scheduleWsFrameFlush(this.flushFrame);
      } else if (msg.type === "predictions")
        usePredictionStore.getState().setPrediction(msg.data);
      else if (msg.type === "race_control")
        store.mergeRaceControl(msg.data);
      else if (msg.type === "telemetry")
        useLiveTelemetryStore.getState().setAll(msg.data);
    };
    this.ws.onclose = () => {
      cancelWsFrameFlush(this.flushFrame);
      this.pendingRaceState = null;
      this.pendingStatus = null;
      store.setConnected(false);
      if (!this.closed) {
        store.setReconnecting(true);
        setTimeout(() => {
          store.setReconnecting(false);
          this.open();
        }, this.retryMs);
        this.retryMs = Math.min(this.retryMs * 2, 10_000);
      }
    };
  }

  /** Send a playback control message. No-op when source is live. */
  control(action: ControlAction, value?: number): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "control", action, value }));
    }
  }

  /** Switch data source. Tears down the backend feeder session and reconnects. */
  async setSource(source: "archive" | "live" | "fixture"): Promise<void> {
    await fetch(`${API_BASE}/api/sessions/${this.sessionKey}/source`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source }),
    });
    // Re-open WS so the new feeder session is picked up
    this.ws?.close();
  }

  /** Fetch current source from backend. */
  async getSource(): Promise<{ source: string; live_available: boolean }> {
    const res = await fetch(
      `${API_BASE}/api/sessions/${this.sessionKey}/source`,
      { cache: "no-store" },
    );
    return res.json();
  }

  close(): void {
    this.closed = true;
    cancelWsFrameFlush(this.flushFrame);
    this.pendingRaceState = null;
    this.pendingStatus = null;
    this.ws?.close();
    useRaceStateStore.getState().reset();
    usePredictionStore.getState().reset();
    useLiveTelemetryStore.getState().reset();
  }
}

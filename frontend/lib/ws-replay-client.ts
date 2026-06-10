// Typed replay WebSocket client with auto-reconnect; pushes into the zustand store.
import { WS_BASE } from "./api-client";
import { useRaceStateStore } from "./race-state-store";
import type { WsMessage } from "./types";

export type ControlAction = "play" | "pause" | "speed" | "seek";

export class ReplayWsClient {
  private ws: WebSocket | null = null;
  private closed = false;
  private retryMs = 1000;

  constructor(private sessionKey: string) {}

  connect(): void {
    this.closed = false;
    this.open();
  }

  private open(): void {
    const store = useRaceStateStore.getState();
    this.ws = new WebSocket(`${WS_BASE}/ws/replay/${this.sessionKey}`);
    this.ws.onopen = () => {
      store.setConnected(true);
      this.retryMs = 1000;
    };
    this.ws.onmessage = (ev) => {
      const msg: WsMessage = JSON.parse(ev.data);
      if (msg.type === "race_state") store.setState(msg.data);
      else if (msg.type === "replay_status") store.setStatus(msg.data);
    };
    this.ws.onclose = () => {
      store.setConnected(false);
      if (!this.closed) {
        // exponential backoff capped at 10s; status resyncs on reconnect snapshot
        setTimeout(() => this.open(), this.retryMs);
        this.retryMs = Math.min(this.retryMs * 2, 10_000);
      }
    };
  }

  control(action: ControlAction, value?: number): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "control", action, value }));
    }
  }

  close(): void {
    this.closed = true;
    this.ws?.close();
    useRaceStateStore.getState().reset();
  }
}

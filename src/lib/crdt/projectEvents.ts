import type { ProjectFile, ProjectRole } from '../types';

export type ClientProjectEvent =
  | { type: 'connected'; projectId: string; role: ProjectRole }
  | { type: 'file:created'; projectId: string; file: ProjectFile }
  | { type: 'file:updated'; projectId: string; file: ProjectFile }
  | { type: 'file:deleted'; projectId: string; fileId: string }
  | {
      type: 'project:updated';
      projectId: string;
      project: { name?: string; description?: string; isPublic?: boolean };
    }
  | { type: 'member:role-updated'; projectId: string; userId: string; role: ProjectRole }
  | { type: 'member:removed'; projectId: string; userId: string }
  | { type: 'member:joined'; projectId: string; userId: string; role: ProjectRole };

/**
 * Subscribes to project-level real-time events (files, renames, membership & role updates) over WebSocket.
 */
export function subscribeProjectEvents(
  projectId: string,
  onEvent: (event: ClientProjectEvent) => void
): () => void {
  if (typeof window === 'undefined' || typeof WebSocket === 'undefined') {
    return () => {};
  }

  let closedByCaller = false;
  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let attempt = 0;

  const scheduleReconnect = () => {
    if (closedByCaller) return;
    const delay = Math.min(10000, 1000 * Math.pow(1.5, attempt));
    attempt += 1;
    reconnectTimer = setTimeout(connect, delay);
  };

  const connect = () => {
    if (closedByCaller) return;

    const isHttps = window.location.protocol === 'https:';
    const wsProto = isHttps ? 'wss:' : 'ws:';
    let token = '';
    try {
      token = localStorage.getItem('obsidian_token') || '';
    } catch {
      token = '';
    }

    const url = `${wsProto}//${window.location.host}/ws/obsidian-project-events-${encodeURIComponent(projectId)}?token=${encodeURIComponent(token)}`;

    try {
      ws = new WebSocket(url);
    } catch {
      scheduleReconnect();
      return;
    }

    ws.onopen = () => {
      attempt = 0;
    };

    ws.onmessage = (msgEvent) => {
      try {
        const data = JSON.parse(String(msgEvent.data)) as ClientProjectEvent;
        if (data && typeof data.type === 'string') {
          onEvent(data);
        }
      } catch {
        // Ignore malformed payloads
      }
    };

    ws.onclose = (closeEvent) => {
      ws = null;
      // Do not reconnect when rejected due to authorization/removal
      if (!closedByCaller && closeEvent.code !== 4003 && closeEvent.code !== 1008) {
        scheduleReconnect();
      }
    };
  };

  connect();

  return () => {
    closedByCaller = true;
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (ws) {
      ws.close();
      ws = null;
    }
  };
}

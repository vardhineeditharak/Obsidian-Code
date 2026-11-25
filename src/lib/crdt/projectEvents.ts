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
  let consecutiveFailedUpgrades = 0;

  const readToken = (): string => {
    try {
      return localStorage.getItem('obsidian_token') || '';
    } catch {
      return '';
    }
  };

  const tokenIsExpired = (token: string): boolean => {
    try {
      const payloadSegment = token.split('.')[1];
      const json = atob(payloadSegment.replace(/-/g, '+').replace(/_/g, '/'));
      const payload = JSON.parse(json) as { exp?: number };
      return typeof payload.exp === 'number' && payload.exp * 1000 <= Date.now();
    } catch {
      return true;
    }
  };

  const scheduleReconnect = () => {
    if (closedByCaller) return;
    const delay = Math.min(10000, 1000 * Math.pow(1.5, attempt));
    attempt += 1;
    reconnectTimer = setTimeout(connect, delay);
  };

  const connect = () => {
    if (closedByCaller) return;

    const token = readToken();
    // A failed upgrade is reported by browsers as close code 1006 (no close frame). Never
    // reconnect forever when we have no usable credential to present to the server.
    if (!token || tokenIsExpired(token)) return;

    const isHttps = window.location.protocol === 'https:';
    const wsProto = isHttps ? 'wss:' : 'ws:';

    const url = `${wsProto}//${window.location.host}/ws/obsidian-project-events-${encodeURIComponent(projectId)}?token=${encodeURIComponent(token)}`;

    let opened = false;
    try {
      ws = new WebSocket(url);
    } catch {
      scheduleReconnect();
      return;
    }

    ws.onopen = () => {
      opened = true;
      attempt = 0;
      consecutiveFailedUpgrades = 0;
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
      // Do not reconnect when rejected due to authorization/removal.
      if (closedByCaller || closeEvent.code === 4003 || closeEvent.code === 1008) return;

      if (!opened && closeEvent.code === 1006) {
        consecutiveFailedUpgrades += 1;
        if (consecutiveFailedUpgrades >= 2) return;
      }
      scheduleReconnect();
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

import { EventEmitter } from 'node:events';

export type ProjectRole = 'owner' | 'editor' | 'viewer';

export type ProjectRealtimeEvent =
  | { type: 'file:created'; projectId: string; file: any }
  | { type: 'file:updated'; projectId: string; file: any }
  | { type: 'file:deleted'; projectId: string; fileId: string }
  | { type: 'project:updated'; projectId: string; project: any }
  | { type: 'member:role-updated'; projectId: string; userId: string; role: ProjectRole }
  | { type: 'member:removed'; projectId: string; userId: string }
  | { type: 'member:joined'; projectId: string; userId: string; role: ProjectRole };

class ProjectEventBus extends EventEmitter {}

export const projectEventBus = new ProjectEventBus();
projectEventBus.setMaxListeners(50);

/**
 * Emits a project-scoped real-time event for active WebSocket listeners.
 */
export function emitProjectEvent(event: ProjectRealtimeEvent): void {
  projectEventBus.emit('project-event', event);
}

import mongoose from 'mongoose';
import { config } from './config';

let connectPromise: Promise<boolean> | null = null;
let listenersRegistered = false;

const STATE_NAMES: Record<number, string> = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
};

function registerConnectionListeners(): void {
  if (listenersRegistered) return;
  listenersRegistered = true;

  mongoose.connection.on('disconnected', () => {
    console.warn('MongoDB disconnected.');
  });

  mongoose.connection.on('reconnected', () => {
    console.log('MongoDB reconnected.');
  });
}

/**
 * Establishes the singleton Mongoose connection pool.
 * Falls back gracefully in dev/test when MongoDB is unavailable.
 */
export async function connectDB(): Promise<boolean> {
  if (mongoose.connection.readyState === 1) {
    return true;
  }
  if (connectPromise) {
    return connectPromise;
  }

  registerConnectionListeners();

  connectPromise = (async () => {
    try {
      mongoose.set('strictQuery', true);
      await mongoose.connect(config.MONGODB_URI, {
        // Asynchronous Node.js server: 20 connections gives headroom for REST + Yjs snapshot bursts
        maxPoolSize: 20,
        // Small warm pool avoids cold-start latency while keeping server memory footprint minimal
        minPoolSize: 2,
        // Reclaim idle connections after 60s
        maxIdleTimeMS: 60_000,
        // Fail fast on TCP/TLS connection errors and server discovery (enables quick fallback in dev/test)
        connectTimeoutMS: 5000,
        serverSelectionTimeoutMS: 5000,
        // Prevent hanging database operations
        socketTimeoutMS: 30_000,
      });
      console.log('MongoDB connected successfully.');
      return true;
    } catch (err) {
      console.warn('MongoDB connection failed or unavailable:', (err as Error).message);
      if (config.NODE_ENV === 'production') {
        console.warn('Production requires MongoDB Atlas connectivity.');
      } else {
        console.log('Development/test mode: running with in-memory fallback store.');
      }
      return false;
    } finally {
      connectPromise = null;
    }
  })();

  return connectPromise;
}

/**
 * Closes the active Mongoose connection pool during graceful shutdown.
 */
export async function disconnectDB(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}

export function getDBStatus(): { status: string; connected: boolean; host?: string } {
  const readyState = mongoose.connection.readyState;
  return {
    status: STATE_NAMES[readyState] || 'unknown',
    connected: readyState === 1,
    host: mongoose.connection.host || undefined,
  };
}

export async function pingDB(): Promise<{
  status: string;
  connected: boolean;
  host?: string;
  latencyMs?: number;
}> {
  const statusObj: {
    status: string;
    connected: boolean;
    host?: string;
    latencyMs?: number;
  } = getDBStatus();

  if (statusObj.connected && mongoose.connection.db) {
    try {
      const start = Date.now();
      await mongoose.connection.db.admin().ping();
      statusObj.latencyMs = Date.now() - start;
    } catch {
      statusObj.status = 'error';
      statusObj.connected = false;
    }
  }

  return statusObj;
}

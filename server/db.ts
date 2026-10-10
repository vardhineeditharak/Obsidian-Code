import mongoose from 'mongoose';
import { config } from './config';

let isConnected = false;

export async function connectDB(): Promise<boolean> {
  if (isConnected) return true;

  try {
    mongoose.set('strictQuery', true);
    await mongoose.connect(config.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
    });
    isConnected = true;
    console.log('MongoDB connected successfully.');
    return true;
  } catch (err) {
    console.warn('MongoDB connection failed or unavailable:', (err as Error).message);
    if (config.NODE_ENV === 'production') {
      console.warn('Production requires MongoDB Atlas connectivity.');
    } else {
      console.log('Development mode: running with in-memory fallback store where appropriate.');
    }
    return false;
  }
}

mongoose.connection.on('disconnected', () => {
  isConnected = false;
  console.warn('MongoDB disconnected. Retrying...');
});

mongoose.connection.on('reconnected', () => {
  isConnected = true;
  console.log('MongoDB reconnected.');
});

export function getDBStatus(): { status: string; connected: boolean; host?: string } {
  const readyState = mongoose.connection.readyState;
  const stateNames: Record<number, string> = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting',
  };
  return {
    status: stateNames[readyState] || 'unknown',
    connected: readyState === 1,
    host: mongoose.connection.host || undefined,
  };
}

export async function pingDB(): Promise<{ status: string; connected: boolean; host?: string; latencyMs?: number }> {
  const readyState = mongoose.connection.readyState;
  const stateNames: Record<number, string> = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting',
  };

  const statusObj: { status: string; connected: boolean; host?: string; latencyMs?: number } = {
    status: stateNames[readyState] || 'unknown',
    connected: readyState === 1,
    host: mongoose.connection.host || undefined,
  };

  if (readyState === 1 && mongoose.connection.db) {
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

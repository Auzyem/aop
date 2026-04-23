'use client';
import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';

const WS_URL =
  process.env.NEXT_PUBLIC_WS_URL ??
  (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3001');

let globalSocket: Socket | null = null;

function getSocket(token: string): Socket {
  if (!globalSocket || !globalSocket.connected) {
    globalSocket = io(WS_URL, {
      path: '/ws',
      auth: { token },
      transports: ['websocket'],
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
    });
  }
  return globalSocket;
}

export function useWebSocket(token: string | null): { socket: Socket | null; connected: boolean } {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!token) return;
    const socket = getSocket(token);
    socketRef.current = socket;
    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    return () => {
      /* keep socket alive across pages */
    };
  }, [token]);

  return { socket: socketRef.current, connected };
}

export interface LmePriceData {
  priceUsdPerKg: number;
  recordedAt: string;
  stale?: boolean;
}

export function useLMEPrice(token: string | null) {
  const { socket } = useWebSocket(token);
  const [priceData, setPriceData] = useState<LmePriceData | null>(null);

  useEffect(() => {
    if (!socket) return;
    socket.emit('subscribe:lme');
    socket.on('lme:price', (data: LmePriceData) => setPriceData(data));
    return () => {
      socket.off('lme:price');
    };
  }, [socket]);

  return priceData;
}

export function useTransactionUpdates(txnId: string | null, token: string | null) {
  const { socket } = useWebSocket(token);
  const [lastEvent, setLastEvent] = useState<{ event: string; data: unknown } | null>(null);

  useEffect(() => {
    if (!socket || !txnId) return;
    socket.emit('subscribe:txn', txnId);
    const handler = (event: string) => (data: unknown) => setLastEvent({ event, data });
    socket.on('txn:phase', handler('txn:phase'));
    socket.on('txn:document', handler('txn:document'));
    return () => {
      socket.emit('unsubscribe:txn', txnId);
      socket.off('txn:phase');
      socket.off('txn:document');
    };
  }, [socket, txnId]);

  return lastEvent;
}

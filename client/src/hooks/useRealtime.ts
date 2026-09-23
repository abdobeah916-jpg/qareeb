import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";

export type DirectSignalKind = "call-offer" | "call-answer" | "ice-candidate" | "call-ended";

export type DirectSignal = {
  conversationId: string;
  fromDeviceId: string;
  kind: DirectSignalKind;
  data?: unknown;
};

type RealtimeOptions = {
  deviceId: string;
  roomId: string;
  onDirectMessage: (event: { conversationId: string; fromDeviceId: string }) => void;
  onDirectSignal: (event: DirectSignal) => void;
  onDirectTyping: (event: { conversationId: string; fromDeviceId: string; isTyping: boolean }) => void;
  onDirectRead: (event: { conversationId: string; fromDeviceId: string; readAt: number }) => void;
  onRoomActivity: (event: { roomId: string }) => void;
};

export function useRealtime({ roomId, deviceId, onDirectMessage, onDirectSignal, onDirectTyping, onDirectRead, onRoomActivity }: RealtimeOptions) {
  const socketRef = useRef<Socket | null>(null);
  const messageHandlerRef = useRef(onDirectMessage);
  const signalHandlerRef = useRef(onDirectSignal);
  const typingHandlerRef = useRef(onDirectTyping);
  const readHandlerRef = useRef(onDirectRead);
  const roomActivityHandlerRef = useRef(onRoomActivity);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    messageHandlerRef.current = onDirectMessage;
    signalHandlerRef.current = onDirectSignal;
    typingHandlerRef.current = onDirectTyping;
    readHandlerRef.current = onDirectRead;
    roomActivityHandlerRef.current = onRoomActivity;
  }, [onDirectMessage, onDirectRead, onDirectSignal, onDirectTyping, onRoomActivity]);

  useEffect(() => {
    const socket = io({ path: "/socket.io", transports: ["websocket", "polling"] });
    socketRef.current = socket;
    const register = () => {
      setIsConnected(true);
      socket.emit("realtime:register", deviceId, roomId);
    };
    socket.on("connect", register);
    socket.on("disconnect", () => setIsConnected(false));
    socket.on("direct:message", event => messageHandlerRef.current(event));
    socket.on("direct:signal", event => signalHandlerRef.current(event));
    socket.on("direct:typing", event => typingHandlerRef.current(event));
    socket.on("direct:read", event => readHandlerRef.current(event));
    socket.on("room:activity", event => roomActivityHandlerRef.current(event));

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setIsConnected(false);
    };
  }, [deviceId, roomId]);

  const notifyDirectMessage = useCallback((conversationId: string) => {
    socketRef.current?.emit("direct:notify", { conversationId });
  }, []);

  const sendDirectSignal = useCallback((conversationId: string, kind: DirectSignalKind, data?: unknown) => {
    socketRef.current?.emit("direct:signal", { conversationId, kind, data });
  }, []);
  const sendDirectTyping = useCallback((conversationId: string, isTyping: boolean) => {
    socketRef.current?.emit("direct:typing", { conversationId, isTyping });
  }, []);
  const sendDirectRead = useCallback((conversationId: string, readAt: number) => {
    socketRef.current?.emit("direct:read", { conversationId, readAt });
  }, []);

  return { isConnected, notifyDirectMessage, sendDirectSignal, sendDirectTyping, sendDirectRead };
}

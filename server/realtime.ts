import type { Server as HttpServer } from "http";
import { Server } from "socket.io";
import { assertDirectMessageAllowed, getDirectPeerIdForMember } from "./db";

const signalKinds = new Set(["call-offer", "call-answer", "ice-candidate", "call-ended"]);
let realtimeIo: Server | null = null;

export function notifyRoomRealtime(roomId: string) {
  realtimeIo?.to(`room:${roomId}`).emit("room:activity", { roomId });
}

export function revokeRealtimeDevice(deviceId: string) {
  const room = realtimeIo?.sockets.adapter.rooms.get(`device:${deviceId}`);
  if (!room) return 0;
  let closed = 0;
  for (const socketId of Array.from(room)) {
    const socket = realtimeIo?.sockets.sockets.get(socketId);
    if (socket) {
      closed += 1;
      socket.emit("session:revoked");
      socket.disconnect(true);
    }
  }
  return closed;
}

function validDeviceId(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 96;
}

function validConversationId(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("direct_") && value.length <= 64;
}

export function registerRealtimeServer(server: HttpServer) {
  const io = new Server(server, {
    path: "/socket.io",
    transports: ["websocket", "polling"],
    maxHttpBufferSize: 100_000,
  });

  realtimeIo = io;
  io.on("connection", socket => {
    socket.on("realtime:register", (deviceId: unknown, roomIdOrAcknowledge: unknown, maybeAcknowledge?: (result: { success: boolean }) => void) => {
      const roomId = typeof roomIdOrAcknowledge === "string" ? roomIdOrAcknowledge : undefined;
      const acknowledge = typeof roomIdOrAcknowledge === "function" ? roomIdOrAcknowledge as (result: { success: boolean }) => void : maybeAcknowledge;
      if (!validDeviceId(deviceId)) {
        acknowledge?.({ success: false });
        return;
      }
      const existing = socket.data.deviceId as string | undefined;
      if (existing) socket.leave(`device:${existing}`);
      socket.data.deviceId = deviceId;
      socket.join(`device:${deviceId}`);
      if (roomId && roomId.length <= 16) {
        const previousRoom = socket.data.roomId as string | undefined;
        if (previousRoom) socket.leave(`room:${previousRoom}`);
        socket.data.roomId = roomId;
        socket.join(`room:${roomId}`);
      }
      acknowledge?.({ success: true });
    });

    socket.on("room:register", (roomId: unknown) => {
      const currentRoom = socket.data.roomId as string | undefined;
      if (currentRoom) socket.leave(`room:${currentRoom}`);
      if (typeof roomId === "string" && roomId.length <= 16) {
        socket.data.roomId = roomId;
        socket.join(`room:${roomId}`);
      }
    });

    socket.on("room:p2p-hello", () => {
      const roomId = socket.data.roomId as string | undefined;
      const deviceId = socket.data.deviceId as string | undefined;
      if (!roomId || !deviceId) return;
      const peers = io.sockets.adapter.rooms.get(`room:${roomId}`) ?? new Set<string>();
      for (const socketId of Array.from(peers)) {
        const peer = io.sockets.sockets.get(socketId);
        const peerDeviceId = peer?.data.deviceId as string | undefined;
        if (peer && peerDeviceId && peerDeviceId !== deviceId) socket.emit("room:p2p-peer", { deviceId: peerDeviceId });
      }
      socket.to(`room:${roomId}`).emit("room:p2p-peer", { deviceId });
    });

    socket.on("room:p2p-signal", (packet: { toDeviceId?: unknown; kind?: unknown; data?: unknown } = {}) => {
      const roomId = socket.data.roomId as string | undefined;
      const fromDeviceId = socket.data.deviceId as string | undefined;
      if (!roomId || !fromDeviceId || !validDeviceId(packet.toDeviceId) || (packet.kind !== "offer" && packet.kind !== "answer") || typeof packet.data !== "string" || packet.data.length > 2_000_000) return;
      io.to(`device:${packet.toDeviceId}`).emit("room:p2p-signal", { fromDeviceId, toDeviceId: packet.toDeviceId, kind: packet.kind, data: packet.data });
    });

    socket.on("direct:notify", async (packet: { conversationId?: unknown } = {}) => {
      const senderId = socket.data.deviceId as string | undefined;
      if (!senderId || !validConversationId(packet.conversationId)) return;
      try {
        await assertDirectMessageAllowed(packet.conversationId, senderId);
        const recipientId = await getDirectPeerIdForMember(packet.conversationId, senderId);
        io.to(`device:${recipientId}`).emit("direct:message", {
          conversationId: packet.conversationId,
          fromDeviceId: senderId,
        });
      } catch {
        // Ignore unauthorized notification attempts without exposing conversation details.
      }
    });

    socket.on("direct:typing", async (packet: { conversationId?: unknown; isTyping?: unknown } = {}) => {
      const senderId = socket.data.deviceId as string | undefined;
      if (!senderId || !validConversationId(packet.conversationId) || typeof packet.isTyping !== "boolean") return;
      try {
        await assertDirectMessageAllowed(packet.conversationId, senderId);
        const recipientId = await getDirectPeerIdForMember(packet.conversationId, senderId);
        io.to(`device:${recipientId}`).emit("direct:typing", { conversationId: packet.conversationId, fromDeviceId: senderId, isTyping: packet.isTyping });
      } catch {
        // Do not expose membership or block state to untrusted sockets.
      }
    });

    socket.on("direct:read", async (packet: { conversationId?: unknown; readAt?: unknown } = {}) => {
      const senderId = socket.data.deviceId as string | undefined;
      if (!senderId || !validConversationId(packet.conversationId) || typeof packet.readAt !== "number" || !Number.isFinite(packet.readAt)) return;
      try {
        const recipientId = await getDirectPeerIdForMember(packet.conversationId, senderId);
        io.to(`device:${recipientId}`).emit("direct:read", { conversationId: packet.conversationId, fromDeviceId: senderId, readAt: packet.readAt });
      } catch {
        // Do not expose membership state to untrusted sockets.
      }
    });

    socket.on("direct:signal", async (packet: { conversationId?: unknown; kind?: unknown; data?: unknown } = {}) => {
      const senderId = socket.data.deviceId as string | undefined;
      if (!senderId || !validConversationId(packet.conversationId) || typeof packet.kind !== "string" || !signalKinds.has(packet.kind)) return;
      try {
        await assertDirectMessageAllowed(packet.conversationId, senderId);
        const recipientId = await getDirectPeerIdForMember(packet.conversationId, senderId);
        io.to(`device:${recipientId}`).emit("direct:signal", {
          conversationId: packet.conversationId,
          fromDeviceId: senderId,
          kind: packet.kind,
          data: packet.data,
        });
      } catch {
        // Ignore unauthorized signaling attempts without exposing call state.
      }
    });
  });

  return io;
}

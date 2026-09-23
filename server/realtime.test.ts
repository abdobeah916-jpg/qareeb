import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createServer, type Server as HttpServer } from "node:http";
import { io as createClient, type Socket } from "socket.io-client";

const mocks = vi.hoisted(() => ({
  assertDirectMessageAllowed: vi.fn(),
  getDirectPeerIdForMember: vi.fn(),
}));

vi.mock("./db", () => ({
  assertDirectMessageAllowed: mocks.assertDirectMessageAllowed,
  getDirectPeerIdForMember: mocks.getDirectPeerIdForMember,
}));

import { registerRealtimeServer } from "./realtime";

function once<T>(socket: Socket, event: string): Promise<T> {
  return new Promise(resolve => socket.once(event, resolve));
}

function waitForConnect(socket: Socket) {
  if (socket.connected) return Promise.resolve();
  return once<void>(socket, "connect");
}

describe("realtime signaling", () => {
  let server: HttpServer;
  let owner: Socket;
  let peer: Socket;

  beforeAll(async () => {
    mocks.assertDirectMessageAllowed.mockResolvedValue({ id: "direct_test" });
    mocks.getDirectPeerIdForMember.mockImplementation(async (_conversationId: string, deviceId: string) => deviceId === "owner" ? "peer" : "owner");

    server = createServer();
    registerRealtimeServer(server);
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server address is unavailable");
    const endpoint = `http://127.0.0.1:${address.port}`;
    owner = createClient(endpoint, { transports: ["websocket"] });
    peer = createClient(endpoint, { transports: ["websocket"] });
    await Promise.all([waitForConnect(owner), waitForConnect(peer)]);
    await Promise.all([
      owner.emitWithAck("realtime:register", "owner"),
      peer.emitWithAck("realtime:register", "peer"),
    ]);
  });

  afterAll(async () => {
    owner.disconnect();
    peer.disconnect();
    await new Promise<void>(resolve => server.close(() => resolve()));
  });

  it("delivers a private-message notification only to the selected peer", async () => {
    const received = once<{ conversationId: string; fromDeviceId: string }>(peer, "direct:message");
    owner.emit("direct:notify", { conversationId: "direct_test" });
    await expect(received).resolves.toEqual({ conversationId: "direct_test", fromDeviceId: "owner" });
    expect(mocks.assertDirectMessageAllowed).toHaveBeenCalledWith("direct_test", "owner");
  });

  it("relays a WebRTC offer to the selected peer", async () => {
    const received = once<{ conversationId: string; fromDeviceId: string; kind: string; data: unknown }>(peer, "direct:signal");
    owner.emit("direct:signal", { conversationId: "direct_test", kind: "call-offer", data: { type: "offer", sdp: "test-sdp" } });
    await expect(received).resolves.toEqual({
      conversationId: "direct_test",
      fromDeviceId: "owner",
      kind: "call-offer",
      data: { type: "offer", sdp: "test-sdp" },
    });
  });

  it("relays typing state and read receipts only to the selected peer", async () => {
    const typing = once<{ conversationId: string; fromDeviceId: string; isTyping: boolean }>(peer, "direct:typing");
    owner.emit("direct:typing", { conversationId: "direct_test", isTyping: true });
    await expect(typing).resolves.toEqual({ conversationId: "direct_test", fromDeviceId: "owner", isTyping: true });

    const read = once<{ conversationId: string; fromDeviceId: string; readAt: number }>(peer, "direct:read");
    owner.emit("direct:read", { conversationId: "direct_test", readAt: 1_777_777_777_777 });
    await expect(read).resolves.toEqual({ conversationId: "direct_test", fromDeviceId: "owner", readAt: 1_777_777_777_777 });
  });
});

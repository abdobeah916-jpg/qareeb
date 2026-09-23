import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const mocks = vi.hoisted(() => ({
  getRoomSnapshot: vi.fn(),
  joinRoom: vi.fn(),
  addMessage: vi.fn(),
  toggleRoomMessageReaction: vi.fn(),
  rejectRecentDuplicateMessage: vi.fn(),
  resetRoom: vi.fn(),
  listRoomFiles: vi.fn(),
  setRoomPin: vi.fn(),
  updateRoomName: vi.fn(),
  setRoomMemberBan: vi.fn(),
  getRoomActorPermissions: vi.fn(),
  listRoomModerators: vi.fn(),
  setRoomModerator: vi.fn(),
  listRoomAdminActivity: vi.fn(),
  listRoomNotifications: vi.fn(),
  markRoomNotificationRead: vi.fn(),
  createModeratorInvitation: vi.fn(),
  listModeratorInvitations: vi.fn(),
  respondModeratorInvitation: vi.fn(),
  cancelModeratorInvitation: vi.fn(),
  exportRoomAdminActivity: vi.fn(),
  listDirectConversations: vi.fn(),
  startDirectConversation: vi.fn(),
  getDirectSnapshot: vi.fn(),
  addDirectMessage: vi.fn(),
  toggleDirectMessageReaction: vi.fn(),
  listDirectFiles: vi.fn(),
  assertDirectMessageAllowed: vi.fn(),
  getDirectPeerIdForMember: vi.fn(),
  setDirectConversationPreferences: vi.fn(),
  markDirectConversationRead: vi.fn(),
  startDirectCall: vi.fn(),
  updateDirectCall: vi.fn(),
  listDirectCallLogs: vi.fn(),
  deleteDirectCall: vi.fn(),
  clearDirectCallLogs: vi.fn(),
  getDeviceProfile: vi.fn(),
  setDeviceAvatar: vi.fn(),
  updatePublicAvatar: vi.fn(),
  storagePut: vi.fn(),
}));

vi.mock("./db", () => ({
  getRoomSnapshot: mocks.getRoomSnapshot,
  joinRoom: mocks.joinRoom,
  addMessage: mocks.addMessage,
  toggleRoomMessageReaction: mocks.toggleRoomMessageReaction,
  rejectRecentDuplicateMessage: mocks.rejectRecentDuplicateMessage,
  resetRoom: mocks.resetRoom,
  listRoomFiles: mocks.listRoomFiles,
  setRoomPin: mocks.setRoomPin,
  updateRoomName: mocks.updateRoomName,
  setRoomMemberBan: mocks.setRoomMemberBan,
  getRoomActorPermissions: mocks.getRoomActorPermissions,
  listRoomModerators: mocks.listRoomModerators,
  setRoomModerator: mocks.setRoomModerator,
  listRoomAdminActivity: mocks.listRoomAdminActivity,
  listRoomNotifications: mocks.listRoomNotifications,
  markRoomNotificationRead: mocks.markRoomNotificationRead,
  createModeratorInvitation: mocks.createModeratorInvitation,
  listModeratorInvitations: mocks.listModeratorInvitations,
  respondModeratorInvitation: mocks.respondModeratorInvitation,
  cancelModeratorInvitation: mocks.cancelModeratorInvitation,
  exportRoomAdminActivity: mocks.exportRoomAdminActivity,
  listDirectConversations: mocks.listDirectConversations,
  startDirectConversation: mocks.startDirectConversation,
  getDirectSnapshot: mocks.getDirectSnapshot,
  addDirectMessage: mocks.addDirectMessage,
  toggleDirectMessageReaction: mocks.toggleDirectMessageReaction,
  listDirectFiles: mocks.listDirectFiles,
  assertDirectMessageAllowed: mocks.assertDirectMessageAllowed,
  getDirectPeerIdForMember: mocks.getDirectPeerIdForMember,
  setDirectConversationPreferences: mocks.setDirectConversationPreferences,
  markDirectConversationRead: mocks.markDirectConversationRead,
  startDirectCall: mocks.startDirectCall,
  updateDirectCall: mocks.updateDirectCall,
  listDirectCallLogs: mocks.listDirectCallLogs,
  deleteDirectCall: mocks.deleteDirectCall,
  clearDirectCallLogs: mocks.clearDirectCallLogs,
  getDeviceProfile: mocks.getDeviceProfile,
  setDeviceAvatar: mocks.setDeviceAvatar,
  updatePublicAvatar: mocks.updatePublicAvatar,
}));

vi.mock("./storage", () => ({ storagePut: mocks.storagePut }));

import { appRouter } from "./routers";

function caller() {
  return appRouter.createCaller({
    user: { id: 1, openId: "device-1", name: "Test User", email: "test@example.com", loginMethod: "oauth", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
    req: { protocol: "https", headers: {} },
    res: { clearCookie: vi.fn() },
  } as unknown as TrpcContext);
}

describe("qareeb router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getRoomSnapshot.mockResolvedValue({ roomId: "AB-12", participants: [], messages: [], updatedAt: new Date() });
    mocks.joinRoom.mockResolvedValue({ roomId: "AB-12", participants: [], messages: [], updatedAt: new Date() });
    mocks.addMessage.mockResolvedValue({ roomId: "AB-12", participants: [], messages: [], updatedAt: new Date() });
    mocks.toggleRoomMessageReaction.mockResolvedValue({ roomId: "AB-12", participants: [], messages: [], updatedAt: new Date() });
    mocks.rejectRecentDuplicateMessage.mockResolvedValue({ allowed: true });
    mocks.resetRoom.mockResolvedValue({ roomId: "AB-12", participants: [], messages: [], updatedAt: new Date() });
    mocks.listRoomFiles.mockResolvedValue([]);
    mocks.setRoomPin.mockResolvedValue({ roomId: "AB-12", roomName: "غرفة قريب", ownerId: "device-1", participants: [], messages: [], pinnedMessage: null, updatedAt: new Date() });
    mocks.updateRoomName.mockResolvedValue({ roomId: "AB-12", roomName: "غرفة الفريق", ownerId: "device-1", participants: [], messages: [], pinnedMessage: null, updatedAt: new Date() });
    mocks.setRoomMemberBan.mockResolvedValue({ roomId: "AB-12", roomName: "غرفة قريب", ownerId: "device-1", participants: [], messages: [], pinnedMessage: null, updatedAt: new Date() });
    mocks.getRoomActorPermissions.mockResolvedValue({ role: "owner", canPin: true, canRename: true, canManageMembers: true, canClearMessages: true, canViewActivity: true });
    mocks.listRoomModerators.mockResolvedValue([]);
    mocks.setRoomModerator.mockResolvedValue([]);
    mocks.listRoomAdminActivity.mockResolvedValue([]);
    mocks.listRoomNotifications.mockResolvedValue([]);
    mocks.markRoomNotificationRead.mockResolvedValue({ success: true });
    mocks.createModeratorInvitation.mockResolvedValue({ id: "invite_1", status: "pending" });
    mocks.listModeratorInvitations.mockResolvedValue([]);
    mocks.respondModeratorInvitation.mockResolvedValue({ id: "invite_1", status: "approved" });
    mocks.cancelModeratorInvitation.mockResolvedValue({ id: "invite_1", status: "cancelled" });
    mocks.exportRoomAdminActivity.mockResolvedValue({ filename: "qareeb-activity.csv", content: "csv" });
    mocks.listDirectConversations.mockResolvedValue([]);
    mocks.startDirectConversation.mockResolvedValue({ id: "direct_1", peerId: "device-2", peerName: "علي", peerColor: "#884FEA", updatedAt: new Date() });
    mocks.getDirectSnapshot.mockResolvedValue({ conversation: { id: "direct_1", peerId: "device-2", peerName: "علي", peerColor: "#884FEA", updatedAt: new Date() }, messages: [], updatedAt: new Date() });
    mocks.addDirectMessage.mockResolvedValue({ conversation: { id: "direct_1", peerId: "device-2", peerName: "علي", peerColor: "#884FEA", updatedAt: new Date() }, messages: [], updatedAt: new Date() });
    mocks.toggleDirectMessageReaction.mockResolvedValue({ conversation: { id: "direct_1", peerId: "device-2", peerName: "علي", peerColor: "#884FEA", updatedAt: new Date() }, messages: [], updatedAt: new Date() });
    mocks.listDirectFiles.mockResolvedValue([]);
    mocks.assertDirectMessageAllowed.mockResolvedValue({ id: "direct_1" });
    mocks.getDirectPeerIdForMember.mockResolvedValue("device-2");
    mocks.setDirectConversationPreferences.mockResolvedValue({ isMuted: false, isBlocked: false });
    mocks.markDirectConversationRead.mockResolvedValue({ success: true });
    mocks.startDirectCall.mockResolvedValue({ id: "call_1", conversationId: "direct_1", callType: "video", status: "ringing", startedAt: new Date() });
    mocks.updateDirectCall.mockResolvedValue({ success: true });
    mocks.listDirectCallLogs.mockResolvedValue([]);
    mocks.deleteDirectCall.mockResolvedValue({ success: true });
    mocks.clearDirectCallLogs.mockResolvedValue({ success: true });
    mocks.getDeviceProfile.mockResolvedValue({ avatarUrl: null });
    mocks.setDeviceAvatar.mockResolvedValue({ avatarUrl: "/manus-storage/qareeb/profiles/device-1/avatar.png" });
  });

  it("normalizes a room code when a visitor joins", async () => {
    await caller().qareeb.join({ roomId: "ab-12", deviceId: "device-1", name: "سارة", color: "#0CA887" });
    expect(mocks.joinRoom).toHaveBeenCalledWith({ roomId: "AB-12", deviceId: "device-1", name: "سارة", color: "#0CA887" });
  });

  it("returns a snapshot and rejects invalid room identifiers", async () => {
    await caller().qareeb.snapshot({ roomId: "ab-12", deviceId: "device-1" });
    expect(mocks.getRoomSnapshot).toHaveBeenCalledWith("AB-12");
    await expect(caller().qareeb.snapshot({ roomId: "!a", deviceId: "device-1" })).rejects.toThrow("رمز الغرفة غير صالح");
  });

  it("sends a text message without invoking storage", async () => {
    await caller().qareeb.sendMessage({ roomId: "ab-12", senderId: "device-1", senderName: "سارة", senderColor: "#0CA887", text: "مرحبًا", });
    expect(mocks.storagePut).not.toHaveBeenCalled();
    expect(mocks.addMessage).toHaveBeenCalledWith(expect.objectContaining({ roomId: "AB-12", text: "مرحبًا", senderId: "device-1" }));
  });

  it("stores a supported personal image and rejects unsupported image types", async () => {
    mocks.storagePut.mockResolvedValue({ key: "qareeb/profiles/device-1/avatar.png", url: "/manus-storage/qareeb/profiles/device-1/avatar.png" });
    await caller().qareeb.profile.updateAvatar({
      deviceId: "device-1",
      avatar: { name: "avatar.png", type: "image/png", dataUrl: "data:image/png;base64,SGVsbG8=" },
    });
    expect(mocks.storagePut).toHaveBeenCalledWith(expect.stringMatching(/^qareeb\/profiles\/device-1\/avatar-/), expect.any(Buffer), "image/png");
    expect(mocks.setDeviceAvatar).toHaveBeenCalledWith({ deviceId: "device-1", avatarUrl: "/manus-storage/qareeb/profiles/device-1/avatar.png" });
    await expect(caller().qareeb.profile.updateAvatar({
      deviceId: "device-1",
      avatar: { name: "avatar.svg", type: "image/svg+xml", dataUrl: "data:image/svg+xml;base64,SGVsbG8=" },
    })).rejects.toThrow("صيغة الصورة غير مدعومة");
  });

  it("rejects mismatched room sender identities outside local mode", async () => {
    const previousDatabaseUrl = process.env.DATABASE_URL;
    const previousLocalMode = process.env.LOCAL_MODE;
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.DATABASE_URL = "mysql://test.invalid/qareeb";
    process.env.NODE_ENV = "production";
    delete process.env.LOCAL_MODE;
    try {
      await expect(caller().qareeb.sendMessage({ roomId: "ab-12", senderId: "device-2", senderName: "سارة", senderColor: "#0CA887", text: "انتحال" })).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(caller().qareeb.react({ roomId: "ab-12", deviceId: "device-2", messageId: "message_1", emoji: "👍" })).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(mocks.addMessage).not.toHaveBeenCalled();
      expect(mocks.toggleRoomMessageReaction).not.toHaveBeenCalled();
    } finally {
      if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previousDatabaseUrl;
      if (previousLocalMode === undefined) delete process.env.LOCAL_MODE; else process.env.LOCAL_MODE = previousLocalMode;
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousNodeEnv;
    }
  });

  it("passes a room reply target through the authenticated message contract", async () => {
    await caller().qareeb.sendMessage({ roomId: "ab-12", senderId: "device-1", senderName: "سارة", senderColor: "#0CA887", text: "رد", replyToId: "message_1" });
    expect(mocks.addMessage).toHaveBeenCalledWith(expect.objectContaining({ roomId: "AB-12", replyToId: "message_1" }));
    await caller().qareeb.react({ roomId: "ab-12", deviceId: "device-1", messageId: "message_1", emoji: "👍" });
    expect(mocks.toggleRoomMessageReaction).toHaveBeenCalledWith({ roomId: "AB-12", deviceId: "device-1", messageId: "message_1", emoji: "👍" });
  });

  it("stores an attachment before recording the message", async () => {
    mocks.storagePut.mockResolvedValue({ key: "qareeb/AB-12/picture.png", url: "/manus-storage/qareeb/AB-12/picture.png" });
    await caller().qareeb.sendMessage({
      roomId: "ab-12", senderId: "device-1", senderName: "سارة", senderColor: "#0CA887", text: "",
      attachment: { name: "picture.png", type: "image/png", dataUrl: "data:image/png;base64,SGVsbG8=" },
    });
    expect(mocks.storagePut).toHaveBeenCalledWith(expect.stringMatching(/^qareeb\/AB-12\//), expect.any(Buffer), "image/png");
    expect(mocks.addMessage).toHaveBeenCalledWith(expect.objectContaining({ attachment: { name: "picture.png", type: "image/png", url: "/manus-storage/qareeb/AB-12/picture.png" } }));
  });

  it("rejects an empty message and delegates a confirmed reset", async () => {
    await expect(caller().qareeb.sendMessage({ roomId: "ab-12", senderId: "device-1", senderName: "سارة", senderColor: "#0CA887", text: "" })).rejects.toThrow("اكتب رسالة");
    await caller().qareeb.reset({ roomId: "ab-12", deviceId: "device-1" });
    expect(mocks.resetRoom).toHaveBeenCalledWith({ roomId: "AB-12", deviceId: "device-1" });
  });

  it("pins room content only through the room owner", async () => {
    await caller().qareeb.setPin({ roomId: "ab-12", deviceId: "device-1", messageId: "message_1" });
    expect(mocks.setRoomPin).toHaveBeenCalledWith({ roomId: "AB-12", deviceId: "device-1", messageId: "message_1" });

    mocks.setRoomPin.mockRejectedValueOnce(new Error("إدارة الغرفة متاحة لمالك الغرفة فقط."));
    await expect(caller().qareeb.setPin({ roomId: "AB-12", deviceId: "device-2", messageId: "message_1" }))
      .rejects.toMatchObject({ code: "FORBIDDEN", message: "إدارة الغرفة متاحة لمالك الغرفة فقط." });
  });

  it("renames a room and manages an existing member only through its owner", async () => {
    await caller().qareeb.rename({ roomId: "ab-12", deviceId: "device-1", name: " غرفة الفريق " });
    expect(mocks.updateRoomName).toHaveBeenCalledWith({ roomId: "AB-12", deviceId: "device-1", name: "غرفة الفريق" });

    await caller().qareeb.setMemberBan({ roomId: "AB-12", deviceId: "device-1", targetDeviceId: "device-2", isBanned: true });
    expect(mocks.setRoomMemberBan).toHaveBeenCalledWith({ roomId: "AB-12", deviceId: "device-1", targetDeviceId: "device-2", isBanned: true });

    mocks.setRoomMemberBan.mockRejectedValueOnce(new Error("إدارة الغرفة متاحة لمالك الغرفة فقط."));
    await expect(caller().qareeb.setMemberBan({ roomId: "AB-12", deviceId: "device-2", targetDeviceId: "device-1", isBanned: true }))
      .rejects.toMatchObject({ code: "FORBIDDEN", message: "إدارة الغرفة متاحة لمالك الغرفة فقط." });
  });

  it("exposes tailored moderator permissions and owner-only moderator management", async () => {
    await caller().qareeb.permissions({ roomId: "ab-12", deviceId: "device-2" });
    expect(mocks.getRoomActorPermissions).toHaveBeenCalledWith({ roomId: "AB-12", deviceId: "device-2" });

    const permissions = { canPin: true, canRename: false, canManageMembers: true, canClearMessages: false, canViewActivity: true };
    await caller().qareeb.setModerator({ roomId: "AB-12", deviceId: "device-1", targetDeviceId: "device-2", isModerator: true, permissions });
    expect(mocks.setRoomModerator).toHaveBeenCalledWith({ roomId: "AB-12", deviceId: "device-1", targetDeviceId: "device-2", isModerator: true, permissions });

    await caller().qareeb.moderators({ roomId: "AB-12", deviceId: "device-1" });
    expect(mocks.listRoomModerators).toHaveBeenCalledWith({ roomId: "AB-12", deviceId: "device-1" });
    await caller().qareeb.activity({ roomId: "AB-12", deviceId: "device-2" });
    expect(mocks.listRoomAdminActivity).toHaveBeenCalledWith({ roomId: "AB-12", deviceId: "device-2" });

    mocks.setRoomModerator.mockRejectedValueOnce(new Error("إدارة المشرفين متاحة لمالك الغرفة فقط."));
    await expect(caller().qareeb.setModerator({ roomId: "AB-12", deviceId: "device-2", targetDeviceId: "device-3", isModerator: true, permissions }))
      .rejects.toMatchObject({ code: "FORBIDDEN", message: "إدارة المشرفين متاحة لمالك الغرفة فقط." });
  });

  it("starts and lists direct conversations for the selected participant", async () => {
    await caller().direct.start({ roomId: "ab-12", deviceId: "device-1", name: "سارة", color: "#0CA887", peerId: "device-2" });
    expect(mocks.startDirectConversation).toHaveBeenCalledWith({ roomId: "AB-12", deviceId: "device-1", name: "سارة", color: "#0CA887", peerId: "device-2" });

    await caller().direct.list({ deviceId: "device-1" });
    expect(mocks.listDirectConversations).toHaveBeenCalledWith("device-1");
  });

  it("sends a private message and exposes direct attachments only through the matching conversation", async () => {
    await caller().direct.sendMessage({ conversationId: "direct_1", senderId: "device-1", senderName: "سارة", senderColor: "#0CA887", text: "رسالة خاصة" });
    expect(mocks.assertDirectMessageAllowed).toHaveBeenCalledWith("direct_1", "device-1");
    expect(mocks.addDirectMessage).toHaveBeenCalledWith(expect.objectContaining({ conversationId: "direct_1", text: "رسالة خاصة" }));

    await caller().direct.files({ conversationId: "direct_1", deviceId: "device-1" });
    expect(mocks.listDirectFiles).toHaveBeenCalledWith({ conversationId: "direct_1", deviceId: "device-1" });
  });

  it("rejects mismatched private sender identities outside local mode", async () => {
    const previousDatabaseUrl = process.env.DATABASE_URL;
    const previousLocalMode = process.env.LOCAL_MODE;
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.DATABASE_URL = "mysql://test.invalid/qareeb";
    process.env.NODE_ENV = "production";
    delete process.env.LOCAL_MODE;
    try {
      await expect(caller().direct.sendMessage({ conversationId: "direct_1", senderId: "device-2", senderName: "سارة", senderColor: "#0CA887", text: "انتحال" })).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(caller().direct.react({ conversationId: "direct_1", deviceId: "device-2", messageId: "direct_message_1", emoji: "❤️" })).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(mocks.addDirectMessage).not.toHaveBeenCalled();
      expect(mocks.toggleDirectMessageReaction).not.toHaveBeenCalled();
    } finally {
      if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previousDatabaseUrl;
      if (previousLocalMode === undefined) delete process.env.LOCAL_MODE; else process.env.LOCAL_MODE = previousLocalMode;
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousNodeEnv;
    }
  });

  it("passes a private reply target and reaction through the authenticated contract", async () => {
    await caller().direct.sendMessage({ conversationId: "direct_1", senderId: "device-1", senderName: "سارة", senderColor: "#0CA887", text: "رد خاص", replyToId: "direct_message_1" });
    expect(mocks.addDirectMessage).toHaveBeenCalledWith(expect.objectContaining({ conversationId: "direct_1", replyToId: "direct_message_1" }));
    await caller().direct.react({ conversationId: "direct_1", deviceId: "device-1", messageId: "direct_message_1", emoji: "❤️" });
    expect(mocks.toggleDirectMessageReaction).toHaveBeenCalledWith({ conversationId: "direct_1", deviceId: "device-1", messageId: "direct_message_1", emoji: "❤️" });
  });

  it("returns a forbidden error without storing a message when either participant blocks the conversation", async () => {
    mocks.assertDirectMessageAllowed.mockRejectedValueOnce(new Error("تعذر إرسال الرسالة لأن أحد الطرفين حظر هذه المحادثة."));

    await expect(caller().direct.sendMessage({
      conversationId: "direct_1", senderId: "device-1", senderName: "سارة", senderColor: "#0CA887", text: "رسالة ممنوعة",
    })).rejects.toMatchObject({ code: "FORBIDDEN", message: "تعذر إرسال الرسالة لأن أحد الطرفين حظر هذه المحادثة." });
    expect(mocks.addDirectMessage).not.toHaveBeenCalled();
    expect(mocks.storagePut).not.toHaveBeenCalled();
  });

  it("stores mute or block preferences and marks a private conversation as read", async () => {
    await caller().direct.setPreferences({ conversationId: "direct_1", deviceId: "device-1", isMuted: true, isBlocked: false });
    expect(mocks.setDirectConversationPreferences).toHaveBeenCalledWith({
      conversationId: "direct_1", deviceId: "device-1", isMuted: true, isBlocked: false,
    });

    await caller().direct.markRead({ conversationId: "direct_1", deviceId: "device-1" });
    expect(mocks.markDirectConversationRead).toHaveBeenCalledWith({ conversationId: "direct_1", deviceId: "device-1" });
  });

  it("serves configured TURN settings only after confirming conversation membership", async () => {
    const previousTurnUrl = process.env.TURN_URL;
    const previousTurnUsername = process.env.TURN_USERNAME;
    const previousTurnCredential = process.env.TURN_CREDENTIAL;
    process.env.TURN_URL = "turn:lan.example.test:3478";
    process.env.TURN_USERNAME = "qareeb-test";
    process.env.TURN_CREDENTIAL = "qareeb-test-credential";
    const response = await caller().direct.iceServers({ conversationId: "direct_1", deviceId: "device-1" });
    const relay = response.iceServers.find(server => Array.isArray(server.urls) || /^turns?:/i.test(server.urls));

    expect(mocks.getDirectPeerIdForMember).toHaveBeenCalledWith("direct_1", "device-1");
    expect(relay).toMatchObject({ username: expect.any(String), credential: expect.any(String) });
    expect(relay?.urls).toBeDefined();
    if (previousTurnUrl === undefined) delete process.env.TURN_URL; else process.env.TURN_URL = previousTurnUrl;
    if (previousTurnUsername === undefined) delete process.env.TURN_USERNAME; else process.env.TURN_USERNAME = previousTurnUsername;
    if (previousTurnCredential === undefined) delete process.env.TURN_CREDENTIAL; else process.env.TURN_CREDENTIAL = previousTurnCredential;
  });

  it("records, updates, and lists private audio or video calls", async () => {
    await caller().direct.startCall({ conversationId: "direct_1", deviceId: "device-1", callType: "video" });
    expect(mocks.startDirectCall).toHaveBeenCalledWith({ conversationId: "direct_1", deviceId: "device-1", callType: "video" });

    await caller().direct.updateCall({ callId: "call_1", conversationId: "direct_1", deviceId: "device-1", status: "ended" });
    expect(mocks.updateDirectCall).toHaveBeenCalledWith({ callId: "call_1", conversationId: "direct_1", deviceId: "device-1", status: "ended" });

    await caller().direct.calls({ conversationId: "direct_1", deviceId: "device-1" });
    expect(mocks.listDirectCallLogs).toHaveBeenCalledWith({ conversationId: "direct_1", deviceId: "device-1" });

    await caller().direct.deleteCall({ callId: "call_1", conversationId: "direct_1", deviceId: "device-1" });
    expect(mocks.deleteDirectCall).toHaveBeenCalledWith({ callId: "call_1", conversationId: "direct_1", deviceId: "device-1" });

    await caller().direct.clearCalls({ conversationId: "direct_1", deviceId: "device-1" });
    expect(mocks.clearDirectCallLogs).toHaveBeenCalledWith({ conversationId: "direct_1", deviceId: "device-1" });
  });

  it("covers moderator invitations, notifications, and filtered activity export contracts", async () => {
    const permissions = { canPin: true, canRename: false, canManageMembers: true, canClearMessages: false, canViewActivity: true };
    await caller().qareeb.inviteModerator({ roomId: "ab-12", deviceId: "device-1", targetDeviceId: "device-2", permissions });
    expect(mocks.createModeratorInvitation).toHaveBeenCalledWith({ roomId: "AB-12", deviceId: "device-1", targetDeviceId: "device-2", permissions });

    await caller().qareeb.moderatorInvites({ roomId: "ab-12", deviceId: "device-1" });
    expect(mocks.listModeratorInvitations).toHaveBeenCalledWith({ roomId: "AB-12", deviceId: "device-1" });
    await caller().qareeb.respondModeratorInvite({ roomId: "ab-12", deviceId: "device-2", inviteId: "invite_1", approve: true });
    expect(mocks.respondModeratorInvitation).toHaveBeenCalledWith({ roomId: "AB-12", deviceId: "device-2", inviteId: "invite_1", approve: true });
    await caller().qareeb.respondModeratorInvite({ roomId: "ab-12", deviceId: "device-2", inviteId: "invite_2", approve: false });
    expect(mocks.respondModeratorInvitation).toHaveBeenCalledWith({ roomId: "AB-12", deviceId: "device-2", inviteId: "invite_2", approve: false });
    await caller().qareeb.cancelModeratorInvite({ roomId: "ab-12", deviceId: "device-1", inviteId: "invite_1" });
    expect(mocks.cancelModeratorInvitation).toHaveBeenCalledWith({ roomId: "AB-12", deviceId: "device-1", inviteId: "invite_1" });

    await caller().qareeb.notifications({ roomId: "ab-12", deviceId: "device-1" });
    expect(mocks.listRoomNotifications).toHaveBeenCalledWith({ roomId: "AB-12", deviceId: "device-1" });
    await caller().qareeb.markNotificationRead({ roomId: "ab-12", deviceId: "device-1", notificationId: "notification_1" });
    expect(mocks.markRoomNotificationRead).toHaveBeenCalledWith({ roomId: "AB-12", deviceId: "device-1", notificationId: "notification_1" });

    await caller().qareeb.exportActivity({ roomId: "ab-12", deviceId: "device-1" });
    expect(mocks.exportRoomAdminActivity).toHaveBeenCalledWith({ roomId: "AB-12", deviceId: "device-1" });
  });
});

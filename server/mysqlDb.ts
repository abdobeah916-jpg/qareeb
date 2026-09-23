import { and, count, desc, eq, gt, gte, inArray, isNotNull, isNull, ne, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { createHash } from "node:crypto";
import { chatMessages, chatParticipants, chatRooms, deviceProfiles, directCallLogs, directConversationPreferences, directConversations, directMessages, directReadStates, roomAdminActivity, roomMemberBans, roomModerators, roomModeratorInvitations, roomNotifications, type InsertUser, users } from "../drizzle/schema";
import { ENV } from "./_core/env";
import type { MessageReactionMap } from "./localDb";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

function parseReactions(value: string | null | undefined): MessageReactionMap {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter(([, users]) => Array.isArray(users) && users.every(user => typeof user === "string")) as [string, string[]][]);
  } catch {
    return {};
  }
}

function serializeReactions(value: MessageReactionMap) {
  return JSON.stringify(value);
}

function participantKey(roomId: string, deviceId: string) {
  return `${roomId}:${deviceId}`;
}

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("قاعدة البيانات غير متاحة حاليًا.");
  return db;
}

export type RoomSnapshot = {
  roomId: string;
  roomName: string;
  ownerId: string | null;
  participants: Array<{ id: string; name: string; color: string; avatarUrl: string | null; lastSeen: Date; isOnline: boolean; isBanned: boolean }>;
  messages: Array<{
    id: string;
    senderId: string;
    senderName: string;
    avatarUrl: string | null;
    text: string;
    replyToId: string | null;
    reactions: MessageReactionMap;
    createdAt: Date;
    pinnedAt: Date | null;
    pinnedBy: string | null;
    attachment?: { name: string; type: string; url: string };
  }>;
  pinnedMessage: RoomSnapshot["messages"][number] | null;
  updatedAt: Date;
};

export type RoomModeratorPermissions = {
  canPin: boolean;
  canRename: boolean;
  canManageMembers: boolean;
  canClearMessages: boolean;
  canViewActivity: boolean;
};

export type RoomActorPermissions = RoomModeratorPermissions & { role: "owner" | "moderator" | "member" };
export type RoomModerator = RoomModeratorPermissions & { deviceId: string; name: string; color: string; assignedBy: string; createdAt: Date };
export type RoomAdminActivity = { id: string; actorDeviceId: string; actorName: string; action: string; targetDeviceId: string | null; targetName: string | null; details: string | null; createdAt: Date };
export type RoomModeratorInvite = { id: string; roomId: string; targetDeviceId: string; targetName: string; targetColor: string; invitedBy: string; invitedByName: string; permissions: RoomModeratorPermissions; status: "pending" | "approved" | "rejected" | "cancelled"; createdAt: Date; decidedAt: Date | null; decidedBy: string | null };
export type RoomNotification = { id: string; roomId: string; targetDeviceId: string; activityId: string; kind: "admin_action" | "moderator_invite"; title: string; body: string; createdAt: Date; readAt: Date | null };

const noRoomPermissions: RoomModeratorPermissions = { canPin: false, canRename: false, canManageMembers: false, canClearMessages: false, canViewActivity: false };
const ownerRoomPermissions: RoomModeratorPermissions = { canPin: true, canRename: true, canManageMembers: true, canClearMessages: true, canViewActivity: true };

function moderatorKey(roomId: string, deviceId: string) {
  return `mod:${roomId}:${deviceId}`;
}

export async function ensureRoom(roomId: string) {
  const db = await requireDb();
  const timestamp = new Date();
  await db.insert(chatRooms).values({
    id: roomId,
    name: "غرفة قريب",
    ownerId: null,
    pinnedMessageId: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  }).onDuplicateKeyUpdate({ set: { updatedAt: timestamp } });
}

async function isRoomMemberBanned(roomId: string, deviceId: string) {
  const db = await requireDb();
  const rows = await db.select({ id: roomMemberBans.id }).from(roomMemberBans).where(and(
    eq(roomMemberBans.roomId, roomId),
    eq(roomMemberBans.deviceId, deviceId),
  )).limit(1);
  return Boolean(rows[0]);
}

export async function joinRoom(input: { roomId: string; deviceId: string; name: string; color: string }) {
  const db = await requireDb();
  await ensureRoom(input.roomId);
  if (await isRoomMemberBanned(input.roomId, input.deviceId)) throw new Error("لقد أزالك مالك الغرفة من هذه المساحة.");
  await db.update(chatRooms).set({ ownerId: input.deviceId }).where(and(
    eq(chatRooms.id, input.roomId),
    isNull(chatRooms.ownerId),
  ));
  await db.insert(chatParticipants).values({
    id: participantKey(input.roomId, input.deviceId), roomId: input.roomId, deviceId: input.deviceId,
    name: input.name, color: input.color, lastSeen: new Date(),
  }).onDuplicateKeyUpdate({ set: { name: input.name, color: input.color, lastSeen: new Date() } });
  return getRoomSnapshot(input.roomId);
}

export async function getRoomSnapshot(roomId: string): Promise<RoomSnapshot> {
  const db = await requireDb();
  await ensureRoom(roomId);
  const activeAfter = new Date(Date.now() - 90_000);
  const [roomRows, participants, messages, bans] = await Promise.all([
    db.select().from(chatRooms).where(eq(chatRooms.id, roomId)).limit(1),
    db.select({ id: chatParticipants.deviceId, name: chatParticipants.name, color: chatParticipants.color, lastSeen: chatParticipants.lastSeen })
      .from(chatParticipants).where(eq(chatParticipants.roomId, roomId)).orderBy(desc(chatParticipants.lastSeen)).limit(80),
    db.select().from(chatMessages).where(eq(chatMessages.roomId, roomId)).orderBy(desc(chatMessages.createdAt)).limit(120),
    db.select({ deviceId: roomMemberBans.deviceId }).from(roomMemberBans).where(eq(roomMemberBans.roomId, roomId)),
  ]);
  const room = roomRows[0];
  const bannedIds = new Set(bans.map(ban => ban.deviceId));
  const pinnedRows = room?.pinnedMessageId ? await db.select().from(chatMessages).where(and(
    eq(chatMessages.id, room.pinnedMessageId),
    eq(chatMessages.roomId, roomId),
  )).limit(1) : [];
  const profileIds = Array.from(new Set([...participants.map(person => person.id), ...messages.map(message => message.senderId), ...pinnedRows.map(message => message.senderId)]));
  const profileRows = profileIds.length
    ? await db.select({ deviceId: deviceProfiles.deviceId, avatarUrl: deviceProfiles.avatarUrl }).from(deviceProfiles).where(inArray(deviceProfiles.deviceId, profileIds))
    : [];
  const avatars = new Map(profileRows.map(profile => [profile.deviceId, profile.avatarUrl]));
  const messageForSnapshot = (message: typeof chatMessages.$inferSelect) => ({
    id: message.id,
    senderId: message.senderId,
    senderName: message.senderName,
    avatarUrl: avatars.get(message.senderId) ?? null,
    text: message.text,
    replyToId: message.replyToId ?? null,
    reactions: parseReactions(message.reactions),
    createdAt: message.createdAt,
    pinnedAt: message.pinnedAt,
    pinnedBy: message.pinnedBy,
    ...(message.attachmentUrl && message.attachmentName && message.attachmentType ? { attachment: { name: message.attachmentName, type: message.attachmentType, url: message.attachmentUrl } } : {}),
  });
  return {
    roomId,
    roomName: room?.name ?? "غرفة قريب",
    ownerId: room?.ownerId ?? null,
    participants: participants.map(person => ({ ...person, avatarUrl: avatars.get(person.id) ?? null, isOnline: !bannedIds.has(person.id) && person.lastSeen >= activeAfter, isBanned: bannedIds.has(person.id) })),
    messages: messages.reverse().map(messageForSnapshot),
    pinnedMessage: pinnedRows[0] ? messageForSnapshot(pinnedRows[0]) : null,
    updatedAt: new Date(),
  };
}

type RoomAdminAction = "moderator_granted" | "moderator_updated" | "moderator_removed" | "moderator_invited" | "moderator_invite_approved" | "moderator_invite_declined" | "moderator_invite_cancelled" | "room_renamed" | "member_removed" | "member_restored" | "message_pinned" | "message_unpinned" | "messages_cleared";

export async function getRoomActorPermissions(input: { roomId: string; deviceId: string }): Promise<RoomActorPermissions> {
  const db = await requireDb();
  const roomRows = await db.select({ ownerId: chatRooms.ownerId }).from(chatRooms).where(eq(chatRooms.id, input.roomId)).limit(1);
  if (roomRows[0]?.ownerId === input.deviceId) return { role: "owner", ...ownerRoomPermissions };
  const rows = await db.select({
    canPin: roomModerators.canPin,
    canRename: roomModerators.canRename,
    canManageMembers: roomModerators.canManageMembers,
    canClearMessages: roomModerators.canClearMessages,
    canViewActivity: roomModerators.canViewActivity,
  }).from(roomModerators).where(and(eq(roomModerators.roomId, input.roomId), eq(roomModerators.deviceId, input.deviceId))).limit(1);
  return rows[0] ? { role: "moderator", ...rows[0] } : { role: "member", ...noRoomPermissions };
}

async function requireRoomCapability(roomId: string, deviceId: string, capability: keyof RoomModeratorPermissions) {
  const permissions = await getRoomActorPermissions({ roomId, deviceId });
  if (!permissions[capability]) throw new Error("لا تملك الصلاحية اللازمة لإدارة الغرفة.");
  const db = await requireDb();
  const actor = await db.select({ name: chatParticipants.name }).from(chatParticipants).where(and(
    eq(chatParticipants.roomId, roomId),
    eq(chatParticipants.deviceId, deviceId),
  )).limit(1);
  return { db, permissions, actorName: actor[0]?.name ?? "مشرف" };
}

async function requireRoomOwner(roomId: string, deviceId: string) {
  const permissions = await getRoomActorPermissions({ roomId, deviceId });
  if (permissions.role !== "owner") throw new Error("إدارة المشرفين متاحة لمالك الغرفة فقط.");
  const db = await requireDb();
  const actor = await db.select({ name: chatParticipants.name }).from(chatParticipants).where(and(
    eq(chatParticipants.roomId, roomId),
    eq(chatParticipants.deviceId, deviceId),
  )).limit(1);
  return { db, actorName: actor[0]?.name ?? "مالك الغرفة" };
}

async function recordRoomAdminActivity(db: Awaited<ReturnType<typeof requireDb>>, input: { roomId: string; actorDeviceId: string; actorName: string; action: RoomAdminAction; targetDeviceId?: string; targetName?: string; details?: string; kind?: string }) {
  const activityId = `activity_${crypto.randomUUID()}`;
  await db.insert(roomAdminActivity).values({ id: activityId, roomId: input.roomId, actorDeviceId: input.actorDeviceId, actorName: input.actorName, action: input.action, targetDeviceId: input.targetDeviceId, targetName: input.targetName, details: input.details });
  const members = await db.select({ deviceId: chatParticipants.deviceId }).from(chatParticipants).where(eq(chatParticipants.roomId, input.roomId));
  for (const member of members) {
    if (member.deviceId === input.actorDeviceId) continue;
    await db.insert(roomNotifications).values({ id: `notification_${crypto.randomUUID()}`, roomId: input.roomId, targetDeviceId: member.deviceId, activityId, kind: input.kind ?? "admin_action", title: "إجراء إداري في الغرفة", body: input.details ?? input.action });
  }
  return activityId;
}

export async function setRoomPin(input: { roomId: string; deviceId: string; messageId: string | null }) {
  const { db, actorName } = await requireRoomCapability(input.roomId, input.deviceId, "canPin");
  const roomRows = await db.select({ pinnedMessageId: chatRooms.pinnedMessageId }).from(chatRooms).where(eq(chatRooms.id, input.roomId)).limit(1);
  if (input.messageId) {
    const messages = await db.select({ id: chatMessages.id }).from(chatMessages).where(and(
      eq(chatMessages.id, input.messageId),
      eq(chatMessages.roomId, input.roomId),
    )).limit(1);
    if (!messages[0]) throw new Error("لا تنتمي الرسالة المحددة إلى هذه الغرفة.");
  }
  const previousMessageId = roomRows[0]?.pinnedMessageId;
  if (previousMessageId && previousMessageId !== input.messageId) {
    await db.update(chatMessages).set({ pinnedAt: null, pinnedBy: null }).where(and(
      eq(chatMessages.id, previousMessageId),
      eq(chatMessages.roomId, input.roomId),
    ));
  }
  if (input.messageId) {
    await db.update(chatMessages).set({ pinnedAt: new Date(), pinnedBy: input.deviceId }).where(and(
      eq(chatMessages.id, input.messageId),
      eq(chatMessages.roomId, input.roomId),
    ));
  }
  await db.update(chatRooms).set({ pinnedMessageId: input.messageId, updatedAt: new Date() }).where(eq(chatRooms.id, input.roomId));
  await recordRoomAdminActivity(db, {
    roomId: input.roomId,
    actorDeviceId: input.deviceId,
    actorName,
    action: input.messageId ? "message_pinned" : "message_unpinned",
    details: input.messageId ? "تم تثبيت محتوى في الغرفة" : "تم إلغاء تثبيت المحتوى",
  });
  return getRoomSnapshot(input.roomId);
}

export async function updateRoomName(input: { roomId: string; deviceId: string; name: string }) {
  const { db, actorName } = await requireRoomCapability(input.roomId, input.deviceId, "canRename");
  await db.update(chatRooms).set({ name: input.name, updatedAt: new Date() }).where(eq(chatRooms.id, input.roomId));
  await recordRoomAdminActivity(db, { roomId: input.roomId, actorDeviceId: input.deviceId, actorName, action: "room_renamed", details: `تم تغيير اسم الغرفة إلى ${input.name}` });
  return getRoomSnapshot(input.roomId);
}

export async function setRoomMemberBan(input: { roomId: string; deviceId: string; targetDeviceId: string; isBanned: boolean }) {
  const { db, actorName } = await requireRoomCapability(input.roomId, input.deviceId, "canManageMembers");
  const roomRows = await db.select({ ownerId: chatRooms.ownerId }).from(chatRooms).where(eq(chatRooms.id, input.roomId)).limit(1);
  if (input.targetDeviceId === roomRows[0]?.ownerId) throw new Error("لا يمكنك إزالة مالك الغرفة.");
  const members = await db.select({ id: chatParticipants.id, name: chatParticipants.name }).from(chatParticipants).where(and(
    eq(chatParticipants.roomId, input.roomId),
    eq(chatParticipants.deviceId, input.targetDeviceId),
  )).limit(1);
  if (!members[0]) throw new Error("لا ينتمي هذا الشخص إلى الغرفة.");
  if (input.isBanned) {
    await db.insert(roomMemberBans).values({
      id: participantKey(input.roomId, input.targetDeviceId),
      roomId: input.roomId,
      deviceId: input.targetDeviceId,
      bannedBy: input.deviceId,
    }).onDuplicateKeyUpdate({ set: { bannedBy: input.deviceId } });
  } else {
    await db.delete(roomMemberBans).where(and(
      eq(roomMemberBans.roomId, input.roomId),
      eq(roomMemberBans.deviceId, input.targetDeviceId),
    ));
  }
  await recordRoomAdminActivity(db, {
    roomId: input.roomId,
    actorDeviceId: input.deviceId,
    actorName,
    action: input.isBanned ? "member_removed" : "member_restored",
    targetDeviceId: input.targetDeviceId,
    targetName: members[0].name,
    details: input.isBanned ? "تمت إزالة العضو من الغرفة" : "تمت إعادة العضو إلى الغرفة",
  });
  return getRoomSnapshot(input.roomId);
}

export async function listRoomModerators(input: { roomId: string; deviceId: string }): Promise<RoomModerator[]> {
  const { db } = await requireRoomOwner(input.roomId, input.deviceId);
  const [moderators, members] = await Promise.all([
    db.select().from(roomModerators).where(eq(roomModerators.roomId, input.roomId)).orderBy(desc(roomModerators.updatedAt)),
    db.select({ deviceId: chatParticipants.deviceId, name: chatParticipants.name, color: chatParticipants.color }).from(chatParticipants).where(eq(chatParticipants.roomId, input.roomId)),
  ]);
  const memberById = new Map(members.map(member => [member.deviceId, member]));
  return moderators.map(moderator => ({
    deviceId: moderator.deviceId,
    name: memberById.get(moderator.deviceId)?.name ?? "مشرف",
    color: memberById.get(moderator.deviceId)?.color ?? "#6382a3",
    canPin: moderator.canPin,
    canRename: moderator.canRename,
    canManageMembers: moderator.canManageMembers,
    canClearMessages: moderator.canClearMessages,
    canViewActivity: moderator.canViewActivity,
    assignedBy: moderator.assignedBy,
    createdAt: moderator.createdAt,
  }));
}

export async function setRoomModerator(input: { roomId: string; deviceId: string; targetDeviceId: string; isModerator: boolean; permissions: RoomModeratorPermissions }) {
  const { db, actorName } = await requireRoomOwner(input.roomId, input.deviceId);
  const roomRows = await db.select({ ownerId: chatRooms.ownerId }).from(chatRooms).where(eq(chatRooms.id, input.roomId)).limit(1);
  if (input.targetDeviceId === roomRows[0]?.ownerId) throw new Error("مالك الغرفة يمتلك جميع الصلاحيات تلقائيًا.");
  const members = await db.select({ id: chatParticipants.id, name: chatParticipants.name }).from(chatParticipants).where(and(
    eq(chatParticipants.roomId, input.roomId),
    eq(chatParticipants.deviceId, input.targetDeviceId),
  )).limit(1);
  if (!members[0]) throw new Error("لا ينتمي هذا الشخص إلى الغرفة.");
  const existing = await db.select({ id: roomModerators.id }).from(roomModerators).where(and(
    eq(roomModerators.roomId, input.roomId),
    eq(roomModerators.deviceId, input.targetDeviceId),
  )).limit(1);
  if (input.isModerator) {
    await db.insert(roomModerators).values({
      id: moderatorKey(input.roomId, input.targetDeviceId),
      roomId: input.roomId,
      deviceId: input.targetDeviceId,
      ...input.permissions,
      assignedBy: input.deviceId,
    }).onDuplicateKeyUpdate({ set: { ...input.permissions, assignedBy: input.deviceId, updatedAt: new Date() } });
  } else {
    await db.delete(roomModerators).where(and(eq(roomModerators.roomId, input.roomId), eq(roomModerators.deviceId, input.targetDeviceId)));
  }
  await recordRoomAdminActivity(db, {
    roomId: input.roomId,
    actorDeviceId: input.deviceId,
    actorName,
    action: input.isModerator ? existing[0] ? "moderator_updated" : "moderator_granted" : "moderator_removed",
    targetDeviceId: input.targetDeviceId,
    targetName: members[0].name,
    details: input.isModerator ? existing[0] ? "تم تحديث صلاحيات المشرف" : "تم تعيين مشرف جديد" : "تمت إزالة صلاحيات المشرف",
  });
  return listRoomModerators({ roomId: input.roomId, deviceId: input.deviceId });
}

export async function listRoomAdminActivity(input: { roomId: string; deviceId: string }): Promise<RoomAdminActivity[]> {
  const { db } = await requireRoomCapability(input.roomId, input.deviceId, "canViewActivity");
  const rows = await db.select({
    id: roomAdminActivity.id,
    actorDeviceId: roomAdminActivity.actorDeviceId,
    actorName: roomAdminActivity.actorName,
    action: roomAdminActivity.action,
    targetDeviceId: roomAdminActivity.targetDeviceId,
    targetName: roomAdminActivity.targetName,
    details: roomAdminActivity.details,
    createdAt: roomAdminActivity.createdAt,
  }).from(roomAdminActivity).where(eq(roomAdminActivity.roomId, input.roomId)).orderBy(desc(roomAdminActivity.createdAt)).limit(80);
  return rows;
}

export async function addMessage(input: { roomId: string; senderId: string; senderName: string; senderColor: string; text: string; replyToId?: string | null; attachment?: { name: string; type: string; url: string } }) {
  const db = await requireDb();
  await joinRoom({ roomId: input.roomId, deviceId: input.senderId, name: input.senderName, color: input.senderColor });
  if (input.replyToId) {
    const target = await db.select({ id: chatMessages.id }).from(chatMessages).where(and(eq(chatMessages.id, input.replyToId), eq(chatMessages.roomId, input.roomId))).limit(1);
    if (!target[0]) throw new Error("لا يمكن الرد على رسالة خارج هذه الغرفة.");
  }
  await db.insert(chatMessages).values({
    id: `message_${crypto.randomUUID()}`, roomId: input.roomId, senderId: input.senderId, senderName: input.senderName,
    senderColor: input.senderColor, text: input.text, replyToId: input.replyToId ?? null, reactions: null,
    attachmentName: input.attachment?.name, attachmentType: input.attachment?.type, attachmentUrl: input.attachment?.url,
  });
  return getRoomSnapshot(input.roomId);
}

export async function toggleRoomMessageReaction(input: { roomId: string; deviceId: string; messageId: string; emoji: string }) {
  const db = await requireDb();
  const member = await db.select({ id: chatParticipants.id }).from(chatParticipants).where(and(eq(chatParticipants.roomId, input.roomId), eq(chatParticipants.deviceId, input.deviceId))).limit(1);
  if (!member[0]) throw new Error("لا ينتمي هذا الشخص إلى الغرفة.");
  const rows = await db.select({ id: chatMessages.id, reactions: chatMessages.reactions }).from(chatMessages).where(and(eq(chatMessages.id, input.messageId), eq(chatMessages.roomId, input.roomId))).limit(1);
  if (!rows[0]) throw new Error("الرسالة غير موجودة في هذه الغرفة.");
  const reactions = parseReactions(rows[0].reactions);
  const users = new Set(reactions[input.emoji] ?? []);
  if (users.has(input.deviceId)) users.delete(input.deviceId); else users.add(input.deviceId);
  if (users.size) reactions[input.emoji] = Array.from(users); else delete reactions[input.emoji];
  await db.update(chatMessages).set({ reactions: Object.keys(reactions).length ? serializeReactions(reactions) : null }).where(eq(chatMessages.id, input.messageId));
  return getRoomSnapshot(input.roomId);
}

export async function resetRoom(input: { roomId: string; deviceId: string }) {
  const { db, actorName } = await requireRoomCapability(input.roomId, input.deviceId, "canClearMessages");
  await db.delete(chatMessages).where(eq(chatMessages.roomId, input.roomId));
  await db.update(chatRooms).set({ pinnedMessageId: null, updatedAt: new Date() }).where(eq(chatRooms.id, input.roomId));
  await recordRoomAdminActivity(db, { roomId: input.roomId, actorDeviceId: input.deviceId, actorName, action: "messages_cleared", details: "تم مسح سجل رسائل الغرفة" });
  return getRoomSnapshot(input.roomId);
}

export async function getDeviceProfile(deviceId: string) {
  const db = await requireDb();
  const rows = await db.select({ avatarUrl: deviceProfiles.avatarUrl }).from(deviceProfiles)
    .where(eq(deviceProfiles.deviceId, deviceId)).limit(1);
  return { avatarUrl: rows[0]?.avatarUrl ?? null };
}

export async function setDeviceAvatar(input: { deviceId: string; avatarUrl: string }) {
  const db = await requireDb();
  await db.insert(deviceProfiles).values({ deviceId: input.deviceId, avatarUrl: input.avatarUrl })
    .onDuplicateKeyUpdate({ set: { avatarUrl: input.avatarUrl, updatedAt: new Date() } });
  return { avatarUrl: input.avatarUrl };
}

export type FileAttachment = {
  id: string;
  senderId: string;
  senderName: string;
  name: string;
  type: string;
  url: string;
  createdAt: Date;
};

export type DirectConversationSummary = {
  id: string;
  peerId: string;
  peerName: string;
  peerColor: string;
  peerAvatarUrl: string | null;
  updatedAt: Date;
  unreadCount: number;
  isMuted: boolean;
  isBlocked: boolean;
};

export type DirectSnapshot = {
  conversation: DirectConversationSummary;
  messages: RoomSnapshot["messages"];
  preferences: { isMuted: boolean; isBlocked: boolean };
  peerLastReadAt: Date | null;
  updatedAt: Date;
};

export type DirectCallType = "audio" | "video";
export type DirectCallStatus = "ringing" | "accepted" | "missed" | "rejected" | "ended" | "failed";
export type DirectCallLog = {
  id: string;
  conversationId: string;
  peerName: string;
  peerColor: string;
  direction: "outgoing" | "incoming";
  callType: DirectCallType;
  status: DirectCallStatus;
  startedAt: Date;
  answeredAt: Date | null;
  endedAt: Date | null;
};

function conversationIdFor(firstDeviceId: string, secondDeviceId: string) {
  const pair = [firstDeviceId, secondDeviceId].sort().join(":");
  return `direct_${createHash("sha256").update(pair).digest("hex").slice(0, 48)}`;
}

function preferenceIdFor(conversationId: string, deviceId: string) {
  return `preference_${createHash("sha256").update(`${conversationId}:${deviceId}`).digest("hex").slice(0, 48)}`;
}

function readStateIdFor(conversationId: string, deviceId: string) {
  return `read_${createHash("sha256").update(`${conversationId}:${deviceId}`).digest("hex").slice(0, 56)}`;
}

function summaryForConversation(
  conversation: typeof directConversations.$inferSelect,
  deviceId: string,
): DirectConversationSummary {
  const firstIsCurrent = conversation.participantOne === deviceId;
  return {
    id: conversation.id,
    peerId: firstIsCurrent ? conversation.participantTwo : conversation.participantOne,
    peerName: firstIsCurrent ? conversation.participantTwoName : conversation.participantOneName,
    peerColor: firstIsCurrent ? conversation.participantTwoColor : conversation.participantOneColor,
    peerAvatarUrl: null,
    updatedAt: conversation.updatedAt,
    unreadCount: 0,
    isMuted: false,
    isBlocked: false,
  };
}

function messageResult(message: typeof directMessages.$inferSelect): RoomSnapshot["messages"][number] {
  return {
    id: message.id,
    senderId: message.senderId,
    senderName: message.senderName,
    avatarUrl: null,
    text: message.text,
    replyToId: message.replyToId ?? null,
    reactions: parseReactions(message.reactions),
    createdAt: message.createdAt,
    pinnedAt: null,
    pinnedBy: null,
    ...(message.attachmentUrl && message.attachmentName && message.attachmentType
      ? { attachment: { name: message.attachmentName, type: message.attachmentType, url: message.attachmentUrl } }
      : {}),
  };
}

async function activeRoomParticipant(roomId: string, deviceId: string) {
  const db = await requireDb();
  const rows = await db.select({
    id: chatParticipants.deviceId,
    name: chatParticipants.name,
    color: chatParticipants.color,
  }).from(chatParticipants).where(and(
    eq(chatParticipants.roomId, roomId),
    eq(chatParticipants.deviceId, deviceId),
    gte(chatParticipants.lastSeen, new Date(Date.now() - 90_000)),
  )).limit(1);
  return rows[0];
}

async function memberConversation(conversationId: string, deviceId: string) {
  const db = await requireDb();
  const rows = await db.select().from(directConversations).where(and(
    eq(directConversations.id, conversationId),
    or(eq(directConversations.participantOne, deviceId), eq(directConversations.participantTwo, deviceId)),
  )).limit(1);
  if (!rows[0]) throw new Error("لا تملك صلاحية الوصول إلى هذه المحادثة الخاصة.");
  return rows[0];
}

async function getConversationPreferences(conversationId: string, deviceId: string, peerId: string) {
  const db = await requireDb();
  const rows = await db.select({ isMuted: directConversationPreferences.isMuted, isBlocked: directConversationPreferences.isBlocked })
    .from(directConversationPreferences).where(and(
      eq(directConversationPreferences.id, preferenceIdFor(conversationId, deviceId)),
      eq(directConversationPreferences.peerId, peerId),
    )).limit(1);
  return rows[0] ?? { isMuted: false, isBlocked: false };
}

async function getUnreadCount(conversationId: string, deviceId: string) {
  const db = await requireDb();
  const state = await db.select({ lastReadAt: directReadStates.lastReadAt }).from(directReadStates)
    .where(eq(directReadStates.id, readStateIdFor(conversationId, deviceId))).limit(1);
  const unseen = [
    eq(directMessages.conversationId, conversationId),
    ne(directMessages.senderId, deviceId),
    ...(state[0] ? [gt(directMessages.createdAt, state[0].lastReadAt)] : []),
  ];
  const rows = await db.select({ total: count() }).from(directMessages).where(and(...unseen));
  return Number(rows[0]?.total ?? 0);
}

async function getLastReadAt(conversationId: string, deviceId: string) {
  const db = await requireDb();
  const rows = await db.select({ lastReadAt: directReadStates.lastReadAt }).from(directReadStates)
    .where(eq(directReadStates.id, readStateIdFor(conversationId, deviceId))).limit(1);
  return rows[0]?.lastReadAt ?? null;
}

async function enrichedSummary(conversation: typeof directConversations.$inferSelect, deviceId: string) {
  const summary = summaryForConversation(conversation, deviceId);
  const [preferences, unreadCount, profile] = await Promise.all([
    getConversationPreferences(conversation.id, deviceId, summary.peerId),
    getUnreadCount(conversation.id, deviceId),
    getDeviceProfile(summary.peerId),
  ]);
  return { ...summary, ...preferences, unreadCount, peerAvatarUrl: profile.avatarUrl };
}

export async function assertDirectMessageAllowed(conversationId: string, senderId: string) {
  const conversation = await memberConversation(conversationId, senderId);
  const recipientId = summaryForConversation(conversation, senderId).peerId;
  const [senderPreferences, recipientPreferences] = await Promise.all([
    getConversationPreferences(conversation.id, senderId, recipientId),
    getConversationPreferences(conversation.id, recipientId, senderId),
  ]);
  if (senderPreferences.isBlocked || recipientPreferences.isBlocked) {
    throw new Error("تعذر إرسال الرسالة لأن أحد الطرفين حظر هذه المحادثة.");
  }
  return conversation;
}

export async function getDirectPeerIdForMember(conversationId: string, deviceId: string) {
  const conversation = await memberConversation(conversationId, deviceId);
  return summaryForConversation(conversation, deviceId).peerId;
}

export async function startDirectConversation(input: {
  roomId: string;
  deviceId: string;
  name: string;
  color: string;
  peerId: string;
}): Promise<DirectConversationSummary> {
  if (input.deviceId === input.peerId) throw new Error("اختر شخصًا آخر لبدء محادثة خاصة.");
  await joinRoom(input);
  const peer = await activeRoomParticipant(input.roomId, input.peerId);
  if (!peer) throw new Error("هذا الشخص لم يعد متصلًا بهذه الغرفة.");

  const id = conversationIdFor(input.deviceId, input.peerId);
  const firstIsCurrent = input.deviceId.localeCompare(input.peerId) < 0;
  const first = firstIsCurrent
    ? { id: input.deviceId, name: input.name, color: input.color }
    : peer;
  const second = firstIsCurrent
    ? peer
    : { id: input.deviceId, name: input.name, color: input.color };
  const db = await requireDb();
  await db.insert(directConversations).values({
    id,
    participantOne: first.id,
    participantOneName: first.name,
    participantOneColor: first.color,
    participantTwo: second.id,
    participantTwoName: second.name,
    participantTwoColor: second.color,
  }).onDuplicateKeyUpdate({
    set: {
      participantOneName: first.name,
      participantOneColor: first.color,
      participantTwoName: second.name,
      participantTwoColor: second.color,
      updatedAt: new Date(),
    },
  });
  const conversation = await memberConversation(id, input.deviceId);
  return enrichedSummary(conversation, input.deviceId);
}

export async function listDirectConversations(deviceId: string): Promise<DirectConversationSummary[]> {
  const db = await requireDb();
  const conversations = await db.select().from(directConversations).where(or(
    eq(directConversations.participantOne, deviceId),
    eq(directConversations.participantTwo, deviceId),
  )).orderBy(desc(directConversations.updatedAt));
  return Promise.all(conversations.map(conversation => enrichedSummary(conversation, deviceId)));
}

export async function getDirectSnapshot(input: { conversationId: string; deviceId: string }): Promise<DirectSnapshot> {
  const conversation = await memberConversation(input.conversationId, input.deviceId);
  const db = await requireDb();
  const messages = await db.select().from(directMessages)
    .where(eq(directMessages.conversationId, input.conversationId))
    .orderBy(desc(directMessages.createdAt)).limit(120);
  const profileIds = Array.from(new Set(messages.map(message => message.senderId)));
  const profileRows = profileIds.length
    ? await db.select({ deviceId: deviceProfiles.deviceId, avatarUrl: deviceProfiles.avatarUrl }).from(deviceProfiles).where(inArray(deviceProfiles.deviceId, profileIds))
    : [];
  const avatars = new Map(profileRows.map(profile => [profile.deviceId, profile.avatarUrl]));
  const peerId = summaryForConversation(conversation, input.deviceId).peerId;
  return {
    conversation: await enrichedSummary(conversation, input.deviceId),
    messages: messages.reverse().map(message => ({ ...messageResult(message), avatarUrl: avatars.get(message.senderId) ?? null })),
    preferences: await getConversationPreferences(conversation.id, input.deviceId, peerId),
    peerLastReadAt: await getLastReadAt(conversation.id, peerId),
    updatedAt: new Date(),
  };
}

export async function addDirectMessage(input: {
  conversationId: string;
  senderId: string;
  senderName: string;
  senderColor: string;
  text: string;
  replyToId?: string | null;
  attachment?: { name: string; type: string; url: string };
}) {
  const conversation = await assertDirectMessageAllowed(input.conversationId, input.senderId);
  const db = await requireDb();
  if (input.replyToId) {
    const target = await db.select({ id: directMessages.id }).from(directMessages).where(and(
      eq(directMessages.id, input.replyToId),
      eq(directMessages.conversationId, input.conversationId),
    )).limit(1);
    if (!target[0]) throw new Error("لا يمكن الرد على رسالة خارج هذه المحادثة.");
  }
  await db.insert(directMessages).values({
    id: `direct_message_${crypto.randomUUID()}`,
    conversationId: input.conversationId,
    senderId: input.senderId,
    senderName: input.senderName,
    senderColor: input.senderColor,
    text: input.text,
    replyToId: input.replyToId ?? null,
    reactions: null,
    attachmentName: input.attachment?.name,
    attachmentType: input.attachment?.type,
    attachmentUrl: input.attachment?.url,
  });
  await db.update(directConversations).set({ updatedAt: new Date() })
    .where(eq(directConversations.id, conversation.id));
  return getDirectSnapshot({ conversationId: input.conversationId, deviceId: input.senderId });
}

export async function toggleDirectMessageReaction(input: { conversationId: string; deviceId: string; messageId: string; emoji: string }) {
  await assertDirectMessageAllowed(input.conversationId, input.deviceId);
  const db = await requireDb();
  const rows = await db.select({ id: directMessages.id, reactions: directMessages.reactions }).from(directMessages).where(and(
    eq(directMessages.id, input.messageId),
    eq(directMessages.conversationId, input.conversationId),
  )).limit(1);
  if (!rows[0]) throw new Error("الرسالة غير موجودة في هذه المحادثة.");
  const reactions = parseReactions(rows[0].reactions);
  const users = new Set(reactions[input.emoji] ?? []);
  if (users.has(input.deviceId)) users.delete(input.deviceId); else users.add(input.deviceId);
  if (users.size) reactions[input.emoji] = Array.from(users); else delete reactions[input.emoji];
  await db.update(directMessages).set({ reactions: Object.keys(reactions).length ? serializeReactions(reactions) : null }).where(eq(directMessages.id, input.messageId));
  return getDirectSnapshot({ conversationId: input.conversationId, deviceId: input.deviceId });
}

export async function setDirectConversationPreferences(input: {
  conversationId: string;
  deviceId: string;
  isMuted: boolean;
  isBlocked: boolean;
}) {
  const conversation = await memberConversation(input.conversationId, input.deviceId);
  const peerId = summaryForConversation(conversation, input.deviceId).peerId;
  const db = await requireDb();
  await db.insert(directConversationPreferences).values({
    id: preferenceIdFor(input.conversationId, input.deviceId),
    conversationId: input.conversationId,
    deviceId: input.deviceId,
    peerId,
    isMuted: input.isMuted,
    isBlocked: input.isBlocked,
  }).onDuplicateKeyUpdate({ set: { isMuted: input.isMuted, isBlocked: input.isBlocked, updatedAt: new Date() } });
  return { isMuted: input.isMuted, isBlocked: input.isBlocked };
}

export async function markDirectConversationRead(input: { conversationId: string; deviceId: string }) {
  await memberConversation(input.conversationId, input.deviceId);
  const db = await requireDb();
  const now = new Date();
  await db.insert(directReadStates).values({
    id: readStateIdFor(input.conversationId, input.deviceId),
    conversationId: input.conversationId,
    deviceId: input.deviceId,
    lastReadAt: now,
  }).onDuplicateKeyUpdate({ set: { lastReadAt: now, updatedAt: now } });
  return { success: true } as const;
}

export async function startDirectCall(input: { conversationId: string; deviceId: string; callType: DirectCallType }) {
  const conversation = await memberConversation(input.conversationId, input.deviceId);
  const peer = summaryForConversation(conversation, input.deviceId);
  const db = await requireDb();
  const id = `call_${crypto.randomUUID()}`;
  const startedAt = new Date();
  await db.insert(directCallLogs).values({
    id,
    conversationId: conversation.id,
    callerId: input.deviceId,
    recipientId: peer.peerId,
    callType: input.callType,
    status: "ringing",
    startedAt,
  });
  return { id, conversationId: conversation.id, callType: input.callType, status: "ringing" as const, startedAt };
}

export async function updateDirectCall(input: { callId: string; conversationId: string; deviceId: string; status: Exclude<DirectCallStatus, "ringing"> }) {
  await memberConversation(input.conversationId, input.deviceId);
  const db = await requireDb();
  const rows = await db.select().from(directCallLogs).where(and(
    eq(directCallLogs.id, input.callId),
    eq(directCallLogs.conversationId, input.conversationId),
    or(eq(directCallLogs.callerId, input.deviceId), eq(directCallLogs.recipientId, input.deviceId)),
  )).limit(1);
  if (!rows[0]) throw new Error("لا تملك صلاحية تعديل سجل هذه المكالمة.");
  if (input.status === "accepted" && rows[0].status !== "ringing") {
    return { success: true } as const;
  }
  const now = new Date();
  const terminal = ["missed", "rejected", "ended", "failed"].includes(input.status);
  await db.update(directCallLogs).set({
    status: input.status,
    ...(input.status === "accepted" ? { answeredAt: now } : {}),
    ...(terminal ? { endedAt: now } : {}),
  }).where(eq(directCallLogs.id, input.callId));
  return { success: true } as const;
}

export async function listDirectCallLogs(input: { conversationId: string; deviceId: string }): Promise<DirectCallLog[]> {
  const conversation = await memberConversation(input.conversationId, input.deviceId);
  const peer = summaryForConversation(conversation, input.deviceId);
  const db = await requireDb();
  const rows = await db.select().from(directCallLogs).where(eq(directCallLogs.conversationId, input.conversationId))
    .orderBy(desc(directCallLogs.startedAt)).limit(60);
  return rows.map(call => ({
    id: call.id,
    conversationId: call.conversationId,
    peerName: peer.peerName,
    peerColor: peer.peerColor,
    direction: call.callerId === input.deviceId ? "outgoing" : "incoming",
    callType: call.callType,
    status: call.status,
    startedAt: call.startedAt,
    answeredAt: call.answeredAt,
    endedAt: call.endedAt,
  }));
}

export async function deleteDirectCall(input: { callId: string; conversationId: string; deviceId: string }) {
  await memberConversation(input.conversationId, input.deviceId);
  const db = await requireDb();
  await db.delete(directCallLogs).where(and(
    eq(directCallLogs.id, input.callId),
    eq(directCallLogs.conversationId, input.conversationId),
    or(eq(directCallLogs.callerId, input.deviceId), eq(directCallLogs.recipientId, input.deviceId)),
  ));
  return { success: true } as const;
}

export async function clearDirectCallLogs(input: { conversationId: string; deviceId: string }) {
  await memberConversation(input.conversationId, input.deviceId);
  const db = await requireDb();
  await db.delete(directCallLogs).where(eq(directCallLogs.conversationId, input.conversationId));
  return { success: true } as const;
}

export async function listRoomFiles(roomId: string): Promise<FileAttachment[]> {
  const db = await requireDb();
  const rows = await db.select({
    id: chatMessages.id,
    senderId: chatMessages.senderId,
    senderName: chatMessages.senderName,
    name: chatMessages.attachmentName,
    type: chatMessages.attachmentType,
    url: chatMessages.attachmentUrl,
    createdAt: chatMessages.createdAt,
  }).from(chatMessages).where(and(eq(chatMessages.roomId, roomId), isNotNull(chatMessages.attachmentUrl)))
    .orderBy(desc(chatMessages.createdAt));
  return rows.flatMap(row => row.name && row.type && row.url ? [{ ...row, name: row.name, type: row.type, url: row.url }] : []);
}

export async function listDirectFiles(input: { conversationId: string; deviceId: string }): Promise<FileAttachment[]> {
  await memberConversation(input.conversationId, input.deviceId);
  const db = await requireDb();
  const rows = await db.select({
    id: directMessages.id,
    senderId: directMessages.senderId,
    senderName: directMessages.senderName,
    name: directMessages.attachmentName,
    type: directMessages.attachmentType,
    url: directMessages.attachmentUrl,
    createdAt: directMessages.createdAt,
  }).from(directMessages).where(and(
    eq(directMessages.conversationId, input.conversationId),
    isNotNull(directMessages.attachmentUrl),
  )).orderBy(desc(directMessages.createdAt));
  return rows.flatMap(row => row.name && row.type && row.url ? [{ ...row, name: row.name, type: row.type, url: row.url }] : []);
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;
  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
    const textFields = ["name", "username", "avatarUrl", "email", "loginMethod"] as const;
  textFields.forEach(field => {
    if (user[field] !== undefined) { values[field] = user[field] ?? null; updateSet[field] = user[field] ?? null; }
  });
  if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
  if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
  else if (user.openId === ENV.ownerOpenId) { values.role = "admin"; updateSet.role = "admin"; }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

function mapModeratorInvite(row: typeof roomModeratorInvitations.$inferSelect): RoomModeratorInvite {
  return {
    id: row.id,
    roomId: row.roomId,
    targetDeviceId: row.targetDeviceId,
    targetName: row.targetName,
    targetColor: row.targetColor,
    invitedBy: row.invitedBy,
    invitedByName: row.invitedByName,
    permissions: { canPin: row.canPin, canRename: row.canRename, canManageMembers: row.canManageMembers, canClearMessages: row.canClearMessages, canViewActivity: row.canViewActivity },
    status: row.status === "declined" ? "rejected" : row.status,
    createdAt: row.createdAt,
    decidedAt: row.decidedAt,
    decidedBy: row.decidedBy,
  };
}

export async function createModeratorInvitation(input: { roomId: string; deviceId: string; targetDeviceId: string; permissions: RoomModeratorPermissions }) {
  const { db, actorName } = await requireRoomOwner(input.roomId, input.deviceId);
  const member = await db.select({ name: chatParticipants.name, color: chatParticipants.color }).from(chatParticipants).where(and(eq(chatParticipants.roomId, input.roomId), eq(chatParticipants.deviceId, input.targetDeviceId))).limit(1);
  if (!member[0]) throw new Error("لا ينتمي هذا الشخص إلى الغرفة.");
  const pending = await db.select({ id: roomModeratorInvitations.id }).from(roomModeratorInvitations).where(and(eq(roomModeratorInvitations.roomId, input.roomId), eq(roomModeratorInvitations.targetDeviceId, input.targetDeviceId), eq(roomModeratorInvitations.status, "pending"))).limit(1);
  if (pending[0]) throw new Error("هناك دعوة مشرف معلقة لهذا العضو بالفعل.");
  const id = `invite:${input.roomId}:${input.targetDeviceId}:${Date.now()}`;
  await db.insert(roomModeratorInvitations).values({ id, roomId: input.roomId, targetDeviceId: input.targetDeviceId, targetName: member[0].name, targetColor: member[0].color, invitedBy: input.deviceId, invitedByName: actorName, ...input.permissions, status: "pending" });
  await recordRoomAdminActivity(db, { roomId: input.roomId, actorDeviceId: input.deviceId, actorName, action: "moderator_invited", targetDeviceId: input.targetDeviceId, targetName: member[0].name, details: "تم إرسال دعوة لتولي دور المشرف", kind: "moderator_invite" });
  const created = await db.select().from(roomModeratorInvitations).where(eq(roomModeratorInvitations.id, id)).limit(1);
  return mapModeratorInvite(created[0]);
}

export async function listModeratorInvitations(input: { roomId: string; deviceId: string }): Promise<RoomModeratorInvite[]> {
  const db = await requireDb();
  const room = await db.select({ ownerId: chatRooms.ownerId }).from(chatRooms).where(eq(chatRooms.id, input.roomId)).limit(1);
  const rows = room[0]?.ownerId === input.deviceId
    ? await db.select().from(roomModeratorInvitations).where(eq(roomModeratorInvitations.roomId, input.roomId)).orderBy(desc(roomModeratorInvitations.createdAt)).limit(80)
    : await db.select().from(roomModeratorInvitations).where(and(eq(roomModeratorInvitations.roomId, input.roomId), eq(roomModeratorInvitations.targetDeviceId, input.deviceId))).orderBy(desc(roomModeratorInvitations.createdAt)).limit(80);
  if (room[0]?.ownerId !== input.deviceId && !rows.length) {
    const member = await db.select({ id: chatParticipants.id }).from(chatParticipants).where(and(eq(chatParticipants.roomId, input.roomId), eq(chatParticipants.deviceId, input.deviceId))).limit(1);
    if (!member[0]) throw new Error("لا تملك صلاحية عرض دعوات المشرفين.");
  }
  return rows.map(mapModeratorInvite);
}

export async function respondModeratorInvitation(input: { roomId: string; deviceId: string; inviteId: string; approve: boolean }) {
  const db = await requireDb();
  const rows = await db.select().from(roomModeratorInvitations).where(and(eq(roomModeratorInvitations.id, input.inviteId), eq(roomModeratorInvitations.roomId, input.roomId), eq(roomModeratorInvitations.targetDeviceId, input.deviceId))).limit(1);
  const invite = rows[0];
  if (!invite) throw new Error("هذه الدعوة غير متاحة لك.");
  if (invite.status !== "pending") throw new Error("تم التعامل مع هذه الدعوة من قبل.");
  const member = await db.select({ name: chatParticipants.name }).from(chatParticipants).where(and(eq(chatParticipants.roomId, input.roomId), eq(chatParticipants.deviceId, input.deviceId))).limit(1);
  if (!member[0]) throw new Error("لا ينتمي هذا الشخص إلى الغرفة.");
  const status = input.approve ? "approved" : "declined";
  await db.update(roomModeratorInvitations).set({ status, decidedAt: new Date(), decidedBy: input.deviceId }).where(eq(roomModeratorInvitations.id, input.inviteId));
  if (input.approve) {
    await db.insert(roomModerators).values({ id: moderatorKey(input.roomId, input.deviceId), roomId: input.roomId, deviceId: input.deviceId, canPin: invite.canPin, canRename: invite.canRename, canManageMembers: invite.canManageMembers, canClearMessages: invite.canClearMessages, canViewActivity: invite.canViewActivity, assignedBy: invite.invitedBy }).onDuplicateKeyUpdate({ set: { canPin: invite.canPin, canRename: invite.canRename, canManageMembers: invite.canManageMembers, canClearMessages: invite.canClearMessages, canViewActivity: invite.canViewActivity, assignedBy: invite.invitedBy, updatedAt: new Date() } });
  }
  await recordRoomAdminActivity(db, { roomId: input.roomId, actorDeviceId: input.deviceId, actorName: member[0].name, action: input.approve ? "moderator_invite_approved" : "moderator_invite_declined", targetDeviceId: input.deviceId, targetName: member[0].name, details: input.approve ? "وافق العضو على دعوة المشرف" : "رفض العضو دعوة المشرف" });
  const updated = await db.select().from(roomModeratorInvitations).where(eq(roomModeratorInvitations.id, input.inviteId)).limit(1);
  return mapModeratorInvite(updated[0]);
}

export async function cancelModeratorInvitation(input: { roomId: string; deviceId: string; inviteId: string }) {
  const { db, actorName } = await requireRoomOwner(input.roomId, input.deviceId);
  const rows = await db.select().from(roomModeratorInvitations).where(and(eq(roomModeratorInvitations.id, input.inviteId), eq(roomModeratorInvitations.roomId, input.roomId))).limit(1);
  const invite = rows[0];
  if (!invite || invite.status !== "pending") throw new Error("الدعوة غير موجودة أو تم التعامل معها.");
  await db.update(roomModeratorInvitations).set({ status: "cancelled", decidedAt: new Date(), decidedBy: input.deviceId }).where(eq(roomModeratorInvitations.id, input.inviteId));
  await recordRoomAdminActivity(db, { roomId: input.roomId, actorDeviceId: input.deviceId, actorName, action: "moderator_invite_cancelled", targetDeviceId: invite.targetDeviceId, targetName: invite.targetName, details: "تم إلغاء دعوة المشرف" });
  const updated = await db.select().from(roomModeratorInvitations).where(eq(roomModeratorInvitations.id, input.inviteId)).limit(1);
  return mapModeratorInvite(updated[0]);
}

export async function listRoomNotifications(input: { roomId: string; deviceId: string }): Promise<RoomNotification[]> {
  const db = await requireDb();
  const member = await db.select({ id: chatParticipants.id }).from(chatParticipants).where(and(eq(chatParticipants.roomId, input.roomId), eq(chatParticipants.deviceId, input.deviceId))).limit(1);
  if (!member[0]) throw new Error("لا ينتمي هذا الشخص إلى الغرفة.");
  return db.select().from(roomNotifications).where(and(eq(roomNotifications.roomId, input.roomId), eq(roomNotifications.targetDeviceId, input.deviceId))).orderBy(desc(roomNotifications.createdAt)).limit(80) as Promise<RoomNotification[]>;
}

export async function markRoomNotificationRead(input: { roomId: string; deviceId: string; notificationId?: string }) {
  const db = await requireDb();
  await db.update(roomNotifications).set({ readAt: new Date() }).where(and(eq(roomNotifications.roomId, input.roomId), eq(roomNotifications.targetDeviceId, input.deviceId), input.notificationId ? eq(roomNotifications.id, input.notificationId) : undefined));
  return { success: true } as const;
}

export async function exportRoomAdminActivity(input: { roomId: string; deviceId: string }) {
  const rows = await listRoomAdminActivity(input);
  const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const header = ["التاريخ", "المنفذ", "الإجراء", "المستهدف", "التفاصيل"].map(escape).join(",");
  const lines = rows.map(row => [row.createdAt.toISOString(), row.actorName, row.action, row.targetName ?? "", row.details ?? ""].map(escape).join(","));
  return { filename: `qareeb-${input.roomId}-admin-activity.csv`, mimeType: "text/csv;charset=utf-8", content: `\uFEFF${[header, ...lines].join("\n")}` };
}

export async function getPublicProfile(openId: string) {
  const db = await requireDb();
  const rows = await db.select({ openId: users.openId, username: users.username, name: users.name, avatarUrl: users.avatarUrl, bio: users.bio, availability: users.availability, language: users.language, privacyMode: users.privacyMode }).from(users).where(eq(users.openId, openId)).limit(1);
  return rows[0] ?? { openId, username: null, name: null, avatarUrl: null, bio: null, availability: "available", language: "ar", privacyMode: "everyone" };
}

export async function updatePublicProfile(input: { openId: string; username: string; name: string; bio?: string; availability?: "available" | "busy" | "away"; language?: "ar" | "en"; privacyMode?: "everyone" | "contacts" | "nobody" }) {
  const db = await requireDb();
  const username = input.username.trim().slice(0, 32);
  const name = input.name.trim().slice(0, 80);
  if (!/^[A-Za-z0-9_.\-\u0600-\u06FF]+$/.test(username)) throw new Error("اسم المستخدم يحتوي على رموز غير مسموحة.");
  const existing = await db.select({ openId: users.openId }).from(users).where(and(eq(users.username, username), ne(users.openId, input.openId))).limit(1);
  if (existing[0]) throw new Error("اسم المستخدم مستخدم بالفعل.");
  await db.update(users).set({ username, name: name || username, bio: input.bio?.trim().slice(0, 160) || null, availability: input.availability ?? "available", language: input.language ?? "ar", privacyMode: input.privacyMode ?? "everyone" }).where(eq(users.openId, input.openId));
  return getPublicProfile(input.openId);
}

export async function updatePublicAvatar(input: { openId: string; avatarUrl: string }) {
  const db = await requireDb();
  await db.update(users).set({ avatarUrl: input.avatarUrl }).where(eq(users.openId, input.openId));
  return getPublicProfile(input.openId);
}

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { InsertUser } from "../drizzle/schema";

export type MessageReactionMap = Record<string, string[]>;

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
export type RoomAdminActivity = { id: string; roomId: string; actorDeviceId: string; actorName: string; action: string; targetDeviceId: string | null; targetName: string | null; details: string | null; createdAt: Date };
export type ModeratorInviteStatus = "pending" | "approved" | "rejected" | "cancelled";
export type RoomModeratorInvite = {
  id: string;
  roomId: string;
  targetDeviceId: string;
  targetName: string;
  targetColor: string;
  invitedBy: string;
  invitedByName: string;
  permissions: RoomModeratorPermissions;
  status: ModeratorInviteStatus;
  createdAt: Date;
  decidedAt: Date | null;
  decidedBy: string | null;
};
export type RoomNotification = {
  id: string;
  roomId: string;
  targetDeviceId: string;
  activityId: string | null;
  kind: "admin_action" | "moderator_invite";
  title: string;
  body: string;
  createdAt: Date;
  readAt: Date | null;
};

export type FileAttachment = { id: string; senderId: string; senderName: string; name: string; type: string; url: string; createdAt: Date };
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

type LocalState = {
  rooms: Record<string, { id: string; name: string; ownerId: string | null; pinnedMessageId: string | null; createdAt: Date; updatedAt: Date }>;
  participants: Record<string, { id: string; roomId: string; deviceId: string; name: string; color: string; lastSeen: Date }>;
  profiles: Record<string, { deviceId: string; avatarUrl: string | null; updatedAt: Date }>;
  bans: Record<string, { id: string; roomId: string; deviceId: string; bannedBy: string; createdAt: Date }>;
  moderators: Record<string, { id: string; roomId: string; deviceId: string } & RoomModeratorPermissions & { assignedBy: string; createdAt: Date; updatedAt: Date }>;
  invites: Record<string, RoomModeratorInvite>;
  activities: Record<string, RoomAdminActivity>;
  notifications: Record<string, RoomNotification>;
  messages: Record<string, { id: string; roomId: string; senderId: string; senderName: string; senderColor: string; text: string; replyToId: string | null; reactions: MessageReactionMap; attachmentName: string | null; attachmentType: string | null; attachmentUrl: string | null; pinnedAt: Date | null; pinnedBy: string | null; createdAt: Date }>;
  conversations: Record<string, { id: string; participantOne: string; participantOneName: string; participantOneColor: string; participantTwo: string; participantTwoName: string; participantTwoColor: string; createdAt: Date; updatedAt: Date }>;
  directMessages: Record<string, { id: string; conversationId: string; senderId: string; senderName: string; senderColor: string; text: string; replyToId: string | null; reactions: MessageReactionMap; attachmentName: string | null; attachmentType: string | null; attachmentUrl: string | null; createdAt: Date }>;
  preferences: Record<string, { id: string; conversationId: string; deviceId: string; peerId: string; isMuted: boolean; isBlocked: boolean; updatedAt: Date }>;
  reads: Record<string, { id: string; conversationId: string; deviceId: string; lastReadAt: Date; updatedAt: Date }>;
  calls: Record<string, { id: string; conversationId: string; callerId: string; recipientId: string; callType: DirectCallType; status: DirectCallStatus; startedAt: Date; answeredAt: Date | null; endedAt: Date | null }>;
  users: Record<string, InsertUser & { createdAt?: Date; updatedAt?: Date; lastSignedIn?: Date }>;
};

const emptyState = (): LocalState => ({ rooms: {}, participants: {}, profiles: {}, bans: {}, moderators: {}, invites: {}, activities: {}, notifications: {}, messages: {}, conversations: {}, directMessages: {}, preferences: {}, reads: {}, calls: {}, users: {} });
const dataDir = path.resolve(process.env.QAREEB_DATA_DIR || ".qareeb-data");
const dataFile = path.join(dataDir, "qareeb.json");
let state: LocalState | null = null;
let loadPromise: Promise<LocalState> | null = null;
let writeChain = Promise.resolve();

function revive(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(revive);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => {
    const next = revive(child);
    return [key, /At$|Date$|Seen$/.test(key) && typeof next === "string" ? new Date(next) : next];
  }));
}

async function getState() {
  if (state) return state;
  if (!loadPromise) {
    loadPromise = (async () => {
      await mkdir(dataDir, { recursive: true });
      try {
        const parsed = JSON.parse(await readFile(dataFile, "utf8"));
        state = { ...emptyState(), ...(revive(parsed) as Partial<LocalState>) };
      } catch {
        state = emptyState();
      }
      return state;
    })();
  }
  return loadPromise;
}

async function persist() {
  const current = await getState();
  const snapshot = JSON.stringify(current, null, 2);
  writeChain = writeChain.then(async () => {
    await mkdir(dataDir, { recursive: true });
    await writeFile(dataFile, snapshot, "utf8");
  });
  await writeChain;
}

function now() { return new Date(); }
function participantKey(roomId: string, deviceId: string) { return `${roomId}:${deviceId}`; }
function moderatorKey(roomId: string, deviceId: string) { return `mod:${roomId}:${deviceId}`; }
function banKey(roomId: string, deviceId: string) { return `ban:${roomId}:${deviceId}`; }
function inviteKey(roomId: string, deviceId: string) { return `invite:${roomId}:${deviceId}`; }
function activityKey() { return `activity_${crypto.randomUUID()}`; }
function notificationKey() { return `notification_${crypto.randomUUID()}`; }
function conversationIdFor(firstDeviceId: string, secondDeviceId: string) {
  const pair = [firstDeviceId, secondDeviceId].sort().join(":");
  return `direct_${createHash("sha256").update(pair).digest("hex").slice(0, 48)}`;
}
function preferenceIdFor(conversationId: string, deviceId: string) { return `preference_${createHash("sha256").update(`${conversationId}:${deviceId}`).digest("hex").slice(0, 48)}`; }
function readStateIdFor(conversationId: string, deviceId: string) { return `read_${createHash("sha256").update(`${conversationId}:${deviceId}`).digest("hex").slice(0, 56)}`; }

const noRoomPermissions: RoomModeratorPermissions = { canPin: false, canRename: false, canManageMembers: false, canClearMessages: false, canViewActivity: false };
const ownerRoomPermissions: RoomModeratorPermissions = { canPin: true, canRename: true, canManageMembers: true, canClearMessages: true, canViewActivity: true };

export async function getDb() { return null; }
export async function ensureRoom(roomId: string) {
  const db = await getState();
  if (!db.rooms[roomId]) {
    const created = now();
    db.rooms[roomId] = { id: roomId, name: "غرفة قريب", ownerId: null, pinnedMessageId: null, createdAt: created, updatedAt: created };
    await persist();
  }
}
async function isBanned(roomId: string, deviceId: string) { const db = await getState(); return Boolean(db.bans[banKey(roomId, deviceId)]); }

export async function joinRoom(input: { roomId: string; deviceId: string; name: string; color: string }) {
  const db = await getState();
  await ensureRoom(input.roomId);
  if (await isBanned(input.roomId, input.deviceId)) throw new Error("لقد أزالك مالك الغرفة من هذه المساحة.");
  const room = db.rooms[input.roomId];
  if (!room.ownerId) room.ownerId = input.deviceId;
  const timestamp = now();
  db.participants[participantKey(input.roomId, input.deviceId)] = { id: participantKey(input.roomId, input.deviceId), roomId: input.roomId, deviceId: input.deviceId, name: input.name, color: input.color, lastSeen: timestamp };
  room.updatedAt = timestamp;
  await persist();
  return getRoomSnapshot(input.roomId);
}

export async function getRoomSnapshot(roomId: string): Promise<RoomSnapshot> {
  const db = await getState();
  await ensureRoom(roomId);
  const room = db.rooms[roomId];
  const bannedIds = new Set(Object.values(db.bans).filter(item => item.roomId === roomId).map(item => item.deviceId));
  const members = Object.values(db.participants).filter(item => item.roomId === roomId).sort((a, b) => b.lastSeen.getTime() - a.lastSeen.getTime()).slice(0, 80);
  const messages = Object.values(db.messages).filter(item => item.roomId === roomId).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()).slice(-120);
  const avatar = (deviceId: string) => db.profiles[deviceId]?.avatarUrl ?? null;
  const toMessage = (message: LocalState["messages"][string]) => ({
    id: message.id, senderId: message.senderId, senderName: message.senderName, avatarUrl: avatar(message.senderId), text: message.text, replyToId: message.replyToId ?? null, reactions: message.reactions ?? {}, createdAt: message.createdAt, pinnedAt: message.pinnedAt, pinnedBy: message.pinnedBy,
    ...(message.attachmentUrl && message.attachmentName && message.attachmentType ? { attachment: { name: message.attachmentName, type: message.attachmentType, url: message.attachmentUrl } } : {}),
  });
  return {
    roomId, roomName: room.name, ownerId: room.ownerId, participants: members.map(member => ({ id: member.deviceId, name: member.name, color: member.color, avatarUrl: avatar(member.deviceId), lastSeen: member.lastSeen, isOnline: !bannedIds.has(member.deviceId) && member.lastSeen.getTime() >= Date.now() - 90_000, isBanned: bannedIds.has(member.deviceId) })),
    messages: messages.map(toMessage), pinnedMessage: room.pinnedMessageId && db.messages[room.pinnedMessageId] ? toMessage(db.messages[room.pinnedMessageId]) : null, updatedAt: now(),
  };
}

export async function getRoomActorPermissions(input: { roomId: string; deviceId: string }): Promise<RoomActorPermissions> {
  const db = await getState();
  const room = db.rooms[input.roomId];
  if (room?.ownerId === input.deviceId) return { role: "owner", ...ownerRoomPermissions };
  const moderator = db.moderators[moderatorKey(input.roomId, input.deviceId)];
  return moderator ? { role: "moderator", canPin: moderator.canPin, canRename: moderator.canRename, canManageMembers: moderator.canManageMembers, canClearMessages: moderator.canClearMessages, canViewActivity: moderator.canViewActivity } : { role: "member", ...noRoomPermissions };
}
async function requireRoomCapability(roomId: string, deviceId: string, capability: keyof RoomModeratorPermissions) {
  const permissions = await getRoomActorPermissions({ roomId, deviceId });
  if (!permissions[capability]) throw new Error("لا تملك الصلاحية اللازمة لإدارة الغرفة.");
  const db = await getState();
  const participant = db.participants[participantKey(roomId, deviceId)];
  return { db, permissions, actorName: participant?.name ?? "مشرف" };
}
async function requireRoomOwner(roomId: string, deviceId: string) {
  const permissions = await getRoomActorPermissions({ roomId, deviceId });
  if (permissions.role !== "owner") throw new Error("إدارة المشرفين متاحة لمالك الغرفة فقط.");
  const db = await getState();
  return { db, actorName: db.participants[participantKey(roomId, deviceId)]?.name ?? "مالك الغرفة" };
}

async function recordActivity(db: LocalState, input: { roomId: string; actorDeviceId: string; actorName: string; action: string; targetDeviceId?: string; targetName?: string; details?: string; kind?: RoomNotification["kind"] }) {
  const activityId = activityKey();
  const activity: RoomAdminActivity = { id: activityId, roomId: input.roomId, actorDeviceId: input.actorDeviceId, actorName: input.actorName, action: input.action, targetDeviceId: input.targetDeviceId ?? null, targetName: input.targetName ?? null, details: input.details ?? null, createdAt: now() };
  db.activities[activityId] = activity;
  const room = db.rooms[input.roomId];
  const body = `${input.details ?? "أجرى تحديثًا إداريًا"}${input.targetName ? `: ${input.targetName}` : ""}`;
  for (const participant of Object.values(db.participants).filter(item => item.roomId === input.roomId && item.deviceId !== input.actorDeviceId)) {
    const id = notificationKey();
    db.notifications[id] = { id, roomId: input.roomId, targetDeviceId: participant.deviceId, activityId, kind: input.kind ?? "admin_action", title: room ? `إجراء إداري في ${room.name}` : "إجراء إداري في الغرفة", body, createdAt: now(), readAt: null };
  }
  return activity;
}

export async function setRoomPin(input: { roomId: string; deviceId: string; messageId: string | null }) {
  const { db, actorName } = await requireRoomCapability(input.roomId, input.deviceId, "canPin");
  const room = db.rooms[input.roomId];
  if (input.messageId && (!db.messages[input.messageId] || db.messages[input.messageId].roomId !== input.roomId)) throw new Error("لا تنتمي الرسالة المحددة إلى هذه الغرفة.");
  if (room.pinnedMessageId && db.messages[room.pinnedMessageId]) { db.messages[room.pinnedMessageId].pinnedAt = null; db.messages[room.pinnedMessageId].pinnedBy = null; }
  if (input.messageId) { db.messages[input.messageId].pinnedAt = now(); db.messages[input.messageId].pinnedBy = input.deviceId; }
  room.pinnedMessageId = input.messageId;
  room.updatedAt = now();
  await recordActivity(db, { roomId: input.roomId, actorDeviceId: input.deviceId, actorName, action: input.messageId ? "message_pinned" : "message_unpinned", details: input.messageId ? "تم تثبيت محتوى في الغرفة" : "تم إلغاء تثبيت المحتوى" });
  await persist();
  return getRoomSnapshot(input.roomId);
}
export async function updateRoomName(input: { roomId: string; deviceId: string; name: string }) {
  const { db, actorName } = await requireRoomCapability(input.roomId, input.deviceId, "canRename");
  db.rooms[input.roomId].name = input.name; db.rooms[input.roomId].updatedAt = now();
  await recordActivity(db, { roomId: input.roomId, actorDeviceId: input.deviceId, actorName, action: "room_renamed", details: `تم تغيير اسم الغرفة إلى ${input.name}` });
  await persist();
  return getRoomSnapshot(input.roomId);
}
export async function setRoomMemberBan(input: { roomId: string; deviceId: string; targetDeviceId: string; isBanned: boolean }) {
  const { db, actorName } = await requireRoomCapability(input.roomId, input.deviceId, "canManageMembers");
  if (input.targetDeviceId === db.rooms[input.roomId]?.ownerId) throw new Error("لا يمكنك إزالة مالك الغرفة.");
  const member = db.participants[participantKey(input.roomId, input.targetDeviceId)];
  if (!member) throw new Error("لا ينتمي هذا الشخص إلى الغرفة.");
  if (input.isBanned) db.bans[banKey(input.roomId, input.targetDeviceId)] = { id: banKey(input.roomId, input.targetDeviceId), roomId: input.roomId, deviceId: input.targetDeviceId, bannedBy: input.deviceId, createdAt: now() };
  else delete db.bans[banKey(input.roomId, input.targetDeviceId)];
  await recordActivity(db, { roomId: input.roomId, actorDeviceId: input.deviceId, actorName, action: input.isBanned ? "member_removed" : "member_restored", targetDeviceId: input.targetDeviceId, targetName: member.name, details: input.isBanned ? "تمت إزالة العضو من الغرفة" : "تمت إعادة العضو إلى الغرفة" });
  await persist();
  return getRoomSnapshot(input.roomId);
}

export async function listRoomModerators(input: { roomId: string; deviceId: string }): Promise<RoomModerator[]> {
  const { db } = await requireRoomOwner(input.roomId, input.deviceId);
  return Object.values(db.moderators).filter(item => item.roomId === input.roomId).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()).map(item => {
    const member = db.participants[participantKey(input.roomId, item.deviceId)];
    return { deviceId: item.deviceId, name: member?.name ?? "مشرف", color: member?.color ?? "#6382a3", canPin: item.canPin, canRename: item.canRename, canManageMembers: item.canManageMembers, canClearMessages: item.canClearMessages, canViewActivity: item.canViewActivity, assignedBy: item.assignedBy, createdAt: item.createdAt };
  });
}
export async function setRoomModerator(input: { roomId: string; deviceId: string; targetDeviceId: string; isModerator: boolean; permissions: RoomModeratorPermissions }) {
  const { db, actorName } = await requireRoomOwner(input.roomId, input.deviceId);
  if (input.targetDeviceId === db.rooms[input.roomId]?.ownerId) throw new Error("مالك الغرفة يمتلك جميع الصلاحيات تلقائيًا.");
  const member = db.participants[participantKey(input.roomId, input.targetDeviceId)];
  if (!member) throw new Error("لا ينتمي هذا الشخص إلى الغرفة.");
  const key = moderatorKey(input.roomId, input.targetDeviceId);
  const existing = Boolean(db.moderators[key]);
  if (input.isModerator) { const timestamp = now(); db.moderators[key] = { id: key, roomId: input.roomId, deviceId: input.targetDeviceId, ...input.permissions, assignedBy: input.deviceId, createdAt: db.moderators[key]?.createdAt ?? timestamp, updatedAt: timestamp }; }
  else delete db.moderators[key];
  await recordActivity(db, { roomId: input.roomId, actorDeviceId: input.deviceId, actorName, action: input.isModerator ? existing ? "moderator_updated" : "moderator_granted" : "moderator_removed", targetDeviceId: input.targetDeviceId, targetName: member.name, details: input.isModerator ? existing ? "تم تحديث صلاحيات المشرف" : "تم تعيين مشرف جديد" : "تمت إزالة صلاحيات المشرف" });
  await persist();
  return listRoomModerators({ roomId: input.roomId, deviceId: input.deviceId });
}

export async function createModeratorInvitation(input: { roomId: string; deviceId: string; targetDeviceId: string; permissions: RoomModeratorPermissions }) {
  const { db, actorName } = await requireRoomOwner(input.roomId, input.deviceId);
  if (input.targetDeviceId === db.rooms[input.roomId]?.ownerId) throw new Error("مالك الغرفة لا يحتاج إلى دعوة مشرف.");
  const member = db.participants[participantKey(input.roomId, input.targetDeviceId)];
  if (!member) throw new Error("لا ينتمي هذا الشخص إلى الغرفة.");
  if (db.moderators[moderatorKey(input.roomId, input.targetDeviceId)]) throw new Error("هذا العضو مشرف بالفعل.");
  const existing = db.invites[inviteKey(input.roomId, input.targetDeviceId)];
  if (existing?.status === "pending") throw new Error("لدى هذا العضو دعوة مشرف معلقة بالفعل.");
  const timestamp = now();
  const invite: RoomModeratorInvite = { id: inviteKey(input.roomId, input.targetDeviceId), roomId: input.roomId, targetDeviceId: input.targetDeviceId, targetName: member.name, targetColor: member.color, invitedBy: input.deviceId, invitedByName: actorName, permissions: input.permissions, status: "pending", createdAt: timestamp, decidedAt: null, decidedBy: null };
  db.invites[invite.id] = invite;
  await recordActivity(db, { roomId: input.roomId, actorDeviceId: input.deviceId, actorName, action: "moderator_invited", targetDeviceId: member.deviceId, targetName: member.name, details: "تم إرسال دعوة لتولي دور المشرف", kind: "moderator_invite" });
  await persist();
  return invite;
}
export async function listModeratorInvitations(input: { roomId: string; deviceId: string }): Promise<RoomModeratorInvite[]> {
  const db = await getState();
  const room = db.rooms[input.roomId];
  if (room?.ownerId !== input.deviceId && !db.participants[participantKey(input.roomId, input.deviceId)]) throw new Error("لا تملك صلاحية عرض دعوات المشرفين.");
  return Object.values(db.invites).filter(invite => invite.roomId === input.roomId && (room?.ownerId === input.deviceId || invite.targetDeviceId === input.deviceId)).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}
export async function respondModeratorInvitation(input: { roomId: string; deviceId: string; inviteId: string; approve: boolean }) {
  const db = await getState();
  const invite = db.invites[input.inviteId];
  if (!invite || invite.roomId !== input.roomId || invite.targetDeviceId !== input.deviceId) throw new Error("هذه الدعوة غير متاحة لك.");
  if (invite.status !== "pending") throw new Error("تم التعامل مع هذه الدعوة من قبل.");
  const member = db.participants[participantKey(input.roomId, input.deviceId)];
  if (!member) throw new Error("لا ينتمي هذا الشخص إلى الغرفة.");
  const timestamp = now();
  invite.status = input.approve ? "approved" : "rejected"; invite.decidedAt = timestamp; invite.decidedBy = input.deviceId;
  if (input.approve) { const key = moderatorKey(input.roomId, input.deviceId); db.moderators[key] = { id: key, roomId: input.roomId, deviceId: input.deviceId, ...invite.permissions, assignedBy: invite.invitedBy, createdAt: timestamp, updatedAt: timestamp }; }
  const actorName = member.name;
  await recordActivity(db, { roomId: input.roomId, actorDeviceId: input.deviceId, actorName, action: input.approve ? "moderator_invite_approved" : "moderator_invite_rejected", targetDeviceId: input.deviceId, targetName: member.name, details: input.approve ? "وافق العضو على دعوة المشرف" : "رفض العضو دعوة المشرف" });
  await persist();
  return invite;
}
export async function cancelModeratorInvitation(input: { roomId: string; deviceId: string; inviteId: string }) {
  const { db, actorName } = await requireRoomOwner(input.roomId, input.deviceId);
  const invite = db.invites[input.inviteId];
  if (!invite || invite.roomId !== input.roomId || invite.status !== "pending") throw new Error("الدعوة غير موجودة أو تم التعامل معها.");
  invite.status = "cancelled"; invite.decidedAt = now(); invite.decidedBy = input.deviceId;
  await recordActivity(db, { roomId: input.roomId, actorDeviceId: input.deviceId, actorName, action: "moderator_invite_cancelled", targetDeviceId: invite.targetDeviceId, targetName: invite.targetName, details: "تم إلغاء دعوة المشرف" });
  await persist();
  return invite;
}

export async function listRoomAdminActivity(input: { roomId: string; deviceId: string }): Promise<RoomAdminActivity[]> {
  await requireRoomCapability(input.roomId, input.deviceId, "canViewActivity");
  const db = await getState();
  return Object.values(db.activities).filter(item => item.roomId === input.roomId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 200);
}
export async function exportRoomAdminActivity(input: { roomId: string; deviceId: string }) {
  const rows = await listRoomAdminActivity(input);
  const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const header = ["التاريخ", "المنفذ", "الإجراء", "المستهدف", "التفاصيل"].map(escape).join(",");
  const lines = rows.map(row => [row.createdAt.toISOString(), row.actorName, row.action, row.targetName ?? "", row.details ?? ""].map(escape).join(","));
  return { filename: `qareeb-${input.roomId}-admin-activity.csv`, mimeType: "text/csv;charset=utf-8", content: `\uFEFF${[header, ...lines].join("\n")}` };
}
export async function listRoomNotifications(input: { roomId: string; deviceId: string }): Promise<RoomNotification[]> {
  const db = await getState();
  if (!db.participants[participantKey(input.roomId, input.deviceId)]) throw new Error("لا ينتمي هذا الشخص إلى الغرفة.");
  return Object.values(db.notifications).filter(item => item.roomId === input.roomId && item.targetDeviceId === input.deviceId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 80);
}
export async function markRoomNotificationRead(input: { roomId: string; deviceId: string; notificationId?: string }) {
  const db = await getState();
  for (const notification of Object.values(db.notifications)) if (notification.roomId === input.roomId && notification.targetDeviceId === input.deviceId && (!input.notificationId || notification.id === input.notificationId)) notification.readAt = now();
  await persist();
  return { success: true } as const;
}

export async function addMessage(input: { roomId: string; senderId: string; senderName: string; senderColor: string; text: string; replyToId?: string | null; attachment?: { name: string; type: string; url: string } }) {
  await joinRoom({ roomId: input.roomId, deviceId: input.senderId, name: input.senderName, color: input.senderColor });
  const db = await getState();
  if (input.replyToId) {
    const target = db.messages[input.replyToId];
    if (!target || target.roomId !== input.roomId) throw new Error("لا يمكن الرد على رسالة خارج هذه الغرفة.");
  }
  const messageId = `message_${crypto.randomUUID()}`;
  db.messages[messageId] = { id: messageId, roomId: input.roomId, senderId: input.senderId, senderName: input.senderName, senderColor: input.senderColor, text: input.text, replyToId: input.replyToId ?? null, reactions: {}, attachmentName: input.attachment?.name ?? null, attachmentType: input.attachment?.type ?? null, attachmentUrl: input.attachment?.url ?? null, pinnedAt: null, pinnedBy: null, createdAt: now() };
  await persist();
  return getRoomSnapshot(input.roomId);
}

export async function toggleRoomMessageReaction(input: { roomId: string; deviceId: string; messageId: string; emoji: string }) {
  const db = await getState();
  if (!db.participants[participantKey(input.roomId, input.deviceId)]) throw new Error("لا ينتمي هذا الشخص إلى الغرفة.");
  const message = db.messages[input.messageId];
  if (!message || message.roomId !== input.roomId) throw new Error("الرسالة غير موجودة في هذه الغرفة.");
  const users = new Set(message.reactions?.[input.emoji] ?? []);
  if (users.has(input.deviceId)) users.delete(input.deviceId); else users.add(input.deviceId);
  message.reactions = { ...(message.reactions ?? {}), [input.emoji]: Array.from(users) };
  if (message.reactions[input.emoji].length === 0) delete message.reactions[input.emoji];
  await persist();
  return getRoomSnapshot(input.roomId);
}
export async function resetRoom(input: { roomId: string; deviceId: string }) {
  const { db, actorName } = await requireRoomCapability(input.roomId, input.deviceId, "canClearMessages");
  for (const [id, message] of Object.entries(db.messages)) if (message.roomId === input.roomId) delete db.messages[id];
  db.rooms[input.roomId].pinnedMessageId = null; db.rooms[input.roomId].updatedAt = now();
  await recordActivity(db, { roomId: input.roomId, actorDeviceId: input.deviceId, actorName, action: "messages_cleared", details: "تم مسح سجل رسائل الغرفة" });
  await persist();
  return getRoomSnapshot(input.roomId);
}
export async function getDeviceProfile(deviceId: string) { const db = await getState(); return { avatarUrl: db.profiles[deviceId]?.avatarUrl ?? null }; }
export async function setDeviceAvatar(input: { deviceId: string; avatarUrl: string }) { const db = await getState(); db.profiles[input.deviceId] = { deviceId: input.deviceId, avatarUrl: input.avatarUrl, updatedAt: now() }; await persist(); return { avatarUrl: input.avatarUrl }; }

function summaryForConversation(conversation: LocalState["conversations"][string], deviceId: string): DirectConversationSummary {
  const first = conversation.participantOne === deviceId;
  return { id: conversation.id, peerId: first ? conversation.participantTwo : conversation.participantOne, peerName: first ? conversation.participantTwoName : conversation.participantOneName, peerColor: first ? conversation.participantTwoColor : conversation.participantOneColor, peerAvatarUrl: null, updatedAt: conversation.updatedAt, unreadCount: 0, isMuted: false, isBlocked: false };
}
function directMessageResult(message: LocalState["directMessages"][string]): RoomSnapshot["messages"][number] { return { id: message.id, senderId: message.senderId, senderName: message.senderName, avatarUrl: null, text: message.text, replyToId: message.replyToId ?? null, reactions: message.reactions ?? {}, createdAt: message.createdAt, pinnedAt: null, pinnedBy: null, ...(message.attachmentUrl && message.attachmentName && message.attachmentType ? { attachment: { name: message.attachmentName, type: message.attachmentType, url: message.attachmentUrl } } : {}) }; }
async function memberConversation(conversationId: string, deviceId: string) { const db = await getState(); const conversation = db.conversations[conversationId]; if (!conversation || (conversation.participantOne !== deviceId && conversation.participantTwo !== deviceId)) throw new Error("لا تملك صلاحية الوصول إلى هذه المحادثة الخاصة."); return conversation; }
async function getPreferences(conversationId: string, deviceId: string, peerId: string) { const db = await getState(); const item = db.preferences[preferenceIdFor(conversationId, deviceId)]; return item?.peerId === peerId ? { isMuted: item.isMuted, isBlocked: item.isBlocked } : { isMuted: false, isBlocked: false }; }
async function unreadCount(conversationId: string, deviceId: string) { const db = await getState(); const read = db.reads[readStateIdFor(conversationId, deviceId)]?.lastReadAt; return Object.values(db.directMessages).filter(message => message.conversationId === conversationId && message.senderId !== deviceId && (!read || message.createdAt > read)).length; }
async function lastReadAt(conversationId: string, deviceId: string) { const db = await getState(); return db.reads[readStateIdFor(conversationId, deviceId)]?.lastReadAt ?? null; }
async function enrichedSummary(conversation: LocalState["conversations"][string], deviceId: string) { const summary = summaryForConversation(conversation, deviceId); const [preferences, unread, profile] = await Promise.all([getPreferences(conversation.id, deviceId, summary.peerId), unreadCount(conversation.id, deviceId), getDeviceProfile(summary.peerId)]); return { ...summary, ...preferences, unreadCount: unread, peerAvatarUrl: profile.avatarUrl }; }
export async function assertDirectMessageAllowed(conversationId: string, senderId: string) { const conversation = await memberConversation(conversationId, senderId); const peerId = summaryForConversation(conversation, senderId).peerId; const [mine, theirs] = await Promise.all([getPreferences(conversationId, senderId, peerId), getPreferences(conversationId, peerId, senderId)]); if (mine.isBlocked || theirs.isBlocked) throw new Error("تعذر إرسال الرسالة لأن أحد الطرفين حظر هذه المحادثة."); return conversation; }
export async function getDirectPeerIdForMember(conversationId: string, deviceId: string) { const conversation = await memberConversation(conversationId, deviceId); return summaryForConversation(conversation, deviceId).peerId; }
export async function startDirectConversation(input: { roomId: string; deviceId: string; name: string; color: string; peerId: string }): Promise<DirectConversationSummary> {
  if (input.deviceId === input.peerId) throw new Error("اختر شخصًا آخر لبدء محادثة خاصة.");
  await joinRoom(input);
  const db = await getState();
  const peer = Object.values(db.participants).find(item => item.roomId === input.roomId && item.deviceId === input.peerId && item.lastSeen.getTime() >= Date.now() - 90_000);
  if (!peer) throw new Error("هذا الشخص لم يعد متصلًا بهذه الغرفة.");
  const id = conversationIdFor(input.deviceId, input.peerId); const first = input.deviceId.localeCompare(input.peerId) < 0; const timestamp = now();
  db.conversations[id] = { id, participantOne: first ? input.deviceId : peer.deviceId, participantOneName: first ? input.name : peer.name, participantOneColor: first ? input.color : peer.color, participantTwo: first ? peer.deviceId : input.deviceId, participantTwoName: first ? peer.name : input.name, participantTwoColor: first ? peer.color : input.color, createdAt: db.conversations[id]?.createdAt ?? timestamp, updatedAt: timestamp };
  await persist();
  return enrichedSummary(db.conversations[id], input.deviceId);
}
export async function listDirectConversations(deviceId: string) { const db = await getState(); return Promise.all(Object.values(db.conversations).filter(item => item.participantOne === deviceId || item.participantTwo === deviceId).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()).map(item => enrichedSummary(item, deviceId))); }
export async function getDirectSnapshot(input: { conversationId: string; deviceId: string }): Promise<DirectSnapshot> {
  const conversation = await memberConversation(input.conversationId, input.deviceId); const db = await getState(); const peerId = summaryForConversation(conversation, input.deviceId).peerId;
  const messages = Object.values(db.directMessages).filter(item => item.conversationId === input.conversationId).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()).slice(-120).map(message => ({ ...directMessageResult(message), avatarUrl: db.profiles[message.senderId]?.avatarUrl ?? null }));
  return { conversation: await enrichedSummary(conversation, input.deviceId), messages, preferences: await getPreferences(input.conversationId, input.deviceId, peerId), peerLastReadAt: await lastReadAt(input.conversationId, peerId), updatedAt: now() };
}
export async function addDirectMessage(input: { conversationId: string; senderId: string; senderName: string; senderColor: string; text: string; replyToId?: string | null; attachment?: { name: string; type: string; url: string } }) { const conversation = await assertDirectMessageAllowed(input.conversationId, input.senderId); const db = await getState(); if (input.replyToId) { const target = db.directMessages[input.replyToId]; if (!target || target.conversationId !== input.conversationId) throw new Error("لا يمكن الرد على رسالة خارج هذه المحادثة."); } const id = `direct_message_${crypto.randomUUID()}`; db.directMessages[id] = { id, conversationId: input.conversationId, senderId: input.senderId, senderName: input.senderName, senderColor: input.senderColor, text: input.text, replyToId: input.replyToId ?? null, reactions: {}, attachmentName: input.attachment?.name ?? null, attachmentType: input.attachment?.type ?? null, attachmentUrl: input.attachment?.url ?? null, createdAt: now() }; conversation.updatedAt = now(); await persist(); return getDirectSnapshot({ conversationId: input.conversationId, deviceId: input.senderId }); }
export async function toggleDirectMessageReaction(input: { conversationId: string; deviceId: string; messageId: string; emoji: string }) { const db = await getState(); await memberConversation(input.conversationId, input.deviceId); const message = db.directMessages[input.messageId]; if (!message || message.conversationId !== input.conversationId) throw new Error("الرسالة غير موجودة في هذه المحادثة."); const users = new Set(message.reactions?.[input.emoji] ?? []); if (users.has(input.deviceId)) users.delete(input.deviceId); else users.add(input.deviceId); message.reactions = { ...(message.reactions ?? {}), [input.emoji]: Array.from(users) }; if (message.reactions[input.emoji].length === 0) delete message.reactions[input.emoji]; await persist(); return getDirectSnapshot({ conversationId: input.conversationId, deviceId: input.deviceId }); }
export async function setDirectConversationPreferences(input: { conversationId: string; deviceId: string; isMuted: boolean; isBlocked: boolean }) { const conversation = await memberConversation(input.conversationId, input.deviceId); const peerId = summaryForConversation(conversation, input.deviceId).peerId; const db = await getState(); const id = preferenceIdFor(input.conversationId, input.deviceId); db.preferences[id] = { id, conversationId: input.conversationId, deviceId: input.deviceId, peerId, isMuted: input.isMuted, isBlocked: input.isBlocked, updatedAt: now() }; await persist(); return { isMuted: input.isMuted, isBlocked: input.isBlocked }; }
export async function markDirectConversationRead(input: { conversationId: string; deviceId: string }) { await memberConversation(input.conversationId, input.deviceId); const db = await getState(); const timestamp = now(); const id = readStateIdFor(input.conversationId, input.deviceId); db.reads[id] = { id, conversationId: input.conversationId, deviceId: input.deviceId, lastReadAt: timestamp, updatedAt: timestamp }; await persist(); return { success: true } as const; }
export async function startDirectCall(input: { conversationId: string; deviceId: string; callType: DirectCallType }) { const conversation = await memberConversation(input.conversationId, input.deviceId); const peerId = summaryForConversation(conversation, input.deviceId).peerId; const db = await getState(); const id = `call_${crypto.randomUUID()}`; const startedAt = now(); db.calls[id] = { id, conversationId: input.conversationId, callerId: input.deviceId, recipientId: peerId, callType: input.callType, status: "ringing", startedAt, answeredAt: null, endedAt: null }; await persist(); return { id, conversationId: input.conversationId, callType: input.callType, status: "ringing" as const, startedAt }; }
export async function updateDirectCall(input: { callId: string; conversationId: string; deviceId: string; status: Exclude<DirectCallStatus, "ringing"> }) { await memberConversation(input.conversationId, input.deviceId); const db = await getState(); const call = db.calls[input.callId]; if (!call || call.conversationId !== input.conversationId || (call.callerId !== input.deviceId && call.recipientId !== input.deviceId)) throw new Error("لا تملك صلاحية تعديل سجل هذه المكالمة."); if (input.status === "accepted" && call.status !== "ringing") return { success: true } as const; const timestamp = now(); call.status = input.status; if (input.status === "accepted") call.answeredAt = timestamp; if (["missed", "rejected", "ended", "failed"].includes(input.status)) call.endedAt = timestamp; await persist(); return { success: true } as const; }
export async function listDirectCallLogs(input: { conversationId: string; deviceId: string }): Promise<DirectCallLog[]> { const conversation = await memberConversation(input.conversationId, input.deviceId); const peer = summaryForConversation(conversation, input.deviceId); const db = await getState(); return Object.values(db.calls).filter(call => call.conversationId === input.conversationId).sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime()).slice(0, 60).map(call => ({ id: call.id, conversationId: call.conversationId, peerName: peer.peerName, peerColor: peer.peerColor, direction: call.callerId === input.deviceId ? "outgoing" : "incoming", callType: call.callType, status: call.status, startedAt: call.startedAt, answeredAt: call.answeredAt, endedAt: call.endedAt })); }
export async function deleteDirectCall(input: { callId: string; conversationId: string; deviceId: string }) { await memberConversation(input.conversationId, input.deviceId); const db = await getState(); const call = db.calls[input.callId]; if (call && call.conversationId === input.conversationId && (call.callerId === input.deviceId || call.recipientId === input.deviceId)) delete db.calls[input.callId]; await persist(); return { success: true } as const; }
export async function clearDirectCallLogs(input: { conversationId: string; deviceId: string }) { await memberConversation(input.conversationId, input.deviceId); const db = await getState(); for (const [id, call] of Object.entries(db.calls)) if (call.conversationId === input.conversationId) delete db.calls[id]; await persist(); return { success: true } as const; }
export async function listRoomFiles(roomId: string): Promise<FileAttachment[]> { const db = await getState(); return Object.values(db.messages).filter(item => item.roomId === roomId && item.attachmentUrl && item.attachmentName && item.attachmentType).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).map(item => ({ id: item.id, senderId: item.senderId, senderName: item.senderName, name: item.attachmentName!, type: item.attachmentType!, url: item.attachmentUrl!, createdAt: item.createdAt })); }
export async function listDirectFiles(input: { conversationId: string; deviceId: string }): Promise<FileAttachment[]> { await memberConversation(input.conversationId, input.deviceId); const db = await getState(); return Object.values(db.directMessages).filter(item => item.conversationId === input.conversationId && item.attachmentUrl && item.attachmentName && item.attachmentType).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).map(item => ({ id: item.id, senderId: item.senderId, senderName: item.senderName, name: item.attachmentName!, type: item.attachmentType!, url: item.attachmentUrl!, createdAt: item.createdAt })); }
export async function upsertUser(user: InsertUser): Promise<void> { const db = await getState(); if (!user.openId) throw new Error("User openId is required for upsert"); const existing = db.users[user.openId]; const timestamp = now(); db.users[user.openId] = { ...existing, ...user, createdAt: existing?.createdAt ?? timestamp, updatedAt: timestamp, lastSignedIn: timestamp }; await persist(); }
export async function getUserByOpenId(openId: string) { const db = await getState(); return db.users[openId]; }

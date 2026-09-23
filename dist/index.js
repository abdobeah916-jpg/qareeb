// server/_core/index.ts
import "dotenv/config";
import express2 from "express";
import { createServer as createHttpServer } from "http";
import { createServer as createHttpsServer } from "https";
import { readFileSync } from "fs";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";

// shared/const.ts
var COOKIE_NAME = "app_session_id";
var ONE_YEAR_MS = 1e3 * 60 * 60 * 24 * 365;
var AXIOS_TIMEOUT_MS = 3e4;
var UNAUTHED_ERR_MSG = "Please login (10001)";
var NOT_ADMIN_ERR_MSG = "You do not have required permission (10002)";
var OAUTH_STATE_COOKIE = "__Host-oauth_state";
var decodeOAuthState = (state2) => {
  let decoded;
  try {
    decoded = atob(state2);
  } catch {
    return { redirectUri: "" };
  }
  try {
    const parsed = JSON.parse(decoded);
    if (parsed && typeof parsed.redirectUri === "string") return parsed;
  } catch {
  }
  return { redirectUri: decoded };
};

// server/_core/oauth.ts
import { parse as parseCookieHeader2 } from "cookie";

// server/localDb.ts
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
var emptyState = () => ({ rooms: {}, participants: {}, profiles: {}, bans: {}, moderators: {}, invites: {}, activities: {}, notifications: {}, messages: {}, conversations: {}, directMessages: {}, preferences: {}, reads: {}, calls: {}, users: {} });
var dataDir = path.resolve(process.env.QAREEB_DATA_DIR || ".qareeb-data");
var dataFile = path.join(dataDir, "qareeb.json");
var state = null;
var loadPromise = null;
var writeChain = Promise.resolve();
function revive(value) {
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
        state = { ...emptyState(), ...revive(parsed) };
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
function now() {
  return /* @__PURE__ */ new Date();
}
function participantKey(roomId, deviceId) {
  return `${roomId}:${deviceId}`;
}
function moderatorKey(roomId, deviceId) {
  return `mod:${roomId}:${deviceId}`;
}
function banKey(roomId, deviceId) {
  return `ban:${roomId}:${deviceId}`;
}
function inviteKey(roomId, deviceId) {
  return `invite:${roomId}:${deviceId}`;
}
function activityKey() {
  return `activity_${crypto.randomUUID()}`;
}
function notificationKey() {
  return `notification_${crypto.randomUUID()}`;
}
function conversationIdFor(firstDeviceId, secondDeviceId) {
  const pair = [firstDeviceId, secondDeviceId].sort().join(":");
  return `direct_${createHash("sha256").update(pair).digest("hex").slice(0, 48)}`;
}
function preferenceIdFor(conversationId, deviceId) {
  return `preference_${createHash("sha256").update(`${conversationId}:${deviceId}`).digest("hex").slice(0, 48)}`;
}
function readStateIdFor(conversationId, deviceId) {
  return `read_${createHash("sha256").update(`${conversationId}:${deviceId}`).digest("hex").slice(0, 56)}`;
}
var noRoomPermissions = { canPin: false, canRename: false, canManageMembers: false, canClearMessages: false, canViewActivity: false };
var ownerRoomPermissions = { canPin: true, canRename: true, canManageMembers: true, canClearMessages: true, canViewActivity: true };
async function ensureRoom(roomId) {
  const db = await getState();
  if (!db.rooms[roomId]) {
    const created = now();
    db.rooms[roomId] = { id: roomId, name: "\u063A\u0631\u0641\u0629 \u0642\u0631\u064A\u0628", ownerId: null, pinnedMessageId: null, createdAt: created, updatedAt: created };
    await persist();
  }
}
async function isBanned(roomId, deviceId) {
  const db = await getState();
  return Boolean(db.bans[banKey(roomId, deviceId)]);
}
async function joinRoom(input) {
  const db = await getState();
  await ensureRoom(input.roomId);
  if (await isBanned(input.roomId, input.deviceId)) throw new Error("\u0644\u0642\u062F \u0623\u0632\u0627\u0644\u0643 \u0645\u0627\u0644\u0643 \u0627\u0644\u063A\u0631\u0641\u0629 \u0645\u0646 \u0647\u0630\u0647 \u0627\u0644\u0645\u0633\u0627\u062D\u0629.");
  const room = db.rooms[input.roomId];
  if (!room.ownerId) room.ownerId = input.deviceId;
  const timestamp2 = now();
  db.participants[participantKey(input.roomId, input.deviceId)] = { id: participantKey(input.roomId, input.deviceId), roomId: input.roomId, deviceId: input.deviceId, name: input.name, color: input.color, lastSeen: timestamp2 };
  room.updatedAt = timestamp2;
  await persist();
  return getRoomSnapshot(input.roomId);
}
async function getRoomSnapshot(roomId) {
  const db = await getState();
  await ensureRoom(roomId);
  const room = db.rooms[roomId];
  const bannedIds = new Set(Object.values(db.bans).filter((item) => item.roomId === roomId).map((item) => item.deviceId));
  const members = Object.values(db.participants).filter((item) => item.roomId === roomId).sort((a, b) => b.lastSeen.getTime() - a.lastSeen.getTime()).slice(0, 80);
  const messages = Object.values(db.messages).filter((item) => item.roomId === roomId).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()).slice(-120);
  const avatar = (deviceId) => db.profiles[deviceId]?.avatarUrl ?? null;
  const toMessage = (message) => ({
    id: message.id,
    senderId: message.senderId,
    senderName: message.senderName,
    avatarUrl: avatar(message.senderId),
    text: message.text,
    replyToId: message.replyToId ?? null,
    reactions: message.reactions ?? {},
    createdAt: message.createdAt,
    pinnedAt: message.pinnedAt,
    pinnedBy: message.pinnedBy,
    ...message.attachmentUrl && message.attachmentName && message.attachmentType ? { attachment: { name: message.attachmentName, type: message.attachmentType, url: message.attachmentUrl } } : {}
  });
  return {
    roomId,
    roomName: room.name,
    ownerId: room.ownerId,
    participants: members.map((member) => ({ id: member.deviceId, name: member.name, color: member.color, avatarUrl: avatar(member.deviceId), lastSeen: member.lastSeen, isOnline: !bannedIds.has(member.deviceId) && member.lastSeen.getTime() >= Date.now() - 9e4, isBanned: bannedIds.has(member.deviceId) })),
    messages: messages.map(toMessage),
    pinnedMessage: room.pinnedMessageId && db.messages[room.pinnedMessageId] ? toMessage(db.messages[room.pinnedMessageId]) : null,
    updatedAt: now()
  };
}
async function getRoomActorPermissions(input) {
  const db = await getState();
  const room = db.rooms[input.roomId];
  if (room?.ownerId === input.deviceId) return { role: "owner", ...ownerRoomPermissions };
  const moderator = db.moderators[moderatorKey(input.roomId, input.deviceId)];
  return moderator ? { role: "moderator", canPin: moderator.canPin, canRename: moderator.canRename, canManageMembers: moderator.canManageMembers, canClearMessages: moderator.canClearMessages, canViewActivity: moderator.canViewActivity } : { role: "member", ...noRoomPermissions };
}
async function requireRoomCapability(roomId, deviceId, capability) {
  const permissions = await getRoomActorPermissions({ roomId, deviceId });
  if (!permissions[capability]) throw new Error("\u0644\u0627 \u062A\u0645\u0644\u0643 \u0627\u0644\u0635\u0644\u0627\u062D\u064A\u0629 \u0627\u0644\u0644\u0627\u0632\u0645\u0629 \u0644\u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u063A\u0631\u0641\u0629.");
  const db = await getState();
  const participant = db.participants[participantKey(roomId, deviceId)];
  return { db, permissions, actorName: participant?.name ?? "\u0645\u0634\u0631\u0641" };
}
async function requireRoomOwner(roomId, deviceId) {
  const permissions = await getRoomActorPermissions({ roomId, deviceId });
  if (permissions.role !== "owner") throw new Error("\u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u0645\u0634\u0631\u0641\u064A\u0646 \u0645\u062A\u0627\u062D\u0629 \u0644\u0645\u0627\u0644\u0643 \u0627\u0644\u063A\u0631\u0641\u0629 \u0641\u0642\u0637.");
  const db = await getState();
  return { db, actorName: db.participants[participantKey(roomId, deviceId)]?.name ?? "\u0645\u0627\u0644\u0643 \u0627\u0644\u063A\u0631\u0641\u0629" };
}
async function recordActivity(db, input) {
  const activityId = activityKey();
  const activity = { id: activityId, roomId: input.roomId, actorDeviceId: input.actorDeviceId, actorName: input.actorName, action: input.action, targetDeviceId: input.targetDeviceId ?? null, targetName: input.targetName ?? null, details: input.details ?? null, createdAt: now() };
  db.activities[activityId] = activity;
  const room = db.rooms[input.roomId];
  const body = `${input.details ?? "\u0623\u062C\u0631\u0649 \u062A\u062D\u062F\u064A\u062B\u064B\u0627 \u0625\u062F\u0627\u0631\u064A\u064B\u0627"}${input.targetName ? `: ${input.targetName}` : ""}`;
  for (const participant of Object.values(db.participants).filter((item) => item.roomId === input.roomId && item.deviceId !== input.actorDeviceId)) {
    const id = notificationKey();
    db.notifications[id] = { id, roomId: input.roomId, targetDeviceId: participant.deviceId, activityId, kind: input.kind ?? "admin_action", title: room ? `\u0625\u062C\u0631\u0627\u0621 \u0625\u062F\u0627\u0631\u064A \u0641\u064A ${room.name}` : "\u0625\u062C\u0631\u0627\u0621 \u0625\u062F\u0627\u0631\u064A \u0641\u064A \u0627\u0644\u063A\u0631\u0641\u0629", body, createdAt: now(), readAt: null };
  }
  return activity;
}
async function setRoomPin(input) {
  const { db, actorName } = await requireRoomCapability(input.roomId, input.deviceId, "canPin");
  const room = db.rooms[input.roomId];
  if (input.messageId && (!db.messages[input.messageId] || db.messages[input.messageId].roomId !== input.roomId)) throw new Error("\u0644\u0627 \u062A\u0646\u062A\u0645\u064A \u0627\u0644\u0631\u0633\u0627\u0644\u0629 \u0627\u0644\u0645\u062D\u062F\u062F\u0629 \u0625\u0644\u0649 \u0647\u0630\u0647 \u0627\u0644\u063A\u0631\u0641\u0629.");
  if (room.pinnedMessageId && db.messages[room.pinnedMessageId]) {
    db.messages[room.pinnedMessageId].pinnedAt = null;
    db.messages[room.pinnedMessageId].pinnedBy = null;
  }
  if (input.messageId) {
    db.messages[input.messageId].pinnedAt = now();
    db.messages[input.messageId].pinnedBy = input.deviceId;
  }
  room.pinnedMessageId = input.messageId;
  room.updatedAt = now();
  await recordActivity(db, { roomId: input.roomId, actorDeviceId: input.deviceId, actorName, action: input.messageId ? "message_pinned" : "message_unpinned", details: input.messageId ? "\u062A\u0645 \u062A\u062B\u0628\u064A\u062A \u0645\u062D\u062A\u0648\u0649 \u0641\u064A \u0627\u0644\u063A\u0631\u0641\u0629" : "\u062A\u0645 \u0625\u0644\u063A\u0627\u0621 \u062A\u062B\u0628\u064A\u062A \u0627\u0644\u0645\u062D\u062A\u0648\u0649" });
  await persist();
  return getRoomSnapshot(input.roomId);
}
async function updateRoomName(input) {
  const { db, actorName } = await requireRoomCapability(input.roomId, input.deviceId, "canRename");
  db.rooms[input.roomId].name = input.name;
  db.rooms[input.roomId].updatedAt = now();
  await recordActivity(db, { roomId: input.roomId, actorDeviceId: input.deviceId, actorName, action: "room_renamed", details: `\u062A\u0645 \u062A\u063A\u064A\u064A\u0631 \u0627\u0633\u0645 \u0627\u0644\u063A\u0631\u0641\u0629 \u0625\u0644\u0649 ${input.name}` });
  await persist();
  return getRoomSnapshot(input.roomId);
}
async function setRoomMemberBan(input) {
  const { db, actorName } = await requireRoomCapability(input.roomId, input.deviceId, "canManageMembers");
  if (input.targetDeviceId === db.rooms[input.roomId]?.ownerId) throw new Error("\u0644\u0627 \u064A\u0645\u0643\u0646\u0643 \u0625\u0632\u0627\u0644\u0629 \u0645\u0627\u0644\u0643 \u0627\u0644\u063A\u0631\u0641\u0629.");
  const member = db.participants[participantKey(input.roomId, input.targetDeviceId)];
  if (!member) throw new Error("\u0644\u0627 \u064A\u0646\u062A\u0645\u064A \u0647\u0630\u0627 \u0627\u0644\u0634\u062E\u0635 \u0625\u0644\u0649 \u0627\u0644\u063A\u0631\u0641\u0629.");
  if (input.isBanned) db.bans[banKey(input.roomId, input.targetDeviceId)] = { id: banKey(input.roomId, input.targetDeviceId), roomId: input.roomId, deviceId: input.targetDeviceId, bannedBy: input.deviceId, createdAt: now() };
  else delete db.bans[banKey(input.roomId, input.targetDeviceId)];
  await recordActivity(db, { roomId: input.roomId, actorDeviceId: input.deviceId, actorName, action: input.isBanned ? "member_removed" : "member_restored", targetDeviceId: input.targetDeviceId, targetName: member.name, details: input.isBanned ? "\u062A\u0645\u062A \u0625\u0632\u0627\u0644\u0629 \u0627\u0644\u0639\u0636\u0648 \u0645\u0646 \u0627\u0644\u063A\u0631\u0641\u0629" : "\u062A\u0645\u062A \u0625\u0639\u0627\u062F\u0629 \u0627\u0644\u0639\u0636\u0648 \u0625\u0644\u0649 \u0627\u0644\u063A\u0631\u0641\u0629" });
  await persist();
  return getRoomSnapshot(input.roomId);
}
async function listRoomModerators(input) {
  const { db } = await requireRoomOwner(input.roomId, input.deviceId);
  return Object.values(db.moderators).filter((item) => item.roomId === input.roomId).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()).map((item) => {
    const member = db.participants[participantKey(input.roomId, item.deviceId)];
    return { deviceId: item.deviceId, name: member?.name ?? "\u0645\u0634\u0631\u0641", color: member?.color ?? "#6382a3", canPin: item.canPin, canRename: item.canRename, canManageMembers: item.canManageMembers, canClearMessages: item.canClearMessages, canViewActivity: item.canViewActivity, assignedBy: item.assignedBy, createdAt: item.createdAt };
  });
}
async function setRoomModerator(input) {
  const { db, actorName } = await requireRoomOwner(input.roomId, input.deviceId);
  if (input.targetDeviceId === db.rooms[input.roomId]?.ownerId) throw new Error("\u0645\u0627\u0644\u0643 \u0627\u0644\u063A\u0631\u0641\u0629 \u064A\u0645\u062A\u0644\u0643 \u062C\u0645\u064A\u0639 \u0627\u0644\u0635\u0644\u0627\u062D\u064A\u0627\u062A \u062A\u0644\u0642\u0627\u0626\u064A\u064B\u0627.");
  const member = db.participants[participantKey(input.roomId, input.targetDeviceId)];
  if (!member) throw new Error("\u0644\u0627 \u064A\u0646\u062A\u0645\u064A \u0647\u0630\u0627 \u0627\u0644\u0634\u062E\u0635 \u0625\u0644\u0649 \u0627\u0644\u063A\u0631\u0641\u0629.");
  const key = moderatorKey(input.roomId, input.targetDeviceId);
  const existing = Boolean(db.moderators[key]);
  if (input.isModerator) {
    const timestamp2 = now();
    db.moderators[key] = { id: key, roomId: input.roomId, deviceId: input.targetDeviceId, ...input.permissions, assignedBy: input.deviceId, createdAt: db.moderators[key]?.createdAt ?? timestamp2, updatedAt: timestamp2 };
  } else delete db.moderators[key];
  await recordActivity(db, { roomId: input.roomId, actorDeviceId: input.deviceId, actorName, action: input.isModerator ? existing ? "moderator_updated" : "moderator_granted" : "moderator_removed", targetDeviceId: input.targetDeviceId, targetName: member.name, details: input.isModerator ? existing ? "\u062A\u0645 \u062A\u062D\u062F\u064A\u062B \u0635\u0644\u0627\u062D\u064A\u0627\u062A \u0627\u0644\u0645\u0634\u0631\u0641" : "\u062A\u0645 \u062A\u0639\u064A\u064A\u0646 \u0645\u0634\u0631\u0641 \u062C\u062F\u064A\u062F" : "\u062A\u0645\u062A \u0625\u0632\u0627\u0644\u0629 \u0635\u0644\u0627\u062D\u064A\u0627\u062A \u0627\u0644\u0645\u0634\u0631\u0641" });
  await persist();
  return listRoomModerators({ roomId: input.roomId, deviceId: input.deviceId });
}
async function createModeratorInvitation(input) {
  const { db, actorName } = await requireRoomOwner(input.roomId, input.deviceId);
  if (input.targetDeviceId === db.rooms[input.roomId]?.ownerId) throw new Error("\u0645\u0627\u0644\u0643 \u0627\u0644\u063A\u0631\u0641\u0629 \u0644\u0627 \u064A\u062D\u062A\u0627\u062C \u0625\u0644\u0649 \u062F\u0639\u0648\u0629 \u0645\u0634\u0631\u0641.");
  const member = db.participants[participantKey(input.roomId, input.targetDeviceId)];
  if (!member) throw new Error("\u0644\u0627 \u064A\u0646\u062A\u0645\u064A \u0647\u0630\u0627 \u0627\u0644\u0634\u062E\u0635 \u0625\u0644\u0649 \u0627\u0644\u063A\u0631\u0641\u0629.");
  if (db.moderators[moderatorKey(input.roomId, input.targetDeviceId)]) throw new Error("\u0647\u0630\u0627 \u0627\u0644\u0639\u0636\u0648 \u0645\u0634\u0631\u0641 \u0628\u0627\u0644\u0641\u0639\u0644.");
  const existing = db.invites[inviteKey(input.roomId, input.targetDeviceId)];
  if (existing?.status === "pending") throw new Error("\u0644\u062F\u0649 \u0647\u0630\u0627 \u0627\u0644\u0639\u0636\u0648 \u062F\u0639\u0648\u0629 \u0645\u0634\u0631\u0641 \u0645\u0639\u0644\u0642\u0629 \u0628\u0627\u0644\u0641\u0639\u0644.");
  const timestamp2 = now();
  const invite = { id: inviteKey(input.roomId, input.targetDeviceId), roomId: input.roomId, targetDeviceId: input.targetDeviceId, targetName: member.name, targetColor: member.color, invitedBy: input.deviceId, invitedByName: actorName, permissions: input.permissions, status: "pending", createdAt: timestamp2, decidedAt: null, decidedBy: null };
  db.invites[invite.id] = invite;
  await recordActivity(db, { roomId: input.roomId, actorDeviceId: input.deviceId, actorName, action: "moderator_invited", targetDeviceId: member.deviceId, targetName: member.name, details: "\u062A\u0645 \u0625\u0631\u0633\u0627\u0644 \u062F\u0639\u0648\u0629 \u0644\u062A\u0648\u0644\u064A \u062F\u0648\u0631 \u0627\u0644\u0645\u0634\u0631\u0641", kind: "moderator_invite" });
  await persist();
  return invite;
}
async function listModeratorInvitations(input) {
  const db = await getState();
  const room = db.rooms[input.roomId];
  if (room?.ownerId !== input.deviceId && !db.participants[participantKey(input.roomId, input.deviceId)]) throw new Error("\u0644\u0627 \u062A\u0645\u0644\u0643 \u0635\u0644\u0627\u062D\u064A\u0629 \u0639\u0631\u0636 \u062F\u0639\u0648\u0627\u062A \u0627\u0644\u0645\u0634\u0631\u0641\u064A\u0646.");
  return Object.values(db.invites).filter((invite) => invite.roomId === input.roomId && (room?.ownerId === input.deviceId || invite.targetDeviceId === input.deviceId)).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}
async function respondModeratorInvitation(input) {
  const db = await getState();
  const invite = db.invites[input.inviteId];
  if (!invite || invite.roomId !== input.roomId || invite.targetDeviceId !== input.deviceId) throw new Error("\u0647\u0630\u0647 \u0627\u0644\u062F\u0639\u0648\u0629 \u063A\u064A\u0631 \u0645\u062A\u0627\u062D\u0629 \u0644\u0643.");
  if (invite.status !== "pending") throw new Error("\u062A\u0645 \u0627\u0644\u062A\u0639\u0627\u0645\u0644 \u0645\u0639 \u0647\u0630\u0647 \u0627\u0644\u062F\u0639\u0648\u0629 \u0645\u0646 \u0642\u0628\u0644.");
  const member = db.participants[participantKey(input.roomId, input.deviceId)];
  if (!member) throw new Error("\u0644\u0627 \u064A\u0646\u062A\u0645\u064A \u0647\u0630\u0627 \u0627\u0644\u0634\u062E\u0635 \u0625\u0644\u0649 \u0627\u0644\u063A\u0631\u0641\u0629.");
  const timestamp2 = now();
  invite.status = input.approve ? "approved" : "rejected";
  invite.decidedAt = timestamp2;
  invite.decidedBy = input.deviceId;
  if (input.approve) {
    const key = moderatorKey(input.roomId, input.deviceId);
    db.moderators[key] = { id: key, roomId: input.roomId, deviceId: input.deviceId, ...invite.permissions, assignedBy: invite.invitedBy, createdAt: timestamp2, updatedAt: timestamp2 };
  }
  const actorName = member.name;
  await recordActivity(db, { roomId: input.roomId, actorDeviceId: input.deviceId, actorName, action: input.approve ? "moderator_invite_approved" : "moderator_invite_rejected", targetDeviceId: input.deviceId, targetName: member.name, details: input.approve ? "\u0648\u0627\u0641\u0642 \u0627\u0644\u0639\u0636\u0648 \u0639\u0644\u0649 \u062F\u0639\u0648\u0629 \u0627\u0644\u0645\u0634\u0631\u0641" : "\u0631\u0641\u0636 \u0627\u0644\u0639\u0636\u0648 \u062F\u0639\u0648\u0629 \u0627\u0644\u0645\u0634\u0631\u0641" });
  await persist();
  return invite;
}
async function cancelModeratorInvitation(input) {
  const { db, actorName } = await requireRoomOwner(input.roomId, input.deviceId);
  const invite = db.invites[input.inviteId];
  if (!invite || invite.roomId !== input.roomId || invite.status !== "pending") throw new Error("\u0627\u0644\u062F\u0639\u0648\u0629 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F\u0629 \u0623\u0648 \u062A\u0645 \u0627\u0644\u062A\u0639\u0627\u0645\u0644 \u0645\u0639\u0647\u0627.");
  invite.status = "cancelled";
  invite.decidedAt = now();
  invite.decidedBy = input.deviceId;
  await recordActivity(db, { roomId: input.roomId, actorDeviceId: input.deviceId, actorName, action: "moderator_invite_cancelled", targetDeviceId: invite.targetDeviceId, targetName: invite.targetName, details: "\u062A\u0645 \u0625\u0644\u063A\u0627\u0621 \u062F\u0639\u0648\u0629 \u0627\u0644\u0645\u0634\u0631\u0641" });
  await persist();
  return invite;
}
async function listRoomAdminActivity(input) {
  await requireRoomCapability(input.roomId, input.deviceId, "canViewActivity");
  const db = await getState();
  return Object.values(db.activities).filter((item) => item.roomId === input.roomId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 200);
}
async function exportRoomAdminActivity(input) {
  const rows = await listRoomAdminActivity(input);
  const escape = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const header = ["\u0627\u0644\u062A\u0627\u0631\u064A\u062E", "\u0627\u0644\u0645\u0646\u0641\u0630", "\u0627\u0644\u0625\u062C\u0631\u0627\u0621", "\u0627\u0644\u0645\u0633\u062A\u0647\u062F\u0641", "\u0627\u0644\u062A\u0641\u0627\u0635\u064A\u0644"].map(escape).join(",");
  const lines = rows.map((row) => [row.createdAt.toISOString(), row.actorName, row.action, row.targetName ?? "", row.details ?? ""].map(escape).join(","));
  return { filename: `qareeb-${input.roomId}-admin-activity.csv`, mimeType: "text/csv;charset=utf-8", content: `\uFEFF${[header, ...lines].join("\n")}` };
}
async function listRoomNotifications(input) {
  const db = await getState();
  if (!db.participants[participantKey(input.roomId, input.deviceId)]) throw new Error("\u0644\u0627 \u064A\u0646\u062A\u0645\u064A \u0647\u0630\u0627 \u0627\u0644\u0634\u062E\u0635 \u0625\u0644\u0649 \u0627\u0644\u063A\u0631\u0641\u0629.");
  return Object.values(db.notifications).filter((item) => item.roomId === input.roomId && item.targetDeviceId === input.deviceId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 80);
}
async function markRoomNotificationRead(input) {
  const db = await getState();
  for (const notification of Object.values(db.notifications)) if (notification.roomId === input.roomId && notification.targetDeviceId === input.deviceId && (!input.notificationId || notification.id === input.notificationId)) notification.readAt = now();
  await persist();
  return { success: true };
}
async function addMessage(input) {
  await joinRoom({ roomId: input.roomId, deviceId: input.senderId, name: input.senderName, color: input.senderColor });
  const db = await getState();
  if (input.replyToId) {
    const target = db.messages[input.replyToId];
    if (!target || target.roomId !== input.roomId) throw new Error("\u0644\u0627 \u064A\u0645\u0643\u0646 \u0627\u0644\u0631\u062F \u0639\u0644\u0649 \u0631\u0633\u0627\u0644\u0629 \u062E\u0627\u0631\u062C \u0647\u0630\u0647 \u0627\u0644\u063A\u0631\u0641\u0629.");
  }
  const messageId = `message_${crypto.randomUUID()}`;
  db.messages[messageId] = { id: messageId, roomId: input.roomId, senderId: input.senderId, senderName: input.senderName, senderColor: input.senderColor, text: input.text, replyToId: input.replyToId ?? null, reactions: {}, attachmentName: input.attachment?.name ?? null, attachmentType: input.attachment?.type ?? null, attachmentUrl: input.attachment?.url ?? null, pinnedAt: null, pinnedBy: null, createdAt: now() };
  await persist();
  return getRoomSnapshot(input.roomId);
}
async function toggleRoomMessageReaction(input) {
  const db = await getState();
  if (!db.participants[participantKey(input.roomId, input.deviceId)]) throw new Error("\u0644\u0627 \u064A\u0646\u062A\u0645\u064A \u0647\u0630\u0627 \u0627\u0644\u0634\u062E\u0635 \u0625\u0644\u0649 \u0627\u0644\u063A\u0631\u0641\u0629.");
  const message = db.messages[input.messageId];
  if (!message || message.roomId !== input.roomId) throw new Error("\u0627\u0644\u0631\u0633\u0627\u0644\u0629 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F\u0629 \u0641\u064A \u0647\u0630\u0647 \u0627\u0644\u063A\u0631\u0641\u0629.");
  const users2 = new Set(message.reactions?.[input.emoji] ?? []);
  if (users2.has(input.deviceId)) users2.delete(input.deviceId);
  else users2.add(input.deviceId);
  message.reactions = { ...message.reactions ?? {}, [input.emoji]: Array.from(users2) };
  if (message.reactions[input.emoji].length === 0) delete message.reactions[input.emoji];
  await persist();
  return getRoomSnapshot(input.roomId);
}
async function resetRoom(input) {
  const { db, actorName } = await requireRoomCapability(input.roomId, input.deviceId, "canClearMessages");
  for (const [id, message] of Object.entries(db.messages)) if (message.roomId === input.roomId) delete db.messages[id];
  db.rooms[input.roomId].pinnedMessageId = null;
  db.rooms[input.roomId].updatedAt = now();
  await recordActivity(db, { roomId: input.roomId, actorDeviceId: input.deviceId, actorName, action: "messages_cleared", details: "\u062A\u0645 \u0645\u0633\u062D \u0633\u062C\u0644 \u0631\u0633\u0627\u0626\u0644 \u0627\u0644\u063A\u0631\u0641\u0629" });
  await persist();
  return getRoomSnapshot(input.roomId);
}
async function getDeviceProfile(deviceId) {
  const db = await getState();
  return { avatarUrl: db.profiles[deviceId]?.avatarUrl ?? null };
}
async function setDeviceAvatar(input) {
  const db = await getState();
  db.profiles[input.deviceId] = { deviceId: input.deviceId, avatarUrl: input.avatarUrl, updatedAt: now() };
  await persist();
  return { avatarUrl: input.avatarUrl };
}
function summaryForConversation(conversation, deviceId) {
  const first = conversation.participantOne === deviceId;
  return { id: conversation.id, peerId: first ? conversation.participantTwo : conversation.participantOne, peerName: first ? conversation.participantTwoName : conversation.participantOneName, peerColor: first ? conversation.participantTwoColor : conversation.participantOneColor, peerAvatarUrl: null, updatedAt: conversation.updatedAt, unreadCount: 0, isMuted: false, isBlocked: false };
}
function directMessageResult(message) {
  return { id: message.id, senderId: message.senderId, senderName: message.senderName, avatarUrl: null, text: message.text, replyToId: message.replyToId ?? null, reactions: message.reactions ?? {}, createdAt: message.createdAt, pinnedAt: null, pinnedBy: null, ...message.attachmentUrl && message.attachmentName && message.attachmentType ? { attachment: { name: message.attachmentName, type: message.attachmentType, url: message.attachmentUrl } } : {} };
}
async function memberConversation(conversationId, deviceId) {
  const db = await getState();
  const conversation = db.conversations[conversationId];
  if (!conversation || conversation.participantOne !== deviceId && conversation.participantTwo !== deviceId) throw new Error("\u0644\u0627 \u062A\u0645\u0644\u0643 \u0635\u0644\u0627\u062D\u064A\u0629 \u0627\u0644\u0648\u0635\u0648\u0644 \u0625\u0644\u0649 \u0647\u0630\u0647 \u0627\u0644\u0645\u062D\u0627\u062F\u062B\u0629 \u0627\u0644\u062E\u0627\u0635\u0629.");
  return conversation;
}
async function getPreferences(conversationId, deviceId, peerId) {
  const db = await getState();
  const item = db.preferences[preferenceIdFor(conversationId, deviceId)];
  return item?.peerId === peerId ? { isMuted: item.isMuted, isBlocked: item.isBlocked } : { isMuted: false, isBlocked: false };
}
async function unreadCount(conversationId, deviceId) {
  const db = await getState();
  const read = db.reads[readStateIdFor(conversationId, deviceId)]?.lastReadAt;
  return Object.values(db.directMessages).filter((message) => message.conversationId === conversationId && message.senderId !== deviceId && (!read || message.createdAt > read)).length;
}
async function lastReadAt(conversationId, deviceId) {
  const db = await getState();
  return db.reads[readStateIdFor(conversationId, deviceId)]?.lastReadAt ?? null;
}
async function enrichedSummary(conversation, deviceId) {
  const summary = summaryForConversation(conversation, deviceId);
  const [preferences, unread, profile] = await Promise.all([getPreferences(conversation.id, deviceId, summary.peerId), unreadCount(conversation.id, deviceId), getDeviceProfile(summary.peerId)]);
  return { ...summary, ...preferences, unreadCount: unread, peerAvatarUrl: profile.avatarUrl };
}
async function assertDirectMessageAllowed(conversationId, senderId) {
  const conversation = await memberConversation(conversationId, senderId);
  const peerId = summaryForConversation(conversation, senderId).peerId;
  const [mine, theirs] = await Promise.all([getPreferences(conversationId, senderId, peerId), getPreferences(conversationId, peerId, senderId)]);
  if (mine.isBlocked || theirs.isBlocked) throw new Error("\u062A\u0639\u0630\u0631 \u0625\u0631\u0633\u0627\u0644 \u0627\u0644\u0631\u0633\u0627\u0644\u0629 \u0644\u0623\u0646 \u0623\u062D\u062F \u0627\u0644\u0637\u0631\u0641\u064A\u0646 \u062D\u0638\u0631 \u0647\u0630\u0647 \u0627\u0644\u0645\u062D\u0627\u062F\u062B\u0629.");
  return conversation;
}
async function getDirectPeerIdForMember(conversationId, deviceId) {
  const conversation = await memberConversation(conversationId, deviceId);
  return summaryForConversation(conversation, deviceId).peerId;
}
async function startDirectConversation(input) {
  if (input.deviceId === input.peerId) throw new Error("\u0627\u062E\u062A\u0631 \u0634\u062E\u0635\u064B\u0627 \u0622\u062E\u0631 \u0644\u0628\u062F\u0621 \u0645\u062D\u0627\u062F\u062B\u0629 \u062E\u0627\u0635\u0629.");
  await joinRoom(input);
  const db = await getState();
  const peer = Object.values(db.participants).find((item) => item.roomId === input.roomId && item.deviceId === input.peerId && item.lastSeen.getTime() >= Date.now() - 9e4);
  if (!peer) throw new Error("\u0647\u0630\u0627 \u0627\u0644\u0634\u062E\u0635 \u0644\u0645 \u064A\u0639\u062F \u0645\u062A\u0635\u0644\u064B\u0627 \u0628\u0647\u0630\u0647 \u0627\u0644\u063A\u0631\u0641\u0629.");
  const id = conversationIdFor(input.deviceId, input.peerId);
  const first = input.deviceId.localeCompare(input.peerId) < 0;
  const timestamp2 = now();
  db.conversations[id] = { id, participantOne: first ? input.deviceId : peer.deviceId, participantOneName: first ? input.name : peer.name, participantOneColor: first ? input.color : peer.color, participantTwo: first ? peer.deviceId : input.deviceId, participantTwoName: first ? peer.name : input.name, participantTwoColor: first ? peer.color : input.color, createdAt: db.conversations[id]?.createdAt ?? timestamp2, updatedAt: timestamp2 };
  await persist();
  return enrichedSummary(db.conversations[id], input.deviceId);
}
async function listDirectConversations(deviceId) {
  const db = await getState();
  return Promise.all(Object.values(db.conversations).filter((item) => item.participantOne === deviceId || item.participantTwo === deviceId).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()).map((item) => enrichedSummary(item, deviceId)));
}
async function getDirectSnapshot(input) {
  const conversation = await memberConversation(input.conversationId, input.deviceId);
  const db = await getState();
  const peerId = summaryForConversation(conversation, input.deviceId).peerId;
  const messages = Object.values(db.directMessages).filter((item) => item.conversationId === input.conversationId).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()).slice(-120).map((message) => ({ ...directMessageResult(message), avatarUrl: db.profiles[message.senderId]?.avatarUrl ?? null }));
  return { conversation: await enrichedSummary(conversation, input.deviceId), messages, preferences: await getPreferences(input.conversationId, input.deviceId, peerId), peerLastReadAt: await lastReadAt(input.conversationId, peerId), updatedAt: now() };
}
async function addDirectMessage(input) {
  const conversation = await assertDirectMessageAllowed(input.conversationId, input.senderId);
  const db = await getState();
  if (input.replyToId) {
    const target = db.directMessages[input.replyToId];
    if (!target || target.conversationId !== input.conversationId) throw new Error("\u0644\u0627 \u064A\u0645\u0643\u0646 \u0627\u0644\u0631\u062F \u0639\u0644\u0649 \u0631\u0633\u0627\u0644\u0629 \u062E\u0627\u0631\u062C \u0647\u0630\u0647 \u0627\u0644\u0645\u062D\u0627\u062F\u062B\u0629.");
  }
  const id = `direct_message_${crypto.randomUUID()}`;
  db.directMessages[id] = { id, conversationId: input.conversationId, senderId: input.senderId, senderName: input.senderName, senderColor: input.senderColor, text: input.text, replyToId: input.replyToId ?? null, reactions: {}, attachmentName: input.attachment?.name ?? null, attachmentType: input.attachment?.type ?? null, attachmentUrl: input.attachment?.url ?? null, createdAt: now() };
  conversation.updatedAt = now();
  await persist();
  return getDirectSnapshot({ conversationId: input.conversationId, deviceId: input.senderId });
}
async function toggleDirectMessageReaction(input) {
  const db = await getState();
  await memberConversation(input.conversationId, input.deviceId);
  const message = db.directMessages[input.messageId];
  if (!message || message.conversationId !== input.conversationId) throw new Error("\u0627\u0644\u0631\u0633\u0627\u0644\u0629 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F\u0629 \u0641\u064A \u0647\u0630\u0647 \u0627\u0644\u0645\u062D\u0627\u062F\u062B\u0629.");
  const users2 = new Set(message.reactions?.[input.emoji] ?? []);
  if (users2.has(input.deviceId)) users2.delete(input.deviceId);
  else users2.add(input.deviceId);
  message.reactions = { ...message.reactions ?? {}, [input.emoji]: Array.from(users2) };
  if (message.reactions[input.emoji].length === 0) delete message.reactions[input.emoji];
  await persist();
  return getDirectSnapshot({ conversationId: input.conversationId, deviceId: input.deviceId });
}
async function setDirectConversationPreferences(input) {
  const conversation = await memberConversation(input.conversationId, input.deviceId);
  const peerId = summaryForConversation(conversation, input.deviceId).peerId;
  const db = await getState();
  const id = preferenceIdFor(input.conversationId, input.deviceId);
  db.preferences[id] = { id, conversationId: input.conversationId, deviceId: input.deviceId, peerId, isMuted: input.isMuted, isBlocked: input.isBlocked, updatedAt: now() };
  await persist();
  return { isMuted: input.isMuted, isBlocked: input.isBlocked };
}
async function markDirectConversationRead(input) {
  await memberConversation(input.conversationId, input.deviceId);
  const db = await getState();
  const timestamp2 = now();
  const id = readStateIdFor(input.conversationId, input.deviceId);
  db.reads[id] = { id, conversationId: input.conversationId, deviceId: input.deviceId, lastReadAt: timestamp2, updatedAt: timestamp2 };
  await persist();
  return { success: true };
}
async function startDirectCall(input) {
  const conversation = await memberConversation(input.conversationId, input.deviceId);
  const peerId = summaryForConversation(conversation, input.deviceId).peerId;
  const db = await getState();
  const id = `call_${crypto.randomUUID()}`;
  const startedAt = now();
  db.calls[id] = { id, conversationId: input.conversationId, callerId: input.deviceId, recipientId: peerId, callType: input.callType, status: "ringing", startedAt, answeredAt: null, endedAt: null };
  await persist();
  return { id, conversationId: input.conversationId, callType: input.callType, status: "ringing", startedAt };
}
async function updateDirectCall(input) {
  await memberConversation(input.conversationId, input.deviceId);
  const db = await getState();
  const call = db.calls[input.callId];
  if (!call || call.conversationId !== input.conversationId || call.callerId !== input.deviceId && call.recipientId !== input.deviceId) throw new Error("\u0644\u0627 \u062A\u0645\u0644\u0643 \u0635\u0644\u0627\u062D\u064A\u0629 \u062A\u0639\u062F\u064A\u0644 \u0633\u062C\u0644 \u0647\u0630\u0647 \u0627\u0644\u0645\u0643\u0627\u0644\u0645\u0629.");
  if (input.status === "accepted" && call.status !== "ringing") return { success: true };
  const timestamp2 = now();
  call.status = input.status;
  if (input.status === "accepted") call.answeredAt = timestamp2;
  if (["missed", "rejected", "ended", "failed"].includes(input.status)) call.endedAt = timestamp2;
  await persist();
  return { success: true };
}
async function listDirectCallLogs(input) {
  const conversation = await memberConversation(input.conversationId, input.deviceId);
  const peer = summaryForConversation(conversation, input.deviceId);
  const db = await getState();
  return Object.values(db.calls).filter((call) => call.conversationId === input.conversationId).sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime()).slice(0, 60).map((call) => ({ id: call.id, conversationId: call.conversationId, peerName: peer.peerName, peerColor: peer.peerColor, direction: call.callerId === input.deviceId ? "outgoing" : "incoming", callType: call.callType, status: call.status, startedAt: call.startedAt, answeredAt: call.answeredAt, endedAt: call.endedAt }));
}
async function deleteDirectCall(input) {
  await memberConversation(input.conversationId, input.deviceId);
  const db = await getState();
  const call = db.calls[input.callId];
  if (call && call.conversationId === input.conversationId && (call.callerId === input.deviceId || call.recipientId === input.deviceId)) delete db.calls[input.callId];
  await persist();
  return { success: true };
}
async function clearDirectCallLogs(input) {
  await memberConversation(input.conversationId, input.deviceId);
  const db = await getState();
  for (const [id, call] of Object.entries(db.calls)) if (call.conversationId === input.conversationId) delete db.calls[id];
  await persist();
  return { success: true };
}
async function listRoomFiles(roomId) {
  const db = await getState();
  return Object.values(db.messages).filter((item) => item.roomId === roomId && item.attachmentUrl && item.attachmentName && item.attachmentType).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).map((item) => ({ id: item.id, senderId: item.senderId, senderName: item.senderName, name: item.attachmentName, type: item.attachmentType, url: item.attachmentUrl, createdAt: item.createdAt }));
}
async function listDirectFiles(input) {
  await memberConversation(input.conversationId, input.deviceId);
  const db = await getState();
  return Object.values(db.directMessages).filter((item) => item.conversationId === input.conversationId && item.attachmentUrl && item.attachmentName && item.attachmentType).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).map((item) => ({ id: item.id, senderId: item.senderId, senderName: item.senderName, name: item.attachmentName, type: item.attachmentType, url: item.attachmentUrl, createdAt: item.createdAt }));
}
async function upsertUser(user) {
  const db = await getState();
  if (!user.openId) throw new Error("User openId is required for upsert");
  const existing = db.users[user.openId];
  const timestamp2 = now();
  db.users[user.openId] = { ...existing, ...user, createdAt: existing?.createdAt ?? timestamp2, updatedAt: timestamp2, lastSignedIn: timestamp2 };
  await persist();
}
async function getUserByOpenId(openId) {
  const db = await getState();
  return db.users[openId];
}

// server/mysqlDb.ts
import { and, count, desc, eq, gt, gte, inArray, isNotNull, isNull, ne, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { createHash as createHash2 } from "node:crypto";

// drizzle/schema.ts
import { boolean, int, mysqlEnum, mysqlTable, text, timestamp, unique, varchar } from "drizzle-orm/mysql-core";
var users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  username: varchar("username", { length: 32 }),
  avatarUrl: varchar("avatarUrl", { length: 512 }),
  bio: text("bio"),
  availability: mysqlEnum("availability", ["available", "busy", "away"]).default("available").notNull(),
  language: mysqlEnum("language", ["ar", "en"]).default("ar").notNull(),
  privacyMode: mysqlEnum("privacyMode", ["everyone", "contacts", "nobody"]).default("everyone").notNull(),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull()
}, (table) => ({
  usernameUnique: unique("users_username_unique").on(table.username)
}));
var chatRooms = mysqlTable("chatRooms", {
  id: varchar("id", { length: 16 }).primaryKey(),
  name: varchar("name", { length: 80 }).notNull().default("\u063A\u0631\u0641\u0629 \u0642\u0631\u064A\u0628"),
  ownerId: varchar("ownerId", { length: 96 }),
  pinnedMessageId: varchar("pinnedMessageId", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  retentionDays: int("retentionDays").default(0).notNull()
});
var deviceProfiles = mysqlTable("deviceProfiles", {
  deviceId: varchar("deviceId", { length: 96 }).primaryKey(),
  avatarUrl: varchar("avatarUrl", { length: 512 }),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
});
var chatParticipants = mysqlTable("chatParticipants", {
  id: varchar("id", { length: 120 }).primaryKey(),
  roomId: varchar("roomId", { length: 16 }).notNull(),
  deviceId: varchar("deviceId", { length: 96 }).notNull(),
  name: varchar("name", { length: 40 }).notNull(),
  color: varchar("color", { length: 7 }).notNull(),
  lastSeen: timestamp("lastSeen").defaultNow().notNull()
});
var roomMemberBans = mysqlTable("roomMemberBans", {
  id: varchar("id", { length: 120 }).primaryKey(),
  roomId: varchar("roomId", { length: 16 }).notNull(),
  deviceId: varchar("deviceId", { length: 96 }).notNull(),
  bannedBy: varchar("bannedBy", { length: 96 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull()
});
var roomModerators = mysqlTable("roomModerators", {
  id: varchar("id", { length: 120 }).primaryKey(),
  roomId: varchar("roomId", { length: 16 }).notNull(),
  deviceId: varchar("deviceId", { length: 96 }).notNull(),
  canPin: boolean("canPin").default(false).notNull(),
  canRename: boolean("canRename").default(false).notNull(),
  canManageMembers: boolean("canManageMembers").default(false).notNull(),
  canClearMessages: boolean("canClearMessages").default(false).notNull(),
  canViewActivity: boolean("canViewActivity").default(true).notNull(),
  assignedBy: varchar("assignedBy", { length: 96 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
});
var roomAdminActivity = mysqlTable("roomAdminActivity", {
  id: varchar("id", { length: 64 }).primaryKey(),
  roomId: varchar("roomId", { length: 16 }).notNull(),
  actorDeviceId: varchar("actorDeviceId", { length: 96 }).notNull(),
  actorName: varchar("actorName", { length: 40 }).notNull(),
  action: mysqlEnum("action", ["moderator_granted", "moderator_updated", "moderator_removed", "moderator_invited", "moderator_invite_approved", "moderator_invite_declined", "moderator_invite_cancelled", "room_renamed", "member_removed", "member_restored", "message_pinned", "message_unpinned", "messages_cleared"]).notNull(),
  targetDeviceId: varchar("targetDeviceId", { length: 96 }),
  targetName: varchar("targetName", { length: 40 }),
  details: varchar("details", { length: 180 }),
  createdAt: timestamp("createdAt").defaultNow().notNull()
});
var roomModeratorInvitations = mysqlTable("roomModeratorInvitations", {
  id: varchar("id", { length: 160 }).primaryKey(),
  roomId: varchar("roomId", { length: 16 }).notNull(),
  targetDeviceId: varchar("targetDeviceId", { length: 96 }).notNull(),
  targetName: varchar("targetName", { length: 40 }).notNull(),
  targetColor: varchar("targetColor", { length: 7 }).notNull(),
  invitedBy: varchar("invitedBy", { length: 96 }).notNull(),
  invitedByName: varchar("invitedByName", { length: 40 }).notNull(),
  canPin: boolean("canPin").default(false).notNull(),
  canRename: boolean("canRename").default(false).notNull(),
  canManageMembers: boolean("canManageMembers").default(false).notNull(),
  canClearMessages: boolean("canClearMessages").default(false).notNull(),
  canViewActivity: boolean("canViewActivity").default(true).notNull(),
  status: mysqlEnum("status", ["pending", "approved", "declined", "cancelled"]).default("pending").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  decidedAt: timestamp("decidedAt"),
  decidedBy: varchar("decidedBy", { length: 96 })
});
var roomNotifications = mysqlTable("roomNotifications", {
  id: varchar("id", { length: 64 }).primaryKey(),
  roomId: varchar("roomId", { length: 16 }).notNull(),
  targetDeviceId: varchar("targetDeviceId", { length: 96 }).notNull(),
  activityId: varchar("activityId", { length: 64 }).notNull(),
  kind: varchar("kind", { length: 64 }).notNull(),
  title: varchar("title", { length: 120 }).notNull(),
  body: varchar("body", { length: 240 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  readAt: timestamp("readAt")
});
var chatMessages = mysqlTable("chatMessages", {
  id: varchar("id", { length: 64 }).primaryKey(),
  roomId: varchar("roomId", { length: 16 }).notNull(),
  senderId: varchar("senderId", { length: 96 }).notNull(),
  senderName: varchar("senderName", { length: 40 }).notNull(),
  senderColor: varchar("senderColor", { length: 7 }).notNull(),
  text: text("text").notNull(),
  replyToId: varchar("replyToId", { length: 64 }),
  reactions: text("reactions"),
  editedAt: timestamp("editedAt"),
  editedBy: varchar("editedBy", { length: 96 }),
  deletedAt: timestamp("deletedAt"),
  deletedBy: varchar("deletedBy", { length: 96 }),
  attachmentName: varchar("attachmentName", { length: 120 }),
  attachmentType: varchar("attachmentType", { length: 100 }),
  attachmentUrl: varchar("attachmentUrl", { length: 512 }),
  pinnedAt: timestamp("pinnedAt"),
  pinnedBy: varchar("pinnedBy", { length: 96 }),
  createdAt: timestamp("createdAt").defaultNow().notNull()
});
var directConversations = mysqlTable("directConversations", {
  id: varchar("id", { length: 64 }).primaryKey(),
  participantOne: varchar("participantOne", { length: 96 }).notNull(),
  participantOneName: varchar("participantOneName", { length: 40 }).notNull(),
  participantOneColor: varchar("participantOneColor", { length: 7 }).notNull(),
  participantTwo: varchar("participantTwo", { length: 96 }).notNull(),
  participantTwoName: varchar("participantTwoName", { length: 40 }).notNull(),
  participantTwoColor: varchar("participantTwoColor", { length: 7 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
});
var directMessages = mysqlTable("directMessages", {
  id: varchar("id", { length: 64 }).primaryKey(),
  conversationId: varchar("conversationId", { length: 64 }).notNull(),
  senderId: varchar("senderId", { length: 96 }).notNull(),
  senderName: varchar("senderName", { length: 40 }).notNull(),
  senderColor: varchar("senderColor", { length: 7 }).notNull(),
  text: text("text").notNull(),
  replyToId: varchar("replyToId", { length: 64 }),
  reactions: text("reactions"),
  attachmentName: varchar("attachmentName", { length: 120 }),
  attachmentType: varchar("attachmentType", { length: 100 }),
  attachmentUrl: varchar("attachmentUrl", { length: 512 }),
  editedAt: timestamp("editedAt"),
  editedBy: varchar("editedBy", { length: 96 }),
  deletedAt: timestamp("deletedAt"),
  deletedBy: varchar("deletedBy", { length: 96 }),
  createdAt: timestamp("createdAt").defaultNow().notNull()
});
var directConversationPreferences = mysqlTable("directConversationPreferences", {
  id: varchar("id", { length: 64 }).primaryKey(),
  conversationId: varchar("conversationId", { length: 64 }).notNull(),
  deviceId: varchar("deviceId", { length: 96 }).notNull(),
  peerId: varchar("peerId", { length: 96 }).notNull(),
  isMuted: boolean("isMuted").default(false).notNull(),
  isBlocked: boolean("isBlocked").default(false).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
});
var directReadStates = mysqlTable("directReadStates", {
  id: varchar("id", { length: 64 }).primaryKey(),
  conversationId: varchar("conversationId", { length: 64 }).notNull(),
  deviceId: varchar("deviceId", { length: 96 }).notNull(),
  lastReadAt: timestamp("lastReadAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
});
var directCallLogs = mysqlTable("directCallLogs", {
  id: varchar("id", { length: 64 }).primaryKey(),
  conversationId: varchar("conversationId", { length: 64 }).notNull(),
  callerId: varchar("callerId", { length: 96 }).notNull(),
  recipientId: varchar("recipientId", { length: 96 }).notNull(),
  callType: mysqlEnum("callType", ["audio", "video"]).notNull(),
  status: mysqlEnum("status", ["ringing", "accepted", "missed", "rejected", "ended", "failed"]).default("ringing").notNull(),
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  answeredAt: timestamp("answeredAt"),
  endedAt: timestamp("endedAt")
});
var userDevices = mysqlTable("userDevices", {
  id: varchar("id", { length: 96 }).primaryKey(),
  userId: varchar("userId", { length: 96 }).notNull(),
  label: varchar("label", { length: 120 }).notNull(),
  userAgent: varchar("userAgent", { length: 255 }),
  lastSeenAt: timestamp("lastSeenAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  revokedAt: timestamp("revokedAt")
});
var userPreferences = mysqlTable("userPreferences", {
  id: varchar("id", { length: 96 }).primaryKey(),
  userId: varchar("userId", { length: 96 }).notNull(),
  theme: mysqlEnum("theme", ["light", "dark", "system"]).default("system").notNull(),
  readingBackground: mysqlEnum("readingBackground", ["soft", "paper", "night"]).default("soft").notNull(),
  fontScale: int("fontScale").default(100).notNull(),
  compactMode: boolean("compactMode").default(false).notNull(),
  ringtoneEnabled: boolean("ringtoneEnabled").default(true).notNull(),
  notificationsEnabled: boolean("notificationsEnabled").default(true).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
}, (table) => ({
  userUnique: unique("user_preferences_user_unique").on(table.userId)
}));
var userNotifications = mysqlTable("userNotifications", {
  id: varchar("id", { length: 96 }).primaryKey(),
  recipientId: varchar("recipientId", { length: 96 }).notNull(),
  kind: varchar("kind", { length: 48 }).notNull(),
  title: varchar("title", { length: 120 }).notNull(),
  body: varchar("body", { length: 240 }).notNull(),
  roomId: varchar("roomId", { length: 16 }),
  conversationId: varchar("conversationId", { length: 64 }),
  messageId: varchar("messageId", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  readAt: timestamp("readAt")
});
var messageReceipts = mysqlTable("messageReceipts", {
  id: varchar("id", { length: 120 }).primaryKey(),
  messageId: varchar("messageId", { length: 64 }).notNull(),
  scopeType: mysqlEnum("scopeType", ["room", "direct"]).notNull(),
  readerId: varchar("readerId", { length: 96 }).notNull(),
  status: mysqlEnum("status", ["sent", "delivered", "read"]).default("delivered").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
}, (table) => ({
  messageReaderUnique: unique("message_receipts_reader_unique").on(table.messageId, table.scopeType, table.readerId)
}));
var messagePins = mysqlTable("messagePins", {
  id: varchar("id", { length: 120 }).primaryKey(),
  scopeType: mysqlEnum("scopeType", ["room", "direct"]).notNull(),
  scopeId: varchar("scopeId", { length: 64 }).notNull(),
  messageId: varchar("messageId", { length: 64 }).notNull(),
  pinnedBy: varchar("pinnedBy", { length: 96 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull()
}, (table) => ({
  messagePinUnique: unique("message_pins_scope_message_unique").on(table.scopeType, table.scopeId, table.messageId)
}));
var userReports = mysqlTable("userReports", {
  id: varchar("id", { length: 96 }).primaryKey(),
  reporterId: varchar("reporterId", { length: 96 }).notNull(),
  targetUserId: varchar("targetUserId", { length: 96 }).notNull(),
  roomId: varchar("roomId", { length: 16 }),
  conversationId: varchar("conversationId", { length: 64 }),
  messageId: varchar("messageId", { length: 64 }),
  reason: varchar("reason", { length: 64 }).notNull(),
  details: text("details"),
  status: mysqlEnum("status", ["open", "reviewed", "resolved", "dismissed"]).default("open").notNull(),
  reviewedBy: varchar("reviewedBy", { length: 96 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  reviewedAt: timestamp("reviewedAt")
});
var moderationActions = mysqlTable("moderationActions", {
  id: varchar("id", { length: 96 }).primaryKey(),
  reportId: varchar("reportId", { length: 96 }),
  actorId: varchar("actorId", { length: 96 }).notNull(),
  targetUserId: varchar("targetUserId", { length: 96 }).notNull(),
  action: mysqlEnum("action", ["warn", "mute", "ban", "unban", "dismiss"]).notNull(),
  scopeType: mysqlEnum("scopeType", ["room", "direct", "global"]).notNull(),
  scopeId: varchar("scopeId", { length: 64 }),
  note: varchar("note", { length: 240 }),
  createdAt: timestamp("createdAt").defaultNow().notNull()
});
var abuseEvents = mysqlTable("abuseEvents", {
  id: varchar("id", { length: 96 }).primaryKey(),
  actorId: varchar("actorId", { length: 96 }).notNull(),
  action: varchar("action", { length: 48 }).notNull(),
  subjectKey: varchar("subjectKey", { length: 120 }).notNull(),
  details: varchar("details", { length: 240 }),
  createdAt: timestamp("createdAt").defaultNow().notNull()
});
var rateLimitBuckets = mysqlTable("rateLimitBuckets", {
  id: varchar("id", { length: 180 }).primaryKey(),
  subjectKey: varchar("subjectKey", { length: 120 }).notNull(),
  action: varchar("action", { length: 48 }).notNull(),
  windowStartedAt: timestamp("windowStartedAt").notNull(),
  count: int("count").default(0).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
}, (table) => ({
  bucketUnique: unique("rate_limit_bucket_unique").on(table.subjectKey, table.action, table.windowStartedAt)
}));
var backupManifests = mysqlTable("backupManifests", {
  id: varchar("id", { length: 96 }).primaryKey(),
  scopeType: mysqlEnum("scopeType", ["room", "global"]).notNull(),
  scopeId: varchar("scopeId", { length: 64 }),
  createdBy: varchar("createdBy", { length: 96 }).notNull(),
  storageKey: varchar("storageKey", { length: 512 }).notNull(),
  storageUrl: varchar("storageUrl", { length: 512 }).notNull(),
  sizeBytes: int("sizeBytes").default(0).notNull(),
  status: mysqlEnum("status", ["ready", "failed", "restored"]).default("ready").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  expiresAt: timestamp("expiresAt"),
  restoredAt: timestamp("restoredAt")
});
var retentionPolicies = mysqlTable("retentionPolicies", {
  id: varchar("id", { length: 96 }).primaryKey(),
  roomId: varchar("roomId", { length: 16 }).notNull(),
  messageRetentionDays: int("messageRetentionDays").default(0).notNull(),
  fileRetentionDays: int("fileRetentionDays").default(0).notNull(),
  adminActivityRetentionDays: int("adminActivityRetentionDays").default(365).notNull(),
  updatedBy: varchar("updatedBy", { length: 96 }).notNull(),
  scheduleCronTaskUid: varchar("scheduleCronTaskUid", { length: 65 }),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
}, (table) => ({
  roomUnique: unique("retention_policies_room_unique").on(table.roomId)
}));
var uploadSessions = mysqlTable("uploadSessions", {
  id: varchar("id", { length: 120 }).primaryKey(),
  ownerId: varchar("ownerId", { length: 96 }).notNull(),
  scopeType: mysqlEnum("scopeType", ["room", "direct", "avatar"]).notNull(),
  scopeId: varchar("scopeId", { length: 64 }).notNull(),
  fileName: varchar("fileName", { length: 120 }).notNull(),
  mimeType: varchar("mimeType", { length: 100 }).notNull(),
  totalBytes: int("totalBytes").default(0).notNull(),
  receivedBytes: int("receivedBytes").default(0).notNull(),
  storageKey: varchar("storageKey", { length: 512 }),
  status: mysqlEnum("status", ["pending", "uploading", "complete", "aborted"]).default("pending").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  completedAt: timestamp("completedAt")
});
var uploadChunks = mysqlTable("uploadChunks", {
  id: varchar("id", { length: 140 }).primaryKey(),
  sessionId: varchar("sessionId", { length: 120 }).notNull(),
  chunkIndex: int("chunkIndex").notNull(),
  byteLength: int("byteLength").notNull(),
  storageKey: varchar("storageKey", { length: 512 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull()
}, (table) => ({
  sessionChunkUnique: unique("upload_chunks_session_chunk_unique").on(table.sessionId, table.chunkIndex)
}));
var roomAnalyticsDaily = mysqlTable("roomAnalyticsDaily", {
  id: varchar("id", { length: 96 }).primaryKey(),
  roomId: varchar("roomId", { length: 16 }).notNull(),
  day: varchar("day", { length: 10 }).notNull(),
  activeMembers: int("activeMembers").default(0).notNull(),
  messageCount: int("messageCount").default(0).notNull(),
  fileCount: int("fileCount").default(0).notNull(),
  callCount: int("callCount").default(0).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
}, (table) => ({
  roomDayUnique: unique("room_analytics_day_unique").on(table.roomId, table.day)
}));

// server/_core/env.ts
var ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? ""
};

// server/mysqlDb.ts
var _db = null;
async function getDb() {
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
function parseReactions(value) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter(([, users2]) => Array.isArray(users2) && users2.every((user) => typeof user === "string")));
  } catch {
    return {};
  }
}
function serializeReactions(value) {
  return JSON.stringify(value);
}
function participantKey2(roomId, deviceId) {
  return `${roomId}:${deviceId}`;
}
async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("\u0642\u0627\u0639\u062F\u0629 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A \u063A\u064A\u0631 \u0645\u062A\u0627\u062D\u0629 \u062D\u0627\u0644\u064A\u064B\u0627.");
  return db;
}
var noRoomPermissions2 = { canPin: false, canRename: false, canManageMembers: false, canClearMessages: false, canViewActivity: false };
var ownerRoomPermissions2 = { canPin: true, canRename: true, canManageMembers: true, canClearMessages: true, canViewActivity: true };
function moderatorKey2(roomId, deviceId) {
  return `mod:${roomId}:${deviceId}`;
}
async function ensureRoom2(roomId) {
  const db = await requireDb();
  const timestamp2 = /* @__PURE__ */ new Date();
  await db.insert(chatRooms).values({
    id: roomId,
    name: "\u063A\u0631\u0641\u0629 \u0642\u0631\u064A\u0628",
    ownerId: null,
    pinnedMessageId: null,
    createdAt: timestamp2,
    updatedAt: timestamp2
  }).onDuplicateKeyUpdate({ set: { updatedAt: timestamp2 } });
}
async function isRoomMemberBanned(roomId, deviceId) {
  const db = await requireDb();
  const rows = await db.select({ id: roomMemberBans.id }).from(roomMemberBans).where(and(
    eq(roomMemberBans.roomId, roomId),
    eq(roomMemberBans.deviceId, deviceId)
  )).limit(1);
  return Boolean(rows[0]);
}
async function joinRoom2(input) {
  const db = await requireDb();
  await ensureRoom2(input.roomId);
  if (await isRoomMemberBanned(input.roomId, input.deviceId)) throw new Error("\u0644\u0642\u062F \u0623\u0632\u0627\u0644\u0643 \u0645\u0627\u0644\u0643 \u0627\u0644\u063A\u0631\u0641\u0629 \u0645\u0646 \u0647\u0630\u0647 \u0627\u0644\u0645\u0633\u0627\u062D\u0629.");
  await db.update(chatRooms).set({ ownerId: input.deviceId }).where(and(
    eq(chatRooms.id, input.roomId),
    isNull(chatRooms.ownerId)
  ));
  await db.insert(chatParticipants).values({
    id: participantKey2(input.roomId, input.deviceId),
    roomId: input.roomId,
    deviceId: input.deviceId,
    name: input.name,
    color: input.color,
    lastSeen: /* @__PURE__ */ new Date()
  }).onDuplicateKeyUpdate({ set: { name: input.name, color: input.color, lastSeen: /* @__PURE__ */ new Date() } });
  return getRoomSnapshot2(input.roomId);
}
async function getRoomSnapshot2(roomId) {
  const db = await requireDb();
  await ensureRoom2(roomId);
  const activeAfter = new Date(Date.now() - 9e4);
  const [roomRows, participants, messages, bans] = await Promise.all([
    db.select().from(chatRooms).where(eq(chatRooms.id, roomId)).limit(1),
    db.select({ id: chatParticipants.deviceId, name: chatParticipants.name, color: chatParticipants.color, lastSeen: chatParticipants.lastSeen }).from(chatParticipants).where(eq(chatParticipants.roomId, roomId)).orderBy(desc(chatParticipants.lastSeen)).limit(80),
    db.select().from(chatMessages).where(eq(chatMessages.roomId, roomId)).orderBy(desc(chatMessages.createdAt)).limit(120),
    db.select({ deviceId: roomMemberBans.deviceId }).from(roomMemberBans).where(eq(roomMemberBans.roomId, roomId))
  ]);
  const room = roomRows[0];
  const bannedIds = new Set(bans.map((ban) => ban.deviceId));
  const pinnedRows = room?.pinnedMessageId ? await db.select().from(chatMessages).where(and(
    eq(chatMessages.id, room.pinnedMessageId),
    eq(chatMessages.roomId, roomId)
  )).limit(1) : [];
  const profileIds = Array.from(/* @__PURE__ */ new Set([...participants.map((person) => person.id), ...messages.map((message) => message.senderId), ...pinnedRows.map((message) => message.senderId)]));
  const profileRows = profileIds.length ? await db.select({ deviceId: deviceProfiles.deviceId, avatarUrl: deviceProfiles.avatarUrl }).from(deviceProfiles).where(inArray(deviceProfiles.deviceId, profileIds)) : [];
  const avatars = new Map(profileRows.map((profile) => [profile.deviceId, profile.avatarUrl]));
  const messageForSnapshot = (message) => ({
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
    ...message.attachmentUrl && message.attachmentName && message.attachmentType ? { attachment: { name: message.attachmentName, type: message.attachmentType, url: message.attachmentUrl } } : {}
  });
  return {
    roomId,
    roomName: room?.name ?? "\u063A\u0631\u0641\u0629 \u0642\u0631\u064A\u0628",
    ownerId: room?.ownerId ?? null,
    participants: participants.map((person) => ({ ...person, avatarUrl: avatars.get(person.id) ?? null, isOnline: !bannedIds.has(person.id) && person.lastSeen >= activeAfter, isBanned: bannedIds.has(person.id) })),
    messages: messages.reverse().map(messageForSnapshot),
    pinnedMessage: pinnedRows[0] ? messageForSnapshot(pinnedRows[0]) : null,
    updatedAt: /* @__PURE__ */ new Date()
  };
}
async function getRoomActorPermissions2(input) {
  const db = await requireDb();
  const roomRows = await db.select({ ownerId: chatRooms.ownerId }).from(chatRooms).where(eq(chatRooms.id, input.roomId)).limit(1);
  if (roomRows[0]?.ownerId === input.deviceId) return { role: "owner", ...ownerRoomPermissions2 };
  const rows = await db.select({
    canPin: roomModerators.canPin,
    canRename: roomModerators.canRename,
    canManageMembers: roomModerators.canManageMembers,
    canClearMessages: roomModerators.canClearMessages,
    canViewActivity: roomModerators.canViewActivity
  }).from(roomModerators).where(and(eq(roomModerators.roomId, input.roomId), eq(roomModerators.deviceId, input.deviceId))).limit(1);
  return rows[0] ? { role: "moderator", ...rows[0] } : { role: "member", ...noRoomPermissions2 };
}
async function requireRoomCapability2(roomId, deviceId, capability) {
  const permissions = await getRoomActorPermissions2({ roomId, deviceId });
  if (!permissions[capability]) throw new Error("\u0644\u0627 \u062A\u0645\u0644\u0643 \u0627\u0644\u0635\u0644\u0627\u062D\u064A\u0629 \u0627\u0644\u0644\u0627\u0632\u0645\u0629 \u0644\u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u063A\u0631\u0641\u0629.");
  const db = await requireDb();
  const actor = await db.select({ name: chatParticipants.name }).from(chatParticipants).where(and(
    eq(chatParticipants.roomId, roomId),
    eq(chatParticipants.deviceId, deviceId)
  )).limit(1);
  return { db, permissions, actorName: actor[0]?.name ?? "\u0645\u0634\u0631\u0641" };
}
async function requireRoomOwner2(roomId, deviceId) {
  const permissions = await getRoomActorPermissions2({ roomId, deviceId });
  if (permissions.role !== "owner") throw new Error("\u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u0645\u0634\u0631\u0641\u064A\u0646 \u0645\u062A\u0627\u062D\u0629 \u0644\u0645\u0627\u0644\u0643 \u0627\u0644\u063A\u0631\u0641\u0629 \u0641\u0642\u0637.");
  const db = await requireDb();
  const actor = await db.select({ name: chatParticipants.name }).from(chatParticipants).where(and(
    eq(chatParticipants.roomId, roomId),
    eq(chatParticipants.deviceId, deviceId)
  )).limit(1);
  return { db, actorName: actor[0]?.name ?? "\u0645\u0627\u0644\u0643 \u0627\u0644\u063A\u0631\u0641\u0629" };
}
async function recordRoomAdminActivity(db, input) {
  const activityId = `activity_${crypto.randomUUID()}`;
  await db.insert(roomAdminActivity).values({ id: activityId, roomId: input.roomId, actorDeviceId: input.actorDeviceId, actorName: input.actorName, action: input.action, targetDeviceId: input.targetDeviceId, targetName: input.targetName, details: input.details });
  const members = await db.select({ deviceId: chatParticipants.deviceId }).from(chatParticipants).where(eq(chatParticipants.roomId, input.roomId));
  for (const member of members) {
    if (member.deviceId === input.actorDeviceId) continue;
    await db.insert(roomNotifications).values({ id: `notification_${crypto.randomUUID()}`, roomId: input.roomId, targetDeviceId: member.deviceId, activityId, kind: input.kind ?? "admin_action", title: "\u0625\u062C\u0631\u0627\u0621 \u0625\u062F\u0627\u0631\u064A \u0641\u064A \u0627\u0644\u063A\u0631\u0641\u0629", body: input.details ?? input.action });
  }
  return activityId;
}
async function setRoomPin2(input) {
  const { db, actorName } = await requireRoomCapability2(input.roomId, input.deviceId, "canPin");
  const roomRows = await db.select({ pinnedMessageId: chatRooms.pinnedMessageId }).from(chatRooms).where(eq(chatRooms.id, input.roomId)).limit(1);
  if (input.messageId) {
    const messages = await db.select({ id: chatMessages.id }).from(chatMessages).where(and(
      eq(chatMessages.id, input.messageId),
      eq(chatMessages.roomId, input.roomId)
    )).limit(1);
    if (!messages[0]) throw new Error("\u0644\u0627 \u062A\u0646\u062A\u0645\u064A \u0627\u0644\u0631\u0633\u0627\u0644\u0629 \u0627\u0644\u0645\u062D\u062F\u062F\u0629 \u0625\u0644\u0649 \u0647\u0630\u0647 \u0627\u0644\u063A\u0631\u0641\u0629.");
  }
  const previousMessageId = roomRows[0]?.pinnedMessageId;
  if (previousMessageId && previousMessageId !== input.messageId) {
    await db.update(chatMessages).set({ pinnedAt: null, pinnedBy: null }).where(and(
      eq(chatMessages.id, previousMessageId),
      eq(chatMessages.roomId, input.roomId)
    ));
  }
  if (input.messageId) {
    await db.update(chatMessages).set({ pinnedAt: /* @__PURE__ */ new Date(), pinnedBy: input.deviceId }).where(and(
      eq(chatMessages.id, input.messageId),
      eq(chatMessages.roomId, input.roomId)
    ));
  }
  await db.update(chatRooms).set({ pinnedMessageId: input.messageId, updatedAt: /* @__PURE__ */ new Date() }).where(eq(chatRooms.id, input.roomId));
  await recordRoomAdminActivity(db, {
    roomId: input.roomId,
    actorDeviceId: input.deviceId,
    actorName,
    action: input.messageId ? "message_pinned" : "message_unpinned",
    details: input.messageId ? "\u062A\u0645 \u062A\u062B\u0628\u064A\u062A \u0645\u062D\u062A\u0648\u0649 \u0641\u064A \u0627\u0644\u063A\u0631\u0641\u0629" : "\u062A\u0645 \u0625\u0644\u063A\u0627\u0621 \u062A\u062B\u0628\u064A\u062A \u0627\u0644\u0645\u062D\u062A\u0648\u0649"
  });
  return getRoomSnapshot2(input.roomId);
}
async function updateRoomName2(input) {
  const { db, actorName } = await requireRoomCapability2(input.roomId, input.deviceId, "canRename");
  await db.update(chatRooms).set({ name: input.name, updatedAt: /* @__PURE__ */ new Date() }).where(eq(chatRooms.id, input.roomId));
  await recordRoomAdminActivity(db, { roomId: input.roomId, actorDeviceId: input.deviceId, actorName, action: "room_renamed", details: `\u062A\u0645 \u062A\u063A\u064A\u064A\u0631 \u0627\u0633\u0645 \u0627\u0644\u063A\u0631\u0641\u0629 \u0625\u0644\u0649 ${input.name}` });
  return getRoomSnapshot2(input.roomId);
}
async function setRoomMemberBan2(input) {
  const { db, actorName } = await requireRoomCapability2(input.roomId, input.deviceId, "canManageMembers");
  const roomRows = await db.select({ ownerId: chatRooms.ownerId }).from(chatRooms).where(eq(chatRooms.id, input.roomId)).limit(1);
  if (input.targetDeviceId === roomRows[0]?.ownerId) throw new Error("\u0644\u0627 \u064A\u0645\u0643\u0646\u0643 \u0625\u0632\u0627\u0644\u0629 \u0645\u0627\u0644\u0643 \u0627\u0644\u063A\u0631\u0641\u0629.");
  const members = await db.select({ id: chatParticipants.id, name: chatParticipants.name }).from(chatParticipants).where(and(
    eq(chatParticipants.roomId, input.roomId),
    eq(chatParticipants.deviceId, input.targetDeviceId)
  )).limit(1);
  if (!members[0]) throw new Error("\u0644\u0627 \u064A\u0646\u062A\u0645\u064A \u0647\u0630\u0627 \u0627\u0644\u0634\u062E\u0635 \u0625\u0644\u0649 \u0627\u0644\u063A\u0631\u0641\u0629.");
  if (input.isBanned) {
    await db.insert(roomMemberBans).values({
      id: participantKey2(input.roomId, input.targetDeviceId),
      roomId: input.roomId,
      deviceId: input.targetDeviceId,
      bannedBy: input.deviceId
    }).onDuplicateKeyUpdate({ set: { bannedBy: input.deviceId } });
  } else {
    await db.delete(roomMemberBans).where(and(
      eq(roomMemberBans.roomId, input.roomId),
      eq(roomMemberBans.deviceId, input.targetDeviceId)
    ));
  }
  await recordRoomAdminActivity(db, {
    roomId: input.roomId,
    actorDeviceId: input.deviceId,
    actorName,
    action: input.isBanned ? "member_removed" : "member_restored",
    targetDeviceId: input.targetDeviceId,
    targetName: members[0].name,
    details: input.isBanned ? "\u062A\u0645\u062A \u0625\u0632\u0627\u0644\u0629 \u0627\u0644\u0639\u0636\u0648 \u0645\u0646 \u0627\u0644\u063A\u0631\u0641\u0629" : "\u062A\u0645\u062A \u0625\u0639\u0627\u062F\u0629 \u0627\u0644\u0639\u0636\u0648 \u0625\u0644\u0649 \u0627\u0644\u063A\u0631\u0641\u0629"
  });
  return getRoomSnapshot2(input.roomId);
}
async function listRoomModerators2(input) {
  const { db } = await requireRoomOwner2(input.roomId, input.deviceId);
  const [moderators, members] = await Promise.all([
    db.select().from(roomModerators).where(eq(roomModerators.roomId, input.roomId)).orderBy(desc(roomModerators.updatedAt)),
    db.select({ deviceId: chatParticipants.deviceId, name: chatParticipants.name, color: chatParticipants.color }).from(chatParticipants).where(eq(chatParticipants.roomId, input.roomId))
  ]);
  const memberById = new Map(members.map((member) => [member.deviceId, member]));
  return moderators.map((moderator) => ({
    deviceId: moderator.deviceId,
    name: memberById.get(moderator.deviceId)?.name ?? "\u0645\u0634\u0631\u0641",
    color: memberById.get(moderator.deviceId)?.color ?? "#6382a3",
    canPin: moderator.canPin,
    canRename: moderator.canRename,
    canManageMembers: moderator.canManageMembers,
    canClearMessages: moderator.canClearMessages,
    canViewActivity: moderator.canViewActivity,
    assignedBy: moderator.assignedBy,
    createdAt: moderator.createdAt
  }));
}
async function setRoomModerator2(input) {
  const { db, actorName } = await requireRoomOwner2(input.roomId, input.deviceId);
  const roomRows = await db.select({ ownerId: chatRooms.ownerId }).from(chatRooms).where(eq(chatRooms.id, input.roomId)).limit(1);
  if (input.targetDeviceId === roomRows[0]?.ownerId) throw new Error("\u0645\u0627\u0644\u0643 \u0627\u0644\u063A\u0631\u0641\u0629 \u064A\u0645\u062A\u0644\u0643 \u062C\u0645\u064A\u0639 \u0627\u0644\u0635\u0644\u0627\u062D\u064A\u0627\u062A \u062A\u0644\u0642\u0627\u0626\u064A\u064B\u0627.");
  const members = await db.select({ id: chatParticipants.id, name: chatParticipants.name }).from(chatParticipants).where(and(
    eq(chatParticipants.roomId, input.roomId),
    eq(chatParticipants.deviceId, input.targetDeviceId)
  )).limit(1);
  if (!members[0]) throw new Error("\u0644\u0627 \u064A\u0646\u062A\u0645\u064A \u0647\u0630\u0627 \u0627\u0644\u0634\u062E\u0635 \u0625\u0644\u0649 \u0627\u0644\u063A\u0631\u0641\u0629.");
  const existing = await db.select({ id: roomModerators.id }).from(roomModerators).where(and(
    eq(roomModerators.roomId, input.roomId),
    eq(roomModerators.deviceId, input.targetDeviceId)
  )).limit(1);
  if (input.isModerator) {
    await db.insert(roomModerators).values({
      id: moderatorKey2(input.roomId, input.targetDeviceId),
      roomId: input.roomId,
      deviceId: input.targetDeviceId,
      ...input.permissions,
      assignedBy: input.deviceId
    }).onDuplicateKeyUpdate({ set: { ...input.permissions, assignedBy: input.deviceId, updatedAt: /* @__PURE__ */ new Date() } });
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
    details: input.isModerator ? existing[0] ? "\u062A\u0645 \u062A\u062D\u062F\u064A\u062B \u0635\u0644\u0627\u062D\u064A\u0627\u062A \u0627\u0644\u0645\u0634\u0631\u0641" : "\u062A\u0645 \u062A\u0639\u064A\u064A\u0646 \u0645\u0634\u0631\u0641 \u062C\u062F\u064A\u062F" : "\u062A\u0645\u062A \u0625\u0632\u0627\u0644\u0629 \u0635\u0644\u0627\u062D\u064A\u0627\u062A \u0627\u0644\u0645\u0634\u0631\u0641"
  });
  return listRoomModerators2({ roomId: input.roomId, deviceId: input.deviceId });
}
async function listRoomAdminActivity2(input) {
  const { db } = await requireRoomCapability2(input.roomId, input.deviceId, "canViewActivity");
  const rows = await db.select({
    id: roomAdminActivity.id,
    actorDeviceId: roomAdminActivity.actorDeviceId,
    actorName: roomAdminActivity.actorName,
    action: roomAdminActivity.action,
    targetDeviceId: roomAdminActivity.targetDeviceId,
    targetName: roomAdminActivity.targetName,
    details: roomAdminActivity.details,
    createdAt: roomAdminActivity.createdAt
  }).from(roomAdminActivity).where(eq(roomAdminActivity.roomId, input.roomId)).orderBy(desc(roomAdminActivity.createdAt)).limit(80);
  return rows;
}
async function addMessage2(input) {
  const db = await requireDb();
  await joinRoom2({ roomId: input.roomId, deviceId: input.senderId, name: input.senderName, color: input.senderColor });
  if (input.replyToId) {
    const target = await db.select({ id: chatMessages.id }).from(chatMessages).where(and(eq(chatMessages.id, input.replyToId), eq(chatMessages.roomId, input.roomId))).limit(1);
    if (!target[0]) throw new Error("\u0644\u0627 \u064A\u0645\u0643\u0646 \u0627\u0644\u0631\u062F \u0639\u0644\u0649 \u0631\u0633\u0627\u0644\u0629 \u062E\u0627\u0631\u062C \u0647\u0630\u0647 \u0627\u0644\u063A\u0631\u0641\u0629.");
  }
  await db.insert(chatMessages).values({
    id: `message_${crypto.randomUUID()}`,
    roomId: input.roomId,
    senderId: input.senderId,
    senderName: input.senderName,
    senderColor: input.senderColor,
    text: input.text,
    replyToId: input.replyToId ?? null,
    reactions: null,
    attachmentName: input.attachment?.name,
    attachmentType: input.attachment?.type,
    attachmentUrl: input.attachment?.url
  });
  return getRoomSnapshot2(input.roomId);
}
async function toggleRoomMessageReaction2(input) {
  const db = await requireDb();
  const member = await db.select({ id: chatParticipants.id }).from(chatParticipants).where(and(eq(chatParticipants.roomId, input.roomId), eq(chatParticipants.deviceId, input.deviceId))).limit(1);
  if (!member[0]) throw new Error("\u0644\u0627 \u064A\u0646\u062A\u0645\u064A \u0647\u0630\u0627 \u0627\u0644\u0634\u062E\u0635 \u0625\u0644\u0649 \u0627\u0644\u063A\u0631\u0641\u0629.");
  const rows = await db.select({ id: chatMessages.id, reactions: chatMessages.reactions }).from(chatMessages).where(and(eq(chatMessages.id, input.messageId), eq(chatMessages.roomId, input.roomId))).limit(1);
  if (!rows[0]) throw new Error("\u0627\u0644\u0631\u0633\u0627\u0644\u0629 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F\u0629 \u0641\u064A \u0647\u0630\u0647 \u0627\u0644\u063A\u0631\u0641\u0629.");
  const reactions = parseReactions(rows[0].reactions);
  const users2 = new Set(reactions[input.emoji] ?? []);
  if (users2.has(input.deviceId)) users2.delete(input.deviceId);
  else users2.add(input.deviceId);
  if (users2.size) reactions[input.emoji] = Array.from(users2);
  else delete reactions[input.emoji];
  await db.update(chatMessages).set({ reactions: Object.keys(reactions).length ? serializeReactions(reactions) : null }).where(eq(chatMessages.id, input.messageId));
  return getRoomSnapshot2(input.roomId);
}
async function resetRoom2(input) {
  const { db, actorName } = await requireRoomCapability2(input.roomId, input.deviceId, "canClearMessages");
  await db.delete(chatMessages).where(eq(chatMessages.roomId, input.roomId));
  await db.update(chatRooms).set({ pinnedMessageId: null, updatedAt: /* @__PURE__ */ new Date() }).where(eq(chatRooms.id, input.roomId));
  await recordRoomAdminActivity(db, { roomId: input.roomId, actorDeviceId: input.deviceId, actorName, action: "messages_cleared", details: "\u062A\u0645 \u0645\u0633\u062D \u0633\u062C\u0644 \u0631\u0633\u0627\u0626\u0644 \u0627\u0644\u063A\u0631\u0641\u0629" });
  return getRoomSnapshot2(input.roomId);
}
async function getDeviceProfile2(deviceId) {
  const db = await requireDb();
  const rows = await db.select({ avatarUrl: deviceProfiles.avatarUrl }).from(deviceProfiles).where(eq(deviceProfiles.deviceId, deviceId)).limit(1);
  return { avatarUrl: rows[0]?.avatarUrl ?? null };
}
async function setDeviceAvatar2(input) {
  const db = await requireDb();
  await db.insert(deviceProfiles).values({ deviceId: input.deviceId, avatarUrl: input.avatarUrl }).onDuplicateKeyUpdate({ set: { avatarUrl: input.avatarUrl, updatedAt: /* @__PURE__ */ new Date() } });
  return { avatarUrl: input.avatarUrl };
}
function conversationIdFor2(firstDeviceId, secondDeviceId) {
  const pair = [firstDeviceId, secondDeviceId].sort().join(":");
  return `direct_${createHash2("sha256").update(pair).digest("hex").slice(0, 48)}`;
}
function preferenceIdFor2(conversationId, deviceId) {
  return `preference_${createHash2("sha256").update(`${conversationId}:${deviceId}`).digest("hex").slice(0, 48)}`;
}
function readStateIdFor2(conversationId, deviceId) {
  return `read_${createHash2("sha256").update(`${conversationId}:${deviceId}`).digest("hex").slice(0, 56)}`;
}
function summaryForConversation2(conversation, deviceId) {
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
    isBlocked: false
  };
}
function messageResult(message) {
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
    ...message.attachmentUrl && message.attachmentName && message.attachmentType ? { attachment: { name: message.attachmentName, type: message.attachmentType, url: message.attachmentUrl } } : {}
  };
}
async function activeRoomParticipant(roomId, deviceId) {
  const db = await requireDb();
  const rows = await db.select({
    id: chatParticipants.deviceId,
    name: chatParticipants.name,
    color: chatParticipants.color
  }).from(chatParticipants).where(and(
    eq(chatParticipants.roomId, roomId),
    eq(chatParticipants.deviceId, deviceId),
    gte(chatParticipants.lastSeen, new Date(Date.now() - 9e4))
  )).limit(1);
  return rows[0];
}
async function memberConversation2(conversationId, deviceId) {
  const db = await requireDb();
  const rows = await db.select().from(directConversations).where(and(
    eq(directConversations.id, conversationId),
    or(eq(directConversations.participantOne, deviceId), eq(directConversations.participantTwo, deviceId))
  )).limit(1);
  if (!rows[0]) throw new Error("\u0644\u0627 \u062A\u0645\u0644\u0643 \u0635\u0644\u0627\u062D\u064A\u0629 \u0627\u0644\u0648\u0635\u0648\u0644 \u0625\u0644\u0649 \u0647\u0630\u0647 \u0627\u0644\u0645\u062D\u0627\u062F\u062B\u0629 \u0627\u0644\u062E\u0627\u0635\u0629.");
  return rows[0];
}
async function getConversationPreferences(conversationId, deviceId, peerId) {
  const db = await requireDb();
  const rows = await db.select({ isMuted: directConversationPreferences.isMuted, isBlocked: directConversationPreferences.isBlocked }).from(directConversationPreferences).where(and(
    eq(directConversationPreferences.id, preferenceIdFor2(conversationId, deviceId)),
    eq(directConversationPreferences.peerId, peerId)
  )).limit(1);
  return rows[0] ?? { isMuted: false, isBlocked: false };
}
async function getUnreadCount(conversationId, deviceId) {
  const db = await requireDb();
  const state2 = await db.select({ lastReadAt: directReadStates.lastReadAt }).from(directReadStates).where(eq(directReadStates.id, readStateIdFor2(conversationId, deviceId))).limit(1);
  const unseen = [
    eq(directMessages.conversationId, conversationId),
    ne(directMessages.senderId, deviceId),
    ...state2[0] ? [gt(directMessages.createdAt, state2[0].lastReadAt)] : []
  ];
  const rows = await db.select({ total: count() }).from(directMessages).where(and(...unseen));
  return Number(rows[0]?.total ?? 0);
}
async function getLastReadAt(conversationId, deviceId) {
  const db = await requireDb();
  const rows = await db.select({ lastReadAt: directReadStates.lastReadAt }).from(directReadStates).where(eq(directReadStates.id, readStateIdFor2(conversationId, deviceId))).limit(1);
  return rows[0]?.lastReadAt ?? null;
}
async function enrichedSummary2(conversation, deviceId) {
  const summary = summaryForConversation2(conversation, deviceId);
  const [preferences, unreadCount2, profile] = await Promise.all([
    getConversationPreferences(conversation.id, deviceId, summary.peerId),
    getUnreadCount(conversation.id, deviceId),
    getDeviceProfile2(summary.peerId)
  ]);
  return { ...summary, ...preferences, unreadCount: unreadCount2, peerAvatarUrl: profile.avatarUrl };
}
async function assertDirectMessageAllowed2(conversationId, senderId) {
  const conversation = await memberConversation2(conversationId, senderId);
  const recipientId = summaryForConversation2(conversation, senderId).peerId;
  const [senderPreferences, recipientPreferences] = await Promise.all([
    getConversationPreferences(conversation.id, senderId, recipientId),
    getConversationPreferences(conversation.id, recipientId, senderId)
  ]);
  if (senderPreferences.isBlocked || recipientPreferences.isBlocked) {
    throw new Error("\u062A\u0639\u0630\u0631 \u0625\u0631\u0633\u0627\u0644 \u0627\u0644\u0631\u0633\u0627\u0644\u0629 \u0644\u0623\u0646 \u0623\u062D\u062F \u0627\u0644\u0637\u0631\u0641\u064A\u0646 \u062D\u0638\u0631 \u0647\u0630\u0647 \u0627\u0644\u0645\u062D\u0627\u062F\u062B\u0629.");
  }
  return conversation;
}
async function getDirectPeerIdForMember2(conversationId, deviceId) {
  const conversation = await memberConversation2(conversationId, deviceId);
  return summaryForConversation2(conversation, deviceId).peerId;
}
async function startDirectConversation2(input) {
  if (input.deviceId === input.peerId) throw new Error("\u0627\u062E\u062A\u0631 \u0634\u062E\u0635\u064B\u0627 \u0622\u062E\u0631 \u0644\u0628\u062F\u0621 \u0645\u062D\u0627\u062F\u062B\u0629 \u062E\u0627\u0635\u0629.");
  await joinRoom2(input);
  const peer = await activeRoomParticipant(input.roomId, input.peerId);
  if (!peer) throw new Error("\u0647\u0630\u0627 \u0627\u0644\u0634\u062E\u0635 \u0644\u0645 \u064A\u0639\u062F \u0645\u062A\u0635\u0644\u064B\u0627 \u0628\u0647\u0630\u0647 \u0627\u0644\u063A\u0631\u0641\u0629.");
  const id = conversationIdFor2(input.deviceId, input.peerId);
  const firstIsCurrent = input.deviceId.localeCompare(input.peerId) < 0;
  const first = firstIsCurrent ? { id: input.deviceId, name: input.name, color: input.color } : peer;
  const second = firstIsCurrent ? peer : { id: input.deviceId, name: input.name, color: input.color };
  const db = await requireDb();
  await db.insert(directConversations).values({
    id,
    participantOne: first.id,
    participantOneName: first.name,
    participantOneColor: first.color,
    participantTwo: second.id,
    participantTwoName: second.name,
    participantTwoColor: second.color
  }).onDuplicateKeyUpdate({
    set: {
      participantOneName: first.name,
      participantOneColor: first.color,
      participantTwoName: second.name,
      participantTwoColor: second.color,
      updatedAt: /* @__PURE__ */ new Date()
    }
  });
  const conversation = await memberConversation2(id, input.deviceId);
  return enrichedSummary2(conversation, input.deviceId);
}
async function listDirectConversations2(deviceId) {
  const db = await requireDb();
  const conversations = await db.select().from(directConversations).where(or(
    eq(directConversations.participantOne, deviceId),
    eq(directConversations.participantTwo, deviceId)
  )).orderBy(desc(directConversations.updatedAt));
  return Promise.all(conversations.map((conversation) => enrichedSummary2(conversation, deviceId)));
}
async function getDirectSnapshot2(input) {
  const conversation = await memberConversation2(input.conversationId, input.deviceId);
  const db = await requireDb();
  const messages = await db.select().from(directMessages).where(eq(directMessages.conversationId, input.conversationId)).orderBy(desc(directMessages.createdAt)).limit(120);
  const profileIds = Array.from(new Set(messages.map((message) => message.senderId)));
  const profileRows = profileIds.length ? await db.select({ deviceId: deviceProfiles.deviceId, avatarUrl: deviceProfiles.avatarUrl }).from(deviceProfiles).where(inArray(deviceProfiles.deviceId, profileIds)) : [];
  const avatars = new Map(profileRows.map((profile) => [profile.deviceId, profile.avatarUrl]));
  const peerId = summaryForConversation2(conversation, input.deviceId).peerId;
  return {
    conversation: await enrichedSummary2(conversation, input.deviceId),
    messages: messages.reverse().map((message) => ({ ...messageResult(message), avatarUrl: avatars.get(message.senderId) ?? null })),
    preferences: await getConversationPreferences(conversation.id, input.deviceId, peerId),
    peerLastReadAt: await getLastReadAt(conversation.id, peerId),
    updatedAt: /* @__PURE__ */ new Date()
  };
}
async function addDirectMessage2(input) {
  const conversation = await assertDirectMessageAllowed2(input.conversationId, input.senderId);
  const db = await requireDb();
  if (input.replyToId) {
    const target = await db.select({ id: directMessages.id }).from(directMessages).where(and(
      eq(directMessages.id, input.replyToId),
      eq(directMessages.conversationId, input.conversationId)
    )).limit(1);
    if (!target[0]) throw new Error("\u0644\u0627 \u064A\u0645\u0643\u0646 \u0627\u0644\u0631\u062F \u0639\u0644\u0649 \u0631\u0633\u0627\u0644\u0629 \u062E\u0627\u0631\u062C \u0647\u0630\u0647 \u0627\u0644\u0645\u062D\u0627\u062F\u062B\u0629.");
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
    attachmentUrl: input.attachment?.url
  });
  await db.update(directConversations).set({ updatedAt: /* @__PURE__ */ new Date() }).where(eq(directConversations.id, conversation.id));
  return getDirectSnapshot2({ conversationId: input.conversationId, deviceId: input.senderId });
}
async function toggleDirectMessageReaction2(input) {
  await assertDirectMessageAllowed2(input.conversationId, input.deviceId);
  const db = await requireDb();
  const rows = await db.select({ id: directMessages.id, reactions: directMessages.reactions }).from(directMessages).where(and(
    eq(directMessages.id, input.messageId),
    eq(directMessages.conversationId, input.conversationId)
  )).limit(1);
  if (!rows[0]) throw new Error("\u0627\u0644\u0631\u0633\u0627\u0644\u0629 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F\u0629 \u0641\u064A \u0647\u0630\u0647 \u0627\u0644\u0645\u062D\u0627\u062F\u062B\u0629.");
  const reactions = parseReactions(rows[0].reactions);
  const users2 = new Set(reactions[input.emoji] ?? []);
  if (users2.has(input.deviceId)) users2.delete(input.deviceId);
  else users2.add(input.deviceId);
  if (users2.size) reactions[input.emoji] = Array.from(users2);
  else delete reactions[input.emoji];
  await db.update(directMessages).set({ reactions: Object.keys(reactions).length ? serializeReactions(reactions) : null }).where(eq(directMessages.id, input.messageId));
  return getDirectSnapshot2({ conversationId: input.conversationId, deviceId: input.deviceId });
}
async function setDirectConversationPreferences2(input) {
  const conversation = await memberConversation2(input.conversationId, input.deviceId);
  const peerId = summaryForConversation2(conversation, input.deviceId).peerId;
  const db = await requireDb();
  await db.insert(directConversationPreferences).values({
    id: preferenceIdFor2(input.conversationId, input.deviceId),
    conversationId: input.conversationId,
    deviceId: input.deviceId,
    peerId,
    isMuted: input.isMuted,
    isBlocked: input.isBlocked
  }).onDuplicateKeyUpdate({ set: { isMuted: input.isMuted, isBlocked: input.isBlocked, updatedAt: /* @__PURE__ */ new Date() } });
  return { isMuted: input.isMuted, isBlocked: input.isBlocked };
}
async function markDirectConversationRead2(input) {
  await memberConversation2(input.conversationId, input.deviceId);
  const db = await requireDb();
  const now2 = /* @__PURE__ */ new Date();
  await db.insert(directReadStates).values({
    id: readStateIdFor2(input.conversationId, input.deviceId),
    conversationId: input.conversationId,
    deviceId: input.deviceId,
    lastReadAt: now2
  }).onDuplicateKeyUpdate({ set: { lastReadAt: now2, updatedAt: now2 } });
  return { success: true };
}
async function startDirectCall2(input) {
  const conversation = await memberConversation2(input.conversationId, input.deviceId);
  const peer = summaryForConversation2(conversation, input.deviceId);
  const db = await requireDb();
  const id = `call_${crypto.randomUUID()}`;
  const startedAt = /* @__PURE__ */ new Date();
  await db.insert(directCallLogs).values({
    id,
    conversationId: conversation.id,
    callerId: input.deviceId,
    recipientId: peer.peerId,
    callType: input.callType,
    status: "ringing",
    startedAt
  });
  return { id, conversationId: conversation.id, callType: input.callType, status: "ringing", startedAt };
}
async function updateDirectCall2(input) {
  await memberConversation2(input.conversationId, input.deviceId);
  const db = await requireDb();
  const rows = await db.select().from(directCallLogs).where(and(
    eq(directCallLogs.id, input.callId),
    eq(directCallLogs.conversationId, input.conversationId),
    or(eq(directCallLogs.callerId, input.deviceId), eq(directCallLogs.recipientId, input.deviceId))
  )).limit(1);
  if (!rows[0]) throw new Error("\u0644\u0627 \u062A\u0645\u0644\u0643 \u0635\u0644\u0627\u062D\u064A\u0629 \u062A\u0639\u062F\u064A\u0644 \u0633\u062C\u0644 \u0647\u0630\u0647 \u0627\u0644\u0645\u0643\u0627\u0644\u0645\u0629.");
  if (input.status === "accepted" && rows[0].status !== "ringing") {
    return { success: true };
  }
  const now2 = /* @__PURE__ */ new Date();
  const terminal = ["missed", "rejected", "ended", "failed"].includes(input.status);
  await db.update(directCallLogs).set({
    status: input.status,
    ...input.status === "accepted" ? { answeredAt: now2 } : {},
    ...terminal ? { endedAt: now2 } : {}
  }).where(eq(directCallLogs.id, input.callId));
  return { success: true };
}
async function listDirectCallLogs2(input) {
  const conversation = await memberConversation2(input.conversationId, input.deviceId);
  const peer = summaryForConversation2(conversation, input.deviceId);
  const db = await requireDb();
  const rows = await db.select().from(directCallLogs).where(eq(directCallLogs.conversationId, input.conversationId)).orderBy(desc(directCallLogs.startedAt)).limit(60);
  return rows.map((call) => ({
    id: call.id,
    conversationId: call.conversationId,
    peerName: peer.peerName,
    peerColor: peer.peerColor,
    direction: call.callerId === input.deviceId ? "outgoing" : "incoming",
    callType: call.callType,
    status: call.status,
    startedAt: call.startedAt,
    answeredAt: call.answeredAt,
    endedAt: call.endedAt
  }));
}
async function deleteDirectCall2(input) {
  await memberConversation2(input.conversationId, input.deviceId);
  const db = await requireDb();
  await db.delete(directCallLogs).where(and(
    eq(directCallLogs.id, input.callId),
    eq(directCallLogs.conversationId, input.conversationId),
    or(eq(directCallLogs.callerId, input.deviceId), eq(directCallLogs.recipientId, input.deviceId))
  ));
  return { success: true };
}
async function clearDirectCallLogs2(input) {
  await memberConversation2(input.conversationId, input.deviceId);
  const db = await requireDb();
  await db.delete(directCallLogs).where(eq(directCallLogs.conversationId, input.conversationId));
  return { success: true };
}
async function listRoomFiles2(roomId) {
  const db = await requireDb();
  const rows = await db.select({
    id: chatMessages.id,
    senderId: chatMessages.senderId,
    senderName: chatMessages.senderName,
    name: chatMessages.attachmentName,
    type: chatMessages.attachmentType,
    url: chatMessages.attachmentUrl,
    createdAt: chatMessages.createdAt
  }).from(chatMessages).where(and(eq(chatMessages.roomId, roomId), isNotNull(chatMessages.attachmentUrl))).orderBy(desc(chatMessages.createdAt));
  return rows.flatMap((row) => row.name && row.type && row.url ? [{ ...row, name: row.name, type: row.type, url: row.url }] : []);
}
async function listDirectFiles2(input) {
  await memberConversation2(input.conversationId, input.deviceId);
  const db = await requireDb();
  const rows = await db.select({
    id: directMessages.id,
    senderId: directMessages.senderId,
    senderName: directMessages.senderName,
    name: directMessages.attachmentName,
    type: directMessages.attachmentType,
    url: directMessages.attachmentUrl,
    createdAt: directMessages.createdAt
  }).from(directMessages).where(and(
    eq(directMessages.conversationId, input.conversationId),
    isNotNull(directMessages.attachmentUrl)
  )).orderBy(desc(directMessages.createdAt));
  return rows.flatMap((row) => row.name && row.type && row.url ? [{ ...row, name: row.name, type: row.type, url: row.url }] : []);
}
async function upsertUser2(user) {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;
  const values = { openId: user.openId };
  const updateSet = {};
  const textFields = ["name", "username", "avatarUrl", "email", "loginMethod"];
  textFields.forEach((field) => {
    if (user[field] !== void 0) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  });
  if (user.lastSignedIn !== void 0) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== void 0) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }
  if (!values.lastSignedIn) values.lastSignedIn = /* @__PURE__ */ new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = /* @__PURE__ */ new Date();
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}
async function getUserByOpenId2(openId) {
  const db = await getDb();
  if (!db) return void 0;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}
function mapModeratorInvite(row) {
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
    decidedBy: row.decidedBy
  };
}
async function createModeratorInvitation2(input) {
  const { db, actorName } = await requireRoomOwner2(input.roomId, input.deviceId);
  const member = await db.select({ name: chatParticipants.name, color: chatParticipants.color }).from(chatParticipants).where(and(eq(chatParticipants.roomId, input.roomId), eq(chatParticipants.deviceId, input.targetDeviceId))).limit(1);
  if (!member[0]) throw new Error("\u0644\u0627 \u064A\u0646\u062A\u0645\u064A \u0647\u0630\u0627 \u0627\u0644\u0634\u062E\u0635 \u0625\u0644\u0649 \u0627\u0644\u063A\u0631\u0641\u0629.");
  const pending = await db.select({ id: roomModeratorInvitations.id }).from(roomModeratorInvitations).where(and(eq(roomModeratorInvitations.roomId, input.roomId), eq(roomModeratorInvitations.targetDeviceId, input.targetDeviceId), eq(roomModeratorInvitations.status, "pending"))).limit(1);
  if (pending[0]) throw new Error("\u0647\u0646\u0627\u0643 \u062F\u0639\u0648\u0629 \u0645\u0634\u0631\u0641 \u0645\u0639\u0644\u0642\u0629 \u0644\u0647\u0630\u0627 \u0627\u0644\u0639\u0636\u0648 \u0628\u0627\u0644\u0641\u0639\u0644.");
  const id = `invite:${input.roomId}:${input.targetDeviceId}:${Date.now()}`;
  await db.insert(roomModeratorInvitations).values({ id, roomId: input.roomId, targetDeviceId: input.targetDeviceId, targetName: member[0].name, targetColor: member[0].color, invitedBy: input.deviceId, invitedByName: actorName, ...input.permissions, status: "pending" });
  await recordRoomAdminActivity(db, { roomId: input.roomId, actorDeviceId: input.deviceId, actorName, action: "moderator_invited", targetDeviceId: input.targetDeviceId, targetName: member[0].name, details: "\u062A\u0645 \u0625\u0631\u0633\u0627\u0644 \u062F\u0639\u0648\u0629 \u0644\u062A\u0648\u0644\u064A \u062F\u0648\u0631 \u0627\u0644\u0645\u0634\u0631\u0641", kind: "moderator_invite" });
  const created = await db.select().from(roomModeratorInvitations).where(eq(roomModeratorInvitations.id, id)).limit(1);
  return mapModeratorInvite(created[0]);
}
async function listModeratorInvitations2(input) {
  const db = await requireDb();
  const room = await db.select({ ownerId: chatRooms.ownerId }).from(chatRooms).where(eq(chatRooms.id, input.roomId)).limit(1);
  const rows = room[0]?.ownerId === input.deviceId ? await db.select().from(roomModeratorInvitations).where(eq(roomModeratorInvitations.roomId, input.roomId)).orderBy(desc(roomModeratorInvitations.createdAt)).limit(80) : await db.select().from(roomModeratorInvitations).where(and(eq(roomModeratorInvitations.roomId, input.roomId), eq(roomModeratorInvitations.targetDeviceId, input.deviceId))).orderBy(desc(roomModeratorInvitations.createdAt)).limit(80);
  if (room[0]?.ownerId !== input.deviceId && !rows.length) {
    const member = await db.select({ id: chatParticipants.id }).from(chatParticipants).where(and(eq(chatParticipants.roomId, input.roomId), eq(chatParticipants.deviceId, input.deviceId))).limit(1);
    if (!member[0]) throw new Error("\u0644\u0627 \u062A\u0645\u0644\u0643 \u0635\u0644\u0627\u062D\u064A\u0629 \u0639\u0631\u0636 \u062F\u0639\u0648\u0627\u062A \u0627\u0644\u0645\u0634\u0631\u0641\u064A\u0646.");
  }
  return rows.map(mapModeratorInvite);
}
async function respondModeratorInvitation2(input) {
  const db = await requireDb();
  const rows = await db.select().from(roomModeratorInvitations).where(and(eq(roomModeratorInvitations.id, input.inviteId), eq(roomModeratorInvitations.roomId, input.roomId), eq(roomModeratorInvitations.targetDeviceId, input.deviceId))).limit(1);
  const invite = rows[0];
  if (!invite) throw new Error("\u0647\u0630\u0647 \u0627\u0644\u062F\u0639\u0648\u0629 \u063A\u064A\u0631 \u0645\u062A\u0627\u062D\u0629 \u0644\u0643.");
  if (invite.status !== "pending") throw new Error("\u062A\u0645 \u0627\u0644\u062A\u0639\u0627\u0645\u0644 \u0645\u0639 \u0647\u0630\u0647 \u0627\u0644\u062F\u0639\u0648\u0629 \u0645\u0646 \u0642\u0628\u0644.");
  const member = await db.select({ name: chatParticipants.name }).from(chatParticipants).where(and(eq(chatParticipants.roomId, input.roomId), eq(chatParticipants.deviceId, input.deviceId))).limit(1);
  if (!member[0]) throw new Error("\u0644\u0627 \u064A\u0646\u062A\u0645\u064A \u0647\u0630\u0627 \u0627\u0644\u0634\u062E\u0635 \u0625\u0644\u0649 \u0627\u0644\u063A\u0631\u0641\u0629.");
  const status = input.approve ? "approved" : "declined";
  await db.update(roomModeratorInvitations).set({ status, decidedAt: /* @__PURE__ */ new Date(), decidedBy: input.deviceId }).where(eq(roomModeratorInvitations.id, input.inviteId));
  if (input.approve) {
    await db.insert(roomModerators).values({ id: moderatorKey2(input.roomId, input.deviceId), roomId: input.roomId, deviceId: input.deviceId, canPin: invite.canPin, canRename: invite.canRename, canManageMembers: invite.canManageMembers, canClearMessages: invite.canClearMessages, canViewActivity: invite.canViewActivity, assignedBy: invite.invitedBy }).onDuplicateKeyUpdate({ set: { canPin: invite.canPin, canRename: invite.canRename, canManageMembers: invite.canManageMembers, canClearMessages: invite.canClearMessages, canViewActivity: invite.canViewActivity, assignedBy: invite.invitedBy, updatedAt: /* @__PURE__ */ new Date() } });
  }
  await recordRoomAdminActivity(db, { roomId: input.roomId, actorDeviceId: input.deviceId, actorName: member[0].name, action: input.approve ? "moderator_invite_approved" : "moderator_invite_declined", targetDeviceId: input.deviceId, targetName: member[0].name, details: input.approve ? "\u0648\u0627\u0641\u0642 \u0627\u0644\u0639\u0636\u0648 \u0639\u0644\u0649 \u062F\u0639\u0648\u0629 \u0627\u0644\u0645\u0634\u0631\u0641" : "\u0631\u0641\u0636 \u0627\u0644\u0639\u0636\u0648 \u062F\u0639\u0648\u0629 \u0627\u0644\u0645\u0634\u0631\u0641" });
  const updated = await db.select().from(roomModeratorInvitations).where(eq(roomModeratorInvitations.id, input.inviteId)).limit(1);
  return mapModeratorInvite(updated[0]);
}
async function cancelModeratorInvitation2(input) {
  const { db, actorName } = await requireRoomOwner2(input.roomId, input.deviceId);
  const rows = await db.select().from(roomModeratorInvitations).where(and(eq(roomModeratorInvitations.id, input.inviteId), eq(roomModeratorInvitations.roomId, input.roomId))).limit(1);
  const invite = rows[0];
  if (!invite || invite.status !== "pending") throw new Error("\u0627\u0644\u062F\u0639\u0648\u0629 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F\u0629 \u0623\u0648 \u062A\u0645 \u0627\u0644\u062A\u0639\u0627\u0645\u0644 \u0645\u0639\u0647\u0627.");
  await db.update(roomModeratorInvitations).set({ status: "cancelled", decidedAt: /* @__PURE__ */ new Date(), decidedBy: input.deviceId }).where(eq(roomModeratorInvitations.id, input.inviteId));
  await recordRoomAdminActivity(db, { roomId: input.roomId, actorDeviceId: input.deviceId, actorName, action: "moderator_invite_cancelled", targetDeviceId: invite.targetDeviceId, targetName: invite.targetName, details: "\u062A\u0645 \u0625\u0644\u063A\u0627\u0621 \u062F\u0639\u0648\u0629 \u0627\u0644\u0645\u0634\u0631\u0641" });
  const updated = await db.select().from(roomModeratorInvitations).where(eq(roomModeratorInvitations.id, input.inviteId)).limit(1);
  return mapModeratorInvite(updated[0]);
}
async function listRoomNotifications2(input) {
  const db = await requireDb();
  const member = await db.select({ id: chatParticipants.id }).from(chatParticipants).where(and(eq(chatParticipants.roomId, input.roomId), eq(chatParticipants.deviceId, input.deviceId))).limit(1);
  if (!member[0]) throw new Error("\u0644\u0627 \u064A\u0646\u062A\u0645\u064A \u0647\u0630\u0627 \u0627\u0644\u0634\u062E\u0635 \u0625\u0644\u0649 \u0627\u0644\u063A\u0631\u0641\u0629.");
  return db.select().from(roomNotifications).where(and(eq(roomNotifications.roomId, input.roomId), eq(roomNotifications.targetDeviceId, input.deviceId))).orderBy(desc(roomNotifications.createdAt)).limit(80);
}
async function markRoomNotificationRead2(input) {
  const db = await requireDb();
  await db.update(roomNotifications).set({ readAt: /* @__PURE__ */ new Date() }).where(and(eq(roomNotifications.roomId, input.roomId), eq(roomNotifications.targetDeviceId, input.deviceId), input.notificationId ? eq(roomNotifications.id, input.notificationId) : void 0));
  return { success: true };
}
async function exportRoomAdminActivity2(input) {
  const rows = await listRoomAdminActivity2(input);
  const escape = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const header = ["\u0627\u0644\u062A\u0627\u0631\u064A\u062E", "\u0627\u0644\u0645\u0646\u0641\u0630", "\u0627\u0644\u0625\u062C\u0631\u0627\u0621", "\u0627\u0644\u0645\u0633\u062A\u0647\u062F\u0641", "\u0627\u0644\u062A\u0641\u0627\u0635\u064A\u0644"].map(escape).join(",");
  const lines = rows.map((row) => [row.createdAt.toISOString(), row.actorName, row.action, row.targetName ?? "", row.details ?? ""].map(escape).join(","));
  return { filename: `qareeb-${input.roomId}-admin-activity.csv`, mimeType: "text/csv;charset=utf-8", content: `\uFEFF${[header, ...lines].join("\n")}` };
}
async function getPublicProfile(openId) {
  const db = await requireDb();
  const rows = await db.select({ openId: users.openId, username: users.username, name: users.name, avatarUrl: users.avatarUrl, bio: users.bio, availability: users.availability, language: users.language, privacyMode: users.privacyMode }).from(users).where(eq(users.openId, openId)).limit(1);
  return rows[0] ?? { openId, username: null, name: null, avatarUrl: null, bio: null, availability: "available", language: "ar", privacyMode: "everyone" };
}
async function updatePublicProfile(input) {
  const db = await requireDb();
  const username = input.username.trim().slice(0, 32);
  const name = input.name.trim().slice(0, 80);
  if (!/^[A-Za-z0-9_.\-\u0600-\u06FF]+$/.test(username)) throw new Error("\u0627\u0633\u0645 \u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645 \u064A\u062D\u062A\u0648\u064A \u0639\u0644\u0649 \u0631\u0645\u0648\u0632 \u063A\u064A\u0631 \u0645\u0633\u0645\u0648\u062D\u0629.");
  const existing = await db.select({ openId: users.openId }).from(users).where(and(eq(users.username, username), ne(users.openId, input.openId))).limit(1);
  if (existing[0]) throw new Error("\u0627\u0633\u0645 \u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645 \u0645\u0633\u062A\u062E\u062F\u0645 \u0628\u0627\u0644\u0641\u0639\u0644.");
  await db.update(users).set({ username, name: name || username, bio: input.bio?.trim().slice(0, 160) || null, availability: input.availability ?? "available", language: input.language ?? "ar", privacyMode: input.privacyMode ?? "everyone" }).where(eq(users.openId, input.openId));
  return getPublicProfile(input.openId);
}
async function updatePublicAvatar(input) {
  const db = await requireDb();
  await db.update(users).set({ avatarUrl: input.avatarUrl }).where(eq(users.openId, input.openId));
  return getPublicProfile(input.openId);
}

// server/advancedDb.ts
import { and as and2, count as count2, desc as desc2, eq as eq2, gt as gt2, gte as gte2, inArray as inArray2, isNotNull as isNotNull2, isNull as isNull2, lt, ne as ne2, or as or2, sql } from "drizzle-orm";
import { createHash as createHash3, randomUUID } from "node:crypto";

// server/storage.ts
import { mkdir as mkdir2, writeFile as writeFile2 } from "node:fs/promises";
import path2 from "node:path";
var LOCAL_STORAGE_DIR = path2.resolve(process.env.QAREEB_STORAGE_DIR || ".qareeb-data/files");
var localMode = process.env.LOCAL_MODE === "true" || !process.env.DATABASE_URL && process.env.NODE_ENV !== "production";
function getForgeConfig() {
  const forgeUrl = ENV.forgeApiUrl;
  const forgeKey = ENV.forgeApiKey;
  if (!forgeUrl || !forgeKey) throw new Error("Storage config missing: set BUILT_IN_FORGE_API_URL and BUILT_IN_FORGE_API_KEY");
  return { forgeUrl: forgeUrl.replace(/\/+$/, ""), forgeKey };
}
function normalizeKey(relKey) {
  return relKey.replace(/^\/+/, "").replace(/\.\./g, "_");
}
function appendHashSuffix(relKey) {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  return lastDot === -1 ? `${relKey}_${hash}` : `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}
async function storagePut(relKey, data, contentType = "application/octet-stream") {
  const key = appendHashSuffix(normalizeKey(relKey));
  if (localMode) {
    const filePath = path2.join(LOCAL_STORAGE_DIR, key);
    await mkdir2(path2.dirname(filePath), { recursive: true });
    await writeFile2(filePath, data);
    return { key, url: `/local-files/${key}` };
  }
  const { forgeUrl, forgeKey } = getForgeConfig();
  const presignUrl = new URL("v1/storage/presign/put", forgeUrl + "/");
  presignUrl.searchParams.set("path", key);
  const presignResp = await fetch(presignUrl, { headers: { Authorization: `Bearer ${forgeKey}` } });
  if (!presignResp.ok) throw new Error(`Storage presign failed (${presignResp.status})`);
  const { url: s3Url } = await presignResp.json();
  if (!s3Url) throw new Error("Forge returned empty presign URL");
  const blob = typeof data === "string" ? new Blob([data], { type: contentType }) : new Blob([data], { type: contentType });
  const uploadResp = await fetch(s3Url, { method: "PUT", headers: { "Content-Type": contentType }, body: blob });
  if (!uploadResp.ok) throw new Error(`Storage upload to S3 failed (${uploadResp.status})`);
  return { key, url: `/manus-storage/${key}` };
}
async function storageGetSignedUrl(relKey) {
  if (localMode) return `/local-files/${normalizeKey(relKey)}`;
  const { forgeUrl, forgeKey } = getForgeConfig();
  const getUrl = new URL("v1/storage/presign/get", forgeUrl + "/");
  getUrl.searchParams.set("path", normalizeKey(relKey));
  const resp = await fetch(getUrl, { headers: { Authorization: `Bearer ${forgeKey}` } });
  if (!resp.ok) throw new Error(`Storage signed URL failed (${resp.status})`);
  const { url } = await resp.json();
  return url;
}

// server/advancedDb.ts
async function dbOrThrow() {
  const db = await getDb();
  if (!db) throw new Error("\u0642\u0627\u0639\u062F\u0629 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A \u063A\u064A\u0631 \u0645\u062A\u0627\u062D\u0629 \u062D\u0627\u0644\u064A\u064B\u0627.");
  return db;
}
function hashId(prefix, value) {
  return `${prefix}_${createHash3("sha256").update(value).digest("hex").slice(0, 56)}`;
}
async function assertRoomMember(roomId, deviceId) {
  const db = await dbOrThrow();
  const rows = await db.select({ id: chatParticipants.id }).from(chatParticipants).where(and2(
    eq2(chatParticipants.roomId, roomId),
    eq2(chatParticipants.deviceId, deviceId)
  )).limit(1);
  if (!rows[0]) throw new Error("\u064A\u062C\u0628 \u0627\u0644\u0627\u0646\u0636\u0645\u0627\u0645 \u0625\u0644\u0649 \u0627\u0644\u063A\u0631\u0641\u0629 \u0623\u0648\u0644\u064B\u0627.");
  return db;
}
async function assertRoomCapability(roomId, actorId, capability) {
  const db = await dbOrThrow();
  const rooms = await db.select({ ownerId: chatRooms.ownerId }).from(chatRooms).where(eq2(chatRooms.id, roomId)).limit(1);
  if (rooms[0]?.ownerId === actorId) return db;
  const moderators = await db.select().from(roomModerators).where(and2(
    eq2(roomModerators.roomId, roomId),
    eq2(roomModerators.deviceId, actorId)
  )).limit(1);
  const moderator = moderators[0];
  if (!moderator || capability !== "canViewActivity" && !moderator[capability]) {
    throw new Error("\u0644\u0627 \u062A\u0645\u0644\u0643 \u0627\u0644\u0635\u0644\u0627\u062D\u064A\u0629 \u0627\u0644\u0644\u0627\u0632\u0645\u0629 \u0644\u0647\u0630\u0627 \u0627\u0644\u0625\u062C\u0631\u0627\u0621.");
  }
  return db;
}
async function assertDirectMember(conversationId, deviceId) {
  const db = await dbOrThrow();
  const rows = await db.select().from(directConversations).where(and2(
    eq2(directConversations.id, conversationId),
    or2(eq2(directConversations.participantOne, deviceId), eq2(directConversations.participantTwo, deviceId))
  )).limit(1);
  if (!rows[0]) throw new Error("\u0644\u0627 \u062A\u0645\u0644\u0643 \u0635\u0644\u0627\u062D\u064A\u0629 \u0627\u0644\u0648\u0635\u0648\u0644 \u0625\u0644\u0649 \u0647\u0630\u0647 \u0627\u0644\u0645\u062D\u0627\u062F\u062B\u0629 \u0627\u0644\u062E\u0627\u0635\u0629.");
  return db;
}
async function ensureUserDevice(input) {
  const db = await dbOrThrow();
  const now2 = /* @__PURE__ */ new Date();
  await db.insert(userDevices).values({
    id: input.deviceId,
    userId: input.userId,
    label: input.label.trim().slice(0, 120) || "Qareeb device",
    userAgent: input.userAgent?.slice(0, 255) ?? null,
    lastSeenAt: now2,
    revokedAt: null
  }).onDuplicateKeyUpdate({ set: { userId: input.userId, label: input.label.trim().slice(0, 120) || "Qareeb device", userAgent: input.userAgent?.slice(0, 255) ?? null, lastSeenAt: now2, revokedAt: null } });
  return { deviceId: input.deviceId, lastSeenAt: now2 };
}
async function isDeviceRevoked(input) {
  const db = await dbOrThrow();
  const rows = await db.select({ revokedAt: userDevices.revokedAt }).from(userDevices).where(and2(eq2(userDevices.userId, input.userId), eq2(userDevices.id, input.deviceId))).limit(1);
  return rows[0]?.revokedAt != null;
}
async function listUserDevices(userId) {
  const db = await dbOrThrow();
  return db.select().from(userDevices).where(eq2(userDevices.userId, userId)).orderBy(desc2(userDevices.lastSeenAt));
}
async function revokeUserDevice(input) {
  const db = await dbOrThrow();
  await db.update(userDevices).set({ revokedAt: /* @__PURE__ */ new Date() }).where(and2(eq2(userDevices.userId, input.userId), eq2(userDevices.id, input.deviceId)));
  return { success: true };
}
async function revokeAllUserDevices(input) {
  const db = await dbOrThrow();
  const predicates = [eq2(userDevices.userId, input.userId)];
  if (input.exceptDeviceId) predicates.push(ne2(userDevices.id, input.exceptDeviceId));
  await db.update(userDevices).set({ revokedAt: /* @__PURE__ */ new Date() }).where(and2(...predicates));
  return { success: true };
}
async function getUserPreferences(userId) {
  const db = await dbOrThrow();
  const rows = await db.select().from(userPreferences).where(eq2(userPreferences.userId, userId)).limit(1);
  return rows[0] ?? { userId, theme: "system", readingBackground: "soft", fontScale: 100, compactMode: false, ringtoneEnabled: true, notificationsEnabled: true };
}
async function updateUserPreferences(input) {
  const db = await dbOrThrow();
  const id = hashId("preferences", input.userId);
  await db.insert(userPreferences).values({ id, ...input, fontScale: Math.max(85, Math.min(125, Math.round(input.fontScale))) }).onDuplicateKeyUpdate({
    set: { theme: input.theme, readingBackground: input.readingBackground, fontScale: Math.max(85, Math.min(125, Math.round(input.fontScale))), compactMode: input.compactMode, ringtoneEnabled: input.ringtoneEnabled, notificationsEnabled: input.notificationsEnabled, updatedAt: /* @__PURE__ */ new Date() }
  });
  return getUserPreferences(input.userId);
}
async function editRoomMessage(input) {
  const db = await assertRoomMember(input.roomId, input.senderId);
  const rows = await db.select({ senderId: chatMessages.senderId }).from(chatMessages).where(and2(eq2(chatMessages.id, input.messageId), eq2(chatMessages.roomId, input.roomId))).limit(1);
  if (!rows[0]) throw new Error("\u0627\u0644\u0631\u0633\u0627\u0644\u0629 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F\u0629.");
  if (rows[0].senderId !== input.senderId) throw new Error("\u064A\u0645\u0643\u0646\u0643 \u062A\u0639\u062F\u064A\u0644 \u0631\u0633\u0627\u0626\u0644\u0643 \u0641\u0642\u0637.");
  const text2 = input.text.trim();
  if (!text2) throw new Error("\u0644\u0627 \u064A\u0645\u0643\u0646 \u0623\u0646 \u062A\u0643\u0648\u0646 \u0627\u0644\u0631\u0633\u0627\u0644\u0629 \u0641\u0627\u0631\u063A\u0629.");
  await db.update(chatMessages).set({ text: text2, editedAt: /* @__PURE__ */ new Date(), editedBy: input.senderId, deletedAt: null, deletedBy: null }).where(eq2(chatMessages.id, input.messageId));
  return { success: true, messageId: input.messageId, text: text2 };
}
async function deleteRoomMessage(input) {
  const db = await assertRoomMember(input.roomId, input.actorId);
  const rows = await db.select({ senderId: chatMessages.senderId }).from(chatMessages).where(and2(eq2(chatMessages.id, input.messageId), eq2(chatMessages.roomId, input.roomId))).limit(1);
  if (!rows[0]) throw new Error("\u0627\u0644\u0631\u0633\u0627\u0644\u0629 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F\u0629.");
  if (rows[0].senderId !== input.actorId) await assertRoomCapability(input.roomId, input.actorId, "canClearMessages");
  await db.update(chatMessages).set({ text: "", deletedAt: /* @__PURE__ */ new Date(), deletedBy: input.actorId, editedAt: null, editedBy: null }).where(eq2(chatMessages.id, input.messageId));
  return { success: true, messageId: input.messageId };
}
async function editDirectMessage(input) {
  const db = await assertDirectMember(input.conversationId, input.senderId);
  const rows = await db.select({ senderId: directMessages.senderId }).from(directMessages).where(and2(eq2(directMessages.id, input.messageId), eq2(directMessages.conversationId, input.conversationId))).limit(1);
  if (!rows[0]) throw new Error("\u0627\u0644\u0631\u0633\u0627\u0644\u0629 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F\u0629.");
  if (rows[0].senderId !== input.senderId) throw new Error("\u064A\u0645\u0643\u0646\u0643 \u062A\u0639\u062F\u064A\u0644 \u0631\u0633\u0627\u0626\u0644\u0643 \u0641\u0642\u0637.");
  const text2 = input.text.trim();
  if (!text2) throw new Error("\u0644\u0627 \u064A\u0645\u0643\u0646 \u0623\u0646 \u062A\u0643\u0648\u0646 \u0627\u0644\u0631\u0633\u0627\u0644\u0629 \u0641\u0627\u0631\u063A\u0629.");
  await db.update(directMessages).set({ text: text2, editedAt: /* @__PURE__ */ new Date(), editedBy: input.senderId, deletedAt: null, deletedBy: null }).where(eq2(directMessages.id, input.messageId));
  return { success: true, messageId: input.messageId, text: text2 };
}
async function deleteDirectMessage(input) {
  const db = await assertDirectMember(input.conversationId, input.actorId);
  const rows = await db.select({ senderId: directMessages.senderId }).from(directMessages).where(and2(eq2(directMessages.id, input.messageId), eq2(directMessages.conversationId, input.conversationId))).limit(1);
  if (!rows[0]) throw new Error("\u0627\u0644\u0631\u0633\u0627\u0644\u0629 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F\u0629.");
  if (rows[0].senderId !== input.actorId) throw new Error("\u064A\u0645\u0643\u0646\u0643 \u062D\u0630\u0641 \u0631\u0633\u0627\u0626\u0644\u0643 \u0641\u0642\u0637.");
  await db.update(directMessages).set({ text: "", deletedAt: /* @__PURE__ */ new Date(), deletedBy: input.actorId, editedAt: null, editedBy: null }).where(eq2(directMessages.id, input.messageId));
  return { success: true, messageId: input.messageId };
}
async function toggleRoomMessagePin(input) {
  const db = await assertRoomCapability(input.roomId, input.actorId, "canPin");
  const exists = await db.select({ id: messagePins.id }).from(messagePins).where(and2(eq2(messagePins.scopeType, "room"), eq2(messagePins.scopeId, input.roomId), eq2(messagePins.messageId, input.messageId))).limit(1);
  if (exists[0]) await db.delete(messagePins).where(eq2(messagePins.id, exists[0].id));
  else await db.insert(messagePins).values({ id: hashId("pin", `room:${input.roomId}:${input.messageId}`), scopeType: "room", scopeId: input.roomId, messageId: input.messageId, pinnedBy: input.actorId });
  return listMessagePins({ scopeType: "room", scopeId: input.roomId, actorId: input.actorId });
}
async function toggleDirectMessagePin(input) {
  const db = await assertDirectMember(input.conversationId, input.actorId);
  const exists = await db.select({ id: messagePins.id }).from(messagePins).where(and2(eq2(messagePins.scopeType, "direct"), eq2(messagePins.scopeId, input.conversationId), eq2(messagePins.messageId, input.messageId))).limit(1);
  if (exists[0]) await db.delete(messagePins).where(eq2(messagePins.id, exists[0].id));
  else await db.insert(messagePins).values({ id: hashId("pin", `direct:${input.conversationId}:${input.messageId}`), scopeType: "direct", scopeId: input.conversationId, messageId: input.messageId, pinnedBy: input.actorId });
  return listMessagePins({ scopeType: "direct", scopeId: input.conversationId, actorId: input.actorId });
}
async function listMessagePins(input) {
  if (input.scopeType === "room") await assertRoomMember(input.scopeId, input.actorId);
  else await assertDirectMember(input.scopeId, input.actorId);
  const db = await dbOrThrow();
  return db.select().from(messagePins).where(and2(eq2(messagePins.scopeType, input.scopeType), eq2(messagePins.scopeId, input.scopeId))).orderBy(desc2(messagePins.createdAt));
}
async function markMessageReceipt(input) {
  if (input.scopeType === "room") await assertRoomMember(input.scopeId, input.readerId);
  else await assertDirectMember(input.scopeId, input.readerId);
  const db = await dbOrThrow();
  const id = hashId("receipt", `${input.scopeType}:${input.scopeId}:${input.messageId}:${input.readerId}`);
  await db.insert(messageReceipts).values({ id, messageId: input.messageId, scopeType: input.scopeType, readerId: input.readerId, status: input.status }).onDuplicateKeyUpdate({ set: { status: input.status, updatedAt: /* @__PURE__ */ new Date() } });
  return { success: true };
}
async function listMessageReceipts(input) {
  if (input.scopeType === "room") await assertRoomMember(input.scopeId, input.readerId);
  else await assertDirectMember(input.scopeId, input.readerId);
  const db = await dbOrThrow();
  return db.select().from(messageReceipts).where(and2(eq2(messageReceipts.scopeType, input.scopeType), eq2(messageReceipts.messageId, input.messageId)));
}
async function createUserNotification(input) {
  const db = await dbOrThrow();
  const id = `notification_${randomUUID()}`;
  await db.insert(userNotifications).values({ id, recipientId: input.recipientId, kind: input.kind.slice(0, 48), title: input.title.slice(0, 120), body: input.body.slice(0, 240), roomId: input.roomId ?? null, conversationId: input.conversationId ?? null, messageId: input.messageId ?? null });
  return { id };
}
async function notifyMentionedUsers(input) {
  const usernames = Array.from(new Set(Array.from(input.text.matchAll(/@([a-zA-Z0-9_]{3,32})/g), (match) => match[1])));
  if (!usernames.length) return { notified: 0 };
  const db = await dbOrThrow();
  const targets = await db.select({ openId: users.openId, username: users.username }).from(users).where(inArray2(users.username, usernames));
  for (const target of targets) {
    if (target.openId === input.actorId) continue;
    await createUserNotification({ recipientId: target.openId, kind: "mention", title: "\u062A\u0645 \u0630\u0643\u0631\u0643 \u0641\u064A \u0631\u0633\u0627\u0644\u0629", body: "\u0642\u0627\u0645 \u0623\u062D\u062F \u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645\u064A\u0646 \u0628\u0630\u0643\u0631\u0643 \u0641\u064A \u0645\u062D\u0627\u062F\u062B\u0629.", roomId: input.roomId, conversationId: input.conversationId, messageId: input.messageId });
  }
  return { notified: targets.filter((target) => target.openId !== input.actorId).length };
}
async function listUserNotifications(input) {
  const db = await dbOrThrow();
  const where = input.unreadOnly ? and2(eq2(userNotifications.recipientId, input.recipientId), isNull2(userNotifications.readAt)) : eq2(userNotifications.recipientId, input.recipientId);
  return db.select().from(userNotifications).where(where).orderBy(desc2(userNotifications.createdAt)).limit(100);
}
async function markUserNotificationRead(input) {
  const db = await dbOrThrow();
  const where = input.notificationId ? and2(eq2(userNotifications.recipientId, input.recipientId), eq2(userNotifications.id, input.notificationId)) : eq2(userNotifications.recipientId, input.recipientId);
  await db.update(userNotifications).set({ readAt: /* @__PURE__ */ new Date() }).where(where);
  return { success: true };
}
async function createUserReport(input) {
  if (input.reporterId === input.targetUserId) throw new Error("\u0644\u0627 \u064A\u0645\u0643\u0646\u0643 \u0627\u0644\u0625\u0628\u0644\u0627\u063A \u0639\u0646 \u0646\u0641\u0633\u0643.");
  const db = await dbOrThrow();
  const id = `report_${randomUUID()}`;
  await db.insert(userReports).values({ id, reporterId: input.reporterId, targetUserId: input.targetUserId, reason: input.reason.slice(0, 64), details: input.details?.slice(0, 2e3) ?? null, roomId: input.roomId ?? null, conversationId: input.conversationId ?? null, messageId: input.messageId ?? null });
  return { id, status: "open" };
}
async function listUserReports(input) {
  const db = await dbOrThrow();
  return db.select().from(userReports).where(input.status ? eq2(userReports.status, input.status) : void 0).orderBy(desc2(userReports.createdAt)).limit(200);
}
async function resolveUserReport(input) {
  const db = await dbOrThrow();
  const reports = await db.select().from(userReports).where(eq2(userReports.id, input.reportId)).limit(1);
  const report = reports[0];
  if (!report) throw new Error("\u0628\u0644\u0627\u063A \u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F.");
  await db.update(userReports).set({ status: input.status, reviewedBy: input.reviewerId, reviewedAt: /* @__PURE__ */ new Date() }).where(eq2(userReports.id, input.reportId));
  if (input.action === "ban" && report.roomId) {
    await db.insert(roomMemberBans).values({ id: hashId("ban", `${report.roomId}:${report.targetUserId}`), roomId: report.roomId, deviceId: report.targetUserId, bannedBy: input.reviewerId }).onDuplicateKeyUpdate({ set: { bannedBy: input.reviewerId, createdAt: /* @__PURE__ */ new Date() } });
  }
  if (input.action === "unban" && report.roomId) {
    await db.delete(roomMemberBans).where(and2(eq2(roomMemberBans.roomId, report.roomId), eq2(roomMemberBans.deviceId, report.targetUserId)));
  }
  if (input.action) await db.insert(moderationActions).values({ id: `moderation_${randomUUID()}`, reportId: input.reportId, actorId: input.reviewerId, targetUserId: report.targetUserId, action: input.action, scopeType: report.roomId ? "room" : report.conversationId ? "direct" : "global", scopeId: report.roomId ?? report.conversationId ?? null, note: input.note?.slice(0, 240) ?? null });
  return { success: true };
}
async function consumeRateLimit(input) {
  const db = await dbOrThrow();
  const windowStartedAt = new Date(Math.floor(Date.now() / input.windowMs) * input.windowMs);
  const id = hashId("rate", `${input.subjectKey}:${input.action}:${windowStartedAt.toISOString()}`);
  await db.insert(rateLimitBuckets).values({ id, subjectKey: input.subjectKey.slice(0, 120), action: input.action.slice(0, 48), windowStartedAt, count: 1 }).onDuplicateKeyUpdate({ set: { count: sql`${rateLimitBuckets.count} + 1`, updatedAt: /* @__PURE__ */ new Date() } });
  const rows = await db.select({ count: rateLimitBuckets.count }).from(rateLimitBuckets).where(eq2(rateLimitBuckets.id, id)).limit(1);
  const current = Number(rows[0]?.count ?? 0);
  if (current > input.limit) {
    const actorId = input.subjectKey.split(":")[0]?.slice(0, 96) || input.subjectKey.slice(0, 96);
    await db.insert(abuseEvents).values({ id: hashId("abuse", `${input.subjectKey}:${input.action}:${Date.now()}`), actorId, action: `rate_limit_${input.action}`.slice(0, 48), subjectKey: input.subjectKey.slice(0, 120), details: `limit=${input.limit}` });
    throw new Error("\u062A\u0645 \u0627\u0644\u0648\u0635\u0648\u0644 \u0625\u0644\u0649 \u062D\u062F \u0627\u0644\u0627\u0633\u062A\u062E\u062F\u0627\u0645 \u0627\u0644\u0645\u0624\u0642\u062A. \u062D\u0627\u0648\u0644 \u0645\u0631\u0629 \u0623\u062E\u0631\u0649 \u0628\u0639\u062F \u0642\u0644\u064A\u0644.");
  }
  return { allowed: true, remaining: Math.max(0, input.limit - current), resetAt: new Date(windowStartedAt.getTime() + input.windowMs) };
}
async function getRetentionPolicy(roomId) {
  const db = await dbOrThrow();
  const rows = await db.select().from(retentionPolicies).where(eq2(retentionPolicies.roomId, roomId)).limit(1);
  return rows[0] ?? { roomId, messageRetentionDays: 0, fileRetentionDays: 0, adminActivityRetentionDays: 365, scheduleCronTaskUid: null };
}
async function saveRetentionPolicy(input) {
  await assertRoomCapability(input.roomId, input.updatedBy, "canManageMembers");
  const db = await dbOrThrow();
  const id = hashId("retention", input.roomId);
  const values = { id, roomId: input.roomId, updatedBy: input.updatedBy, messageRetentionDays: Math.max(0, Math.min(3650, Math.round(input.messageRetentionDays))), fileRetentionDays: Math.max(0, Math.min(3650, Math.round(input.fileRetentionDays))), adminActivityRetentionDays: Math.max(30, Math.min(3650, Math.round(input.adminActivityRetentionDays))), scheduleCronTaskUid: input.scheduleCronTaskUid ?? null };
  await db.insert(retentionPolicies).values(values).onDuplicateKeyUpdate({ set: { ...values, updatedAt: /* @__PURE__ */ new Date() } });
  return getRetentionPolicy(input.roomId);
}
async function runRetentionCleanup(input) {
  const db = await dbOrThrow();
  const where = input.scheduleCronTaskUid ? eq2(retentionPolicies.scheduleCronTaskUid, input.scheduleCronTaskUid) : input.roomId ? eq2(retentionPolicies.roomId, input.roomId) : void 0;
  const policies = await db.select().from(retentionPolicies).where(where);
  let messagesDeleted = 0;
  let activityDeleted = 0;
  for (const policy of policies) {
    if (policy.messageRetentionDays > 0) {
      const cutoff = new Date(Date.now() - policy.messageRetentionDays * 864e5);
      const result = await db.delete(chatMessages).where(and2(eq2(chatMessages.roomId, policy.roomId), lt(chatMessages.createdAt, cutoff)));
      messagesDeleted += Number(result[0]?.affectedRows ?? 0);
    }
    if (policy.adminActivityRetentionDays > 0) {
      const cutoff = new Date(Date.now() - policy.adminActivityRetentionDays * 864e5);
      const result = await db.delete(roomAdminActivity).where(and2(eq2(roomAdminActivity.roomId, policy.roomId), lt(roomAdminActivity.createdAt, cutoff)));
      activityDeleted += Number(result[0]?.affectedRows ?? 0);
    }
  }
  return { messagesDeleted, activityDeleted };
}
async function getGlobalAnalytics() {
  const db = await dbOrThrow();
  const [rooms, members, messages, direct, files, reports] = await Promise.all([
    db.select({ total: count2() }).from(chatRooms),
    db.select({ total: count2() }).from(users),
    db.select({ total: count2() }).from(chatMessages),
    db.select({ total: count2() }).from(directMessages),
    db.select({ total: count2() }).from(chatMessages).where(isNotNull2(chatMessages.attachmentUrl)),
    db.select({ total: count2() }).from(userReports).where(eq2(userReports.status, "open"))
  ]);
  return { roomCount: Number(rooms[0]?.total ?? 0), userCount: Number(members[0]?.total ?? 0), messageCount: Number(messages[0]?.total ?? 0) + Number(direct[0]?.total ?? 0), fileCount: Number(files[0]?.total ?? 0), openReportCount: Number(reports[0]?.total ?? 0) };
}
async function getRoomAnalytics(roomId, actorId) {
  await assertRoomCapability(roomId, actorId, "canViewActivity");
  const db = await dbOrThrow();
  const [members, messages, files, calls, daily] = await Promise.all([
    db.select({ total: count2() }).from(chatParticipants).where(and2(eq2(chatParticipants.roomId, roomId), gte2(chatParticipants.lastSeen, new Date(Date.now() - 864e5)))),
    db.select({ total: count2() }).from(chatMessages).where(eq2(chatMessages.roomId, roomId)),
    db.select({ total: count2() }).from(chatMessages).where(and2(eq2(chatMessages.roomId, roomId), isNotNull2(chatMessages.attachmentUrl))),
    db.select({ total: count2() }).from(roomNotifications).where(eq2(roomNotifications.roomId, roomId)),
    db.select().from(roomAnalyticsDaily).where(eq2(roomAnalyticsDaily.roomId, roomId)).orderBy(desc2(roomAnalyticsDaily.day)).limit(30)
  ]);
  return { activeMembers: Number(members[0]?.total ?? 0), messageCount: Number(messages[0]?.total ?? 0), fileCount: Number(files[0]?.total ?? 0), activityCount: Number(calls[0]?.total ?? 0), daily };
}
async function rejectRecentDuplicateMessage(input) {
  const normalized = input.text.trim().replace(/\s+/g, " ").toLocaleLowerCase();
  if (normalized.length < 8) return { allowed: true };
  const db = input.scopeType === "room" ? await assertRoomMember(input.scopeId, input.actorId) : await assertDirectMember(input.scopeId, input.actorId);
  const since = new Date(Date.now() - 3e4);
  const rows = input.scopeType === "room" ? await db.select({ id: chatMessages.id, text: chatMessages.text }).from(chatMessages).where(and2(eq2(chatMessages.roomId, input.scopeId), eq2(chatMessages.senderId, input.actorId), gt2(chatMessages.createdAt, since))).limit(8) : await db.select({ id: directMessages.id, text: directMessages.text }).from(directMessages).where(and2(eq2(directMessages.conversationId, input.scopeId), eq2(directMessages.senderId, input.actorId), gt2(directMessages.createdAt, since))).limit(8);
  if (!rows.some((row) => row.text.trim().replace(/\s+/g, " ").toLocaleLowerCase() === normalized)) return { allowed: true };
  await db.insert(abuseEvents).values({ id: `abuse_${randomUUID()}`, actorId: input.actorId, action: "spam_duplicate_message", subjectKey: `${input.scopeType}:${input.scopeId}`, details: "duplicate message within 30 seconds" });
  throw new Error("\u062A\u0645 \u0631\u0641\u0636 \u0627\u0644\u0631\u0633\u0627\u0644\u0629 \u0627\u0644\u0645\u0643\u0631\u0631\u0629 \u0644\u062D\u0645\u0627\u064A\u0629 \u0627\u0644\u0645\u062D\u0627\u062F\u062B\u0629 \u0645\u0646 \u0627\u0644\u0625\u063A\u0631\u0627\u0642.");
}
async function createUploadSession(input) {
  const db = await dbOrThrow();
  const id = `upload_${randomUUID()}`;
  await db.insert(uploadSessions).values({ id, ownerId: input.ownerId, scopeType: input.scopeType, scopeId: input.scopeId, fileName: input.fileName.slice(0, 120), mimeType: input.mimeType.slice(0, 100), totalBytes: Math.max(0, input.totalBytes), receivedBytes: 0, status: "pending" });
  return db.select().from(uploadSessions).where(eq2(uploadSessions.id, id)).limit(1);
}
async function updateUploadSession(input) {
  const db = await dbOrThrow();
  const rows = await db.select().from(uploadSessions).where(and2(eq2(uploadSessions.id, input.id), eq2(uploadSessions.ownerId, input.ownerId))).limit(1);
  if (!rows[0]) throw new Error("\u062C\u0644\u0633\u0629 \u0627\u0644\u0631\u0641\u0639 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F\u0629.");
  await db.update(uploadSessions).set({ receivedBytes: Math.max(0, input.receivedBytes), storageKey: input.storageKey ?? rows[0].storageKey, status: input.status, completedAt: input.status === "complete" ? /* @__PURE__ */ new Date() : null, updatedAt: /* @__PURE__ */ new Date() }).where(eq2(uploadSessions.id, input.id));
  return db.select().from(uploadSessions).where(eq2(uploadSessions.id, input.id)).limit(1);
}
async function appendUploadChunk(input) {
  const db = await dbOrThrow();
  const sessions = await db.select().from(uploadSessions).where(and2(eq2(uploadSessions.id, input.id), eq2(uploadSessions.ownerId, input.ownerId))).limit(1);
  const session = sessions[0];
  if (!session || session.status === "aborted" || session.status === "complete") throw new Error("\u062C\u0644\u0633\u0629 \u0627\u0644\u0631\u0641\u0639 \u063A\u064A\u0631 \u0645\u062A\u0627\u062D\u0629 \u0644\u0644\u0627\u0633\u062A\u0643\u0645\u0627\u0644.");
  if (!Number.isInteger(input.chunkIndex) || input.chunkIndex < 0) throw new Error("\u0631\u0642\u0645 \u0627\u0644\u062C\u0632\u0621 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D.");
  const existing = await db.select().from(uploadChunks).where(and2(eq2(uploadChunks.sessionId, input.id), eq2(uploadChunks.chunkIndex, input.chunkIndex))).limit(1);
  if (existing[0]) return { session, chunk: existing[0], resumed: true };
  const match = /^data:[^;]+;base64,(.+)$/.exec(input.dataUrl);
  if (!match) throw new Error("\u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u062C\u0632\u0621 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D\u0629.");
  const bytes = Buffer.from(match[1], "base64");
  if (!bytes.length || bytes.length > 15e5) throw new Error("\u062D\u062C\u0645 \u0627\u0644\u062C\u0632\u0621 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D.");
  const stored = await storagePut(`qareeb/uploads/${input.id}/${input.chunkIndex}.part`, bytes, session.mimeType || "application/octet-stream");
  const chunk = { id: `upload_chunk_${randomUUID()}`, sessionId: input.id, chunkIndex: input.chunkIndex, byteLength: bytes.length, storageKey: stored.key };
  await db.insert(uploadChunks).values(chunk);
  const all = await db.select({ byteLength: uploadChunks.byteLength }).from(uploadChunks).where(eq2(uploadChunks.sessionId, input.id));
  const receivedBytes = all.reduce((sum, row) => sum + row.byteLength, 0);
  await db.update(uploadSessions).set({ receivedBytes, status: "uploading", updatedAt: /* @__PURE__ */ new Date() }).where(eq2(uploadSessions.id, input.id));
  const updated = await db.select().from(uploadSessions).where(eq2(uploadSessions.id, input.id)).limit(1);
  return { session: updated[0], chunk, resumed: false };
}
async function finalizeUploadSession(input) {
  const db = await dbOrThrow();
  const sessions = await db.select().from(uploadSessions).where(and2(eq2(uploadSessions.id, input.id), eq2(uploadSessions.ownerId, input.ownerId))).limit(1);
  const session = sessions[0];
  if (!session) throw new Error("\u062C\u0644\u0633\u0629 \u0627\u0644\u0631\u0641\u0639 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F\u0629.");
  if (session.status === "complete" && session.storageKey) return session;
  const chunks = await db.select().from(uploadChunks).where(eq2(uploadChunks.sessionId, input.id)).orderBy(uploadChunks.chunkIndex);
  const expected = chunks.length ? chunks[chunks.length - 1].chunkIndex + 1 : 0;
  if (!chunks.length || chunks.length !== expected || chunks.some((chunk, index) => chunk.chunkIndex !== index)) throw new Error("\u0644\u0645 \u062A\u0643\u062A\u0645\u0644 \u0643\u0644 \u0623\u062C\u0632\u0627\u0621 \u0627\u0644\u0631\u0641\u0639 \u0628\u0639\u062F.");
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  if (total !== session.totalBytes) throw new Error("\u062D\u062C\u0645 \u0627\u0644\u0645\u0644\u0641 \u0644\u0627 \u064A\u0637\u0627\u0628\u0642 \u0627\u0644\u0623\u062C\u0632\u0627\u0621 \u0627\u0644\u0645\u0633\u062A\u0644\u0645\u0629.");
  const parts = [];
  for (const chunk of chunks) {
    const signedUrl = await storageGetSignedUrl(chunk.storageKey);
    const response = await fetch(signedUrl);
    if (!response.ok) throw new Error("\u062A\u0639\u0630\u0631 \u0642\u0631\u0627\u0621\u0629 \u062C\u0632\u0621 \u0645\u0631\u0641\u0648\u0639.");
    parts.push(Buffer.from(await response.arrayBuffer()));
  }
  const stored = await storagePut(`qareeb/${session.scopeType}/${session.scopeId}/${session.fileName}`, Buffer.concat(parts), session.mimeType || "application/octet-stream");
  await db.update(uploadSessions).set({ receivedBytes: total, storageKey: stored.key, status: "complete", completedAt: /* @__PURE__ */ new Date(), updatedAt: /* @__PURE__ */ new Date() }).where(eq2(uploadSessions.id, input.id));
  const updated = await db.select().from(uploadSessions).where(eq2(uploadSessions.id, input.id)).limit(1);
  return updated[0];
}
async function recordBackupManifest(input) {
  const db = await dbOrThrow();
  const id = `backup_${randomUUID()}`;
  await db.insert(backupManifests).values({ id, scopeType: input.scopeType, scopeId: input.scopeId ?? null, createdBy: input.createdBy, storageKey: input.storageKey, storageUrl: input.storageUrl, sizeBytes: Math.max(0, input.sizeBytes), expiresAt: input.expiresAt ?? null });
  return db.select().from(backupManifests).where(eq2(backupManifests.id, id)).limit(1);
}
async function listBackupManifests(input) {
  const db = await dbOrThrow();
  const where = input.scopeId ? and2(eq2(backupManifests.createdBy, input.createdBy), eq2(backupManifests.scopeId, input.scopeId)) : eq2(backupManifests.createdBy, input.createdBy);
  return db.select().from(backupManifests).where(where).orderBy(desc2(backupManifests.createdAt)).limit(100);
}
async function getRoomBackupData(roomId, actorId) {
  await assertRoomCapability(roomId, actorId, "canViewActivity");
  const db = await dbOrThrow();
  const [room, participants, messages, bans, moderators, invitations, activity, notifications] = await Promise.all([
    db.select().from(chatRooms).where(eq2(chatRooms.id, roomId)).limit(1),
    db.select().from(chatParticipants).where(eq2(chatParticipants.roomId, roomId)),
    db.select().from(chatMessages).where(eq2(chatMessages.roomId, roomId)),
    db.select().from(roomMemberBans).where(eq2(roomMemberBans.roomId, roomId)),
    db.select().from(roomModerators).where(eq2(roomModerators.roomId, roomId)),
    db.select().from(roomModeratorInvitations).where(eq2(roomModeratorInvitations.roomId, roomId)),
    db.select().from(roomAdminActivity).where(eq2(roomAdminActivity.roomId, roomId)),
    db.select().from(roomNotifications).where(eq2(roomNotifications.roomId, roomId))
  ]);
  return { version: 1, exportedAt: (/* @__PURE__ */ new Date()).toISOString(), room: room[0] ?? null, participants, messages, bans, moderators, invitations, activity, notifications };
}
function backupDate(value) {
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? /* @__PURE__ */ new Date() : date;
}
async function restoreRoomBackup(input) {
  const db = await assertRoomCapability(input.roomId, input.actorId, "canManageMembers");
  if (!input.payload || typeof input.payload !== "object") throw new Error("\u0645\u0644\u0641 \u0627\u0644\u0646\u0633\u062E\u0629 \u0627\u0644\u0627\u062D\u062A\u064A\u0627\u0637\u064A\u0629 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D.");
  const data = input.payload;
  const room = data.room;
  if (!room || String(room.id) !== input.roomId) throw new Error("\u0627\u0644\u0646\u0633\u062E\u0629 \u0627\u0644\u0627\u062D\u062A\u064A\u0627\u0637\u064A\u0629 \u0644\u0627 \u062A\u062E\u0635 \u0647\u0630\u0647 \u0627\u0644\u063A\u0631\u0641\u0629.");
  await db.insert(chatRooms).values({ id: input.roomId, name: String(room.name ?? "\u063A\u0631\u0641\u0629 \u0642\u0631\u064A\u0628").slice(0, 80), ownerId: room.ownerId ? String(room.ownerId) : null, pinnedMessageId: room.pinnedMessageId ? String(room.pinnedMessageId) : null, retentionDays: Number(room.retentionDays ?? 0), createdAt: backupDate(room.createdAt), updatedAt: /* @__PURE__ */ new Date() }).onDuplicateKeyUpdate({ set: { name: String(room.name ?? "\u063A\u0631\u0641\u0629 \u0642\u0631\u064A\u0628").slice(0, 80), retentionDays: Number(room.retentionDays ?? 0), updatedAt: /* @__PURE__ */ new Date() } });
  let restoredMessages = 0;
  const asRecord = (raw) => raw && typeof raw === "object" ? raw : null;
  for (const raw of data.participants ?? []) {
    const participant = asRecord(raw);
    if (!participant || String(participant.roomId) !== input.roomId || !participant.id || !participant.deviceId) continue;
    await db.insert(chatParticipants).values({ id: String(participant.id), roomId: input.roomId, deviceId: String(participant.deviceId), name: String(participant.name ?? "\u0632\u0627\u0626\u0631").slice(0, 40), color: String(participant.color ?? "#5B8DEF").slice(0, 7), lastSeen: backupDate(participant.lastSeen) }).onDuplicateKeyUpdate({ set: { name: String(participant.name ?? "\u0632\u0627\u0626\u0631").slice(0, 40), color: String(participant.color ?? "#5B8DEF").slice(0, 7), lastSeen: backupDate(participant.lastSeen) } });
  }
  for (const raw of data.bans ?? []) {
    const ban = asRecord(raw);
    if (!ban || String(ban.roomId) !== input.roomId || !ban.id || !ban.deviceId || !ban.bannedBy) continue;
    await db.insert(roomMemberBans).values({ id: String(ban.id), roomId: input.roomId, deviceId: String(ban.deviceId), bannedBy: String(ban.bannedBy), createdAt: backupDate(ban.createdAt) }).onDuplicateKeyUpdate({ set: { bannedBy: String(ban.bannedBy) } });
  }
  for (const raw of data.moderators ?? []) {
    const moderator = asRecord(raw);
    if (!moderator || String(moderator.roomId) !== input.roomId || !moderator.id || !moderator.deviceId || !moderator.assignedBy) continue;
    await db.insert(roomModerators).values({ id: String(moderator.id), roomId: input.roomId, deviceId: String(moderator.deviceId), canPin: Boolean(moderator.canPin), canRename: Boolean(moderator.canRename), canManageMembers: Boolean(moderator.canManageMembers), canClearMessages: Boolean(moderator.canClearMessages), canViewActivity: moderator.canViewActivity !== false, assignedBy: String(moderator.assignedBy), createdAt: backupDate(moderator.createdAt), updatedAt: /* @__PURE__ */ new Date() }).onDuplicateKeyUpdate({ set: { canPin: Boolean(moderator.canPin), canRename: Boolean(moderator.canRename), canManageMembers: Boolean(moderator.canManageMembers), canClearMessages: Boolean(moderator.canClearMessages), canViewActivity: moderator.canViewActivity !== false, updatedAt: /* @__PURE__ */ new Date() } });
  }
  for (const raw of data.invitations ?? []) {
    const invitation = asRecord(raw);
    if (!invitation || String(invitation.roomId) !== input.roomId || !invitation.id || !invitation.targetDeviceId || !invitation.invitedBy) continue;
    await db.insert(roomModeratorInvitations).values({ id: String(invitation.id), roomId: input.roomId, targetDeviceId: String(invitation.targetDeviceId), targetName: String(invitation.targetName ?? "\u0632\u0627\u0626\u0631").slice(0, 40), targetColor: String(invitation.targetColor ?? "#5B8DEF").slice(0, 7), invitedBy: String(invitation.invitedBy), invitedByName: String(invitation.invitedByName ?? "\u0632\u0627\u0626\u0631").slice(0, 40), canPin: Boolean(invitation.canPin), canRename: Boolean(invitation.canRename), canManageMembers: Boolean(invitation.canManageMembers), canClearMessages: Boolean(invitation.canClearMessages), canViewActivity: invitation.canViewActivity !== false, status: String(invitation.status ?? "pending"), createdAt: backupDate(invitation.createdAt), decidedAt: invitation.decidedAt ? backupDate(invitation.decidedAt) : null, decidedBy: invitation.decidedBy ? String(invitation.decidedBy) : null }).onDuplicateKeyUpdate({ set: { status: String(invitation.status ?? "pending"), decidedAt: invitation.decidedAt ? backupDate(invitation.decidedAt) : null, decidedBy: invitation.decidedBy ? String(invitation.decidedBy) : null } });
  }
  for (const raw of data.messages ?? []) {
    if (!raw || typeof raw !== "object") continue;
    const message = raw;
    if (String(message.roomId) !== input.roomId || !message.id || !message.senderId) continue;
    await db.insert(chatMessages).values({ id: String(message.id), roomId: input.roomId, senderId: String(message.senderId), senderName: String(message.senderName ?? "\u0632\u0627\u0626\u0631").slice(0, 40), senderColor: String(message.senderColor ?? "#5B8DEF").slice(0, 7), text: String(message.text ?? "").slice(0, 2e4), replyToId: message.replyToId ? String(message.replyToId) : null, reactions: message.reactions ? String(message.reactions) : null, editedAt: message.editedAt ? backupDate(message.editedAt) : null, deletedAt: message.deletedAt ? backupDate(message.deletedAt) : null, attachmentName: message.attachmentName ? String(message.attachmentName).slice(0, 120) : null, attachmentType: message.attachmentType ? String(message.attachmentType).slice(0, 100) : null, attachmentUrl: message.attachmentUrl ? String(message.attachmentUrl).slice(0, 512) : null, pinnedAt: message.pinnedAt ? backupDate(message.pinnedAt) : null, pinnedBy: message.pinnedBy ? String(message.pinnedBy).slice(0, 96) : null, createdAt: backupDate(message.createdAt) }).onDuplicateKeyUpdate({ set: { text: String(message.text ?? "").slice(0, 2e4), editedAt: message.editedAt ? backupDate(message.editedAt) : null, deletedAt: message.deletedAt ? backupDate(message.deletedAt) : null } });
    restoredMessages += 1;
  }
  for (const raw of data.activity ?? []) {
    const entry = asRecord(raw);
    if (!entry || String(entry.roomId) !== input.roomId || !entry.id || !entry.actorDeviceId || !entry.action) continue;
    await db.insert(roomAdminActivity).values({ id: String(entry.id), roomId: input.roomId, actorDeviceId: String(entry.actorDeviceId), actorName: String(entry.actorName ?? "\u0632\u0627\u0626\u0631").slice(0, 40), action: String(entry.action), targetDeviceId: entry.targetDeviceId ? String(entry.targetDeviceId) : null, targetName: entry.targetName ? String(entry.targetName).slice(0, 40) : null, details: entry.details ? String(entry.details).slice(0, 180) : null, createdAt: backupDate(entry.createdAt) }).onDuplicateKeyUpdate({ set: { details: entry.details ? String(entry.details).slice(0, 180) : null } });
  }
  for (const raw of data.notifications ?? []) {
    const notification = asRecord(raw);
    if (!notification || String(notification.roomId) !== input.roomId || !notification.id || !notification.targetDeviceId || !notification.activityId) continue;
    await db.insert(roomNotifications).values({ id: String(notification.id), roomId: input.roomId, targetDeviceId: String(notification.targetDeviceId), activityId: String(notification.activityId), kind: String(notification.kind ?? "admin"), title: String(notification.title ?? "\u0625\u062C\u0631\u0627\u0621 \u0625\u062F\u0627\u0631\u064A").slice(0, 120), body: String(notification.body ?? "").slice(0, 240), createdAt: backupDate(notification.createdAt), readAt: notification.readAt ? backupDate(notification.readAt) : null }).onDuplicateKeyUpdate({ set: { title: String(notification.title ?? "\u0625\u062C\u0631\u0627\u0621 \u0625\u062F\u0627\u0631\u064A").slice(0, 120), body: String(notification.body ?? "").slice(0, 240), readAt: notification.readAt ? backupDate(notification.readAt) : null } });
  }
  return { success: true, restoredMessages, restoredParticipants: (data.participants ?? []).length, restoredBans: (data.bans ?? []).length, restoredModerators: (data.moderators ?? []).length, restoredInvitations: (data.invitations ?? []).length, restoredActivity: (data.activity ?? []).length, restoredNotifications: (data.notifications ?? []).length };
}

// server/db.ts
var isLocalMode = process.env.LOCAL_MODE === "true" || !process.env.DATABASE_URL && process.env.NODE_ENV !== "production";
async function joinRoom3(input) {
  return isLocalMode ? joinRoom(input) : joinRoom2(input);
}
async function getRoomSnapshot3(roomId) {
  return isLocalMode ? getRoomSnapshot(roomId) : getRoomSnapshot2(roomId);
}
async function getRoomActorPermissions3(input) {
  return isLocalMode ? getRoomActorPermissions(input) : getRoomActorPermissions2(input);
}
async function setRoomPin3(input) {
  return isLocalMode ? setRoomPin(input) : setRoomPin2(input);
}
async function updateRoomName3(input) {
  return isLocalMode ? updateRoomName(input) : updateRoomName2(input);
}
async function setRoomMemberBan3(input) {
  return isLocalMode ? setRoomMemberBan(input) : setRoomMemberBan2(input);
}
async function listRoomModerators3(input) {
  return isLocalMode ? listRoomModerators(input) : listRoomModerators2(input);
}
async function setRoomModerator3(input) {
  return isLocalMode ? setRoomModerator(input) : setRoomModerator2(input);
}
async function listRoomAdminActivity3(input) {
  return isLocalMode ? listRoomAdminActivity(input) : listRoomAdminActivity2(input);
}
async function addMessage3(input) {
  return isLocalMode ? addMessage(input) : addMessage2(input);
}
async function toggleRoomMessageReaction3(input) {
  return isLocalMode ? toggleRoomMessageReaction(input) : toggleRoomMessageReaction2(input);
}
async function resetRoom3(input) {
  return isLocalMode ? resetRoom(input) : resetRoom2(input);
}
async function getDeviceProfile3(deviceId) {
  return isLocalMode ? getDeviceProfile(deviceId) : getDeviceProfile2(deviceId);
}
async function setDeviceAvatar3(input) {
  return isLocalMode ? setDeviceAvatar(input) : setDeviceAvatar2(input);
}
async function assertDirectMessageAllowed3(conversationId, senderId) {
  return isLocalMode ? assertDirectMessageAllowed(conversationId, senderId) : assertDirectMessageAllowed2(conversationId, senderId);
}
async function getDirectPeerIdForMember3(conversationId, deviceId) {
  return isLocalMode ? getDirectPeerIdForMember(conversationId, deviceId) : getDirectPeerIdForMember2(conversationId, deviceId);
}
async function startDirectConversation3(input) {
  return isLocalMode ? startDirectConversation(input) : startDirectConversation2(input);
}
async function listDirectConversations3(deviceId) {
  return isLocalMode ? listDirectConversations(deviceId) : listDirectConversations2(deviceId);
}
async function getDirectSnapshot3(input) {
  return isLocalMode ? getDirectSnapshot(input) : getDirectSnapshot2(input);
}
async function addDirectMessage3(input) {
  return isLocalMode ? addDirectMessage(input) : addDirectMessage2(input);
}
async function toggleDirectMessageReaction3(input) {
  return isLocalMode ? toggleDirectMessageReaction(input) : toggleDirectMessageReaction2(input);
}
async function setDirectConversationPreferences3(input) {
  return isLocalMode ? setDirectConversationPreferences(input) : setDirectConversationPreferences2(input);
}
async function markDirectConversationRead3(input) {
  return isLocalMode ? markDirectConversationRead(input) : markDirectConversationRead2(input);
}
async function startDirectCall3(input) {
  return isLocalMode ? startDirectCall(input) : startDirectCall2(input);
}
async function updateDirectCall3(input) {
  return isLocalMode ? updateDirectCall(input) : updateDirectCall2(input);
}
async function listDirectCallLogs3(input) {
  return isLocalMode ? listDirectCallLogs(input) : listDirectCallLogs2(input);
}
async function deleteDirectCall3(input) {
  return isLocalMode ? deleteDirectCall(input) : deleteDirectCall2(input);
}
async function clearDirectCallLogs3(input) {
  return isLocalMode ? clearDirectCallLogs(input) : clearDirectCallLogs2(input);
}
async function listRoomFiles3(roomId) {
  return isLocalMode ? listRoomFiles(roomId) : listRoomFiles2(roomId);
}
async function listDirectFiles3(input) {
  return isLocalMode ? listDirectFiles(input) : listDirectFiles2(input);
}
async function upsertUser3(user) {
  if (isLocalMode) return upsertUser(user);
  return upsertUser2(user);
}
async function getUserByOpenId3(openId) {
  return isLocalMode ? await getUserByOpenId(openId) : await getUserByOpenId2(openId);
}
async function getPublicProfile2(openId) {
  return isLocalMode ? { openId, username: null, name: null, avatarUrl: (await getDeviceProfile(openId)).avatarUrl, bio: null, availability: "available", language: "ar", privacyMode: "everyone" } : getPublicProfile(openId);
}
async function updatePublicProfile2(input) {
  return isLocalMode ? { openId: input.openId, username: input.username, name: input.name, avatarUrl: (await getDeviceProfile(input.openId)).avatarUrl, bio: input.bio ?? null, availability: input.availability ?? "available", language: input.language ?? "ar", privacyMode: input.privacyMode ?? "everyone" } : updatePublicProfile(input);
}
async function updatePublicAvatar2(input) {
  return isLocalMode ? setDeviceAvatar({ deviceId: input.openId, avatarUrl: input.avatarUrl }) : updatePublicAvatar(input);
}
async function createModeratorInvitation3(input) {
  return isLocalMode ? createModeratorInvitation(input) : createModeratorInvitation2(input);
}
async function listModeratorInvitations3(input) {
  return isLocalMode ? listModeratorInvitations(input) : listModeratorInvitations2(input);
}
async function respondModeratorInvitation3(input) {
  return isLocalMode ? respondModeratorInvitation(input) : respondModeratorInvitation2(input);
}
async function cancelModeratorInvitation3(input) {
  return isLocalMode ? cancelModeratorInvitation(input) : cancelModeratorInvitation2(input);
}
async function exportRoomAdminActivity3(input) {
  return isLocalMode ? exportRoomAdminActivity(input) : exportRoomAdminActivity2(input);
}
async function listRoomNotifications3(input) {
  return isLocalMode ? listRoomNotifications(input) : listRoomNotifications2(input);
}
async function markRoomNotificationRead3(input) {
  return isLocalMode ? markRoomNotificationRead(input) : markRoomNotificationRead2(input);
}
function cloudOnly(work) {
  if (isLocalMode) return Promise.resolve(void 0);
  return work();
}
var ensureUserDevice2 = (input) => cloudOnly(() => ensureUserDevice(input));
var isDeviceRevoked2 = (input) => cloudOnly(() => isDeviceRevoked(input));
var listUserDevices2 = (userId) => cloudOnly(() => listUserDevices(userId));
var revokeUserDevice2 = (input) => cloudOnly(() => revokeUserDevice(input));
var revokeAllUserDevices2 = (input) => cloudOnly(() => revokeAllUserDevices(input));
var getUserPreferences2 = (userId) => cloudOnly(() => getUserPreferences(userId));
var updateUserPreferences2 = (input) => cloudOnly(() => updateUserPreferences(input));
var editRoomMessage2 = (input) => cloudOnly(() => editRoomMessage(input));
var deleteRoomMessage2 = (input) => cloudOnly(() => deleteRoomMessage(input));
var editDirectMessage2 = (input) => cloudOnly(() => editDirectMessage(input));
var deleteDirectMessage2 = (input) => cloudOnly(() => deleteDirectMessage(input));
var toggleRoomMessagePin2 = (input) => cloudOnly(() => toggleRoomMessagePin(input));
var toggleDirectMessagePin2 = (input) => cloudOnly(() => toggleDirectMessagePin(input));
var listMessagePins2 = (input) => cloudOnly(() => listMessagePins(input));
var markMessageReceipt2 = (input) => cloudOnly(() => markMessageReceipt(input));
var listMessageReceipts2 = (input) => cloudOnly(() => listMessageReceipts(input));
var notifyMentionedUsers2 = (input) => cloudOnly(() => notifyMentionedUsers(input));
var listUserNotifications2 = (input) => cloudOnly(() => listUserNotifications(input));
var markUserNotificationRead2 = (input) => cloudOnly(() => markUserNotificationRead(input));
var createUserReport2 = (input) => cloudOnly(() => createUserReport(input));
var listUserReports2 = (input) => cloudOnly(() => listUserReports(input));
var resolveUserReport2 = (input) => cloudOnly(() => resolveUserReport(input));
var consumeRateLimit2 = (input) => cloudOnly(() => consumeRateLimit(input));
var getRetentionPolicy2 = (roomId) => cloudOnly(() => getRetentionPolicy(roomId));
var saveRetentionPolicy2 = (input) => cloudOnly(() => saveRetentionPolicy(input));
var runRetentionCleanup2 = (input) => cloudOnly(() => runRetentionCleanup(input));
var getRoomAnalytics2 = (input) => cloudOnly(() => getRoomAnalytics(input.roomId, input.actorId));
var getGlobalAnalytics2 = () => cloudOnly(() => getGlobalAnalytics());
var rejectRecentDuplicateMessage2 = (input) => isLocalMode ? Promise.resolve() : rejectRecentDuplicateMessage(input);
var createUploadSession2 = (input) => cloudOnly(() => createUploadSession(input));
var updateUploadSession2 = (input) => cloudOnly(() => updateUploadSession(input));
var appendUploadChunk2 = (input) => cloudOnly(() => appendUploadChunk(input));
var finalizeUploadSession2 = (input) => cloudOnly(() => finalizeUploadSession(input));
var recordBackupManifest2 = (input) => cloudOnly(() => recordBackupManifest(input));
var listBackupManifests2 = (input) => cloudOnly(() => listBackupManifests(input));
var getRoomBackupData2 = (input) => cloudOnly(() => getRoomBackupData(input.roomId, input.actorId));
var restoreRoomBackup2 = (input) => cloudOnly(() => restoreRoomBackup(input));

// server/_core/cookies.ts
function isSecureRequest(req) {
  if (req.protocol === "https") return true;
  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;
  const protoList = Array.isArray(forwardedProto) ? forwardedProto : forwardedProto.split(",");
  return protoList.some((proto) => proto.trim().toLowerCase() === "https");
}
function getSessionCookieOptions(req) {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "none",
    secure: isSecureRequest(req)
  };
}

// shared/_core/errors.ts
var HttpError = class extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
    this.name = "HttpError";
  }
};
var ForbiddenError = (msg) => new HttpError(403, msg);

// server/_core/sdk.ts
import axios from "axios";
import { parse as parseCookieHeader } from "cookie";
import { SignJWT, jwtVerify } from "jose";
var isNonEmptyString = (value) => typeof value === "string" && value.length > 0;
var EXCHANGE_TOKEN_PATH = `/webdev.v1.WebDevAuthPublicService/ExchangeToken`;
var GET_USER_INFO_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfo`;
var GET_USER_INFO_WITH_JWT_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfoWithJwt`;
var OAuthService = class {
  constructor(client) {
    this.client = client;
    const localMode2 = process.env.LOCAL_MODE !== "false" && process.env.LOCAL_MODE !== "0";
    if (!localMode2) {
      console.log("[OAuth] Initialized with baseURL:", ENV.oAuthServerUrl);
      if (!ENV.oAuthServerUrl) {
        console.error(
          "[OAuth] ERROR: OAUTH_SERVER_URL is not configured! Set OAUTH_SERVER_URL environment variable."
        );
      }
    }
  }
  decodeState(state2) {
    return decodeOAuthState(state2).redirectUri;
  }
  async getTokenByCode(code, state2) {
    const payload = {
      clientId: ENV.appId,
      grantType: "authorization_code",
      code,
      redirectUri: this.decodeState(state2)
    };
    const { data } = await this.client.post(
      EXCHANGE_TOKEN_PATH,
      payload
    );
    return data;
  }
  async getUserInfoByToken(token) {
    const { data } = await this.client.post(
      GET_USER_INFO_PATH,
      {
        accessToken: token.accessToken
      }
    );
    return data;
  }
};
var createOAuthHttpClient = () => axios.create({
  baseURL: ENV.oAuthServerUrl,
  timeout: AXIOS_TIMEOUT_MS
});
var SDKServer = class {
  client;
  oauthService;
  constructor(client = createOAuthHttpClient()) {
    this.client = client;
    this.oauthService = new OAuthService(this.client);
  }
  deriveLoginMethod(platforms, fallback) {
    if (fallback && fallback.length > 0) return fallback;
    if (!Array.isArray(platforms) || platforms.length === 0) return null;
    const set = new Set(
      platforms.filter((p) => typeof p === "string")
    );
    if (set.has("REGISTERED_PLATFORM_EMAIL")) return "email";
    if (set.has("REGISTERED_PLATFORM_GOOGLE")) return "google";
    if (set.has("REGISTERED_PLATFORM_APPLE")) return "apple";
    if (set.has("REGISTERED_PLATFORM_MICROSOFT") || set.has("REGISTERED_PLATFORM_AZURE"))
      return "microsoft";
    if (set.has("REGISTERED_PLATFORM_GITHUB")) return "github";
    const first = Array.from(set)[0];
    return first ? first.toLowerCase() : null;
  }
  /**
   * Exchange OAuth authorization code for access token
   * @example
   * const tokenResponse = await sdk.exchangeCodeForToken(code, state);
   */
  async exchangeCodeForToken(code, state2) {
    return this.oauthService.getTokenByCode(code, state2);
  }
  /**
   * Get user information using access token
   * @example
   * const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
   */
  async getUserInfo(accessToken) {
    const data = await this.oauthService.getUserInfoByToken({
      accessToken
    });
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  parseCookies(cookieHeader) {
    if (!cookieHeader) {
      return /* @__PURE__ */ new Map();
    }
    const parsed = parseCookieHeader(cookieHeader);
    return new Map(Object.entries(parsed));
  }
  getSessionSecret() {
    const secret = ENV.cookieSecret;
    return new TextEncoder().encode(secret);
  }
  /**
   * Create a session token for a Manus user openId
   * @example
   * const sessionToken = await sdk.createSessionToken(userInfo.openId);
   */
  async createSessionToken(openId, options = {}) {
    return this.signSession(
      {
        openId,
        appId: ENV.appId,
        name: options.name || ""
      },
      options
    );
  }
  async signSession(payload, options = {}) {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
    const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1e3);
    const secretKey = this.getSessionSecret();
    return new SignJWT({
      openId: payload.openId,
      appId: payload.appId,
      name: payload.name
    }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setExpirationTime(expirationSeconds).sign(secretKey);
  }
  async verifySession(cookieValue) {
    if (!cookieValue) {
      console.warn("[Auth] Missing session cookie");
      return null;
    }
    try {
      const secretKey = this.getSessionSecret();
      const { payload } = await jwtVerify(cookieValue, secretKey, {
        algorithms: ["HS256"]
      });
      const { openId, appId, name } = payload;
      if (!isNonEmptyString(openId) || !isNonEmptyString(appId) || !isNonEmptyString(name)) {
        console.warn("[Auth] Session payload missing required fields");
        return null;
      }
      return {
        openId,
        appId,
        name
      };
    } catch (error) {
      console.warn("[Auth] Session verification failed", String(error));
      return null;
    }
  }
  async getUserInfoWithJwt(jwtToken) {
    const payload = {
      jwtToken,
      projectId: ENV.appId
    };
    const { data } = await this.client.post(
      GET_USER_INFO_WITH_JWT_PATH,
      payload
    );
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  async authenticateRequest(req) {
    const cookies = this.parseCookies(req.headers.cookie);
    let sessionToken = cookies.get(COOKIE_NAME);
    if (!sessionToken) {
      const authHeader = req.headers.authorization;
      if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
        sessionToken = authHeader.slice(7);
      }
    }
    const session = await this.verifySession(sessionToken);
    if (!session) {
      throw ForbiddenError("Invalid session cookie");
    }
    if (session.openId.startsWith(CRON_OPEN_ID_PREFIX)) {
      const userInfo = await this.getUserInfoWithJwt(sessionToken ?? "");
      const taskUid = userInfo.taskUid ?? null;
      if (!taskUid) {
        throw ForbiddenError("Cron session missing task_uid");
      }
      return buildCronUser(userInfo);
    }
    const sessionUserId = session.openId;
    const signedInAt = /* @__PURE__ */ new Date();
    let user = await getUserByOpenId3(sessionUserId);
    if (!user) {
      try {
        const userInfo = await this.getUserInfoWithJwt(sessionToken ?? "");
        await upsertUser3({
          openId: userInfo.openId,
          name: userInfo.name || null,
          email: userInfo.email ?? null,
          loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
          lastSignedIn: signedInAt
        });
        user = await getUserByOpenId3(userInfo.openId);
      } catch (error) {
        console.error("[Auth] Failed to sync user from OAuth:", error);
        throw ForbiddenError("Failed to sync user info");
      }
    }
    if (!user) {
      throw ForbiddenError("User not found");
    }
    await upsertUser3({
      openId: user.openId,
      lastSignedIn: signedInAt
    });
    return user;
  }
};
var CRON_OPEN_ID_PREFIX = "cron_";
function buildCronUser(userInfo) {
  const now2 = /* @__PURE__ */ new Date();
  return {
    id: -1,
    openId: userInfo.openId,
    name: userInfo.name || "Manus Scheduled Task",
    email: null,
    loginMethod: null,
    role: "user",
    createdAt: now2,
    updatedAt: now2,
    lastSignedIn: now2,
    taskUid: userInfo.taskUid ?? void 0,
    isCron: true
  };
}
var sdk = new SDKServer();

// server/_core/oauth.ts
function getQueryParam(req, key) {
  const value = req.query[key];
  return typeof value === "string" ? value : void 0;
}
function registerOAuthRoutes(app) {
  app.get("/api/oauth/callback", async (req, res) => {
    const code = getQueryParam(req, "code");
    const state2 = getQueryParam(req, "state");
    if (!code || !state2) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }
    const { nonce } = decodeOAuthState(state2);
    const expectedNonce = parseCookieHeader2(req.headers.cookie ?? "")[OAUTH_STATE_COOKIE];
    if (!nonce || nonce !== expectedNonce) {
      res.status(403).json({ error: "invalid oauth state" });
      return;
    }
    res.clearCookie(OAUTH_STATE_COOKIE, { path: "/", secure: true, sameSite: "none" });
    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state2);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }
      await upsertUser3({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: /* @__PURE__ */ new Date()
      });
      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS
      });
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}

// server/_core/storageProxy.ts
function registerStorageProxy(app) {
  app.get("/manus-storage/*", async (req, res) => {
    const key = req.params[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }
    const publicProduction = process.env.NODE_ENV === "production" && Boolean(process.env.DATABASE_URL) && process.env.LOCAL_MODE !== "true";
    if (publicProduction) {
      try {
        const user = await sdk.authenticateRequest(req);
        if (!user) {
          res.status(401).send("Authentication required");
          return;
        }
      } catch {
        res.status(401).send("Authentication required");
        return;
      }
    }
    if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
      res.status(500).send("Storage proxy not configured");
      return;
    }
    try {
      const forgeUrl = new URL(
        "v1/storage/presign/get",
        ENV.forgeApiUrl.replace(/\/+$/, "") + "/"
      );
      forgeUrl.searchParams.set("path", key);
      const forgeResp = await fetch(forgeUrl, {
        headers: { Authorization: `Bearer ${ENV.forgeApiKey}` }
      });
      if (!forgeResp.ok) {
        const body = await forgeResp.text().catch(() => "");
        console.error(`[StorageProxy] forge error: ${forgeResp.status} ${body}`);
        res.status(502).send("Storage backend error");
        return;
      }
      const { url } = await forgeResp.json();
      if (!url) {
        res.status(502).send("Empty signed URL from backend");
        return;
      }
      res.set("Cache-Control", "no-store");
      res.redirect(307, url);
    } catch (err) {
      console.error("[StorageProxy] failed:", err);
      res.status(502).send("Storage proxy error");
    }
  });
}

// server/routers.ts
import { z as z2 } from "zod";
import { parse as parseCookie } from "cookie";
import { TRPCError as TRPCError4 } from "@trpc/server";

// server/_core/systemRouter.ts
import { z } from "zod";

// server/_core/notification.ts
import { TRPCError } from "@trpc/server";
var TITLE_MAX_LENGTH = 1200;
var CONTENT_MAX_LENGTH = 2e4;
var trimValue = (value) => value.trim();
var isNonEmptyString2 = (value) => typeof value === "string" && value.trim().length > 0;
var buildEndpointUrl = (baseUrl) => {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(
    "webdevtoken.v1.WebDevService/SendNotification",
    normalizedBase
  ).toString();
};
var validatePayload = (input) => {
  if (!isNonEmptyString2(input.title)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification title is required."
    });
  }
  if (!isNonEmptyString2(input.content)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification content is required."
    });
  }
  const title = trimValue(input.title);
  const content = trimValue(input.content);
  if (title.length > TITLE_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification title must be at most ${TITLE_MAX_LENGTH} characters.`
    });
  }
  if (content.length > CONTENT_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification content must be at most ${CONTENT_MAX_LENGTH} characters.`
    });
  }
  return { title, content };
};
async function notifyOwner(payload) {
  const { title, content } = validatePayload(payload);
  if (!ENV.forgeApiUrl) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service URL is not configured."
    });
  }
  if (!ENV.forgeApiKey) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service API key is not configured."
    });
  }
  const endpoint = buildEndpointUrl(ENV.forgeApiUrl);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${ENV.forgeApiKey}`,
        "content-type": "application/json",
        "connect-protocol-version": "1"
      },
      body: JSON.stringify({ title, content })
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(
        `[Notification] Failed to notify owner (${response.status} ${response.statusText})${detail ? `: ${detail}` : ""}`
      );
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[Notification] Error calling notification service:", error);
    return false;
  }
}

// server/_core/trpc.ts
import { initTRPC, TRPCError as TRPCError2 } from "@trpc/server";
import superjson from "superjson";
var t = initTRPC.context().create({
  transformer: superjson
});
var router = t.router;
var publicProcedure = t.procedure;
var requireUser = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  if (!ctx.user) {
    throw new TRPCError2({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user
    }
  });
});
var protectedProcedure = t.procedure.use(requireUser);
var adminProcedure = t.procedure.use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;
    if (!ctx.user || ctx.user.role !== "admin") {
      throw new TRPCError2({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next({
      ctx: {
        ...ctx,
        user: ctx.user
      }
    });
  })
);

// server/_core/systemRouter.ts
var systemRouter = router({
  health: publicProcedure.input(
    z.object({
      timestamp: z.number().min(0, "timestamp cannot be negative")
    })
  ).query(() => ({
    ok: true
  })),
  notifyOwner: adminProcedure.input(
    z.object({
      title: z.string().min(1, "title is required"),
      content: z.string().min(1, "content is required")
    })
  ).mutation(async ({ input }) => {
    const delivered = await notifyOwner(input);
    return {
      success: delivered
    };
  })
});

// server/turn.ts
function getIceServers() {
  const urls = (process.env.TURN_URL ?? "").split(",").map((url) => url.trim()).filter((url) => /^turns?:/i.test(url));
  const username = (process.env.TURN_USERNAME ?? "").trim();
  const credential = (process.env.TURN_CREDENTIAL ?? "").trim();
  if (!urls.length || !username || !credential) return [];
  return [{ urls, username, credential }];
}

// server/qareeb.validation.ts
var MAX_MESSAGE_LENGTH = 1600;
var MAX_FILE_BYTES = 115e4;
function cleanText(value, maxLength) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, maxLength) : "";
}
function normalizeRoomId(value) {
  const id = cleanText(value, 16).toUpperCase().replace(/[^A-Z0-9-]/g, "");
  return id.length >= 4 ? id : "";
}
function safeColor(value) {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#1B76F2";
}
function safeFileName(value) {
  const cleaned = cleanText(value, 120).replace(/[^A-Za-z0-9._-]/g, "-");
  return cleaned || "file";
}
function parseDataUrl(dataUrl) {
  const match = /^data:([\w.+/-]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUrl);
  if (!match) return null;
  const mimeType = match[1];
  const data = Buffer.from(match[2].replace(/\s/g, ""), "base64");
  return data.length > 0 && data.length <= MAX_FILE_BYTES ? { mimeType, data } : null;
}

// server/realtime.ts
import { Server } from "socket.io";
var signalKinds = /* @__PURE__ */ new Set(["call-offer", "call-answer", "ice-candidate", "call-ended"]);
var realtimeIo = null;
function notifyRoomRealtime(roomId) {
  realtimeIo?.to(`room:${roomId}`).emit("room:activity", { roomId });
}
function revokeRealtimeDevice(deviceId) {
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
function validDeviceId(value) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 96;
}
function validConversationId(value) {
  return typeof value === "string" && value.startsWith("direct_") && value.length <= 64;
}
function registerRealtimeServer(server) {
  const io = new Server(server, {
    path: "/socket.io",
    transports: ["websocket", "polling"],
    maxHttpBufferSize: 1e5
  });
  realtimeIo = io;
  io.on("connection", (socket) => {
    socket.on("realtime:register", (deviceId, roomIdOrAcknowledge, maybeAcknowledge) => {
      const roomId = typeof roomIdOrAcknowledge === "string" ? roomIdOrAcknowledge : void 0;
      const acknowledge = typeof roomIdOrAcknowledge === "function" ? roomIdOrAcknowledge : maybeAcknowledge;
      if (!validDeviceId(deviceId)) {
        acknowledge?.({ success: false });
        return;
      }
      const existing = socket.data.deviceId;
      if (existing) socket.leave(`device:${existing}`);
      socket.data.deviceId = deviceId;
      socket.join(`device:${deviceId}`);
      if (roomId && roomId.length <= 16) {
        const previousRoom = socket.data.roomId;
        if (previousRoom) socket.leave(`room:${previousRoom}`);
        socket.data.roomId = roomId;
        socket.join(`room:${roomId}`);
      }
      acknowledge?.({ success: true });
    });
    socket.on("room:register", (roomId) => {
      const currentRoom = socket.data.roomId;
      if (currentRoom) socket.leave(`room:${currentRoom}`);
      if (typeof roomId === "string" && roomId.length <= 16) {
        socket.data.roomId = roomId;
        socket.join(`room:${roomId}`);
      }
    });
    socket.on("room:p2p-hello", () => {
      const roomId = socket.data.roomId;
      const deviceId = socket.data.deviceId;
      if (!roomId || !deviceId) return;
      const peers = io.sockets.adapter.rooms.get(`room:${roomId}`) ?? /* @__PURE__ */ new Set();
      for (const socketId of Array.from(peers)) {
        const peer = io.sockets.sockets.get(socketId);
        const peerDeviceId = peer?.data.deviceId;
        if (peer && peerDeviceId && peerDeviceId !== deviceId) socket.emit("room:p2p-peer", { deviceId: peerDeviceId });
      }
      socket.to(`room:${roomId}`).emit("room:p2p-peer", { deviceId });
    });
    socket.on("room:p2p-signal", (packet = {}) => {
      const roomId = socket.data.roomId;
      const fromDeviceId = socket.data.deviceId;
      if (!roomId || !fromDeviceId || !validDeviceId(packet.toDeviceId) || packet.kind !== "offer" && packet.kind !== "answer" || typeof packet.data !== "string" || packet.data.length > 2e6) return;
      io.to(`device:${packet.toDeviceId}`).emit("room:p2p-signal", { fromDeviceId, toDeviceId: packet.toDeviceId, kind: packet.kind, data: packet.data });
    });
    socket.on("direct:notify", async (packet = {}) => {
      const senderId = socket.data.deviceId;
      if (!senderId || !validConversationId(packet.conversationId)) return;
      try {
        await assertDirectMessageAllowed3(packet.conversationId, senderId);
        const recipientId = await getDirectPeerIdForMember3(packet.conversationId, senderId);
        io.to(`device:${recipientId}`).emit("direct:message", {
          conversationId: packet.conversationId,
          fromDeviceId: senderId
        });
      } catch {
      }
    });
    socket.on("direct:typing", async (packet = {}) => {
      const senderId = socket.data.deviceId;
      if (!senderId || !validConversationId(packet.conversationId) || typeof packet.isTyping !== "boolean") return;
      try {
        await assertDirectMessageAllowed3(packet.conversationId, senderId);
        const recipientId = await getDirectPeerIdForMember3(packet.conversationId, senderId);
        io.to(`device:${recipientId}`).emit("direct:typing", { conversationId: packet.conversationId, fromDeviceId: senderId, isTyping: packet.isTyping });
      } catch {
      }
    });
    socket.on("direct:read", async (packet = {}) => {
      const senderId = socket.data.deviceId;
      if (!senderId || !validConversationId(packet.conversationId) || typeof packet.readAt !== "number" || !Number.isFinite(packet.readAt)) return;
      try {
        const recipientId = await getDirectPeerIdForMember3(packet.conversationId, senderId);
        io.to(`device:${recipientId}`).emit("direct:read", { conversationId: packet.conversationId, fromDeviceId: senderId, readAt: packet.readAt });
      } catch {
      }
    });
    socket.on("direct:signal", async (packet = {}) => {
      const senderId = socket.data.deviceId;
      if (!senderId || !validConversationId(packet.conversationId) || typeof packet.kind !== "string" || !signalKinds.has(packet.kind)) return;
      try {
        await assertDirectMessageAllowed3(packet.conversationId, senderId);
        const recipientId = await getDirectPeerIdForMember3(packet.conversationId, senderId);
        io.to(`device:${recipientId}`).emit("direct:signal", {
          conversationId: packet.conversationId,
          fromDeviceId: senderId,
          kind: packet.kind,
          data: packet.data
        });
      } catch {
      }
    });
  });
  return io;
}

// server/_core/heartbeat.ts
import { TRPCError as TRPCError3 } from "@trpc/server";
var SERVICE = "webdevtoken.v1.WebDevService";
var buildEndpoint = (rpc) => {
  if (!ENV.forgeApiUrl) {
    throw new TRPCError3({
      code: "INTERNAL_SERVER_ERROR",
      message: "Heartbeat service URL is not configured (BUILT_IN_FORGE_API_URL)."
    });
  }
  if (!ENV.forgeApiKey) {
    throw new TRPCError3({
      code: "INTERNAL_SERVER_ERROR",
      message: "Heartbeat service API key is not configured (BUILT_IN_FORGE_API_KEY)."
    });
  }
  const baseUrl = ENV.forgeApiUrl;
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(`${SERVICE}/${rpc}`, normalizedBase).toString();
};
var callForge = async (rpc, body, userSession) => {
  const endpoint = buildEndpoint(rpc);
  const headers = {
    accept: "application/json",
    authorization: `Bearer ${ENV.forgeApiKey}`,
    "content-type": "application/json",
    "connect-protocol-version": "1"
  };
  if (userSession) {
    headers["x-manus-user-session"] = userSession;
  }
  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body)
    });
  } catch (error) {
    throw new TRPCError3({
      code: "INTERNAL_SERVER_ERROR",
      message: `Heartbeat ${rpc} network error: ${String(error)}`
    });
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw mapForgeError(response, detail, rpc);
  }
  return await response.json();
};
var mapForgeError = (response, detail, rpc) => {
  const status = response.status;
  let code = "INTERNAL_SERVER_ERROR";
  if (status === 401) code = "UNAUTHORIZED";
  else if (status === 403) code = "FORBIDDEN";
  else if (status === 404) code = "NOT_FOUND";
  else if (status === 400 || status === 422) code = "BAD_REQUEST";
  else if (status === 409) code = "CONFLICT";
  else if (status === 429) code = "TOO_MANY_REQUESTS";
  return new TRPCError3({
    code,
    message: `Heartbeat ${rpc} failed (${status})${detail ? `: ${detail}` : ""}`
  });
};
var stringifyPayload = (payload) => {
  if (payload === void 0 || payload === null) return "{}";
  if (typeof payload === "string") return payload;
  return JSON.stringify(payload);
};
var validateCallbackPath = (path5) => {
  if (!path5 || !path5.startsWith("/api/scheduled/")) {
    throw new TRPCError3({
      code: "BAD_REQUEST",
      message: "callback path must start with /api/scheduled/"
    });
  }
};
async function createHeartbeatJob(job, userSession) {
  validateCallbackPath(job.path);
  return callForge(
    "CreateHeartbeatJob",
    {
      name: job.name,
      cronExpression: job.cron,
      callbackPath: job.path,
      callbackMethod: job.method ?? "POST",
      callbackPayload: stringifyPayload(job.payload),
      description: job.description ?? ""
    },
    userSession
  );
}
async function updateHeartbeatJob(taskUid, patch, userSession) {
  if (patch.path !== void 0) validateCallbackPath(patch.path);
  const body = { taskUid };
  if (patch.cron !== void 0) body.cronExpression = patch.cron;
  if (patch.path !== void 0) body.callbackPath = patch.path;
  if (patch.method !== void 0) body.callbackMethod = patch.method;
  if (patch.payload !== void 0) {
    body.callbackPayload = stringifyPayload(patch.payload);
  }
  if (patch.description !== void 0) body.description = patch.description;
  if (patch.enable !== void 0) body.enable = patch.enable;
  return callForge(
    "UpdateHeartbeatJob",
    body,
    userSession
  );
}

// server/routers.ts
var roomIdInput = z2.string().max(16);
var attachmentInput = z2.object({ name: z2.string().max(120), type: z2.string().max(100), dataUrl: z2.string().max(16e5), url: z2.string().url().max(900).optional() });
var deviceIdInput = z2.string().min(1).max(96);
function requireActor(ctx, actorId) {
  const localMode2 = process.env.LOCAL_MODE === "true" || !process.env.DATABASE_URL && process.env.NODE_ENV !== "production" && process.env.NODE_ENV !== "test";
  if (localMode2) return;
  if (!ctx.user) throw new TRPCError4({ code: "UNAUTHORIZED", message: "\u064A\u062C\u0628 \u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u062F\u062E\u0648\u0644 \u0644\u0644\u0648\u0635\u0648\u0644 \u0625\u0644\u0649 Qareeb." });
  if (ctx.user.openId !== actorId) throw new TRPCError4({ code: "FORBIDDEN", message: "\u0644\u0627 \u064A\u0645\u0643\u0646\u0643 \u062A\u0646\u0641\u064A\u0630 \u0647\u0630\u0627 \u0627\u0644\u0625\u062C\u0631\u0627\u0621 \u0628\u0647\u0648\u064A\u0629 \u0645\u0633\u062A\u062E\u062F\u0645 \u0623\u062E\u0631\u0649." });
}
async function requireActiveActor(ctx, actorId) {
  requireActor(ctx, actorId);
  if (isLocalRuntime() || !ctx.user) return;
  if (await isDeviceRevoked2({ userId: ctx.user.openId, deviceId: actorId })) throw new TRPCError4({ code: "FORBIDDEN", message: "\u062A\u0645 \u0625\u0644\u063A\u0627\u0621 \u0648\u0635\u0648\u0644 \u0647\u0630\u0627 \u0627\u0644\u062C\u0647\u0627\u0632. \u0633\u062C\u0651\u0644 \u0627\u0644\u062C\u0647\u0627\u0632 \u0645\u0646 \u062C\u062F\u064A\u062F \u0644\u0644\u0645\u062A\u0627\u0628\u0639\u0629." });
}
var deviceRegistrationProcedure = publicProcedure.use(({ ctx, next }) => {
  if (!isLocalRuntime() && !ctx.user) throw new TRPCError4({ code: "UNAUTHORIZED", message: "\u064A\u062C\u0628 \u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u062F\u062E\u0648\u0644 \u0644\u062A\u0633\u062C\u064A\u0644 \u0647\u0630\u0627 \u0627\u0644\u062C\u0647\u0627\u0632." });
  return next();
});
var qareebProcedure = publicProcedure.use(async ({ ctx, next, input }) => {
  const localMode2 = process.env.LOCAL_MODE === "true" || !process.env.DATABASE_URL && process.env.NODE_ENV !== "production" && process.env.NODE_ENV !== "test";
  if (!localMode2 && !ctx.user) throw new TRPCError4({ code: "UNAUTHORIZED", message: "\u064A\u062C\u0628 \u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u062F\u062E\u0648\u0644 \u0644\u0644\u0648\u0635\u0648\u0644 \u0625\u0644\u0649 Qareeb." });
  if (!localMode2 && ctx.user && input && typeof input === "object") {
    const record = input;
    const actorId = typeof record.deviceId === "string" ? record.deviceId : typeof record.senderId === "string" ? record.senderId : void 0;
    if (actorId) await requireActiveActor(ctx, actorId);
  }
  return next();
});
var avatarInput = z2.object({ name: z2.string().max(120), type: z2.string().max(100), dataUrl: z2.string().max(8e5) });
function validRoomId(value) {
  const roomId = normalizeRoomId(value);
  if (!roomId) throw new Error("\u0631\u0645\u0632 \u0627\u0644\u063A\u0631\u0641\u0629 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D.");
  return roomId;
}
async function storeAttachment(input, keyPrefix) {
  if (input.url) return { name: safeFileName(input.name), type: cleanText(input.type, 100) || "application/octet-stream", url: input.url };
  const parsed = parseDataUrl(input.dataUrl);
  if (!parsed) throw new Error("\u0627\u0644\u0645\u0644\u0641 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D \u0623\u0648 \u064A\u062A\u062C\u0627\u0648\u0632 \u0627\u0644\u062D\u062C\u0645 \u0627\u0644\u0645\u0633\u0645\u0648\u062D.");
  const type = parsed.mimeType || cleanText(input.type, 100) || "application/octet-stream";
  const name = safeFileName(input.name);
  const stored = await storagePut(`${keyPrefix}/${Date.now()}-${name}`, parsed.data, type);
  return { name, type, url: stored.url };
}
async function storeAvatar(input, deviceId) {
  const parsed = parseDataUrl(input.dataUrl);
  if (!parsed || !parsed.mimeType.startsWith("image/") || parsed.data.length > 5e5) {
    throw new Error("\u0627\u062E\u062A\u0631 \u0635\u0648\u0631\u0629 \u0635\u0627\u0644\u062D\u0629 \u0628\u062D\u062C\u0645 \u0644\u0627 \u064A\u062A\u062C\u0627\u0648\u0632 500 \u0643\u064A\u0644\u0648\u0628\u0627\u064A\u062A.");
  }
  const allowed = /* @__PURE__ */ new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
  if (!allowed.has(parsed.mimeType)) throw new Error("\u0635\u064A\u063A\u0629 \u0627\u0644\u0635\u0648\u0631\u0629 \u063A\u064A\u0631 \u0645\u062F\u0639\u0648\u0645\u0629. \u0627\u0633\u062A\u062E\u062F\u0645 JPG \u0623\u0648 PNG \u0623\u0648 WebP \u0623\u0648 GIF.");
  const extension = parsed.mimeType === "image/jpeg" ? "jpg" : parsed.mimeType.split("/")[1];
  const stored = await storagePut(`qareeb/profiles/${deviceId}/avatar-${Date.now()}.${extension}`, parsed.data, parsed.mimeType);
  return stored.url;
}
function isLocalRuntime() {
  return process.env.VITEST === "true" || process.env.NODE_ENV === "test" || process.env.LOCAL_MODE === "true" || !process.env.DATABASE_URL && process.env.NODE_ENV !== "production";
}
function requireAdmin(ctx) {
  if (!ctx.user || ctx.user.role !== "admin") throw new TRPCError4({ code: "FORBIDDEN", message: "\u0647\u0630\u0647 \u0627\u0644\u0639\u0645\u0644\u064A\u0629 \u0645\u062A\u0627\u062D\u0629 \u0644\u0645\u062F\u064A\u0631 \u0627\u0644\u0646\u0638\u0627\u0645 \u0641\u0642\u0637." });
}
async function enforceRateLimit(subjectKey, action, limit) {
  if (isLocalRuntime()) return;
  await consumeRateLimit2({ subjectKey, action, limit, windowMs: 6e4 });
}
async function requireDirectMessagingPermission(conversationId, senderId) {
  try {
    await assertDirectMessageAllowed3(conversationId, senderId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "\u062A\u0639\u0630\u0631 \u0625\u0631\u0633\u0627\u0644 \u0627\u0644\u0631\u0633\u0627\u0644\u0629 \u0627\u0644\u062E\u0627\u0635\u0629.";
    throw new TRPCError4({ code: "FORBIDDEN", message });
  }
}
async function roomManagement(roomIdOrAction, action) {
  try {
    const roomId = typeof roomIdOrAction === "string" ? roomIdOrAction : void 0;
    const result = await (typeof roomIdOrAction === "function" ? roomIdOrAction : action)();
    if (roomId) notifyRoomRealtime(roomId);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "\u062A\u0639\u0630\u0631 \u062A\u0646\u0641\u064A\u0630 \u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u063A\u0631\u0641\u0629.";
    throw new TRPCError4({ code: message.includes("\u0645\u0627\u0644\u0643 \u0627\u0644\u063A\u0631\u0641\u0629") || message.includes("\u0625\u0632\u0627\u0644\u0629 \u0645\u0627\u0644\u0643") || message.includes("\u0627\u0644\u0635\u0644\u0627\u062D\u064A\u0629 \u0627\u0644\u0644\u0627\u0632\u0645\u0629") ? "FORBIDDEN" : "BAD_REQUEST", message });
  }
}
var appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true };
    })
  }),
  qareeb: router({
    profile: router({
      get: qareebProcedure.input(z2.object({ deviceId: deviceIdInput })).query(({ input }) => getDeviceProfile3(cleanText(input.deviceId, 96))),
      me: qareebProcedure.query(({ ctx }) => getPublicProfile2(ctx.user?.openId ?? "")),
      update: qareebProcedure.input(z2.object({ deviceId: deviceIdInput.optional(), username: z2.string().min(3).max(32), name: z2.string().min(1).max(80), bio: z2.string().max(160).optional(), availability: z2.enum(["available", "busy", "away"]).optional(), language: z2.enum(["ar", "en"]).optional(), privacyMode: z2.enum(["everyone", "contacts", "nobody"]).optional() })).mutation(({ ctx, input }) => updatePublicProfile2({ openId: ctx.user?.openId ?? cleanText(input.deviceId ?? "", 96), username: cleanText(input.username, 32), name: cleanText(input.name, 80), bio: cleanText(input.bio ?? "", 160), availability: input.availability, language: input.language, privacyMode: input.privacyMode })),
      updateAvatar: qareebProcedure.input(z2.object({ deviceId: deviceIdInput, avatar: avatarInput })).mutation(async ({ input }) => {
        const deviceId = cleanText(input.deviceId, 96);
        const avatarUrl = await storeAvatar(input.avatar, deviceId);
        await updatePublicAvatar2({ openId: deviceId, avatarUrl });
        return setDeviceAvatar3({ deviceId, avatarUrl });
      })
    }),
    devices: router({
      register: deviceRegistrationProcedure.input(z2.object({ deviceId: deviceIdInput, label: z2.string().max(120), userAgent: z2.string().max(255).optional() })).mutation(({ ctx, input }) => {
        const deviceId = cleanText(input.deviceId, 96);
        requireActor(ctx, deviceId);
        return ensureUserDevice2({ userId: ctx.user?.openId ?? deviceId, deviceId, label: cleanText(input.label, 120) || "Qareeb device", userAgent: input.userAgent });
      }),
      list: qareebProcedure.query(({ ctx }) => listUserDevices2(ctx.user?.openId ?? "")),
      revoke: qareebProcedure.input(z2.object({ deviceId: deviceIdInput })).mutation(async ({ ctx, input }) => {
        const target = cleanText(input.deviceId, 96);
        const result = await revokeUserDevice2({ userId: ctx.user?.openId ?? "", deviceId: target });
        revokeRealtimeDevice(target);
        return result;
      }),
      revokeAll: qareebProcedure.input(z2.object({ exceptDeviceId: deviceIdInput.nullable().optional() })).mutation(async ({ ctx, input }) => {
        const exceptDeviceId = input.exceptDeviceId ? cleanText(input.exceptDeviceId, 96) : null;
        const result = await revokeAllUserDevices2({ userId: ctx.user?.openId ?? "", exceptDeviceId });
        const devices = await listUserDevices2(ctx.user?.openId ?? "");
        for (const device of devices) if (device.id !== exceptDeviceId) revokeRealtimeDevice(device.id);
        return result;
      })
    }),
    preferences: router({
      get: qareebProcedure.query(({ ctx }) => getUserPreferences2(ctx.user?.openId ?? "")),
      update: qareebProcedure.input(z2.object({ theme: z2.enum(["light", "dark", "system"]), readingBackground: z2.enum(["soft", "paper", "night"]), fontScale: z2.number().min(85).max(125), compactMode: z2.boolean(), ringtoneEnabled: z2.boolean(), notificationsEnabled: z2.boolean() })).mutation(({ ctx, input }) => updateUserPreferences2({ userId: ctx.user?.openId ?? "", ...input }))
    }),
    userNotifications: router({
      list: qareebProcedure.input(z2.object({ unreadOnly: z2.boolean().optional() }).optional()).query(({ ctx, input }) => listUserNotifications2({ recipientId: ctx.user?.openId ?? "", unreadOnly: input?.unreadOnly })),
      markRead: qareebProcedure.input(z2.object({ notificationId: z2.string().max(96).optional() })).mutation(({ ctx, input }) => markUserNotificationRead2({ recipientId: ctx.user?.openId ?? "", notificationId: input.notificationId }))
    }),
    reports: router({
      create: qareebProcedure.input(z2.object({ targetUserId: deviceIdInput, reason: z2.string().min(1).max(64), details: z2.string().max(2e3).optional(), roomId: roomIdInput.nullable().optional(), conversationId: z2.string().max(64).nullable().optional(), messageId: z2.string().max(64).nullable().optional() })).mutation(async ({ ctx, input }) => {
        const reporterId = ctx.user?.openId ?? "";
        await enforceRateLimit(`${reporterId}:reports`, "create", 5);
        return createUserReport2({ reporterId, targetUserId: cleanText(input.targetUserId, 96), reason: cleanText(input.reason, 64), details: input.details ? cleanText(input.details, 2e3) : null, roomId: input.roomId ? validRoomId(input.roomId) : null, conversationId: input.conversationId ?? null, messageId: input.messageId ?? null });
      }),
      list: qareebProcedure.input(z2.object({ status: z2.enum(["open", "reviewed", "resolved", "dismissed"]).optional() }).optional()).query(({ ctx, input }) => {
        requireAdmin(ctx);
        return listUserReports2(input ?? {});
      }),
      resolve: qareebProcedure.input(z2.object({ reportId: z2.string().min(1).max(96), status: z2.enum(["reviewed", "resolved", "dismissed"]), action: z2.enum(["warn", "mute", "ban", "unban", "dismiss"]).optional(), note: z2.string().max(240).nullable().optional() })).mutation(({ ctx, input }) => {
        requireAdmin(ctx);
        return resolveUserReport2({ reportId: input.reportId, reviewerId: ctx.user?.openId ?? "", status: input.status, action: input.action, note: input.note });
      })
    }),
    retention: router({
      get: qareebProcedure.input(z2.object({ roomId: roomIdInput, deviceId: deviceIdInput })).query(({ ctx, input }) => {
        const deviceId = cleanText(input.deviceId, 96);
        requireActor(ctx, deviceId);
        return getRetentionPolicy2(validRoomId(input.roomId));
      }),
      update: qareebProcedure.input(z2.object({ roomId: roomIdInput, deviceId: deviceIdInput, messageRetentionDays: z2.number().min(0).max(3650), fileRetentionDays: z2.number().min(0).max(3650), adminActivityRetentionDays: z2.number().min(30).max(3650) })).mutation(({ ctx, input }) => {
        const deviceId = cleanText(input.deviceId, 96);
        requireActor(ctx, deviceId);
        return saveRetentionPolicy2({ roomId: validRoomId(input.roomId), updatedBy: deviceId, messageRetentionDays: input.messageRetentionDays, fileRetentionDays: input.fileRetentionDays, adminActivityRetentionDays: input.adminActivityRetentionDays });
      }),
      schedule: qareebProcedure.input(z2.object({ roomId: roomIdInput, deviceId: deviceIdInput, cron: z2.string().regex(/^\\d+ \\d+ \\d+ \\* \\* \\*$/) })).mutation(async ({ ctx, input }) => {
        const deviceId = cleanText(input.deviceId, 96);
        requireActor(ctx, deviceId);
        if (isLocalRuntime()) throw new TRPCError4({ code: "BAD_REQUEST", message: "\u0627\u0644\u062C\u062F\u0648\u0644\u0629 \u0645\u062A\u0627\u062D\u0629 \u0628\u0639\u062F \u0646\u0634\u0631 \u0627\u0644\u0646\u0633\u062E\u0629 \u0627\u0644\u0633\u062D\u0627\u0628\u064A\u0629." });
        const roomId = validRoomId(input.roomId);
        const current = await getRetentionPolicy2(roomId);
        const sessionToken = parseCookie(ctx.req.headers.cookie ?? "")[COOKIE_NAME] ?? "";
        const job = current.scheduleCronTaskUid ? await updateHeartbeatJob(current.scheduleCronTaskUid, { cron: input.cron, path: "/api/scheduled/qareeb-retention", description: `Qareeb retention cleanup for ${roomId}`, enable: true }, sessionToken).then((result) => ({ taskUid: current.scheduleCronTaskUid, ...result })) : await createHeartbeatJob({ name: `qareeb-retention-${roomId}`, cron: input.cron, path: "/api/scheduled/qareeb-retention", description: `Qareeb retention cleanup for ${roomId}` }, sessionToken);
        return saveRetentionPolicy2({ roomId, updatedBy: deviceId, messageRetentionDays: current.messageRetentionDays, fileRetentionDays: current.fileRetentionDays, adminActivityRetentionDays: current.adminActivityRetentionDays, scheduleCronTaskUid: job.taskUid });
      })
    }),
    analytics: router({
      room: qareebProcedure.input(z2.object({ roomId: roomIdInput, deviceId: deviceIdInput })).query(({ ctx, input }) => {
        const deviceId = cleanText(input.deviceId, 96);
        requireActor(ctx, deviceId);
        return getRoomAnalytics2({ roomId: validRoomId(input.roomId), actorId: deviceId });
      }),
      global: qareebProcedure.query(({ ctx }) => {
        requireAdmin(ctx);
        return getGlobalAnalytics2();
      })
    }),
    backup: router({
      list: qareebProcedure.input(z2.object({ roomId: roomIdInput, deviceId: deviceIdInput })).query(({ ctx, input }) => {
        const deviceId = cleanText(input.deviceId, 96);
        requireActor(ctx, deviceId);
        return listBackupManifests2({ createdBy: deviceId, scopeId: validRoomId(input.roomId) });
      }),
      create: qareebProcedure.input(z2.object({ roomId: roomIdInput, deviceId: deviceIdInput, retentionDays: z2.number().min(1).max(3650).optional() })).mutation(async ({ ctx, input }) => {
        const deviceId = cleanText(input.deviceId, 96);
        requireActor(ctx, deviceId);
        const roomId = validRoomId(input.roomId);
        await enforceRateLimit(`${deviceId}:backups:${roomId}`, "create", 3);
        const snapshot = await getRoomBackupData2({ roomId, actorId: deviceId });
        const payload = Buffer.from(JSON.stringify(snapshot), "utf8");
        const stored = await storagePut(`qareeb/backups/${roomId}/${Date.now()}.json`, payload, "application/json");
        const days = input.retentionDays ?? 90;
        return recordBackupManifest2({ scopeType: "room", scopeId: roomId, createdBy: deviceId, storageKey: stored.key, storageUrl: stored.url, sizeBytes: payload.byteLength, expiresAt: new Date(Date.now() + days * 864e5) });
      }),
      restore: qareebProcedure.input(z2.object({ roomId: roomIdInput, deviceId: deviceIdInput, backupId: z2.string().min(1).max(96) })).mutation(async ({ ctx, input }) => {
        const deviceId = cleanText(input.deviceId, 96);
        requireActor(ctx, deviceId);
        const roomId = validRoomId(input.roomId);
        const manifests = await listBackupManifests2({ createdBy: deviceId, scopeId: roomId });
        const manifest = manifests.find((item) => item.id === input.backupId);
        if (!manifest) throw new TRPCError4({ code: "NOT_FOUND", message: "\u0627\u0644\u0646\u0633\u062E\u0629 \u0627\u0644\u0627\u062D\u062A\u064A\u0627\u0637\u064A\u0629 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F\u0629 \u0623\u0648 \u0644\u0627 \u062A\u062E\u0635\u0643." });
        const signedUrl = await storageGetSignedUrl(manifest.storageKey);
        const response = await fetch(signedUrl);
        if (!response.ok) throw new TRPCError4({ code: "INTERNAL_SERVER_ERROR", message: "\u062A\u0639\u0630\u0631 \u0642\u0631\u0627\u0621\u0629 \u0627\u0644\u0646\u0633\u062E\u0629 \u0627\u0644\u0627\u062D\u062A\u064A\u0627\u0637\u064A\u0629." });
        const payload = await response.json();
        return restoreRoomBackup2({ roomId, actorId: deviceId, payload });
      })
    }),
    uploads: router({
      start: qareebProcedure.input(z2.object({ deviceId: deviceIdInput, scopeType: z2.enum(["room", "direct", "avatar"]), scopeId: z2.string().min(1).max(64), fileName: z2.string().min(1).max(120), mimeType: z2.string().max(100), totalBytes: z2.number().int().min(1).max(5e7) })).mutation(async ({ ctx, input }) => {
        const deviceId = cleanText(input.deviceId, 96);
        requireActor(ctx, deviceId);
        await enforceRateLimit(`${deviceId}:uploads`, "start", 20);
        return createUploadSession2({ ownerId: deviceId, scopeType: input.scopeType, scopeId: input.scopeId, fileName: safeFileName(input.fileName), mimeType: input.mimeType, totalBytes: input.totalBytes });
      }),
      update: qareebProcedure.input(z2.object({ deviceId: deviceIdInput, sessionId: z2.string().min(1).max(120), receivedBytes: z2.number().int().min(0), storageKey: z2.string().max(512).nullable().optional(), status: z2.enum(["uploading", "complete", "aborted"]) })).mutation(({ ctx, input }) => {
        const deviceId = cleanText(input.deviceId, 96);
        requireActor(ctx, deviceId);
        return updateUploadSession2({ id: input.sessionId, ownerId: deviceId, receivedBytes: input.receivedBytes, storageKey: input.storageKey, status: input.status });
      }),
      append: qareebProcedure.input(z2.object({ deviceId: deviceIdInput, sessionId: z2.string().min(1).max(120), chunkIndex: z2.number().int().min(0).max(1e5), dataUrl: z2.string().max(21e5) })).mutation(async ({ ctx, input }) => {
        const deviceId = cleanText(input.deviceId, 96);
        requireActor(ctx, deviceId);
        await enforceRateLimit(`${deviceId}:uploads:${input.sessionId}`, "chunk", 2e3);
        return appendUploadChunk2({ id: input.sessionId, ownerId: deviceId, chunkIndex: input.chunkIndex, dataUrl: input.dataUrl });
      }),
      finalize: qareebProcedure.input(z2.object({ deviceId: deviceIdInput, sessionId: z2.string().min(1).max(120) })).mutation(({ ctx, input }) => {
        const deviceId = cleanText(input.deviceId, 96);
        requireActor(ctx, deviceId);
        return finalizeUploadSession2({ id: input.sessionId, ownerId: deviceId });
      })
    }),
    snapshot: qareebProcedure.input(z2.object({ roomId: roomIdInput, deviceId: deviceIdInput })).query(({ ctx, input }) => {
      const deviceId = cleanText(input.deviceId, 96);
      requireActor(ctx, deviceId);
      return getRoomSnapshot3(validRoomId(input.roomId));
    }),
    join: qareebProcedure.input(z2.object({ roomId: roomIdInput, deviceId: deviceIdInput, name: z2.string().max(80), color: z2.string().max(20) })).mutation(
      ({ input }) => joinRoom3({ roomId: validRoomId(input.roomId), deviceId: cleanText(input.deviceId, 96), name: cleanText(input.name, 40) || "\u0632\u0627\u0626\u0631", color: safeColor(input.color) })
    ),
    sendMessage: qareebProcedure.input(z2.object({
      roomId: roomIdInput,
      senderId: deviceIdInput,
      senderName: z2.string().max(80),
      senderColor: z2.string().max(20),
      text: z2.string().max(MAX_MESSAGE_LENGTH),
      replyToId: z2.string().min(1).max(64).nullable().optional(),
      attachment: attachmentInput.optional()
    })).mutation(async ({ ctx, input }) => {
      requireActor(ctx, cleanText(input.senderId, 96));
      const roomId = validRoomId(input.roomId);
      const text2 = cleanText(input.text, MAX_MESSAGE_LENGTH);
      const attachment = input.attachment ? await storeAttachment(input.attachment, `qareeb/${roomId}`) : void 0;
      if (!text2 && !attachment) throw new Error("\u0627\u0643\u062A\u0628 \u0631\u0633\u0627\u0644\u0629 \u0623\u0648 \u0627\u062E\u062A\u0631 \u0645\u0644\u0641\u064B\u0627 \u0644\u0625\u0631\u0633\u0627\u0644\u0647.");
      const senderId = cleanText(input.senderId, 96);
      await enforceRateLimit(`${senderId}:room:${roomId}`, "message", 30);
      await rejectRecentDuplicateMessage2({ scopeType: "room", scopeId: roomId, actorId: senderId, text: text2 });
      const result = await addMessage3({ roomId, senderId, senderName: cleanText(input.senderName, 40) || "\u0632\u0627\u0626\u0631", senderColor: safeColor(input.senderColor), text: text2, replyToId: input.replyToId ?? null, attachment });
      if (!isLocalRuntime()) await notifyMentionedUsers2({ actorId: senderId, text: text2, roomId, messageId: result.messages.at(-1)?.id ?? null });
      return result;
    }),
    edit: qareebProcedure.input(z2.object({ roomId: roomIdInput, messageId: z2.string().min(1).max(64), deviceId: deviceIdInput, text: z2.string().max(MAX_MESSAGE_LENGTH) })).mutation(({ ctx, input }) => {
      const deviceId = cleanText(input.deviceId, 96);
      requireActor(ctx, deviceId);
      return editRoomMessage2({ roomId: validRoomId(input.roomId), messageId: cleanText(input.messageId, 64), senderId: deviceId, text: cleanText(input.text, MAX_MESSAGE_LENGTH) });
    }),
    delete: qareebProcedure.input(z2.object({ roomId: roomIdInput, messageId: z2.string().min(1).max(64), deviceId: deviceIdInput })).mutation(({ ctx, input }) => {
      const deviceId = cleanText(input.deviceId, 96);
      requireActor(ctx, deviceId);
      return deleteRoomMessage2({ roomId: validRoomId(input.roomId), messageId: cleanText(input.messageId, 64), actorId: deviceId });
    }),
    togglePin: qareebProcedure.input(z2.object({ roomId: roomIdInput, messageId: z2.string().min(1).max(64), deviceId: deviceIdInput })).mutation(({ ctx, input }) => {
      const deviceId = cleanText(input.deviceId, 96);
      requireActor(ctx, deviceId);
      return toggleRoomMessagePin2({ roomId: validRoomId(input.roomId), messageId: cleanText(input.messageId, 64), actorId: deviceId });
    }),
    pins: qareebProcedure.input(z2.object({ roomId: roomIdInput, deviceId: deviceIdInput })).query(({ ctx, input }) => {
      const deviceId = cleanText(input.deviceId, 96);
      requireActor(ctx, deviceId);
      return listMessagePins2({ scopeType: "room", scopeId: validRoomId(input.roomId), actorId: deviceId });
    }),
    receipt: qareebProcedure.input(z2.object({ roomId: roomIdInput, messageId: z2.string().min(1).max(64), deviceId: deviceIdInput, status: z2.enum(["sent", "delivered", "read"]) })).mutation(({ ctx, input }) => {
      const deviceId = cleanText(input.deviceId, 96);
      requireActor(ctx, deviceId);
      return markMessageReceipt2({ scopeType: "room", scopeId: validRoomId(input.roomId), messageId: cleanText(input.messageId, 64), readerId: deviceId, status: input.status });
    }),
    receipts: qareebProcedure.input(z2.object({ roomId: roomIdInput, messageId: z2.string().min(1).max(64), deviceId: deviceIdInput })).query(({ ctx, input }) => {
      const deviceId = cleanText(input.deviceId, 96);
      requireActor(ctx, deviceId);
      return listMessageReceipts2({ scopeType: "room", scopeId: validRoomId(input.roomId), messageId: cleanText(input.messageId, 64), readerId: deviceId });
    }),
    react: qareebProcedure.input(z2.object({ roomId: roomIdInput, deviceId: deviceIdInput, messageId: z2.string().min(1).max(64), emoji: z2.string().min(1).max(16) })).mutation(({ ctx, input }) => {
      requireActor(ctx, cleanText(input.deviceId, 96));
      return toggleRoomMessageReaction3({ roomId: validRoomId(input.roomId), deviceId: cleanText(input.deviceId, 96), messageId: cleanText(input.messageId, 64), emoji: input.emoji });
    }),
    reset: qareebProcedure.input(z2.object({ roomId: roomIdInput, deviceId: deviceIdInput })).mutation(({ input }) => roomManagement(
      validRoomId(input.roomId),
      () => resetRoom3({ roomId: validRoomId(input.roomId), deviceId: cleanText(input.deviceId, 96) })
    )),
    files: qareebProcedure.input(z2.object({ roomId: roomIdInput, deviceId: deviceIdInput })).query(({ ctx, input }) => {
      requireActor(ctx, cleanText(input.deviceId, 96));
      return listRoomFiles3(validRoomId(input.roomId));
    }),
    setPin: qareebProcedure.input(z2.object({ roomId: roomIdInput, deviceId: deviceIdInput, messageId: z2.string().min(1).max(64).nullable() })).mutation(async ({ input }) => {
      return roomManagement(validRoomId(input.roomId), () => setRoomPin3({ roomId: validRoomId(input.roomId), deviceId: cleanText(input.deviceId, 96), messageId: input.messageId }));
    }),
    rename: qareebProcedure.input(z2.object({ roomId: roomIdInput, deviceId: deviceIdInput, name: z2.string().max(120) })).mutation(({ input }) => roomManagement(validRoomId(input.roomId), () => {
      const name = cleanText(input.name, 80);
      if (!name) throw new Error("\u0627\u0643\u062A\u0628 \u0627\u0633\u0645\u064B\u0627 \u0635\u0627\u0644\u062D\u064B\u0627 \u0644\u0644\u063A\u0631\u0641\u0629.");
      return updateRoomName3({ roomId: validRoomId(input.roomId), deviceId: cleanText(input.deviceId, 96), name });
    })),
    setMemberBan: qareebProcedure.input(z2.object({ roomId: roomIdInput, deviceId: deviceIdInput, targetDeviceId: deviceIdInput, isBanned: z2.boolean() })).mutation(({ input }) => roomManagement(
      validRoomId(input.roomId),
      () => setRoomMemberBan3({ roomId: validRoomId(input.roomId), deviceId: cleanText(input.deviceId, 96), targetDeviceId: cleanText(input.targetDeviceId, 96), isBanned: input.isBanned })
    )),
    permissions: qareebProcedure.input(z2.object({ roomId: roomIdInput, deviceId: deviceIdInput })).query(
      ({ input }) => getRoomActorPermissions3({ roomId: validRoomId(input.roomId), deviceId: cleanText(input.deviceId, 96) })
    ),
    moderators: qareebProcedure.input(z2.object({ roomId: roomIdInput, deviceId: deviceIdInput })).query(({ input }) => roomManagement(
      () => listRoomModerators3({ roomId: validRoomId(input.roomId), deviceId: cleanText(input.deviceId, 96) })
    )),
    setModerator: qareebProcedure.input(z2.object({
      roomId: roomIdInput,
      deviceId: deviceIdInput,
      targetDeviceId: deviceIdInput,
      isModerator: z2.boolean(),
      permissions: z2.object({ canPin: z2.boolean(), canRename: z2.boolean(), canManageMembers: z2.boolean(), canClearMessages: z2.boolean(), canViewActivity: z2.boolean() })
    })).mutation(({ input }) => roomManagement(validRoomId(input.roomId), () => setRoomModerator3({
      roomId: validRoomId(input.roomId),
      deviceId: cleanText(input.deviceId, 96),
      targetDeviceId: cleanText(input.targetDeviceId, 96),
      isModerator: input.isModerator,
      permissions: input.permissions
    }))),
    activity: qareebProcedure.input(z2.object({ roomId: roomIdInput, deviceId: deviceIdInput })).query(({ input }) => roomManagement(
      () => listRoomAdminActivity3({ roomId: validRoomId(input.roomId), deviceId: cleanText(input.deviceId, 96) })
    )),
    notifications: qareebProcedure.input(z2.object({ roomId: roomIdInput, deviceId: deviceIdInput })).query(
      ({ input }) => listRoomNotifications3({ roomId: validRoomId(input.roomId), deviceId: cleanText(input.deviceId, 96) })
    ),
    markNotificationRead: qareebProcedure.input(z2.object({ roomId: roomIdInput, deviceId: deviceIdInput, notificationId: z2.string().max(100).optional() })).mutation(
      ({ input }) => markRoomNotificationRead3({ roomId: validRoomId(input.roomId), deviceId: cleanText(input.deviceId, 96), notificationId: input.notificationId })
    ),
    moderatorInvites: qareebProcedure.input(z2.object({ roomId: roomIdInput, deviceId: deviceIdInput })).query(({ input }) => roomManagement(
      () => listModeratorInvitations3({ roomId: validRoomId(input.roomId), deviceId: cleanText(input.deviceId, 96) })
    )),
    inviteModerator: qareebProcedure.input(z2.object({
      roomId: roomIdInput,
      deviceId: deviceIdInput,
      targetDeviceId: deviceIdInput,
      permissions: z2.object({ canPin: z2.boolean(), canRename: z2.boolean(), canManageMembers: z2.boolean(), canClearMessages: z2.boolean(), canViewActivity: z2.boolean() })
    })).mutation(({ input }) => roomManagement(validRoomId(input.roomId), () => createModeratorInvitation3({
      roomId: validRoomId(input.roomId),
      deviceId: cleanText(input.deviceId, 96),
      targetDeviceId: cleanText(input.targetDeviceId, 96),
      permissions: input.permissions
    }))),
    respondModeratorInvite: qareebProcedure.input(z2.object({ roomId: roomIdInput, deviceId: deviceIdInput, inviteId: z2.string().max(120), approve: z2.boolean() })).mutation(({ input }) => roomManagement(
      validRoomId(input.roomId),
      () => respondModeratorInvitation3({ roomId: validRoomId(input.roomId), deviceId: cleanText(input.deviceId, 96), inviteId: cleanText(input.inviteId, 120), approve: input.approve })
    )),
    cancelModeratorInvite: qareebProcedure.input(z2.object({ roomId: roomIdInput, deviceId: deviceIdInput, inviteId: z2.string().max(120) })).mutation(({ input }) => roomManagement(
      validRoomId(input.roomId),
      () => cancelModeratorInvitation3({ roomId: validRoomId(input.roomId), deviceId: cleanText(input.deviceId, 96), inviteId: cleanText(input.inviteId, 120) })
    )),
    exportActivity: qareebProcedure.input(z2.object({ roomId: roomIdInput, deviceId: deviceIdInput })).query(({ input }) => roomManagement(
      () => exportRoomAdminActivity3({ roomId: validRoomId(input.roomId), deviceId: cleanText(input.deviceId, 96) })
    ))
  }),
  direct: router({
    list: qareebProcedure.input(z2.object({ deviceId: deviceIdInput })).query(({ input }) => listDirectConversations3(cleanText(input.deviceId, 96))),
    start: qareebProcedure.input(z2.object({
      roomId: roomIdInput,
      deviceId: deviceIdInput,
      name: z2.string().max(80),
      color: z2.string().max(20),
      peerId: deviceIdInput
    })).mutation(({ input }) => startDirectConversation3({
      roomId: validRoomId(input.roomId),
      deviceId: cleanText(input.deviceId, 96),
      name: cleanText(input.name, 40) || "\u0632\u0627\u0626\u0631",
      color: safeColor(input.color),
      peerId: cleanText(input.peerId, 96)
    })),
    snapshot: qareebProcedure.input(z2.object({ conversationId: z2.string().min(1).max(64), deviceId: deviceIdInput })).query(
      ({ input }) => getDirectSnapshot3({ conversationId: input.conversationId, deviceId: cleanText(input.deviceId, 96) })
    ),
    sendMessage: qareebProcedure.input(z2.object({
      conversationId: z2.string().min(1).max(64),
      senderId: deviceIdInput,
      senderName: z2.string().max(80),
      senderColor: z2.string().max(20),
      text: z2.string().max(MAX_MESSAGE_LENGTH),
      replyToId: z2.string().min(1).max(64).nullable().optional(),
      attachment: attachmentInput.optional()
    })).mutation(async ({ ctx, input }) => {
      requireActor(ctx, cleanText(input.senderId, 96));
      const text2 = cleanText(input.text, MAX_MESSAGE_LENGTH);
      await requireDirectMessagingPermission(input.conversationId, cleanText(input.senderId, 96));
      const attachment = input.attachment ? await storeAttachment(input.attachment, `qareeb/direct/${input.conversationId}`) : void 0;
      if (!text2 && !attachment) throw new Error("\u0627\u0643\u062A\u0628 \u0631\u0633\u0627\u0644\u0629 \u0623\u0648 \u0627\u062E\u062A\u0631 \u0645\u0644\u0641\u064B\u0627 \u0644\u0625\u0631\u0633\u0627\u0644\u0647.");
      const senderId = cleanText(input.senderId, 96);
      await enforceRateLimit(`${senderId}:direct:${input.conversationId}`, "message", 40);
      await rejectRecentDuplicateMessage2({ scopeType: "direct", scopeId: input.conversationId, actorId: senderId, text: text2 });
      const result = await addDirectMessage3({ conversationId: input.conversationId, senderId, senderName: cleanText(input.senderName, 40) || "\u0632\u0627\u0626\u0631", senderColor: safeColor(input.senderColor), text: text2, replyToId: input.replyToId ?? null, attachment });
      if (!isLocalRuntime()) await notifyMentionedUsers2({ actorId: senderId, text: text2, conversationId: input.conversationId, messageId: result.messages.at(-1)?.id ?? null });
      return result;
    }),
    edit: qareebProcedure.input(z2.object({ conversationId: z2.string().min(1).max(64), messageId: z2.string().min(1).max(64), deviceId: deviceIdInput, text: z2.string().max(MAX_MESSAGE_LENGTH) })).mutation(({ ctx, input }) => {
      const deviceId = cleanText(input.deviceId, 96);
      requireActor(ctx, deviceId);
      return editDirectMessage2({ conversationId: input.conversationId, messageId: cleanText(input.messageId, 64), senderId: deviceId, text: cleanText(input.text, MAX_MESSAGE_LENGTH) });
    }),
    delete: qareebProcedure.input(z2.object({ conversationId: z2.string().min(1).max(64), messageId: z2.string().min(1).max(64), deviceId: deviceIdInput })).mutation(({ ctx, input }) => {
      const deviceId = cleanText(input.deviceId, 96);
      requireActor(ctx, deviceId);
      return deleteDirectMessage2({ conversationId: input.conversationId, messageId: cleanText(input.messageId, 64), actorId: deviceId });
    }),
    togglePin: qareebProcedure.input(z2.object({ conversationId: z2.string().min(1).max(64), messageId: z2.string().min(1).max(64), deviceId: deviceIdInput })).mutation(({ ctx, input }) => {
      const deviceId = cleanText(input.deviceId, 96);
      requireActor(ctx, deviceId);
      return toggleDirectMessagePin2({ conversationId: input.conversationId, messageId: cleanText(input.messageId, 64), actorId: deviceId });
    }),
    pins: qareebProcedure.input(z2.object({ conversationId: z2.string().min(1).max(64), deviceId: deviceIdInput })).query(({ ctx, input }) => {
      const deviceId = cleanText(input.deviceId, 96);
      requireActor(ctx, deviceId);
      return listMessagePins2({ scopeType: "direct", scopeId: input.conversationId, actorId: deviceId });
    }),
    receipt: qareebProcedure.input(z2.object({ conversationId: z2.string().min(1).max(64), messageId: z2.string().min(1).max(64), deviceId: deviceIdInput, status: z2.enum(["sent", "delivered", "read"]) })).mutation(({ ctx, input }) => {
      const deviceId = cleanText(input.deviceId, 96);
      requireActor(ctx, deviceId);
      return markMessageReceipt2({ scopeType: "direct", scopeId: input.conversationId, messageId: cleanText(input.messageId, 64), readerId: deviceId, status: input.status });
    }),
    receipts: qareebProcedure.input(z2.object({ conversationId: z2.string().min(1).max(64), messageId: z2.string().min(1).max(64), deviceId: deviceIdInput })).query(({ ctx, input }) => {
      const deviceId = cleanText(input.deviceId, 96);
      requireActor(ctx, deviceId);
      return listMessageReceipts2({ scopeType: "direct", scopeId: input.conversationId, messageId: cleanText(input.messageId, 64), readerId: deviceId });
    }),
    react: qareebProcedure.input(z2.object({ conversationId: z2.string().min(1).max(64), deviceId: deviceIdInput, messageId: z2.string().min(1).max(64), emoji: z2.string().min(1).max(16) })).mutation(({ ctx, input }) => {
      requireActor(ctx, cleanText(input.deviceId, 96));
      return toggleDirectMessageReaction3({ conversationId: input.conversationId, deviceId: cleanText(input.deviceId, 96), messageId: cleanText(input.messageId, 64), emoji: input.emoji });
    }),
    files: qareebProcedure.input(z2.object({ conversationId: z2.string().min(1).max(64), deviceId: deviceIdInput })).query(
      ({ input }) => listDirectFiles3({ conversationId: input.conversationId, deviceId: cleanText(input.deviceId, 96) })
    ),
    setPreferences: qareebProcedure.input(z2.object({
      conversationId: z2.string().min(1).max(64),
      deviceId: deviceIdInput,
      isMuted: z2.boolean(),
      isBlocked: z2.boolean()
    })).mutation(({ input }) => setDirectConversationPreferences3({
      conversationId: input.conversationId,
      deviceId: cleanText(input.deviceId, 96),
      isMuted: input.isMuted,
      isBlocked: input.isBlocked
    })),
    markRead: qareebProcedure.input(z2.object({ conversationId: z2.string().min(1).max(64), deviceId: deviceIdInput })).mutation(
      ({ input }) => markDirectConversationRead3({ conversationId: input.conversationId, deviceId: cleanText(input.deviceId, 96) })
    ),
    iceServers: qareebProcedure.input(z2.object({ conversationId: z2.string().min(1).max(64), deviceId: deviceIdInput })).query(async ({ input }) => {
      await getDirectPeerIdForMember3(input.conversationId, cleanText(input.deviceId, 96));
      return { iceServers: getIceServers() };
    }),
    calls: qareebProcedure.input(z2.object({ conversationId: z2.string().min(1).max(64), deviceId: deviceIdInput })).query(
      ({ input }) => listDirectCallLogs3({ conversationId: input.conversationId, deviceId: cleanText(input.deviceId, 96) })
    ),
    startCall: qareebProcedure.input(z2.object({ conversationId: z2.string().min(1).max(64), deviceId: deviceIdInput, callType: z2.enum(["audio", "video"]) })).mutation(
      ({ input }) => startDirectCall3({ conversationId: input.conversationId, deviceId: cleanText(input.deviceId, 96), callType: input.callType })
    ),
    updateCall: qareebProcedure.input(z2.object({
      callId: z2.string().min(1).max(64),
      conversationId: z2.string().min(1).max(64),
      deviceId: deviceIdInput,
      status: z2.enum(["accepted", "missed", "rejected", "ended", "failed"])
    })).mutation(({ input }) => updateDirectCall3({
      callId: input.callId,
      conversationId: input.conversationId,
      deviceId: cleanText(input.deviceId, 96),
      status: input.status
    })),
    deleteCall: qareebProcedure.input(z2.object({
      callId: z2.string().min(1).max(64),
      conversationId: z2.string().min(1).max(64),
      deviceId: deviceIdInput
    })).mutation(({ input }) => deleteDirectCall3({
      callId: input.callId,
      conversationId: input.conversationId,
      deviceId: cleanText(input.deviceId, 96)
    })),
    clearCalls: qareebProcedure.input(z2.object({
      conversationId: z2.string().min(1).max(64),
      deviceId: deviceIdInput
    })).mutation(({ input }) => clearDirectCallLogs3({
      conversationId: input.conversationId,
      deviceId: cleanText(input.deviceId, 96)
    }))
  })
});

// server/_core/context.ts
async function createContext(opts) {
  let user = null;
  try {
    const localMode2 = process.env.LOCAL_MODE === "true" || !process.env.DATABASE_URL && process.env.NODE_ENV !== "production";
    user = localMode2 ? null : await sdk.authenticateRequest(opts.req);
  } catch (error) {
    user = null;
  }
  return {
    req: opts.req,
    res: opts.res,
    user
  };
}

// server/_core/vite.ts
import express from "express";
import fs2 from "fs";
import { nanoid } from "nanoid";
import path4 from "path";
import { createServer as createViteServer } from "vite";

// vite.config.ts
import { jsxLocPlugin } from "@builder.io/vite-plugin-jsx-loc";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path3 from "node:path";
import { defineConfig } from "vite";
import { vitePluginManusRuntime } from "vite-plugin-manus-runtime";
var PROJECT_ROOT = import.meta.dirname;
var LOG_DIR = path3.join(PROJECT_ROOT, ".manus-logs");
var MAX_LOG_SIZE_BYTES = 1 * 1024 * 1024;
var TRIM_TARGET_BYTES = Math.floor(MAX_LOG_SIZE_BYTES * 0.6);
function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}
function trimLogFile(logPath, maxSize) {
  try {
    if (!fs.existsSync(logPath) || fs.statSync(logPath).size <= maxSize) {
      return;
    }
    const lines = fs.readFileSync(logPath, "utf-8").split("\n");
    const keptLines = [];
    let keptBytes = 0;
    const targetSize = TRIM_TARGET_BYTES;
    for (let i = lines.length - 1; i >= 0; i--) {
      const lineBytes = Buffer.byteLength(`${lines[i]}
`, "utf-8");
      if (keptBytes + lineBytes > targetSize) break;
      keptLines.unshift(lines[i]);
      keptBytes += lineBytes;
    }
    fs.writeFileSync(logPath, keptLines.join("\n"), "utf-8");
  } catch {
  }
}
function writeToLogFile(source, entries) {
  if (entries.length === 0) return;
  ensureLogDir();
  const logPath = path3.join(LOG_DIR, `${source}.log`);
  const lines = entries.map((entry) => {
    const ts = (/* @__PURE__ */ new Date()).toISOString();
    return `[${ts}] ${JSON.stringify(entry)}`;
  });
  fs.appendFileSync(logPath, `${lines.join("\n")}
`, "utf-8");
  trimLogFile(logPath, MAX_LOG_SIZE_BYTES);
}
function vitePluginManusDebugCollector() {
  return {
    name: "manus-debug-collector",
    transformIndexHtml(html) {
      if (process.env.NODE_ENV === "production") {
        return html;
      }
      return {
        html,
        tags: [
          {
            tag: "script",
            attrs: {
              src: "/__manus__/debug-collector.js",
              defer: true
            },
            injectTo: "head"
          }
        ]
      };
    },
    configureServer(server) {
      server.middlewares.use("/__manus__/logs", (req, res, next) => {
        if (req.method !== "POST") {
          return next();
        }
        const handlePayload = (payload) => {
          if (payload.consoleLogs?.length > 0) {
            writeToLogFile("browserConsole", payload.consoleLogs);
          }
          if (payload.networkRequests?.length > 0) {
            writeToLogFile("networkRequests", payload.networkRequests);
          }
          if (payload.sessionEvents?.length > 0) {
            writeToLogFile("sessionReplay", payload.sessionEvents);
          }
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true }));
        };
        const reqBody = req.body;
        if (reqBody && typeof reqBody === "object") {
          try {
            handlePayload(reqBody);
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: String(e) }));
          }
          return;
        }
        let body = "";
        req.on("data", (chunk) => {
          body += chunk.toString();
        });
        req.on("end", () => {
          try {
            const payload = JSON.parse(body);
            handlePayload(payload);
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: String(e) }));
          }
        });
      });
    }
  };
}
var plugins = [react(), tailwindcss(), jsxLocPlugin(), vitePluginManusRuntime(), vitePluginManusDebugCollector()];
var vite_config_default = defineConfig({
  plugins,
  resolve: {
    alias: {
      "@": path3.resolve(import.meta.dirname, "client", "src"),
      "@shared": path3.resolve(import.meta.dirname, "shared"),
      "@assets": path3.resolve(import.meta.dirname, "attached_assets")
    }
  },
  envDir: path3.resolve(import.meta.dirname),
  root: path3.resolve(import.meta.dirname, "client"),
  publicDir: path3.resolve(import.meta.dirname, "client", "public"),
  build: {
    outDir: path3.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          "framework": ["react", "react-dom", "wouter"],
          "data-client": ["@tanstack/react-query", "@trpc/client", "@trpc/react-query", "superjson"],
          "realtime": ["socket.io-client"],
          "interface": ["lucide-react", "sonner"]
        }
      }
    }
  },
  server: {
    host: true,
    allowedHosts: [
      ".manuspre.computer",
      ".manus.computer",
      ".manus-asia.computer",
      ".manuscomputer.ai",
      ".manusvm.computer",
      "localhost",
      "127.0.0.1"
    ],
    fs: {
      strict: true,
      deny: ["**/.*"]
    }
  }
});

// server/_core/vite.ts
async function setupVite(app, server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true
  };
  const vite = await createViteServer({
    ...vite_config_default,
    configFile: false,
    server: serverOptions,
    appType: "custom"
  });
  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    try {
      const clientTemplate = path4.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );
      let template = await fs2.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e);
      next(e);
    }
  });
}
function serveStatic(app) {
  const distPath = process.env.NODE_ENV === "development" ? path4.resolve(import.meta.dirname, "../..", "dist", "public") : path4.resolve(import.meta.dirname, "public");
  if (!fs2.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }
  app.use(express.static(distPath));
  app.use("*", (_req, res) => {
    res.sendFile(path4.resolve(distPath, "index.html"));
  });
}

// server/_core/index.ts
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}
async function findAvailablePort(startPort = 3e3) {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}
async function startServer() {
  const app = express2();
  const localMode2 = process.env.LOCAL_MODE === "true" || !process.env.DATABASE_URL && process.env.NODE_ENV !== "production";
  const certPath = process.env.LOCAL_HTTPS_CERT;
  const keyPath = process.env.LOCAL_HTTPS_KEY;
  const useLocalHttps = localMode2 && Boolean(certPath && keyPath);
  const server = useLocalHttps ? createHttpsServer({ cert: readFileSync(certPath), key: readFileSync(keyPath) }, app) : createHttpServer(app);
  registerRealtimeServer(server);
  app.use(express2.json({ limit: "50mb" }));
  app.use(express2.urlencoded({ limit: "50mb", extended: true }));
  if (!localMode2) {
    registerStorageProxy(app);
    registerOAuthRoutes(app);
  } else {
    app.use("/local-files", express2.static(LOCAL_STORAGE_DIR));
  }
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext
    })
  );
  app.post("/api/scheduled/qareeb-retention", async (req, res) => {
    try {
      const user = await sdk.authenticateRequest(req);
      if (!user.isCron || !user.taskUid) return res.status(403).json({ error: "cron-only" });
      const result = await runRetentionCleanup2({ scheduleCronTaskUid: user.taskUid });
      return res.json({ ok: true, ...result });
    } catch (error) {
      return res.status(500).json({ error: error instanceof Error ? error.message : String(error), context: { url: req.originalUrl }, timestamp: (/* @__PURE__ */ new Date()).toISOString() });
    }
  });
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }
  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);
  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }
  server.listen(port, "0.0.0.0", () => {
    const protocol = useLocalHttps ? "https" : "http";
    console.log(`Qareeb LAN server running on ${protocol}://0.0.0.0:${port}/`);
    console.log(`Local data: ${process.env.QAREEB_DATA_DIR || ".qareeb-data"}`);
  });
}
startServer().catch(console.error);

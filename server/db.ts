import * as local from "./localDb";
import * as mysql from "./mysqlDb";
import * as advanced from "./advancedDb";

export type RoomSnapshot = local.RoomSnapshot;
export type RoomModeratorPermissions = local.RoomModeratorPermissions;
export type RoomActorPermissions = local.RoomActorPermissions;
export type RoomModerator = local.RoomModerator;
export type RoomAdminActivity = local.RoomAdminActivity;
export type RoomModeratorInvite = local.RoomModeratorInvite;
export type RoomNotification = local.RoomNotification;
export type FileAttachment = local.FileAttachment;
export type DirectConversationSummary = local.DirectConversationSummary;
export type DirectSnapshot = local.DirectSnapshot;
export type DirectCallType = local.DirectCallType;
export type DirectCallStatus = local.DirectCallStatus;
export type DirectCallLog = local.DirectCallLog;

export const isLocalMode = process.env.LOCAL_MODE === "true" || (!process.env.DATABASE_URL && process.env.NODE_ENV !== "production");

export async function getDb() { return isLocalMode ? null : mysql.getDb(); }
export async function ensureRoom(roomId: string) { return isLocalMode ? local.ensureRoom(roomId) : mysql.ensureRoom(roomId); }
export async function joinRoom(input: Parameters<typeof local.joinRoom>[0]) { return isLocalMode ? local.joinRoom(input) : mysql.joinRoom(input); }
export async function getRoomSnapshot(roomId: string): Promise<RoomSnapshot> { return isLocalMode ? local.getRoomSnapshot(roomId) : mysql.getRoomSnapshot(roomId) as Promise<RoomSnapshot>; }
export async function getRoomActorPermissions(input: Parameters<typeof local.getRoomActorPermissions>[0]): Promise<RoomActorPermissions> { return isLocalMode ? local.getRoomActorPermissions(input) : mysql.getRoomActorPermissions(input) as Promise<RoomActorPermissions>; }
export async function setRoomPin(input: Parameters<typeof local.setRoomPin>[0]) { return isLocalMode ? local.setRoomPin(input) : mysql.setRoomPin(input); }
export async function updateRoomName(input: Parameters<typeof local.updateRoomName>[0]) { return isLocalMode ? local.updateRoomName(input) : mysql.updateRoomName(input); }
export async function setRoomMemberBan(input: Parameters<typeof local.setRoomMemberBan>[0]) { return isLocalMode ? local.setRoomMemberBan(input) : mysql.setRoomMemberBan(input); }
export async function listRoomModerators(input: Parameters<typeof local.listRoomModerators>[0]): Promise<RoomModerator[]> { return isLocalMode ? local.listRoomModerators(input) : mysql.listRoomModerators(input) as Promise<RoomModerator[]>; }
export async function setRoomModerator(input: Parameters<typeof local.setRoomModerator>[0]) { return isLocalMode ? local.setRoomModerator(input) : mysql.setRoomModerator(input); }
export async function listRoomAdminActivity(input: Parameters<typeof local.listRoomAdminActivity>[0]): Promise<RoomAdminActivity[]> { return isLocalMode ? local.listRoomAdminActivity(input) : mysql.listRoomAdminActivity(input) as Promise<RoomAdminActivity[]>; }
export async function addMessage(input: Parameters<typeof local.addMessage>[0]) { return isLocalMode ? local.addMessage(input) : mysql.addMessage(input); }
export async function toggleRoomMessageReaction(input: Parameters<typeof local.toggleRoomMessageReaction>[0]) { return isLocalMode ? local.toggleRoomMessageReaction(input) : mysql.toggleRoomMessageReaction(input); }
export async function resetRoom(input: Parameters<typeof local.resetRoom>[0]) { return isLocalMode ? local.resetRoom(input) : mysql.resetRoom(input); }
export async function getDeviceProfile(deviceId: string) { return isLocalMode ? local.getDeviceProfile(deviceId) : mysql.getDeviceProfile(deviceId); }
export async function setDeviceAvatar(input: Parameters<typeof local.setDeviceAvatar>[0]) { return isLocalMode ? local.setDeviceAvatar(input) : mysql.setDeviceAvatar(input); }
export async function assertDirectMessageAllowed(conversationId: string, senderId: string) { return isLocalMode ? local.assertDirectMessageAllowed(conversationId, senderId) : mysql.assertDirectMessageAllowed(conversationId, senderId); }
export async function getDirectPeerIdForMember(conversationId: string, deviceId: string) { return isLocalMode ? local.getDirectPeerIdForMember(conversationId, deviceId) : mysql.getDirectPeerIdForMember(conversationId, deviceId); }
export async function startDirectConversation(input: Parameters<typeof local.startDirectConversation>[0]) { return isLocalMode ? local.startDirectConversation(input) : mysql.startDirectConversation(input); }
export async function listDirectConversations(deviceId: string): Promise<DirectConversationSummary[]> { return isLocalMode ? local.listDirectConversations(deviceId) : mysql.listDirectConversations(deviceId) as Promise<DirectConversationSummary[]>; }
export async function getDirectSnapshot(input: Parameters<typeof local.getDirectSnapshot>[0]): Promise<DirectSnapshot> { return isLocalMode ? local.getDirectSnapshot(input) : mysql.getDirectSnapshot(input) as Promise<DirectSnapshot>; }
export async function addDirectMessage(input: Parameters<typeof local.addDirectMessage>[0]) { return isLocalMode ? local.addDirectMessage(input) : mysql.addDirectMessage(input); }
export async function toggleDirectMessageReaction(input: Parameters<typeof local.toggleDirectMessageReaction>[0]) { return isLocalMode ? local.toggleDirectMessageReaction(input) : mysql.toggleDirectMessageReaction(input); }
export async function setDirectConversationPreferences(input: Parameters<typeof local.setDirectConversationPreferences>[0]) { return isLocalMode ? local.setDirectConversationPreferences(input) : mysql.setDirectConversationPreferences(input); }
export async function markDirectConversationRead(input: Parameters<typeof local.markDirectConversationRead>[0]) { return isLocalMode ? local.markDirectConversationRead(input) : mysql.markDirectConversationRead(input); }
export async function startDirectCall(input: Parameters<typeof local.startDirectCall>[0]) { return isLocalMode ? local.startDirectCall(input) : mysql.startDirectCall(input); }
export async function updateDirectCall(input: Parameters<typeof local.updateDirectCall>[0]) { return isLocalMode ? local.updateDirectCall(input) : mysql.updateDirectCall(input); }
export async function listDirectCallLogs(input: Parameters<typeof local.listDirectCallLogs>[0]): Promise<DirectCallLog[]> { return isLocalMode ? local.listDirectCallLogs(input) : mysql.listDirectCallLogs(input) as Promise<DirectCallLog[]>; }
export async function deleteDirectCall(input: Parameters<typeof local.deleteDirectCall>[0]) { return isLocalMode ? local.deleteDirectCall(input) : mysql.deleteDirectCall(input); }
export async function clearDirectCallLogs(input: Parameters<typeof local.clearDirectCallLogs>[0]) { return isLocalMode ? local.clearDirectCallLogs(input) : mysql.clearDirectCallLogs(input); }
export async function listRoomFiles(roomId: string): Promise<FileAttachment[]> { return isLocalMode ? local.listRoomFiles(roomId) : mysql.listRoomFiles(roomId) as Promise<FileAttachment[]>; }
export async function listDirectFiles(input: Parameters<typeof local.listDirectFiles>[0]): Promise<FileAttachment[]> { return isLocalMode ? local.listDirectFiles(input) : mysql.listDirectFiles(input) as Promise<FileAttachment[]>; }
export async function upsertUser(user: Parameters<typeof local.upsertUser>[0]): Promise<void> { if (isLocalMode) return local.upsertUser(user); return mysql.upsertUser(user); }
export async function getUserByOpenId(openId: string) { return (isLocalMode ? await local.getUserByOpenId(openId) : await mysql.getUserByOpenId(openId)) as Awaited<ReturnType<typeof mysql.getUserByOpenId>>; }
export async function getPublicProfile(openId: string) { return isLocalMode ? { openId, username: null, name: null, avatarUrl: (await local.getDeviceProfile(openId)).avatarUrl, bio: null, availability: "available" as const, language: "ar" as const, privacyMode: "everyone" as const } : mysql.getPublicProfile(openId); }
export async function updatePublicProfile(input: Parameters<typeof mysql.updatePublicProfile>[0]) { return isLocalMode ? { openId: input.openId, username: input.username, name: input.name, avatarUrl: (await local.getDeviceProfile(input.openId)).avatarUrl, bio: input.bio ?? null, availability: input.availability ?? "available" as const, language: input.language ?? "ar" as const, privacyMode: input.privacyMode ?? "everyone" as const } : mysql.updatePublicProfile(input); }
export async function updatePublicAvatar(input: Parameters<typeof mysql.updatePublicAvatar>[0]) { return isLocalMode ? local.setDeviceAvatar({ deviceId: input.openId, avatarUrl: input.avatarUrl }) : mysql.updatePublicAvatar(input); }

export async function createModeratorInvitation(input: Parameters<typeof local.createModeratorInvitation>[0]) { return isLocalMode ? local.createModeratorInvitation(input) : mysql.createModeratorInvitation(input); }
export async function listModeratorInvitations(input: Parameters<typeof local.listModeratorInvitations>[0]): Promise<RoomModeratorInvite[]> { return isLocalMode ? local.listModeratorInvitations(input) : mysql.listModeratorInvitations(input); }
export async function respondModeratorInvitation(input: Parameters<typeof local.respondModeratorInvitation>[0]) { return isLocalMode ? local.respondModeratorInvitation(input) : mysql.respondModeratorInvitation(input); }
export async function cancelModeratorInvitation(input: Parameters<typeof local.cancelModeratorInvitation>[0]) { return isLocalMode ? local.cancelModeratorInvitation(input) : mysql.cancelModeratorInvitation(input); }
export async function exportRoomAdminActivity(input: Parameters<typeof local.exportRoomAdminActivity>[0]) { return isLocalMode ? local.exportRoomAdminActivity(input) : mysql.exportRoomAdminActivity(input); }
export async function listRoomNotifications(input: Parameters<typeof local.listRoomNotifications>[0]): Promise<RoomNotification[]> { return isLocalMode ? local.listRoomNotifications(input) : mysql.listRoomNotifications(input); }
export async function markRoomNotificationRead(input: Parameters<typeof local.markRoomNotificationRead>[0]) { return isLocalMode ? local.markRoomNotificationRead(input) : mysql.markRoomNotificationRead(input); }

function cloudOnly<T>(work: () => Promise<T>) {
  // LAN-only mode must never contact or require the cloud. Optional cloud
  // administration features become harmless no-ops while core chat uses localDb.
  if (isLocalMode) return Promise.resolve(undefined as T);
  return work();
}

export const ensureUserDevice = (input: Parameters<typeof advanced.ensureUserDevice>[0]) => cloudOnly(() => advanced.ensureUserDevice(input));
export const isDeviceRevoked = (input: Parameters<typeof advanced.isDeviceRevoked>[0]) => cloudOnly(() => advanced.isDeviceRevoked(input));
export const listUserDevices = (userId: string) => cloudOnly(() => advanced.listUserDevices(userId));
export const revokeUserDevice = (input: Parameters<typeof advanced.revokeUserDevice>[0]) => cloudOnly(() => advanced.revokeUserDevice(input));
export const revokeAllUserDevices = (input: Parameters<typeof advanced.revokeAllUserDevices>[0]) => cloudOnly(() => advanced.revokeAllUserDevices(input));
export const getUserPreferences = (userId: string) => cloudOnly(() => advanced.getUserPreferences(userId));
export const updateUserPreferences = (input: Parameters<typeof advanced.updateUserPreferences>[0]) => cloudOnly(() => advanced.updateUserPreferences(input));
export const editRoomMessage = (input: Parameters<typeof advanced.editRoomMessage>[0]) => cloudOnly(() => advanced.editRoomMessage(input));
export const deleteRoomMessage = (input: Parameters<typeof advanced.deleteRoomMessage>[0]) => cloudOnly(() => advanced.deleteRoomMessage(input));
export const editDirectMessage = (input: Parameters<typeof advanced.editDirectMessage>[0]) => cloudOnly(() => advanced.editDirectMessage(input));
export const deleteDirectMessage = (input: Parameters<typeof advanced.deleteDirectMessage>[0]) => cloudOnly(() => advanced.deleteDirectMessage(input));
export const toggleRoomMessagePin = (input: Parameters<typeof advanced.toggleRoomMessagePin>[0]) => cloudOnly(() => advanced.toggleRoomMessagePin(input));
export const toggleDirectMessagePin = (input: Parameters<typeof advanced.toggleDirectMessagePin>[0]) => cloudOnly(() => advanced.toggleDirectMessagePin(input));
export const listMessagePins = (input: Parameters<typeof advanced.listMessagePins>[0]) => cloudOnly(() => advanced.listMessagePins(input));
export const markMessageReceipt = (input: Parameters<typeof advanced.markMessageReceipt>[0]) => cloudOnly(() => advanced.markMessageReceipt(input));
export const listMessageReceipts = (input: Parameters<typeof advanced.listMessageReceipts>[0]) => cloudOnly(() => advanced.listMessageReceipts(input));
export const createUserNotification = (input: Parameters<typeof advanced.createUserNotification>[0]) => cloudOnly(() => advanced.createUserNotification(input));
export const notifyMentionedUsers = (input: Parameters<typeof advanced.notifyMentionedUsers>[0]) => cloudOnly(() => advanced.notifyMentionedUsers(input));
export const listUserNotifications = (input: Parameters<typeof advanced.listUserNotifications>[0]) => cloudOnly(() => advanced.listUserNotifications(input));
export const markUserNotificationRead = (input: Parameters<typeof advanced.markUserNotificationRead>[0]) => cloudOnly(() => advanced.markUserNotificationRead(input));
export const createUserReport = (input: Parameters<typeof advanced.createUserReport>[0]) => cloudOnly(() => advanced.createUserReport(input));
export const listUserReports = (input: Parameters<typeof advanced.listUserReports>[0]) => cloudOnly(() => advanced.listUserReports(input));
export const resolveUserReport = (input: Parameters<typeof advanced.resolveUserReport>[0]) => cloudOnly(() => advanced.resolveUserReport(input));
export const consumeRateLimit = (input: Parameters<typeof advanced.consumeRateLimit>[0]) => cloudOnly(() => advanced.consumeRateLimit(input));
export const getRetentionPolicy = (roomId: string) => cloudOnly(() => advanced.getRetentionPolicy(roomId));
export const saveRetentionPolicy = (input: Parameters<typeof advanced.saveRetentionPolicy>[0]) => cloudOnly(() => advanced.saveRetentionPolicy(input));
export const runRetentionCleanup = (input: Parameters<typeof advanced.runRetentionCleanup>[0]) => cloudOnly(() => advanced.runRetentionCleanup(input));
export const getRoomAnalytics = (input: { roomId: string; actorId: string }) => cloudOnly(() => advanced.getRoomAnalytics(input.roomId, input.actorId));
export const getGlobalAnalytics = () => cloudOnly(() => advanced.getGlobalAnalytics());
export const rejectRecentDuplicateMessage = (input: Parameters<typeof advanced.rejectRecentDuplicateMessage>[0]) => isLocalMode ? Promise.resolve() : advanced.rejectRecentDuplicateMessage(input);
export const createUploadSession = (input: Parameters<typeof advanced.createUploadSession>[0]) => cloudOnly(() => advanced.createUploadSession(input));
export const updateUploadSession = (input: Parameters<typeof advanced.updateUploadSession>[0]) => cloudOnly(() => advanced.updateUploadSession(input));
export const appendUploadChunk = (input: Parameters<typeof advanced.appendUploadChunk>[0]) => cloudOnly(() => advanced.appendUploadChunk(input));
export const finalizeUploadSession = (input: Parameters<typeof advanced.finalizeUploadSession>[0]) => cloudOnly(() => advanced.finalizeUploadSession(input));
export const recordBackupManifest = (input: Parameters<typeof advanced.recordBackupManifest>[0]) => cloudOnly(() => advanced.recordBackupManifest(input));
export const listBackupManifests = (input: Parameters<typeof advanced.listBackupManifests>[0]) => cloudOnly(() => advanced.listBackupManifests(input));
export const getRoomBackupData = (input: { roomId: string; actorId: string }) => cloudOnly(() => advanced.getRoomBackupData(input.roomId, input.actorId));
export const restoreRoomBackup = (input: Parameters<typeof advanced.restoreRoomBackup>[0]) => cloudOnly(() => advanced.restoreRoomBackup(input));

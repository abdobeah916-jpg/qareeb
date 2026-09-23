import { z } from "zod";
import { parse as parseCookie } from "cookie";
import { TRPCError } from "@trpc/server";
import { COOKIE_NAME } from "@shared/const";
import { addDirectMessage, addMessage, assertDirectMessageAllowed, toggleDirectMessageReaction, toggleRoomMessageReaction, cancelModeratorInvitation, clearDirectCallLogs, createModeratorInvitation, deleteDirectCall, exportRoomAdminActivity, getDeviceProfile, getPublicProfile, updatePublicProfile, updatePublicAvatar, getDirectPeerIdForMember, getDirectSnapshot, getRoomActorPermissions, getRoomSnapshot, joinRoom, listDirectCallLogs, listDirectConversations, listDirectFiles, listModeratorInvitations, listRoomAdminActivity, listRoomFiles, listRoomModerators, listRoomNotifications, markDirectConversationRead, markRoomNotificationRead, resetRoom, respondModeratorInvitation, setDeviceAvatar, setDirectConversationPreferences, setRoomMemberBan, setRoomModerator, setRoomPin, startDirectCall, startDirectConversation, updateDirectCall, updateRoomName, ensureUserDevice, isDeviceRevoked, listUserDevices, revokeUserDevice, revokeAllUserDevices, getUserPreferences, updateUserPreferences, editRoomMessage, deleteRoomMessage, editDirectMessage, deleteDirectMessage, toggleRoomMessagePin, toggleDirectMessagePin, listMessagePins, markMessageReceipt, listMessageReceipts, notifyMentionedUsers, listUserNotifications, markUserNotificationRead, createUserReport, listUserReports, resolveUserReport, consumeRateLimit, getRetentionPolicy, saveRetentionPolicy, getRoomAnalytics, getGlobalAnalytics, rejectRecentDuplicateMessage, createUploadSession, updateUploadSession, appendUploadChunk, finalizeUploadSession, recordBackupManifest, listBackupManifests, getRoomBackupData, restoreRoomBackup } from "./db";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { storageGetSignedUrl, storagePut } from "./storage";
import { getIceServers } from "./turn";
import { cleanText, MAX_MESSAGE_LENGTH, normalizeRoomId, parseDataUrl, safeColor, safeFileName } from "./qareeb.validation";
import { notifyRoomRealtime, revokeRealtimeDevice } from "./realtime";
import { createHeartbeatJob, updateHeartbeatJob } from "./_core/heartbeat";

const roomIdInput = z.string().max(16);
const attachmentInput = z.object({ name: z.string().max(120), type: z.string().max(100), dataUrl: z.string().max(1_600_000), url: z.string().url().max(900).optional() });
const deviceIdInput = z.string().min(1).max(96);

type ActorContext = { user?: { openId: string } | null };
function requireActor(ctx: ActorContext, actorId: string) {
  const localMode = process.env.LOCAL_MODE === "true" || (!process.env.DATABASE_URL && process.env.NODE_ENV !== "production" && process.env.NODE_ENV !== "test");
  if (localMode) return;
  if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED", message: "يجب تسجيل الدخول للوصول إلى Qareeb." });
  if (ctx.user.openId !== actorId) throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكنك تنفيذ هذا الإجراء بهوية مستخدم أخرى." });
}

async function requireActiveActor(ctx: ActorContext, actorId: string) {
  requireActor(ctx, actorId);
  if (isLocalRuntime() || !ctx.user) return;
  if (await isDeviceRevoked({ userId: ctx.user.openId, deviceId: actorId })) throw new TRPCError({ code: "FORBIDDEN", message: "تم إلغاء وصول هذا الجهاز. سجّل الجهاز من جديد للمتابعة." });
}

const deviceRegistrationProcedure = publicProcedure.use(({ ctx, next }) => {
  if (!isLocalRuntime() && !ctx.user) throw new TRPCError({ code: "UNAUTHORIZED", message: "يجب تسجيل الدخول لتسجيل هذا الجهاز." });
  return next();
});

const qareebProcedure = publicProcedure.use(async ({ ctx, next, input }) => {
  const localMode = process.env.LOCAL_MODE === "true" || (!process.env.DATABASE_URL && process.env.NODE_ENV !== "production" && process.env.NODE_ENV !== "test");
  if (!localMode && !ctx.user) throw new TRPCError({ code: "UNAUTHORIZED", message: "يجب تسجيل الدخول للوصول إلى Qareeb." });
  if (!localMode && ctx.user && input && typeof input === "object") {
    const record = input as Record<string, unknown>;
    const actorId = typeof record.deviceId === "string" ? record.deviceId : typeof record.senderId === "string" ? record.senderId : undefined;
    if (actorId) await requireActiveActor(ctx, actorId);
  }
  return next();
});
const avatarInput = z.object({ name: z.string().max(120), type: z.string().max(100), dataUrl: z.string().max(800_000) });

function validRoomId(value: string) {
  const roomId = normalizeRoomId(value);
  if (!roomId) throw new Error("رمز الغرفة غير صالح.");
  return roomId;
}

async function storeAttachment(input: z.infer<typeof attachmentInput>, keyPrefix: string) {
  if (input.url) return { name: safeFileName(input.name), type: cleanText(input.type, 100) || "application/octet-stream", url: input.url };
  const parsed = parseDataUrl(input.dataUrl);
  if (!parsed) throw new Error("الملف غير صالح أو يتجاوز الحجم المسموح.");
  const type = parsed.mimeType || cleanText(input.type, 100) || "application/octet-stream";
  const name = safeFileName(input.name);
  const stored = await storagePut(`${keyPrefix}/${Date.now()}-${name}`, parsed.data, type);
  return { name, type, url: stored.url };
}

async function storeAvatar(input: z.infer<typeof avatarInput>, deviceId: string) {
  const parsed = parseDataUrl(input.dataUrl);
  if (!parsed || !parsed.mimeType.startsWith("image/") || parsed.data.length > 500_000) {
    throw new Error("اختر صورة صالحة بحجم لا يتجاوز 500 كيلوبايت.");
  }
  const allowed = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
  if (!allowed.has(parsed.mimeType)) throw new Error("صيغة الصورة غير مدعومة. استخدم JPG أو PNG أو WebP أو GIF.");
  const extension = parsed.mimeType === "image/jpeg" ? "jpg" : parsed.mimeType.split("/")[1];
  const stored = await storagePut(`qareeb/profiles/${deviceId}/avatar-${Date.now()}.${extension}`, parsed.data, parsed.mimeType);
  return stored.url;
}

function isLocalRuntime() {
  return process.env.VITEST === "true" || process.env.NODE_ENV === "test" || process.env.LOCAL_MODE === "true" || (!process.env.DATABASE_URL && process.env.NODE_ENV !== "production");
}

function requireAdmin(ctx: { user?: { role?: string } | null }) {
  if (!ctx.user || ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "هذه العملية متاحة لمدير النظام فقط." });
}

async function enforceRateLimit(subjectKey: string, action: string, limit: number) {
  if (isLocalRuntime()) return;
  await consumeRateLimit({ subjectKey, action, limit, windowMs: 60_000 });
}

async function requireDirectMessagingPermission(conversationId: string, senderId: string) {
  try {
    await assertDirectMessageAllowed(conversationId, senderId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "تعذر إرسال الرسالة الخاصة.";
    throw new TRPCError({ code: "FORBIDDEN", message });
  }
}

async function roomManagement<T>(roomIdOrAction: string | (() => Promise<T>), action?: () => Promise<T>) {
  try {
    const roomId = typeof roomIdOrAction === "string" ? roomIdOrAction : undefined;
    const result = await (typeof roomIdOrAction === "function" ? roomIdOrAction : action)!();
    if (roomId) notifyRoomRealtime(roomId);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "تعذر تنفيذ إدارة الغرفة.";
    throw new TRPCError({ code: message.includes("مالك الغرفة") || message.includes("إزالة مالك") || message.includes("الصلاحية اللازمة") ? "FORBIDDEN" : "BAD_REQUEST", message });
  }
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  qareeb: router({
    profile: router({
      get: qareebProcedure.input(z.object({ deviceId: deviceIdInput })).query(({ input }) => getDeviceProfile(cleanText(input.deviceId, 96))),
      me: qareebProcedure.query(({ ctx }) => getPublicProfile(ctx.user?.openId ?? "")),
      update: qareebProcedure.input(z.object({ deviceId: deviceIdInput.optional(), username: z.string().min(3).max(32), name: z.string().min(1).max(80), bio: z.string().max(160).optional(), availability: z.enum(["available", "busy", "away"]).optional(), language: z.enum(["ar", "en"]).optional(), privacyMode: z.enum(["everyone", "contacts", "nobody"]).optional() })).mutation(({ ctx, input }) => updatePublicProfile({ openId: ctx.user?.openId ?? cleanText(input.deviceId ?? "", 96), username: cleanText(input.username, 32), name: cleanText(input.name, 80), bio: cleanText(input.bio ?? "", 160), availability: input.availability, language: input.language, privacyMode: input.privacyMode })),
      updateAvatar: qareebProcedure.input(z.object({ deviceId: deviceIdInput, avatar: avatarInput })).mutation(async ({ input }) => {
        const deviceId = cleanText(input.deviceId, 96);
        const avatarUrl = await storeAvatar(input.avatar, deviceId);
        await updatePublicAvatar({ openId: deviceId, avatarUrl });
        return setDeviceAvatar({ deviceId, avatarUrl });
      }),
    }),
    devices: router({
      register: deviceRegistrationProcedure.input(z.object({ deviceId: deviceIdInput, label: z.string().max(120), userAgent: z.string().max(255).optional() })).mutation(({ ctx, input }) => {
        const deviceId = cleanText(input.deviceId, 96);
        requireActor(ctx, deviceId);
        return ensureUserDevice({ userId: ctx.user?.openId ?? deviceId, deviceId, label: cleanText(input.label, 120) || "Qareeb device", userAgent: input.userAgent });
      }),
      list: qareebProcedure.query(({ ctx }) => listUserDevices(ctx.user?.openId ?? "")),
      revoke: qareebProcedure.input(z.object({ deviceId: deviceIdInput })).mutation(async ({ ctx, input }) => { const target = cleanText(input.deviceId, 96); const result = await revokeUserDevice({ userId: ctx.user?.openId ?? "", deviceId: target }); revokeRealtimeDevice(target); return result; }),
      revokeAll: qareebProcedure.input(z.object({ exceptDeviceId: deviceIdInput.nullable().optional() })).mutation(async ({ ctx, input }) => { const exceptDeviceId = input.exceptDeviceId ? cleanText(input.exceptDeviceId, 96) : null; const result = await revokeAllUserDevices({ userId: ctx.user?.openId ?? "", exceptDeviceId }); const devices = await listUserDevices(ctx.user?.openId ?? ""); for (const device of devices) if (device.id !== exceptDeviceId) revokeRealtimeDevice(device.id); return result; }),
    }),
    preferences: router({
      get: qareebProcedure.query(({ ctx }) => getUserPreferences(ctx.user?.openId ?? "")),
      update: qareebProcedure.input(z.object({ theme: z.enum(["light", "dark", "system"]), readingBackground: z.enum(["soft", "paper", "night"]), fontScale: z.number().min(85).max(125), compactMode: z.boolean(), ringtoneEnabled: z.boolean(), notificationsEnabled: z.boolean() })).mutation(({ ctx, input }) => updateUserPreferences({ userId: ctx.user?.openId ?? "", ...input })),
    }),
    userNotifications: router({
      list: qareebProcedure.input(z.object({ unreadOnly: z.boolean().optional() }).optional()).query(({ ctx, input }) => listUserNotifications({ recipientId: ctx.user?.openId ?? "", unreadOnly: input?.unreadOnly })),
      markRead: qareebProcedure.input(z.object({ notificationId: z.string().max(96).optional() })).mutation(({ ctx, input }) => markUserNotificationRead({ recipientId: ctx.user?.openId ?? "", notificationId: input.notificationId })),
    }),
    reports: router({
      create: qareebProcedure.input(z.object({ targetUserId: deviceIdInput, reason: z.string().min(1).max(64), details: z.string().max(2000).optional(), roomId: roomIdInput.nullable().optional(), conversationId: z.string().max(64).nullable().optional(), messageId: z.string().max(64).nullable().optional() })).mutation(async ({ ctx, input }) => { const reporterId = ctx.user?.openId ?? ""; await enforceRateLimit(`${reporterId}:reports`, "create", 5); return createUserReport({ reporterId, targetUserId: cleanText(input.targetUserId, 96), reason: cleanText(input.reason, 64), details: input.details ? cleanText(input.details, 2000) : null, roomId: input.roomId ? validRoomId(input.roomId) : null, conversationId: input.conversationId ?? null, messageId: input.messageId ?? null }); }),
      list: qareebProcedure.input(z.object({ status: z.enum(["open", "reviewed", "resolved", "dismissed"]).optional() }).optional()).query(({ ctx, input }) => { requireAdmin(ctx); return listUserReports(input ?? {}); }),
      resolve: qareebProcedure.input(z.object({ reportId: z.string().min(1).max(96), status: z.enum(["reviewed", "resolved", "dismissed"]), action: z.enum(["warn", "mute", "ban", "unban", "dismiss"]).optional(), note: z.string().max(240).nullable().optional() })).mutation(({ ctx, input }) => { requireAdmin(ctx); return resolveUserReport({ reportId: input.reportId, reviewerId: ctx.user?.openId ?? "", status: input.status, action: input.action, note: input.note }); }),
    }),
    retention: router({
      get: qareebProcedure.input(z.object({ roomId: roomIdInput, deviceId: deviceIdInput })).query(({ ctx, input }) => { const deviceId = cleanText(input.deviceId, 96); requireActor(ctx, deviceId); return getRetentionPolicy(validRoomId(input.roomId)); }),
      update: qareebProcedure.input(z.object({ roomId: roomIdInput, deviceId: deviceIdInput, messageRetentionDays: z.number().min(0).max(3650), fileRetentionDays: z.number().min(0).max(3650), adminActivityRetentionDays: z.number().min(30).max(3650) })).mutation(({ ctx, input }) => { const deviceId = cleanText(input.deviceId, 96); requireActor(ctx, deviceId); return saveRetentionPolicy({ roomId: validRoomId(input.roomId), updatedBy: deviceId, messageRetentionDays: input.messageRetentionDays, fileRetentionDays: input.fileRetentionDays, adminActivityRetentionDays: input.adminActivityRetentionDays }); }),
      schedule: qareebProcedure.input(z.object({ roomId: roomIdInput, deviceId: deviceIdInput, cron: z.string().regex(/^\\d+ \\d+ \\d+ \\* \\* \\*$/) })).mutation(async ({ ctx, input }) => {
        const deviceId = cleanText(input.deviceId, 96);
        requireActor(ctx, deviceId);
        if (isLocalRuntime()) throw new TRPCError({ code: "BAD_REQUEST", message: "الجدولة متاحة بعد نشر النسخة السحابية." });
        const roomId = validRoomId(input.roomId);
        const current = await getRetentionPolicy(roomId);
        const sessionToken = parseCookie(ctx.req.headers.cookie ?? "")[COOKIE_NAME] ?? "";
        const job = current.scheduleCronTaskUid
          ? await updateHeartbeatJob(current.scheduleCronTaskUid, { cron: input.cron, path: "/api/scheduled/qareeb-retention", description: `Qareeb retention cleanup for ${roomId}`, enable: true }, sessionToken).then(result => ({ taskUid: current.scheduleCronTaskUid as string, ...result }))
          : await createHeartbeatJob({ name: `qareeb-retention-${roomId}`, cron: input.cron, path: "/api/scheduled/qareeb-retention", description: `Qareeb retention cleanup for ${roomId}` }, sessionToken);
        return saveRetentionPolicy({ roomId, updatedBy: deviceId, messageRetentionDays: current.messageRetentionDays, fileRetentionDays: current.fileRetentionDays, adminActivityRetentionDays: current.adminActivityRetentionDays, scheduleCronTaskUid: job.taskUid });
      }),
    }),
    analytics: router({
      room: qareebProcedure.input(z.object({ roomId: roomIdInput, deviceId: deviceIdInput })).query(({ ctx, input }) => { const deviceId = cleanText(input.deviceId, 96); requireActor(ctx, deviceId); return getRoomAnalytics({ roomId: validRoomId(input.roomId), actorId: deviceId }); }),
      global: qareebProcedure.query(({ ctx }) => { requireAdmin(ctx); return getGlobalAnalytics(); }),
    }),
    backup: router({
      list: qareebProcedure.input(z.object({ roomId: roomIdInput, deviceId: deviceIdInput })).query(({ ctx, input }) => { const deviceId = cleanText(input.deviceId, 96); requireActor(ctx, deviceId); return listBackupManifests({ createdBy: deviceId, scopeId: validRoomId(input.roomId) }); }),
      create: qareebProcedure.input(z.object({ roomId: roomIdInput, deviceId: deviceIdInput, retentionDays: z.number().min(1).max(3650).optional() })).mutation(async ({ ctx, input }) => {
        const deviceId = cleanText(input.deviceId, 96);
        requireActor(ctx, deviceId);
        const roomId = validRoomId(input.roomId);
        await enforceRateLimit(`${deviceId}:backups:${roomId}`, "create", 3);
        const snapshot = await getRoomBackupData({ roomId, actorId: deviceId });
        const payload = Buffer.from(JSON.stringify(snapshot), "utf8");
        const stored = await storagePut(`qareeb/backups/${roomId}/${Date.now()}.json`, payload, "application/json");
        const days = input.retentionDays ?? 90;
        return recordBackupManifest({ scopeType: "room", scopeId: roomId, createdBy: deviceId, storageKey: stored.key, storageUrl: stored.url, sizeBytes: payload.byteLength, expiresAt: new Date(Date.now() + days * 86_400_000) });
      }),
      restore: qareebProcedure.input(z.object({ roomId: roomIdInput, deviceId: deviceIdInput, backupId: z.string().min(1).max(96) })).mutation(async ({ ctx, input }) => {
        const deviceId = cleanText(input.deviceId, 96);
        requireActor(ctx, deviceId);
        const roomId = validRoomId(input.roomId);
        const manifests = await listBackupManifests({ createdBy: deviceId, scopeId: roomId });
        const manifest = manifests.find(item => item.id === input.backupId);
        if (!manifest) throw new TRPCError({ code: "NOT_FOUND", message: "النسخة الاحتياطية غير موجودة أو لا تخصك." });
        const signedUrl = await storageGetSignedUrl(manifest.storageKey);
        const response = await fetch(signedUrl);
        if (!response.ok) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "تعذر قراءة النسخة الاحتياطية." });
        const payload = await response.json() as unknown;
        return restoreRoomBackup({ roomId, actorId: deviceId, payload });
      }),
    }),
    uploads: router({
      start: qareebProcedure.input(z.object({ deviceId: deviceIdInput, scopeType: z.enum(["room", "direct", "avatar"]), scopeId: z.string().min(1).max(64), fileName: z.string().min(1).max(120), mimeType: z.string().max(100), totalBytes: z.number().int().min(1).max(50_000_000) })).mutation(async ({ ctx, input }) => { const deviceId = cleanText(input.deviceId, 96); requireActor(ctx, deviceId); await enforceRateLimit(`${deviceId}:uploads`, "start", 20); return createUploadSession({ ownerId: deviceId, scopeType: input.scopeType, scopeId: input.scopeId, fileName: safeFileName(input.fileName), mimeType: input.mimeType, totalBytes: input.totalBytes }); }),
      update: qareebProcedure.input(z.object({ deviceId: deviceIdInput, sessionId: z.string().min(1).max(120), receivedBytes: z.number().int().min(0), storageKey: z.string().max(512).nullable().optional(), status: z.enum(["uploading", "complete", "aborted"]) })).mutation(({ ctx, input }) => { const deviceId = cleanText(input.deviceId, 96); requireActor(ctx, deviceId); return updateUploadSession({ id: input.sessionId, ownerId: deviceId, receivedBytes: input.receivedBytes, storageKey: input.storageKey, status: input.status }); }),
      append: qareebProcedure.input(z.object({ deviceId: deviceIdInput, sessionId: z.string().min(1).max(120), chunkIndex: z.number().int().min(0).max(100_000), dataUrl: z.string().max(2_100_000) })).mutation(async ({ ctx, input }) => { const deviceId = cleanText(input.deviceId, 96); requireActor(ctx, deviceId); await enforceRateLimit(`${deviceId}:uploads:${input.sessionId}`, "chunk", 2_000); return appendUploadChunk({ id: input.sessionId, ownerId: deviceId, chunkIndex: input.chunkIndex, dataUrl: input.dataUrl }); }),
      finalize: qareebProcedure.input(z.object({ deviceId: deviceIdInput, sessionId: z.string().min(1).max(120) })).mutation(({ ctx, input }) => { const deviceId = cleanText(input.deviceId, 96); requireActor(ctx, deviceId); return finalizeUploadSession({ id: input.sessionId, ownerId: deviceId }); }),
    }),
    snapshot: qareebProcedure.input(z.object({ roomId: roomIdInput, deviceId: deviceIdInput })).query(({ ctx, input }) => { const deviceId = cleanText(input.deviceId, 96); requireActor(ctx, deviceId); return getRoomSnapshot(validRoomId(input.roomId)); }),
    join: qareebProcedure.input(z.object({ roomId: roomIdInput, deviceId: deviceIdInput, name: z.string().max(80), color: z.string().max(20) })).mutation(({ input }) =>
      joinRoom({ roomId: validRoomId(input.roomId), deviceId: cleanText(input.deviceId, 96), name: cleanText(input.name, 40) || "زائر", color: safeColor(input.color) }),
    ),
    sendMessage: qareebProcedure.input(z.object({
      roomId: roomIdInput, senderId: deviceIdInput, senderName: z.string().max(80), senderColor: z.string().max(20), text: z.string().max(MAX_MESSAGE_LENGTH), replyToId: z.string().min(1).max(64).nullable().optional(), attachment: attachmentInput.optional(),
    })).mutation(async ({ ctx, input }) => {
      requireActor(ctx, cleanText(input.senderId, 96));
      const roomId = validRoomId(input.roomId);
      const text = cleanText(input.text, MAX_MESSAGE_LENGTH);
      const attachment = input.attachment ? await storeAttachment(input.attachment, `qareeb/${roomId}`) : undefined;
      if (!text && !attachment) throw new Error("اكتب رسالة أو اختر ملفًا لإرساله.");
      const senderId = cleanText(input.senderId, 96);
      await enforceRateLimit(`${senderId}:room:${roomId}`, "message", 30);
      await rejectRecentDuplicateMessage({ scopeType: "room", scopeId: roomId, actorId: senderId, text });
      const result = await addMessage({ roomId, senderId, senderName: cleanText(input.senderName, 40) || "زائر", senderColor: safeColor(input.senderColor), text, replyToId: input.replyToId ?? null, attachment });
      if (!isLocalRuntime()) await notifyMentionedUsers({ actorId: senderId, text, roomId, messageId: result.messages.at(-1)?.id ?? null });
      return result;
    }),
    edit: qareebProcedure.input(z.object({ roomId: roomIdInput, messageId: z.string().min(1).max(64), deviceId: deviceIdInput, text: z.string().max(MAX_MESSAGE_LENGTH) })).mutation(({ ctx, input }) => {
      const deviceId = cleanText(input.deviceId, 96);
      requireActor(ctx, deviceId);
      return editRoomMessage({ roomId: validRoomId(input.roomId), messageId: cleanText(input.messageId, 64), senderId: deviceId, text: cleanText(input.text, MAX_MESSAGE_LENGTH) });
    }),
    delete: qareebProcedure.input(z.object({ roomId: roomIdInput, messageId: z.string().min(1).max(64), deviceId: deviceIdInput })).mutation(({ ctx, input }) => {
      const deviceId = cleanText(input.deviceId, 96);
      requireActor(ctx, deviceId);
      return deleteRoomMessage({ roomId: validRoomId(input.roomId), messageId: cleanText(input.messageId, 64), actorId: deviceId });
    }),
    togglePin: qareebProcedure.input(z.object({ roomId: roomIdInput, messageId: z.string().min(1).max(64), deviceId: deviceIdInput })).mutation(({ ctx, input }) => {
      const deviceId = cleanText(input.deviceId, 96);
      requireActor(ctx, deviceId);
      return toggleRoomMessagePin({ roomId: validRoomId(input.roomId), messageId: cleanText(input.messageId, 64), actorId: deviceId });
    }),
    pins: qareebProcedure.input(z.object({ roomId: roomIdInput, deviceId: deviceIdInput })).query(({ ctx, input }) => {
      const deviceId = cleanText(input.deviceId, 96);
      requireActor(ctx, deviceId);
      return listMessagePins({ scopeType: "room", scopeId: validRoomId(input.roomId), actorId: deviceId });
    }),
    receipt: qareebProcedure.input(z.object({ roomId: roomIdInput, messageId: z.string().min(1).max(64), deviceId: deviceIdInput, status: z.enum(["sent", "delivered", "read"]) })).mutation(({ ctx, input }) => {
      const deviceId = cleanText(input.deviceId, 96);
      requireActor(ctx, deviceId);
      return markMessageReceipt({ scopeType: "room", scopeId: validRoomId(input.roomId), messageId: cleanText(input.messageId, 64), readerId: deviceId, status: input.status });
    }),
    receipts: qareebProcedure.input(z.object({ roomId: roomIdInput, messageId: z.string().min(1).max(64), deviceId: deviceIdInput })).query(({ ctx, input }) => {
      const deviceId = cleanText(input.deviceId, 96);
      requireActor(ctx, deviceId);
      return listMessageReceipts({ scopeType: "room", scopeId: validRoomId(input.roomId), messageId: cleanText(input.messageId, 64), readerId: deviceId });
    }),
    react: qareebProcedure.input(z.object({ roomId: roomIdInput, deviceId: deviceIdInput, messageId: z.string().min(1).max(64), emoji: z.string().min(1).max(16) })).mutation(({ ctx, input }) => { requireActor(ctx, cleanText(input.deviceId, 96)); return toggleRoomMessageReaction({ roomId: validRoomId(input.roomId), deviceId: cleanText(input.deviceId, 96), messageId: cleanText(input.messageId, 64), emoji: input.emoji }); }),
    reset: qareebProcedure.input(z.object({ roomId: roomIdInput, deviceId: deviceIdInput })).mutation(({ input }) => roomManagement(validRoomId(input.roomId), () =>
      resetRoom({ roomId: validRoomId(input.roomId), deviceId: cleanText(input.deviceId, 96) }),
    )),
    files: qareebProcedure.input(z.object({ roomId: roomIdInput, deviceId: deviceIdInput })).query(({ ctx, input }) => { requireActor(ctx, cleanText(input.deviceId, 96)); return listRoomFiles(validRoomId(input.roomId)); }),
    setPin: qareebProcedure.input(z.object({ roomId: roomIdInput, deviceId: deviceIdInput, messageId: z.string().min(1).max(64).nullable() })).mutation(async ({ input }) => {
      return roomManagement(validRoomId(input.roomId), () => setRoomPin({ roomId: validRoomId(input.roomId), deviceId: cleanText(input.deviceId, 96), messageId: input.messageId }));
    }),
    rename: qareebProcedure.input(z.object({ roomId: roomIdInput, deviceId: deviceIdInput, name: z.string().max(120) })).mutation(({ input }) => roomManagement(validRoomId(input.roomId), () => {
      const name = cleanText(input.name, 80);
      if (!name) throw new Error("اكتب اسمًا صالحًا للغرفة.");
      return updateRoomName({ roomId: validRoomId(input.roomId), deviceId: cleanText(input.deviceId, 96), name });
    })),
    setMemberBan: qareebProcedure.input(z.object({ roomId: roomIdInput, deviceId: deviceIdInput, targetDeviceId: deviceIdInput, isBanned: z.boolean()  })).mutation(({ input }) => roomManagement(validRoomId(input.roomId), () =>
      setRoomMemberBan({ roomId: validRoomId(input.roomId), deviceId: cleanText(input.deviceId, 96), targetDeviceId: cleanText(input.targetDeviceId, 96), isBanned: input.isBanned }),
    )),
    permissions: qareebProcedure.input(z.object({ roomId: roomIdInput, deviceId: deviceIdInput })).query(({ input }) =>
      getRoomActorPermissions({ roomId: validRoomId(input.roomId), deviceId: cleanText(input.deviceId, 96) }),
    ),
    moderators: qareebProcedure.input(z.object({ roomId: roomIdInput, deviceId: deviceIdInput })).query(({ input }) => roomManagement(() =>
      listRoomModerators({ roomId: validRoomId(input.roomId), deviceId: cleanText(input.deviceId, 96) }),
    )),
    setModerator: qareebProcedure.input(z.object({
      roomId: roomIdInput,
      deviceId: deviceIdInput,
      targetDeviceId: deviceIdInput,
      isModerator: z.boolean(),
      permissions: z.object({ canPin: z.boolean(), canRename: z.boolean(), canManageMembers: z.boolean(), canClearMessages: z.boolean(), canViewActivity: z.boolean() }),
    })).mutation(({ input }) => roomManagement(validRoomId(input.roomId), () => setRoomModerator({
      roomId: validRoomId(input.roomId),
      deviceId: cleanText(input.deviceId, 96),
      targetDeviceId: cleanText(input.targetDeviceId, 96),
      isModerator: input.isModerator,
      permissions: input.permissions,
    }))),
    activity: qareebProcedure.input(z.object({ roomId: roomIdInput, deviceId: deviceIdInput })).query(({ input }) => roomManagement(() =>
      listRoomAdminActivity({ roomId: validRoomId(input.roomId), deviceId: cleanText(input.deviceId, 96) }),
    )),
    notifications: qareebProcedure.input(z.object({ roomId: roomIdInput, deviceId: deviceIdInput })).query(({ input }) =>
      listRoomNotifications({ roomId: validRoomId(input.roomId), deviceId: cleanText(input.deviceId, 96) }),
    ),
    markNotificationRead: qareebProcedure.input(z.object({ roomId: roomIdInput, deviceId: deviceIdInput, notificationId: z.string().max(100).optional() })).mutation(({ input }) =>
      markRoomNotificationRead({ roomId: validRoomId(input.roomId), deviceId: cleanText(input.deviceId, 96), notificationId: input.notificationId }),
    ),
    moderatorInvites: qareebProcedure.input(z.object({ roomId: roomIdInput, deviceId: deviceIdInput })).query(({ input }) => roomManagement(() =>
      listModeratorInvitations({ roomId: validRoomId(input.roomId), deviceId: cleanText(input.deviceId, 96) }),
    )),
    inviteModerator: qareebProcedure.input(z.object({
      roomId: roomIdInput,
      deviceId: deviceIdInput,
      targetDeviceId: deviceIdInput,
      permissions: z.object({ canPin: z.boolean(), canRename: z.boolean(), canManageMembers: z.boolean(), canClearMessages: z.boolean(), canViewActivity: z.boolean() }),
    })).mutation(({ input }) => roomManagement(validRoomId(input.roomId), () => createModeratorInvitation({
      roomId: validRoomId(input.roomId), deviceId: cleanText(input.deviceId, 96), targetDeviceId: cleanText(input.targetDeviceId, 96), permissions: input.permissions,
    }))),
    respondModeratorInvite: qareebProcedure.input(z.object({ roomId: roomIdInput, deviceId: deviceIdInput, inviteId: z.string().max(120), approve: z.boolean() })).mutation(({ input }) => roomManagement(validRoomId(input.roomId), () =>
      respondModeratorInvitation({ roomId: validRoomId(input.roomId), deviceId: cleanText(input.deviceId, 96), inviteId: cleanText(input.inviteId, 120), approve: input.approve }),
    )),
    cancelModeratorInvite: qareebProcedure.input(z.object({ roomId: roomIdInput, deviceId: deviceIdInput, inviteId: z.string().max(120) })).mutation(({ input }) => roomManagement(validRoomId(input.roomId), () =>
      cancelModeratorInvitation({ roomId: validRoomId(input.roomId), deviceId: cleanText(input.deviceId, 96), inviteId: cleanText(input.inviteId, 120) }),
    )),
    exportActivity: qareebProcedure.input(z.object({ roomId: roomIdInput, deviceId: deviceIdInput })).query(({ input }) => roomManagement(() =>
      exportRoomAdminActivity({ roomId: validRoomId(input.roomId), deviceId: cleanText(input.deviceId, 96) }),
    )),
  }),
  direct: router({
    list: qareebProcedure.input(z.object({ deviceId: deviceIdInput })).query(({ input }) => listDirectConversations(cleanText(input.deviceId, 96))),
    start: qareebProcedure.input(z.object({
      roomId: roomIdInput,
      deviceId: deviceIdInput,
      name: z.string().max(80),
      color: z.string().max(20),
      peerId: deviceIdInput,
    })).mutation(({ input }) => startDirectConversation({
      roomId: validRoomId(input.roomId),
      deviceId: cleanText(input.deviceId, 96),
      name: cleanText(input.name, 40) || "زائر",
      color: safeColor(input.color),
      peerId: cleanText(input.peerId, 96),
    })),
    snapshot: qareebProcedure.input(z.object({ conversationId: z.string().min(1).max(64), deviceId: deviceIdInput })).query(({ input }) =>
      getDirectSnapshot({ conversationId: input.conversationId, deviceId: cleanText(input.deviceId, 96) }),
    ),
    sendMessage: qareebProcedure.input(z.object({
      conversationId: z.string().min(1).max(64),
      senderId: deviceIdInput,
      senderName: z.string().max(80),
      senderColor: z.string().max(20),
      text: z.string().max(MAX_MESSAGE_LENGTH),
      replyToId: z.string().min(1).max(64).nullable().optional(),
      attachment: attachmentInput.optional(),
    })).mutation(async ({ ctx, input }) => {
      requireActor(ctx, cleanText(input.senderId, 96));
      const text = cleanText(input.text, MAX_MESSAGE_LENGTH);
      await requireDirectMessagingPermission(input.conversationId, cleanText(input.senderId, 96));
      const attachment = input.attachment ? await storeAttachment(input.attachment, `qareeb/direct/${input.conversationId}`) : undefined;
      if (!text && !attachment) throw new Error("اكتب رسالة أو اختر ملفًا لإرساله.");
      const senderId = cleanText(input.senderId, 96);
      await enforceRateLimit(`${senderId}:direct:${input.conversationId}`, "message", 40);
      await rejectRecentDuplicateMessage({ scopeType: "direct", scopeId: input.conversationId, actorId: senderId, text });
      const result = await addDirectMessage({ conversationId: input.conversationId, senderId, senderName: cleanText(input.senderName, 40) || "زائر", senderColor: safeColor(input.senderColor), text, replyToId: input.replyToId ?? null, attachment });
      if (!isLocalRuntime()) await notifyMentionedUsers({ actorId: senderId, text, conversationId: input.conversationId, messageId: result.messages.at(-1)?.id ?? null });
      return result;
    }),
    edit: qareebProcedure.input(z.object({ conversationId: z.string().min(1).max(64), messageId: z.string().min(1).max(64), deviceId: deviceIdInput, text: z.string().max(MAX_MESSAGE_LENGTH) })).mutation(({ ctx, input }) => {
      const deviceId = cleanText(input.deviceId, 96);
      requireActor(ctx, deviceId);
      return editDirectMessage({ conversationId: input.conversationId, messageId: cleanText(input.messageId, 64), senderId: deviceId, text: cleanText(input.text, MAX_MESSAGE_LENGTH) });
    }),
    delete: qareebProcedure.input(z.object({ conversationId: z.string().min(1).max(64), messageId: z.string().min(1).max(64), deviceId: deviceIdInput })).mutation(({ ctx, input }) => {
      const deviceId = cleanText(input.deviceId, 96);
      requireActor(ctx, deviceId);
      return deleteDirectMessage({ conversationId: input.conversationId, messageId: cleanText(input.messageId, 64), actorId: deviceId });
    }),
    togglePin: qareebProcedure.input(z.object({ conversationId: z.string().min(1).max(64), messageId: z.string().min(1).max(64), deviceId: deviceIdInput })).mutation(({ ctx, input }) => {
      const deviceId = cleanText(input.deviceId, 96);
      requireActor(ctx, deviceId);
      return toggleDirectMessagePin({ conversationId: input.conversationId, messageId: cleanText(input.messageId, 64), actorId: deviceId });
    }),
    pins: qareebProcedure.input(z.object({ conversationId: z.string().min(1).max(64), deviceId: deviceIdInput })).query(({ ctx, input }) => {
      const deviceId = cleanText(input.deviceId, 96);
      requireActor(ctx, deviceId);
      return listMessagePins({ scopeType: "direct", scopeId: input.conversationId, actorId: deviceId });
    }),
    receipt: qareebProcedure.input(z.object({ conversationId: z.string().min(1).max(64), messageId: z.string().min(1).max(64), deviceId: deviceIdInput, status: z.enum(["sent", "delivered", "read"]) })).mutation(({ ctx, input }) => {
      const deviceId = cleanText(input.deviceId, 96);
      requireActor(ctx, deviceId);
      return markMessageReceipt({ scopeType: "direct", scopeId: input.conversationId, messageId: cleanText(input.messageId, 64), readerId: deviceId, status: input.status });
    }),
    receipts: qareebProcedure.input(z.object({ conversationId: z.string().min(1).max(64), messageId: z.string().min(1).max(64), deviceId: deviceIdInput })).query(({ ctx, input }) => {
      const deviceId = cleanText(input.deviceId, 96);
      requireActor(ctx, deviceId);
      return listMessageReceipts({ scopeType: "direct", scopeId: input.conversationId, messageId: cleanText(input.messageId, 64), readerId: deviceId });
    }),
    react: qareebProcedure.input(z.object({ conversationId: z.string().min(1).max(64), deviceId: deviceIdInput, messageId: z.string().min(1).max(64), emoji: z.string().min(1).max(16) })).mutation(({ ctx, input }) => { requireActor(ctx, cleanText(input.deviceId, 96)); return toggleDirectMessageReaction({ conversationId: input.conversationId, deviceId: cleanText(input.deviceId, 96), messageId: cleanText(input.messageId, 64), emoji: input.emoji }); }),
    files: qareebProcedure.input(z.object({ conversationId: z.string().min(1).max(64), deviceId: deviceIdInput })).query(({ input }) =>
      listDirectFiles({ conversationId: input.conversationId, deviceId: cleanText(input.deviceId, 96) }),
    ),
    setPreferences: qareebProcedure.input(z.object({
      conversationId: z.string().min(1).max(64),
      deviceId: deviceIdInput,
      isMuted: z.boolean(),
      isBlocked: z.boolean(),
    })).mutation(({ input }) => setDirectConversationPreferences({
      conversationId: input.conversationId,
      deviceId: cleanText(input.deviceId, 96),
      isMuted: input.isMuted,
      isBlocked: input.isBlocked,
    })),
    markRead: qareebProcedure.input(z.object({ conversationId: z.string().min(1).max(64), deviceId: deviceIdInput })).mutation(({ input }) =>
      markDirectConversationRead({ conversationId: input.conversationId, deviceId: cleanText(input.deviceId, 96) }),
    ),
    iceServers: qareebProcedure.input(z.object({ conversationId: z.string().min(1).max(64), deviceId: deviceIdInput })).query(async ({ input }) => {
      await getDirectPeerIdForMember(input.conversationId, cleanText(input.deviceId, 96));
      return { iceServers: getIceServers() };
    }),
    calls: qareebProcedure.input(z.object({ conversationId: z.string().min(1).max(64), deviceId: deviceIdInput })).query(({ input }) =>
      listDirectCallLogs({ conversationId: input.conversationId, deviceId: cleanText(input.deviceId, 96) }),
    ),
    startCall: qareebProcedure.input(z.object({ conversationId: z.string().min(1).max(64), deviceId: deviceIdInput, callType: z.enum(["audio", "video"]) })).mutation(({ input }) =>
      startDirectCall({ conversationId: input.conversationId, deviceId: cleanText(input.deviceId, 96), callType: input.callType }),
    ),
    updateCall: qareebProcedure.input(z.object({
      callId: z.string().min(1).max(64),
      conversationId: z.string().min(1).max(64),
      deviceId: deviceIdInput,
      status: z.enum(["accepted", "missed", "rejected", "ended", "failed"]),
    })).mutation(({ input }) => updateDirectCall({
      callId: input.callId,
      conversationId: input.conversationId,
      deviceId: cleanText(input.deviceId, 96),
      status: input.status,
    })),
    deleteCall: qareebProcedure.input(z.object({
      callId: z.string().min(1).max(64),
      conversationId: z.string().min(1).max(64),
      deviceId: deviceIdInput,
    })).mutation(({ input }) => deleteDirectCall({
      callId: input.callId,
      conversationId: input.conversationId,
      deviceId: cleanText(input.deviceId, 96),
    })),
    clearCalls: qareebProcedure.input(z.object({
      conversationId: z.string().min(1).max(64),
      deviceId: deviceIdInput,
    })).mutation(({ input }) => clearDirectCallLogs({
      conversationId: input.conversationId,
      deviceId: cleanText(input.deviceId, 96),
    })),
  }),
});

export type AppRouter = typeof appRouter;

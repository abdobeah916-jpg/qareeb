import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const mocks = vi.hoisted(() => ({
  editRoomMessage: vi.fn(),
  deleteRoomMessage: vi.fn(),
  createUserReport: vi.fn(),
  listUserReports: vi.fn(),
  resolveUserReport: vi.fn(),
  ensureUserDevice: vi.fn(),
  listUserDevices: vi.fn(),
  revokeUserDevice: vi.fn(),
  revokeAllUserDevices: vi.fn(),
  getUserPreferences: vi.fn(),
  updateUserPreferences: vi.fn(),
  getRetentionPolicy: vi.fn(),
  saveRetentionPolicy: vi.fn(),
  getRoomAnalytics: vi.fn(),
  getGlobalAnalytics: vi.fn(),
  listBackupManifests: vi.fn(),
  restoreRoomBackup: vi.fn(),
  createUploadSession: vi.fn(),
  updateUploadSession: vi.fn(),
  listUserNotifications: vi.fn(),
  markUserNotificationRead: vi.fn(),
  storagePut: vi.fn(),
  storageGetSignedUrl: vi.fn(),
}));

vi.mock("./db", () => ({ ...mocks }));
vi.mock("./storage", () => ({ storagePut: mocks.storagePut, storageGetSignedUrl: mocks.storageGetSignedUrl }));
vi.mock("./_core/heartbeat", () => ({ createHeartbeatJob: vi.fn(), updateHeartbeatJob: vi.fn() }));

import { appRouter } from "./routers";

function makeCaller(role: "admin" | "user" = "user") {
  return appRouter.createCaller({
    user: { id: 1, openId: "device-1", name: "Test User", email: "test@example.com", loginMethod: "oauth", role, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
    req: { protocol: "https", headers: {} },
    res: { clearCookie: vi.fn() },
  } as unknown as TrpcContext);
}

describe("qareeb expansion contracts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listUserDevices.mockResolvedValue([{ id: "device-1", label: "Current", userAgent: "test" }]);
    mocks.listUserReports.mockResolvedValue([]);
    mocks.createUserReport.mockResolvedValue({ id: "report-1", status: "open" });
    mocks.getUserPreferences.mockResolvedValue({ theme: "system", readingBackground: "soft", fontScale: 100, compactMode: false, ringtoneEnabled: true, notificationsEnabled: true });
    mocks.getRetentionPolicy.mockResolvedValue({ roomId: "AB-12", messageRetentionDays: 30, fileRetentionDays: 30, adminActivityRetentionDays: 365, scheduleCronTaskUid: null });
    mocks.getRoomAnalytics.mockResolvedValue({ activeMembers: 1, messageCount: 4, fileCount: 0, activityCount: 0, daily: [] });
    mocks.getGlobalAnalytics.mockResolvedValue({ roomCount: 2, userCount: 3, messageCount: 8, fileCount: 1, openReportCount: 0 });
    mocks.listBackupManifests.mockResolvedValue([]);
  });

  it("binds report creation to the authenticated OAuth actor", async () => {
    await makeCaller().qareeb.reports.create({ targetUserId: "device-2", reason: "spam", details: "Repeated messages", roomId: "AB-12" });
    expect(mocks.createUserReport).toHaveBeenCalledWith(expect.objectContaining({ reporterId: "device-1", targetUserId: "device-2", roomId: "AB-12" }));
  });

  it("keeps global analytics admin-only and forwards the owner query", async () => {
    await expect(makeCaller().qareeb.analytics.global()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await makeCaller("admin").qareeb.analytics.global();
    expect(mocks.getGlobalAnalytics).toHaveBeenCalledTimes(1);
  });

  it("rejects the admin report queue for a normal user", async () => {
    await expect(makeCaller().qareeb.reports.list({ status: "open" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.listUserReports).not.toHaveBeenCalled();
  });

  it("allows the admin report queue and forwards resolution", async () => {
    await makeCaller("admin").qareeb.reports.list({ status: "open" });
    expect(mocks.listUserReports).toHaveBeenCalledWith({ status: "open" });
    await makeCaller("admin").qareeb.reports.resolve({ reportId: "report-1", status: "resolved", action: "ban", note: "Confirmed abuse" });
    expect(mocks.resolveUserReport).toHaveBeenCalledWith(expect.objectContaining({ reportId: "report-1", reviewerId: "device-1", action: "ban" }));
  });

  it("rejects room message edits when the request identity does not match OAuth", async () => {
    await expect(makeCaller().qareeb.edit({ roomId: "AB-12", messageId: "message-1", deviceId: "device-2", text: "changed" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.editRoomMessage).not.toHaveBeenCalled();
  });

  it("forwards device revocation and preferences to the authenticated account", async () => {
    await makeCaller().qareeb.devices.revokeAll({ exceptDeviceId: "device-1" });
    expect(mocks.revokeAllUserDevices).toHaveBeenCalledWith({ userId: "device-1", exceptDeviceId: "device-1" });
    await makeCaller().qareeb.preferences.update({ theme: "dark", readingBackground: "night", fontScale: 110, compactMode: true, ringtoneEnabled: false, notificationsEnabled: true });
    expect(mocks.updateUserPreferences).toHaveBeenCalledWith(expect.objectContaining({ userId: "device-1", theme: "dark", compactMode: true }));
  });
});

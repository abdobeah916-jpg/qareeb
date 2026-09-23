import { useEffect, useState } from "react";
import { Bell, DatabaseBackup, Download, Gauge, Laptop, LockKeyhole, RefreshCw, ShieldAlert, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

type Language = "ar" | "en";

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

type Props = {
  language: Language;
  roomId: string;
  deviceId: string;
  isAdmin: boolean;
};

const copy = {
  ar: {
    title: "أدوات الحماية والبيانات",
    subtitle: "تحكم في أجهزتك، البلاغات، النسخ الاحتياطية، والاحتفاظ بالبيانات من مكان واحد.",
    devices: "الأجهزة والجلسات",
    devicesHint: "راجع الأجهزة المرتبطة بحسابك وألغِ وصول أي جهاز لم تعد تستخدمه.",
    current: "الجهاز الحالي",
    revoke: "إلغاء الوصول",
    revokeAll: "إلغاء كل الأجهزة الأخرى",
    noDevices: "لم يتم تسجيل أجهزة إضافية بعد.",
    reports: "الإبلاغ عن مستخدم",
    reportsHint: "ساعد في الحفاظ على مساحة قريبة بإرسال بلاغ واضح عن السلوك المزعج.",
    target: "معرّف المستخدم أو اسم المستخدم",
    reason: "السبب",
    details: "تفاصيل إضافية",
    sendReport: "إرسال البلاغ",
    backup: "النسخ الاحتياطي والاسترجاع",
    backupHint: "احفظ نسخة JSON مشفّرة عبر التخزين السحابي لاسترجاع رسائل الغرفة عند الحاجة.",
    createBackup: "إنشاء نسخة الآن",
    restore: "استرجاع",
    noBackups: "لا توجد نسخ محفوظة لهذه الغرفة.",
    retention: "سياسة الاحتفاظ",
    retentionHint: "حدّد مدة الاحتفاظ بالرسائل وسجل الإدارة بالأيام. القيمة 0 تعني بلا تنظيف تلقائي.",
    messagesDays: "الرسائل بالأيام",
    filesDays: "الملفات بالأيام",
    activityDays: "سجل الإدارة بالأيام",
    save: "حفظ السياسة",
    schedule: "جدولة التنظيف",
    scheduleHint: "التنظيف يعمل على الخادم المنشور وفق UTC، وليس بمؤقت داخل المتصفح.",
    cron: "تعبير الجدولة",
    scheduleNow: "تفعيل الجدولة",
    analytics: "إحصاءات الغرفة",
    activeMembers: "أعضاء نشطون",
    messageCount: "رسائل",
    fileCount: "ملفات",
    activityCount: "إشعارات إدارة",
    adminQueue: "طابور البلاغات",
    resolve: "إغلاق البلاغ",
    ban: "حظر في الغرفة",
    warn: "تحذير",
    mute: "كتم في الغرفة",
    dismiss: "رفض البلاغ",
    invalid: "أكمل الحقول المطلوبة.",
    saved: "تم الحفظ.",
    created: "تم إنشاء النسخة الاحتياطية.",
    restored: "تم الاسترجاع.",
    scheduled: "تم تفعيل الجدولة.",
    reportSent: "تم إرسال البلاغ للمراجعة.",
    install: "تثبيت قريب",
    installHint: "ثبّت قريب على الهاتف للوصول السريع مع واجهة مستقلة.",
    installButton: "تثبيت التطبيق",
    unban: "إلغاء الحظر في الغرفة",
    inbox: "صندوق الإشعارات",
    noNotifications: "لا توجد إشعارات جديدة.",
    markRead: "تحديد كمقروء",
    globalAnalytics: "إحصاءات عامة للمالك",
    users: "مستخدمون",
    rooms: "غرف",
    openReports: "بلاغات مفتوحة",
  },
  en: {
    title: "Protection & data tools",
    subtitle: "Manage devices, reports, backups, retention, and room health from one place.",
    devices: "Devices & sessions",
    devicesHint: "Review devices linked to your account and revoke access you no longer trust.",
    current: "Current device",
    revoke: "Revoke access",
    revokeAll: "Revoke all other devices",
    noDevices: "No additional devices have been registered yet.",
    reports: "Report a user",
    reportsHint: "Help keep Qareeb safe by sending a clear report about harmful behaviour.",
    target: "User ID or username",
    reason: "Reason",
    details: "Additional details",
    sendReport: "Send report",
    backup: "Backup & restore",
    backupHint: "Save a cloud JSON snapshot so room messages can be restored when needed.",
    createBackup: "Create backup now",
    restore: "Restore",
    noBackups: "No backups have been saved for this room.",
    retention: "Retention policy",
    retentionHint: "Set message and admin-log retention in days. 0 means no automatic cleanup.",
    messagesDays: "Message days",
    filesDays: "File days",
    activityDays: "Admin-log days",
    save: "Save policy",
    schedule: "Schedule cleanup",
    scheduleHint: "Cleanup runs on the published server in UTC, not from a browser timer.",
    cron: "Schedule expression",
    scheduleNow: "Enable schedule",
    analytics: "Room analytics",
    activeMembers: "Active members",
    messageCount: "Messages",
    fileCount: "Files",
    activityCount: "Admin notices",
    adminQueue: "Reports queue",
    resolve: "Close report",
    ban: "Ban in room",
    warn: "Warn",
    mute: "Mute in room",
    dismiss: "Dismiss report",
    invalid: "Complete the required fields.",
    saved: "Saved.",
    created: "Backup created.",
    restored: "Restored.",
    scheduled: "Schedule enabled.",
    reportSent: "Report sent for review.",
    install: "Install Qareeb",
    installHint: "Install Qareeb on your phone for quick access in a standalone window.",
    installButton: "Install app",
    unban: "Unban in room",
    inbox: "Notification inbox",
    noNotifications: "No new notifications.",
    markRead: "Mark as read",
    globalAnalytics: "Owner-wide analytics",
    users: "Users",
    rooms: "Rooms",
    openReports: "Open reports",
  },
} as const;

export default function AdvancedToolsView({ language, roomId, deviceId, isAdmin }: Props) {
  const t = copy[language];
  const [targetUserId, setTargetUserId] = useState("");
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [retentionForm, setRetentionForm] = useState({ messageRetentionDays: 0, fileRetentionDays: 0, adminActivityRetentionDays: 365 });
  const [cron, setCron] = useState("0 0 3 * * *");
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const devices = trpc.qareeb.devices.list.useQuery(undefined, { retry: false });
  const reports = trpc.qareeb.reports.list.useQuery({ status: "open" }, { enabled: isAdmin, retry: false });
  const backups = trpc.qareeb.backup.list.useQuery({ roomId, deviceId }, { retry: false });
  const retention = trpc.qareeb.retention.get.useQuery({ roomId, deviceId }, { retry: false });
  const analytics = trpc.qareeb.analytics.room.useQuery({ roomId, deviceId }, { retry: false });
  const globalAnalytics = trpc.qareeb.analytics.global.useQuery(undefined, { enabled: isAdmin, retry: false });
  const notifications = trpc.qareeb.userNotifications.list.useQuery({ unreadOnly: false }, { retry: false });
  const utils = trpc.useUtils();
  const registerDevice = trpc.qareeb.devices.register.useMutation({ onError: error => toast.error(error.message) });
  const revokeDevice = trpc.qareeb.devices.revoke.useMutation({ onSuccess: () => { toast.success(t.saved); void devices.refetch(); } });
  const revokeAll = trpc.qareeb.devices.revokeAll.useMutation({ onSuccess: () => { toast.success(t.saved); void devices.refetch(); } });
  const createReport = trpc.qareeb.reports.create.useMutation({ onSuccess: () => { toast.success(t.reportSent); setTargetUserId(""); setReason(""); setDetails(""); } });
  const createBackup = trpc.qareeb.backup.create.useMutation({ onSuccess: () => { toast.success(t.created); void backups.refetch(); } });
  const restoreBackup = trpc.qareeb.backup.restore.useMutation({ onSuccess: () => { toast.success(t.restored); void utils.qareeb.snapshot.invalidate(); } });
  const saveRetention = trpc.qareeb.retention.update.useMutation({ onSuccess: () => { toast.success(t.saved); void retention.refetch(); } });
  const scheduleRetention = trpc.qareeb.retention.schedule.useMutation({ onSuccess: () => toast.success(t.scheduled) });
  const resolveReport = trpc.qareeb.reports.resolve.useMutation({ onSuccess: () => { toast.success(t.saved); void reports.refetch(); } });
  const markUserNotificationRead = trpc.qareeb.userNotifications.markRead.useMutation({ onSuccess: () => void notifications.refetch() });

  useEffect(() => {
    const stored = (window as Window & { __qareebInstallPrompt?: Event }).__qareebInstallPrompt;
    if (stored) setInstallPrompt(stored as InstallPromptEvent);
    const handler = (event: Event) => { event.preventDefault(); setInstallPrompt(event as InstallPromptEvent); };
    const installed = () => setInstallPrompt(null);
    const ready = () => { const prompt = (window as Window & { __qareebInstallPrompt?: Event }).__qareebInstallPrompt; if (prompt) setInstallPrompt(prompt as InstallPromptEvent); };
    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("qareeb:pwa-ready", ready);
    window.addEventListener("qareeb:pwa-installed", installed);
    return () => { window.removeEventListener("beforeinstallprompt", handler); window.removeEventListener("qareeb:pwa-ready", ready); window.removeEventListener("qareeb:pwa-installed", installed); };
  }, []);

  useEffect(() => {
    if (!deviceId || devices.data?.some(device => device.id === deviceId && !device.revokedAt)) return;
    registerDevice.mutate({ deviceId, label: typeof navigator !== "undefined" ? `${navigator.platform || "Qareeb"}` : "Qareeb device", userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined });
  }, [deviceId, devices.data, registerDevice]);

  useEffect(() => {
    if (!retention.data) return;
    setRetentionForm({ messageRetentionDays: retention.data.messageRetentionDays, fileRetentionDays: retention.data.fileRetentionDays, adminActivityRetentionDays: retention.data.adminActivityRetentionDays });
  }, [retention.data]);

  const installApp = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    setInstallPrompt(null);
  };

  const submitReport = (event: React.FormEvent) => {
    event.preventDefault();
    if (!targetUserId.trim() || !reason.trim()) return toast.error(t.invalid);
    createReport.mutate({ targetUserId: targetUserId.trim(), reason: reason.trim(), details: details.trim() || undefined, roomId });
  };

  return <section className="advanced-tools" aria-label={t.title}>
    <div className="view-heading"><div><p className="eyebrow">{t.title}</p><h2>{t.title}</h2><p>{t.subtitle}</p></div><span className="view-count"><ShieldAlert /> {roomId}</span></div>
    <div className="settings-grid">
      <section className="setting-card"><div className="setting-heading"><span><Laptop /></span><div><h3>{t.devices}</h3><p>{t.devicesHint}</p></div></div><div className="device-list">{devices.isLoading ? <p>{language === "ar" ? "جارٍ التحميل…" : "Loading…"}</p> : devices.data?.length ? devices.data.map(device => <div className="device-row" key={device.id}><div><b>{device.label}{device.id === deviceId ? ` — ${t.current}` : ""}</b><small>{device.userAgent || device.id}</small></div>{device.id !== deviceId && <button type="button" onClick={() => revokeDevice.mutate({ deviceId: device.id })} disabled={revokeDevice.isPending}><Trash2 /> {t.revoke}</button>}</div>) : <p>{t.noDevices}</p>}</div><button type="button" onClick={() => revokeAll.mutate({ exceptDeviceId: deviceId })} disabled={revokeAll.isPending}>{t.revokeAll}</button></section>
      <section className="setting-card"><div className="setting-heading"><span><Download /></span><div><h3>{t.install}</h3><p>{t.installHint}</p></div></div><button type="button" onClick={installApp} disabled={!installPrompt}><Download /> {t.installButton}</button></section>
      <section className="setting-card"><div className="setting-heading"><span><ShieldAlert /></span><div><h3>{t.reports}</h3><p>{t.reportsHint}</p></div></div><form className="tool-form" onSubmit={submitReport}><input value={targetUserId} onChange={event => setTargetUserId(event.target.value)} placeholder={t.target} aria-label={t.target} /><input value={reason} onChange={event => setReason(event.target.value)} placeholder={t.reason} aria-label={t.reason} /><textarea value={details} onChange={event => setDetails(event.target.value)} placeholder={t.details} aria-label={t.details} rows={3} /><button type="submit" disabled={createReport.isPending}>{t.sendReport}</button></form></section>
      <section className="setting-card"><div className="setting-heading"><span><DatabaseBackup /></span><div><h3>{t.backup}</h3><p>{t.backupHint}</p></div></div><button type="button" onClick={() => createBackup.mutate({ roomId, deviceId })} disabled={createBackup.isPending}>{createBackup.isPending ? <RefreshCw className="spin" /> : <DatabaseBackup />} {t.createBackup}</button><div className="backup-list">{backups.data?.length ? backups.data.map(backup => <div className="backup-row" key={backup.id}><span>{new Date(backup.createdAt).toLocaleString(language === "ar" ? "ar" : "en")} · {Math.round(backup.sizeBytes / 1024)} KB</span><button type="button" onClick={() => restoreBackup.mutate({ roomId, deviceId, backupId: backup.id })} disabled={restoreBackup.isPending}>{t.restore}</button></div>) : <p>{t.noBackups}</p>}</div></section>
      <section className="setting-card"><div className="setting-heading"><span><LockKeyhole /></span><div><h3>{t.retention}</h3><p>{t.retentionHint}</p></div></div><div className="tool-form retention-form"><label>{t.messagesDays}<input type="number" min={0} max={3650} value={retentionForm.messageRetentionDays} onChange={event => setRetentionForm(form => ({ ...form, messageRetentionDays: Number(event.target.value) }))} /></label><label>{t.filesDays}<input type="number" min={0} max={3650} value={retentionForm.fileRetentionDays} onChange={event => setRetentionForm(form => ({ ...form, fileRetentionDays: Number(event.target.value) }))} /></label><label>{t.activityDays}<input type="number" min={30} max={3650} value={retentionForm.adminActivityRetentionDays} onChange={event => setRetentionForm(form => ({ ...form, adminActivityRetentionDays: Number(event.target.value) }))} /></label><button type="button" onClick={() => saveRetention.mutate({ roomId, deviceId, ...retentionForm })} disabled={saveRetention.isPending}>{t.save}</button></div><div className="schedule-row"><b>{t.schedule}</b><small>{t.scheduleHint}</small><label>{t.cron}<input value={cron} onChange={event => setCron(event.target.value)} /></label><button type="button" onClick={() => scheduleRetention.mutate({ roomId, deviceId, cron })} disabled={scheduleRetention.isPending}>{t.scheduleNow}</button></div></section>
      <section className="setting-card"><div className="setting-heading"><span><Bell /></span><div><h3>{t.inbox}</h3><p>{language === "ar" ? "تنبيهات المنشن والإجراءات المهمة المرتبطة بحسابك." : "Mentions and important actions linked to your account."}</p></div></div><div className="notification-inbox">{notifications.data?.length ? notifications.data.slice(0, 8).map(notification => <div className="notification-inbox-row" key={notification.id}><div><b>{notification.title}</b><small>{notification.body}</small></div>{!notification.readAt && <button type="button" onClick={() => markUserNotificationRead.mutate({ notificationId: notification.id })}>{t.markRead}</button>}</div>) : <p>{t.noNotifications}</p>}</div></section>
      <section className="setting-card"><div className="setting-heading"><span><Gauge /></span><div><h3>{t.analytics}</h3><p>{language === "ar" ? "مؤشرات موجزة تساعدك على فهم نشاط الغرفة." : "A compact view of room activity."}</p></div></div><div className="analytics-strip"><span><b>{analytics.data?.activeMembers ?? 0}</b>{t.activeMembers}</span><span><b>{analytics.data?.messageCount ?? 0}</b>{t.messageCount}</span><span><b>{analytics.data?.fileCount ?? 0}</b>{t.fileCount}</span><span><b>{analytics.data?.activityCount ?? 0}</b>{t.activityCount}</span></div></section>
      {isAdmin && <section className="setting-card"><div className="setting-heading"><span><Gauge /></span><div><h3>{t.globalAnalytics}</h3><p>{language === "ar" ? "ملخص عام متاح للمالك فقط." : "An owner-only summary across Qareeb."}</p></div></div><div className="analytics-strip"><span><b>{globalAnalytics.data?.roomCount ?? 0}</b>{t.rooms}</span><span><b>{globalAnalytics.data?.userCount ?? 0}</b>{t.users}</span><span><b>{globalAnalytics.data?.messageCount ?? 0}</b>{t.messageCount}</span><span><b>{globalAnalytics.data?.openReportCount ?? 0}</b>{t.openReports}</span></div></section>}
      {isAdmin && <section className="setting-card report-queue-card"><div className="setting-heading"><span><ShieldAlert /></span><div><h3>{t.adminQueue}</h3><p>{language === "ar" ? "راجع البلاغات المفتوحة واتخذ إجراءً موثقًا." : "Review open reports and record a moderation action."}</p></div></div>{reports.data?.length ? reports.data.map(report => <div className="report-row" key={report.id}><div><b>{report.reason}</b><small>{report.details || report.targetUserId}</small></div><button type="button" onClick={() => resolveReport.mutate({ reportId: report.id, status: "resolved", action: report.roomId ? "ban" : "warn" })}>{report.roomId ? t.ban : t.resolve}</button><button type="button" onClick={() => resolveReport.mutate({ reportId: report.id, status: "reviewed", action: "warn" })}>{t.warn}</button>{report.roomId && <button type="button" onClick={() => resolveReport.mutate({ reportId: report.id, status: "reviewed", action: "mute" })}>{t.mute}</button>}<button type="button" onClick={() => resolveReport.mutate({ reportId: report.id, status: "dismissed", action: "dismiss" })}>{t.dismiss}</button>{report.roomId && <button type="button" onClick={() => resolveReport.mutate({ reportId: report.id, status: "resolved", action: "unban" })}>{t.unban}</button>}</div>) : <p>{language === "ar" ? "لا توجد بلاغات مفتوحة." : "No open reports."}</p>}</section>}
    </div>
  </section>;
}

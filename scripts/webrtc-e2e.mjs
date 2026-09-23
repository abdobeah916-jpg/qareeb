import puppeteer from "puppeteer-core";
import { createHash, randomUUID } from "node:crypto";

const baseUrl = "http://localhost:3000/chat?e2e=webrtc";
const room = `VC-${Date.now().toString().slice(-8)}`;
const sender = `sender-${randomUUID()}`;
const recipient = `recipient-${randomUUID()}`;
const conversationId = `direct_${createHash("sha256").update([sender, recipient].sort().join(":")).digest("hex").slice(0, 48)}`;

console.log(`E2E_ROOM=${room}`);
console.log(`E2E_CONVERSATION=${conversationId}`);

const browser = await puppeteer.launch({
  executablePath: "/usr/bin/chromium",
  headless: true,
  args: [
    "--no-sandbox",
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
    "--auto-select-desktop-capture-source=Entire screen",
    "--allow-http-screen-capture",
    "--autoplay-policy=no-user-gesture-required",
  ],
});

async function preparePage(page, deviceId, name, color) {
  await page.evaluateOnNewDocument(() => {
    const AudioContextConstructor = window.AudioContext;
    if (!AudioContextConstructor) return;
    const originalCreateOscillator = AudioContextConstructor.prototype.createOscillator;
    AudioContextConstructor.prototype.createOscillator = function (...args) {
      window.__qareebRingCount = (window.__qareebRingCount ?? 0) + 1;
      return originalCreateOscillator.apply(this, args);
    };
  });
  await page.goto(baseUrl, { waitUntil: "networkidle0" });
  await page.evaluate(({ roomId, id, userName, userColor }) => {
    localStorage.setItem("qareeb-room", roomId);
    localStorage.setItem("qareeb-device", id);
    localStorage.setItem("qareeb-name", userName);
    localStorage.setItem("qareeb-color", userColor);
  }, { roomId: room, id: deviceId, userName: name, userColor: color });
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForSelector(".chat-panel");
}

async function clickByText(page, text) {
  const clicked = await page.evaluate(target => {
    const button = [...document.querySelectorAll("button")].find(element => element.textContent?.replace(/\s+/g, " ").trim().includes(target));
    if (!button) return false;
    button.click();
    return true;
  }, text);
  if (!clicked) throw new Error(`Button not found: ${text}`);
}

async function waitForText(page, text, timeout = 12_000) {
  await page.waitForFunction(target => document.body.innerText.includes(target), { timeout }, text);
}

try {
  const senderContext = await browser.createBrowserContext();
  const recipientContext = await browser.createBrowserContext();
  const senderPage = await senderContext.newPage();
  const recipientPage = await recipientContext.newPage();
  senderPage.on("dialog", dialog => void dialog.accept());
  recipientPage.on("dialog", dialog => void dialog.accept());
  await Promise.all([
    preparePage(senderPage, sender, "مرسل الاختبار", "#1B76F2"),
    preparePage(recipientPage, recipient, "مستقبل الاختبار", "#0CA887"),
  ]);

  await new Promise(resolve => setTimeout(resolve, 1_200));
  await clickByText(senderPage, "الأشخاص");
  await waitForText(senderPage, "مستقبل الاختبار");
  await clickByText(senderPage, "رسالة خاصة");
  await waitForText(senderPage, "محادثة خاصة بين شخصين");

  await new Promise(resolve => setTimeout(resolve, 5_500));
  await clickByText(recipientPage, "الأشخاص");
  await waitForText(recipientPage, "محادثات خاصة");
  await clickByText(recipientPage, "مرسل الاختبار");
  await waitForText(recipientPage, "محادثة خاصة بين شخصين");
  await clickByText(recipientPage, "الرنين مفعّل");
  await recipientPage.waitForFunction(() => localStorage.getItem("qareeb-ringtone-enabled") === "off", { timeout: 12_000 });
  await clickByText(recipientPage, "تفعيل الرنين");
  await recipientPage.waitForFunction(() => localStorage.getItem("qareeb-ringtone-enabled") === "on", { timeout: 12_000 });

  await senderPage.type(".message-field input", "مسودة اختبار الكتابة");
  await recipientPage.waitForFunction(() => document.body.innerText.includes("مرسل الاختبار يكتب الآن"), { timeout: 12_000 });
  await senderPage.focus(".message-field input");
  await senderPage.keyboard.down("Control");
  await senderPage.keyboard.press("KeyA");
  await senderPage.keyboard.up("Control");
  await senderPage.keyboard.press("Backspace");

  await senderPage.waitForSelector("button.start-call:not(:disabled)", { timeout: 12_000 });
  await clickByText(senderPage, "صوت");
  await recipientPage.waitForSelector(".call-banner.incoming .accept", { timeout: 12_000 });
  await recipientPage.waitForFunction(() => (window.__qareebRingCount ?? 0) > 0, { timeout: 6_000 });
  await clickByText(recipientPage, "قبول");
  await waitForText(senderPage, "متصل صوتيًا مع مستقبل الاختبار");
  await waitForText(recipientPage, "متصل صوتيًا مع مرسل الاختبار");
  await clickByText(senderPage, "إنهاء");
  await waitForText(recipientPage, "مكالمة صوتية آمنة");

  await clickByText(senderPage, "فيديو");
  await recipientPage.waitForSelector(".call-banner.incoming .accept", { timeout: 12_000 });
  await clickByText(recipientPage, "قبول");
  await waitForText(senderPage, "متصل مرئيًا مع مستقبل الاختبار");
  await senderPage.waitForSelector(".video-stage video", { timeout: 12_000 });
  const videoCount = await senderPage.$$eval(".video-stage video", videos => videos.length);
  if (videoCount !== 2) throw new Error(`Expected local and remote video elements, received ${videoCount}`);
  await clickByText(senderPage, "كتم الصوت");
  await senderPage.waitForFunction(() => document.querySelector("button[title='تشغيل الميكروفون']")?.getAttribute("aria-pressed") === "true");
  const microphoneMuted = await senderPage.$eval(".video-stage video:last-child", video => !(video.srcObject instanceof MediaStream) || video.srcObject.getAudioTracks().every(track => !track.enabled));
  if (!microphoneMuted) throw new Error("Microphone track remained enabled after mute");
  await clickByText(senderPage, "تشغيل الصوت");
  await senderPage.waitForFunction(() => document.querySelector("button[title='كتم الميكروفون']")?.getAttribute("aria-pressed") === "false");
  await clickByText(senderPage, "إيقاف الكاميرا");
  await senderPage.waitForFunction(() => document.querySelector("button[title='تشغيل الكاميرا']")?.getAttribute("aria-pressed") === "true");
  const cameraOff = await senderPage.$eval(".video-stage video:last-child", video => !(video.srcObject instanceof MediaStream) || video.srcObject.getVideoTracks().every(track => !track.enabled));
  if (!cameraOff) throw new Error("Camera track remained enabled after camera toggle");
  await clickByText(senderPage, "تشغيل الكاميرا");
  await senderPage.waitForFunction(() => document.querySelector("button[title='إيقاف الكاميرا']")?.getAttribute("aria-pressed") === "false");
  await clickByText(senderPage, "مشاركة الشاشة");
  await senderPage.waitForFunction(() => document.querySelector("button[title='إيقاف مشاركة الشاشة']")?.getAttribute("aria-pressed") === "true", { timeout: 12_000 });
  await clickByText(senderPage, "إيقاف المشاركة");
  await senderPage.waitForFunction(() => document.querySelector("button[title='مشاركة الشاشة']")?.getAttribute("aria-pressed") === "false", { timeout: 12_000 });
  await clickByText(senderPage, "إنهاء");
  await waitForText(recipientPage, "مكالمة مرئية آمنة");

  const callHistory = await senderPage.evaluate(async ({ conversationId, deviceId }) => {
    const input = encodeURIComponent(JSON.stringify({ 0: { json: { conversationId, deviceId } } }));
    const response = await fetch(`/api/trpc/direct.calls?batch=1&input=${input}`);
    const body = await response.json();
    return body[0]?.result?.data?.json ?? [];
  }, { conversationId, deviceId: sender });
  if (callHistory.length < 2 || !callHistory.some(call => call.callType === "video" && call.status === "ended")) throw new Error("Video call was not recorded as ended");
  await senderPage.click("button[aria-label='معلومات الغرفة']");
  await waitForText(senderPage, "مسح الكل");
  await senderPage.click("button[aria-label='حذف سجل المكالمة']");
  await senderPage.waitForFunction(async ({ id, deviceId }) => {
    const input = encodeURIComponent(JSON.stringify({ 0: { json: { conversationId: id, deviceId } } }));
    const response = await fetch(`/api/trpc/direct.calls?batch=1&input=${input}`);
    const body = await response.json();
    return (body[0]?.result?.data?.json ?? []).length === 1;
  }, {}, { id: conversationId, deviceId: sender });
  await clickByText(senderPage, "مسح الكل");
  await senderPage.waitForFunction(async ({ id, deviceId }) => {
    const input = encodeURIComponent(JSON.stringify({ 0: { json: { conversationId: id, deviceId } } }));
    const response = await fetch(`/api/trpc/direct.calls?batch=1&input=${input}`);
    const body = await response.json();
    return (body[0]?.result?.data?.json ?? []).length === 0;
  }, {}, { id: conversationId, deviceId: sender });

  await clickByText(recipientPage, "الرجوع للغرفة المشتركة");
  await senderPage.type(".message-field input", "رسالة الإشعار الأولى");
  await clickByText(senderPage, "إرسال");
  await waitForText(recipientPage, "رسالة خاصة جديدة");

  await new Promise(resolve => setTimeout(resolve, 5_000));
  await clickByText(recipientPage, "الأشخاص");
  await clickByText(recipientPage, "مرسل الاختبار");
  await waitForText(recipientPage, "محادثة خاصة بين شخصين");
  await senderPage.waitForFunction(() => document.body.innerText.includes("تمت القراءة"), { timeout: 12_000 });
  const preferenceResponse = recipientPage.waitForResponse(response => response.url().includes("/api/trpc/direct.setPreferences") && response.request().method() === "POST", { timeout: 12_000 });
  await clickByText(recipientPage, "كتم الإشعارات");
  const preferenceResult = await preferenceResponse;
  if (!preferenceResult.ok()) throw new Error(`Mute preference request failed with ${preferenceResult.status()}`);
  await recipientPage.waitForSelector(".private-controls button.selected", { timeout: 12_000 });
  await clickByText(recipientPage, "الرجوع للغرفة المشتركة");

  await senderPage.type(".message-field input", "رسالة الإشعار المكتومة");
  await clickByText(senderPage, "إرسال");
  await new Promise(resolve => setTimeout(resolve, 1_500));
  const mutedNotification = await recipientPage.evaluate(() => document.body.innerText.includes("رسالة خاصة جديدة"));
  if (mutedNotification) throw new Error("Muted conversation displayed a private-message notification");
  await recipientPage.waitForSelector(".unread-badge", { timeout: 12_000 });
  const unreadCount = await recipientPage.$eval(".unread-badge", element => element.textContent?.trim());
  if (unreadCount !== "1") throw new Error(`Expected 1 unread private message, received ${unreadCount}`);

  console.log("WEBRTC_E2E=passed");
} finally {
  await browser.close();
}

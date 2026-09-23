import puppeteer from "puppeteer-core";
import { createHash, randomUUID } from "node:crypto";

const room = `TR-${Date.now().toString().slice(-8)}`;
const sender = `typing-sender-${randomUUID()}`;
const recipient = `typing-recipient-${randomUUID()}`;
const conversationId = `direct_${createHash("sha256").update([sender, recipient].sort().join(":")) .digest("hex").slice(0, 48)}`.replace(" )", ")");

async function clickByText(page, text) {
  const clicked = await page.evaluate(target => {
    const button = [...document.querySelectorAll("button")].find(item => item.textContent?.replace(/\s+/g, " ").trim().includes(target));
    if (!button) return false;
    button.click();
    return true;
  }, text);
  if (!clicked) throw new Error(`Button not found: ${text}`);
}

async function preparePage(page, deviceId, name, color) {
  await page.goto("http://localhost:3000/chat?e2e=typing-read", { waitUntil: "networkidle0" });
  await page.evaluate(({ roomId, id, userName, userColor }) => {
    localStorage.setItem("qareeb-room", roomId);
    localStorage.setItem("qareeb-device", id);
    localStorage.setItem("qareeb-name", userName);
    localStorage.setItem("qareeb-color", userColor);
  }, { roomId: room, id: deviceId, userName: name, userColor: color });
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForSelector(".chat-panel");
}

const browser = await puppeteer.launch({ executablePath: "/usr/bin/chromium", headless: true, args: ["--no-sandbox"] });
try {
  const senderContext = await browser.createBrowserContext();
  const recipientContext = await browser.createBrowserContext();
  const senderPage = await senderContext.newPage();
  const recipientPage = await recipientContext.newPage();
  await Promise.all([preparePage(senderPage, sender, "مرسل الكتابة", "#1B76F2"), preparePage(recipientPage, recipient, "مستقبل القراءة", "#0CA887")]);
  await new Promise(resolve => setTimeout(resolve, 5_500));
  await clickByText(senderPage, "الأشخاص");
  await senderPage.waitForFunction(() => document.body.innerText.includes("مستقبل القراءة"));
  await clickByText(senderPage, "رسالة خاصة");
  await senderPage.waitForSelector(".message-field input");
  await clickByText(recipientPage, "الأشخاص");
  await recipientPage.waitForFunction(() => document.body.innerText.includes("محادثات خاصة"));
  await recipientPage.waitForFunction(() => [...document.querySelectorAll(".saved-conversation")].some(item => item.textContent?.includes("مرسل الكتابة")), { timeout: 12_000 });
  await clickByText(recipientPage, "مرسل الكتابة");
  await recipientPage.waitForSelector(".message-field input");
  await senderPage.type(".message-field input", "رسالة لتأكيد القراءة");
  await senderPage.click(".send-button");
  await recipientPage.waitForFunction(() => document.body.innerText.includes("رسالة لتأكيد القراءة"), { timeout: 12_000 });
  await senderPage.waitForFunction(() => document.body.innerText.includes("تمت القراءة"), { timeout: 12_000 });
  await senderPage.type(".message-field input", "مسودة كتابة");
  await recipientPage.waitForFunction(() => document.body.innerText.includes("مرسل الكتابة يكتب الآن"), { timeout: 12_000 });
  console.log(`E2E_TYPING_ROOM=${room}`);
  console.log(`E2E_TYPING_CONVERSATION=${conversationId}`);
  console.log("TYPING_READ_E2E=passed");
} finally {
  await browser.close();
}

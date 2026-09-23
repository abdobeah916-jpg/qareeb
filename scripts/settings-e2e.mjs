import puppeteer from "puppeteer-core";
import { randomUUID } from "node:crypto";

const room = `SE-${Date.now().toString().slice(-8)}`;
const deviceId = `settings-${randomUUID()}`;

async function clickByText(page, text) {
  const clicked = await page.evaluate(target => {
    const button = [...document.querySelectorAll("button")].find(item => item.textContent?.replace(/\s+/g, " ").trim().includes(target));
    if (!button) return false;
    button.click();
    return true;
  }, text);
  if (!clicked) throw new Error(`Button not found: ${text}`);
}

const browser = await puppeteer.launch({ executablePath: "/usr/bin/chromium", headless: true, args: ["--no-sandbox"] });
try {
  const page = await browser.newPage();
  await page.goto("http://localhost:3000/chat?e2e=settings", { waitUntil: "networkidle0" });
  await page.evaluate(({ roomId, id }) => {
    localStorage.setItem("qareeb-room", roomId);
    localStorage.setItem("qareeb-device", id);
    localStorage.setItem("qareeb-name", "الاسم السابق");
    localStorage.setItem("qareeb-color", "#1B76F2");
    localStorage.setItem("theme", "light");
  }, { roomId: room, id: deviceId });
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForSelector(".chat-panel");
  await page.click('[title="الإعدادات"]');
  await page.waitForSelector(".settings-view");
  await page.waitForSelector("#qareeb-display-name");
  await clickByText(page, "تفعيل الوضع الليلي");
  await page.waitForFunction(() => document.documentElement.classList.contains("dark"));
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForSelector(".chat-panel");
  await page.waitForFunction(() => document.documentElement.classList.contains("dark"));
  await page.click('[title="الإعدادات"]');
  await page.waitForSelector("#qareeb-display-name");
  await page.locator("#qareeb-display-name").fill("اسم محدث من الإعدادات");
  await clickByText(page, "حفظ");
  await page.waitForFunction(() => localStorage.getItem("qareeb-name") === "اسم محدث من الإعدادات");
  const promptStillPresent = await page.evaluate(() => document.body.innerText.includes("تعديل الاسم"));
  if (promptStillPresent) throw new Error("Legacy name-edit action is still present outside settings");
  console.log(`E2E_SETTINGS_ROOM=${room}`);
  console.log("SETTINGS_E2E=passed");
} finally {
  await browser.close();
}

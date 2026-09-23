import puppeteer from "puppeteer-core";
import { randomUUID } from "node:crypto";
import { rm, writeFile } from "node:fs/promises";

const room = `RP-${Date.now().toString().slice(-8)}`;
const ownerId = `room-owner-${randomUUID()}`;
const memberId = `room-member-${randomUUID()}`;
const filePath = "/tmp/qareeb-pinned-file.txt";

async function preparePage(page, deviceId, name, color) {
  await page.goto("http://localhost:3000/chat?e2e=room-pin", { waitUntil: "networkidle0" });
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
    const button = [...document.querySelectorAll("button")].find(item => item.textContent?.replace(/\s+/g, " ").trim().includes(target));
    if (!button) return false;
    button.click();
    return true;
  }, text);
  if (!clicked) throw new Error(`Button not found: ${text}`);
}

const browser = await puppeteer.launch({ executablePath: "/usr/bin/chromium", headless: true, args: ["--no-sandbox"] });
try {
  await writeFile(filePath, "ملف اختبار التثبيت");
  const ownerContext = await browser.createBrowserContext();
  const memberContext = await browser.createBrowserContext();
  const ownerPage = await ownerContext.newPage();
  const memberPage = await memberContext.newPage();
  await preparePage(ownerPage, ownerId, "مالك الغرفة", "#1B76F2");
  await new Promise(resolve => setTimeout(resolve, 900));
  await preparePage(memberPage, memberId, "عضو الغرفة", "#0CA887");

  await ownerPage.type(".message-field input", "رسالة مهمة للتثبيت");
  await clickByText(ownerPage, "إرسال");
  await ownerPage.waitForFunction(() => document.body.innerText.includes("رسالة مهمة للتثبيت"));
  await clickByText(ownerPage, "تثبيت الرسالة");
  await ownerPage.waitForFunction(() => document.querySelector(".pinned-message-card")?.textContent?.includes("رسالة مهمة للتثبيت"));

  const attachmentInput = await ownerPage.$("#qareeb-file");
  if (!attachmentInput) throw new Error("Attachment input is missing");
  await attachmentInput.uploadFile(filePath);
  await ownerPage.waitForSelector(".attachment-preview");
  await ownerPage.type(".message-field input", "مرفق للتثبيت");
  await clickByText(ownerPage, "إرسال");
  await ownerPage.waitForSelector(".attachment-preview", { hidden: true });
  await ownerPage.waitForFunction(() => [...document.querySelectorAll(".pin-message-button")].some(button => button.textContent?.includes("تثبيت الملف")));
  await clickByText(ownerPage, "تثبيت الملف");
  await ownerPage.waitForFunction(() => document.querySelector(".pinned-message-card")?.textContent?.includes("qareeb-pinned-file.txt"));
  await memberPage.waitForFunction(() => document.querySelector(".pinned-message-card")?.textContent?.includes("qareeb-pinned-file.txt"), { timeout: 12_000 });

  console.log(`E2E_ROOM_PIN_ROOM=${room}`);
  console.log("ROOM_PIN_E2E=passed");
} finally {
  await browser.close();
  await rm(filePath, { force: true });
}

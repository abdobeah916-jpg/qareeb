import puppeteer from "puppeteer-core";
import { randomUUID } from "node:crypto";

const room = `MD-${Date.now().toString().slice(-8)}`;
const ownerId = `moderator-owner-${randomUUID()}`;
const moderatorId = `moderator-user-${randomUUID()}`;
const updatedName = "غرفة صلاحيات المشرف";

async function preparePage(page, deviceId, name, color) {
  await page.goto("http://localhost:3000/chat?e2e=moderators", { waitUntil: "networkidle0" });
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
  const ownerContext = await browser.createBrowserContext();
  const moderatorContext = await browser.createBrowserContext();
  const ownerPage = await ownerContext.newPage();
  const moderatorPage = await moderatorContext.newPage();
  await preparePage(ownerPage, ownerId, "مالك المشرفين", "#1B76F2");
  await new Promise(resolve => setTimeout(resolve, 900));
  await preparePage(moderatorPage, moderatorId, "مشرف التجربة", "#0CA887");
  await ownerPage.click('[aria-label="معلومات الغرفة"]');
  await ownerPage.waitForSelector(".moderator-management-card");
  await ownerPage.waitForSelector(".moderator-candidates button", { timeout: 12_000 });
  const assignButton = await ownerPage.$(".moderator-candidates button");
  if (!assignButton) throw new Error("Moderator candidate button is missing");
  if (await assignButton.evaluate(button => button instanceof HTMLButtonElement && button.disabled)) throw new Error("Moderator candidate button is unexpectedly disabled");
  await ownerPage.evaluate(() => (document.querySelector(".moderator-candidates button") instanceof HTMLElement) && document.querySelector(".moderator-candidates button")?.click());
  await ownerPage.waitForSelector(".managed-moderator");

  const renamePermission = await ownerPage.evaluate(() => [...document.querySelectorAll(".permission-toggles button")].find(button => button.textContent?.includes("تغيير الاسم"))?.getAttribute("aria-pressed"));
  if (renamePermission !== "false") throw new Error("Unexpected default rename permission");
  await ownerPage.evaluate(() => [...document.querySelectorAll(".permission-toggles button")].find(button => button.textContent?.includes("تغيير الاسم"))?.click());
  await ownerPage.waitForFunction(() => [...document.querySelectorAll(".permission-toggles button")].some(button => button.textContent?.includes("تغيير الاسم") && button.getAttribute("aria-pressed") === "true"));

  await moderatorPage.click('[aria-label="معلومات الغرفة"]');
  await moderatorPage.waitForSelector(".moderator-tools", { timeout: 12_000 });
  await moderatorPage.waitForSelector("#qareeb-moderator-room-name", { timeout: 12_000 });
  await moderatorPage.click("#qareeb-moderator-room-name", { clickCount: 3 });
  await moderatorPage.type("#qareeb-moderator-room-name", updatedName);
  await moderatorPage.click(".moderator-tools form button");
  await moderatorPage.waitForFunction(name => document.querySelector(".chat-heading h1")?.textContent?.includes(name), {}, updatedName);
  console.log(`E2E_MODERATOR_ROOM=${room}`);
  console.log("MODERATOR_PERMISSIONS_E2E=passed");
} finally {
  await browser.close();
}

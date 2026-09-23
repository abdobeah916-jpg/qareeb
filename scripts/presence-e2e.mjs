import puppeteer from "puppeteer-core";
import mysql from "mysql2/promise";
import { randomUUID } from "node:crypto";

const room = `PS-${Date.now().toString().slice(-8)}`;
const ownerId = `presence-owner-${randomUUID()}`;
const peerId = `presence-peer-${randomUUID()}`;

async function preparePage(page, deviceId, name, color) {
  await page.goto("http://localhost:3000/chat?e2e=presence", { waitUntil: "networkidle0" });
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
  const ownerContext = await browser.createBrowserContext();
  const peerContext = await browser.createBrowserContext();
  const ownerPage = await ownerContext.newPage();
  const peerPage = await peerContext.newPage();
  await preparePage(ownerPage, ownerId, "مالك الحضور", "#1B76F2");
  await preparePage(peerPage, peerId, "عضو الحضور", "#0CA887");
  await clickByText(ownerPage, "الأشخاص");
  await ownerPage.waitForFunction(() => document.body.innerText.includes("عضو الحضور") && document.body.innerText.includes("متصل الآن"));

  await peerPage.close();
  const database = await mysql.createConnection(process.env.DATABASE_URL);
  await database.execute("UPDATE chatParticipants SET lastSeen = DATE_SUB(NOW(), INTERVAL 2 MINUTE) WHERE roomId = ? AND deviceId = ?", [room, peerId]);
  await database.end();
  await ownerPage.waitForFunction(() => document.body.innerText.includes("آخر ظهور قبل") && document.querySelector(".person-card.offline"), { timeout: 12_000 });
  const offlineDisabled = await ownerPage.$eval(".person-card.offline button", button => (button instanceof HTMLButtonElement ? button.disabled : false));
  if (!offlineDisabled) throw new Error("Offline participant still permits starting a direct conversation");
  console.log(`E2E_PRESENCE_ROOM=${room}`);
  console.log("PRESENCE_E2E=passed");
} finally {
  await browser.close();
}

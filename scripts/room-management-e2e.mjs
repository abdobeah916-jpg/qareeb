import puppeteer from "puppeteer-core";
import { randomUUID } from "node:crypto";

const room = `RM-${Date.now().toString().slice(-8)}`;
const ownerId = `manage-owner-${randomUUID()}`;
const memberId = `manage-member-${randomUUID()}`;
const renamedRoom = "غرفة الإدارة التجريبية";

async function preparePage(page, deviceId, name, color) {
  await page.goto("http://localhost:3000/chat?e2e=room-management", { waitUntil: "networkidle0" });
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
  const memberContext = await browser.createBrowserContext();
  const ownerPage = await ownerContext.newPage();
  const memberPage = await memberContext.newPage();
  ownerPage.on("dialog", dialog => dialog.accept());

  await preparePage(ownerPage, ownerId, "مالك الإدارة", "#1B76F2");
  await new Promise(resolve => setTimeout(resolve, 900));
  await preparePage(memberPage, memberId, "عضو الإدارة", "#0CA887");
  await ownerPage.click('[aria-label="معلومات الغرفة"]');
  await ownerPage.waitForSelector(".room-management-card");

  await ownerPage.click("#qareeb-room-name", { clickCount: 3 });
  await ownerPage.type("#qareeb-room-name", renamedRoom);
  await ownerPage.click(".room-management-card form button");
  await ownerPage.waitForFunction(name => document.querySelector(".chat-heading h1")?.textContent?.includes(name), {}, renamedRoom);

  await ownerPage.waitForSelector(".managed-member button.remove");
  await ownerPage.click(".managed-member button.remove");
  await ownerPage.waitForSelector(".managed-member button.restore");
  await memberPage.reload({ waitUntil: "networkidle0" });
  await memberPage.waitForFunction(() => document.body.innerText.includes("لقد أزالك مالك الغرفة"), { timeout: 12_000 });

  await ownerPage.click(".managed-member button.restore");
  await memberPage.reload({ waitUntil: "networkidle0" });
  await ownerPage.waitForFunction(() => [...document.querySelectorAll(".managed-member small")].some(item => item.textContent?.includes("متصل الآن")), { timeout: 12_000 });
  console.log(`E2E_ROOM_MANAGEMENT_ROOM=${room}`);
  console.log("ROOM_MANAGEMENT_E2E=passed");
} finally {
  await browser.close();
}

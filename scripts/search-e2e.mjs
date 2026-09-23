import puppeteer from "puppeteer-core";
import { randomUUID } from "node:crypto";
import { rm, writeFile } from "node:fs/promises";

const room = `SR-${Date.now().toString().slice(-8)}`;
const deviceId = `search-${randomUUID()}`;
const filePath = "/tmp/qareeb-search-document.txt";
const browser = await puppeteer.launch({ executablePath: "/usr/bin/chromium", headless: true, args: ["--no-sandbox"] });

try {
  await writeFile(filePath, "ملف اختبار البحث");
  const page = await browser.newPage();
  await page.goto("http://localhost:3000/chat?e2e=search", { waitUntil: "networkidle0" });
  await page.evaluate(({ nextRoom, nextDevice }) => {
    localStorage.setItem("qareeb-room", nextRoom);
    localStorage.setItem("qareeb-device", nextDevice);
    localStorage.setItem("qareeb-name", "باحث الاختبار");
    localStorage.setItem("qareeb-color", "#1B76F2");
  }, { nextRoom: room, nextDevice: deviceId });
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForSelector(".chat-panel");
  await page.type(".message-field input", "وثيقة search قابلة للعثور");
  const input = await page.$("#qareeb-file");
  if (!input) throw new Error("Attachment input is missing");
  await input.uploadFile(filePath);
  await page.waitForSelector(".attachment-preview");
  await page.evaluate(() => [...document.querySelectorAll("button")].find(button => button.textContent?.includes("إرسال"))?.click());
  await page.waitForFunction(() => document.body.innerText.includes("وثيقة search قابلة للعثور"));
  await page.click('button[aria-label="البحث"]');
  await page.waitForSelector(".message-search input");
  await page.type(".message-search input", "search");
  await page.waitForFunction(() => document.querySelectorAll(".search-message-result").length === 1 && document.querySelectorAll(".search-file-list a").length === 1);
  const results = await page.$$eval(".search-file-list a", nodes => nodes.map(node => node.textContent?.replace(/\s+/g, " ").trim()));
  if (!results[0]?.includes("qareeb-search-document.txt")) throw new Error("Attachment search result is missing");
  console.log(`E2E_SEARCH_ROOM=${room}`);
  console.log("SEARCH_E2E=passed");
} finally {
  await browser.close();
  await rm(filePath, { force: true });
}

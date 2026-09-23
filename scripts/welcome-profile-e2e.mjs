import puppeteer from "puppeteer-core";
import { writeFile, rm } from "node:fs/promises";

const pixelPng = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL9AAAAAElFTkSuQmCC";
const testImagePath = "/tmp/qareeb-profile-e2e.png";
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
  await writeFile(testImagePath, Buffer.from(pixelPng, "base64"));
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto("http://localhost:3000/", { waitUntil: "networkidle0" });
  await clickByText(page, "ابدأ الآن");
  await page.waitForFunction(() => location.pathname === "/chat");
  const deviceId = await page.evaluate(() => localStorage.getItem("qareeb-device"));
  if (!deviceId) throw new Error("Missing local device identity");
  console.log(`E2E_DEVICE_PROFILE=${deviceId}`);
  await page.click('button[aria-label="الإعدادات"]');
  await page.waitForSelector("#qareeb-avatar");
  const input = await page.$("#qareeb-avatar");
  if (!input) throw new Error("Avatar input is missing");
  await input.uploadFile(testImagePath);
  await page.waitForFunction(() => document.querySelector(".avatar-setting-card img")?.getAttribute("src")?.startsWith("/manus-storage/"));
  await page.waitForFunction(() => document.querySelector(".profile-button img")?.getAttribute("src")?.startsWith("/manus-storage/"));
  await clickByText(page, "عرض صفحة التعريف");
  await page.waitForFunction(() => location.search.includes("welcome=1"));
  console.log("WELCOME_PROFILE_E2E=passed");
} finally {
  await browser.close();
  await rm(testImagePath, { force: true });
}

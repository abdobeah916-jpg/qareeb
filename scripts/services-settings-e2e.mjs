import puppeteer from "puppeteer-core";

const browser = await puppeteer.launch({
  executablePath: "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox"],
});

async function clickByText(page, text) {
  const clicked = await page.evaluate(target => {
    const button = [...document.querySelectorAll("button")].find(item => item.textContent?.replace(/\s+/g, " ").trim().includes(target));
    if (!button) return false;
    button.click();
    return true;
  }, text);
  if (!clicked) throw new Error(`Button not found: ${text}`);
}

try {
  const page = await browser.newPage();
  await page.goto("http://localhost:3000/chat?e2e=services-settings", { waitUntil: "networkidle0" });
  await page.waitForSelector(".chat-panel");

  await clickByText(page, "الخدمات");
  await page.waitForFunction(() => document.body.innerText.includes("أحدث الخدمات"));
  await page.waitForSelector(".service-grid .service-card");
  const serviceCount = await page.$$eval(".service-grid .service-card", cards => cards.length);
  if (serviceCount !== 4) throw new Error(`Expected 4 services, received ${serviceCount}`);
  await clickByText(page, "فتح المحادثات");
  await page.waitForSelector(".chat-panel");

  await page.click("button[aria-label='الإعدادات']");
  await page.waitForFunction(() => document.body.innerText.includes("إعدادات المساحة"));
  await clickByText(page, "أزرق متزن");
  await page.waitForFunction(() => document.documentElement.dataset.qareebAppearance === "ocean");
  await clickByText(page, "ورقية");
  await page.waitForFunction(() => document.documentElement.dataset.qareebReadingBackdrop === "paper");
  await clickByText(page, "استخدم وضعًا مضغوطًا");
  await page.waitForFunction(() => document.documentElement.dataset.qareebDensity === "compact");
  const stored = await page.evaluate(() => ({ appearance: localStorage.getItem("qareeb-appearance"), density: localStorage.getItem("qareeb-compact-reading"), backdrop: localStorage.getItem("qareeb-reading-backdrop") }));
  if (stored.appearance !== "ocean" || stored.density !== "on" || stored.backdrop !== "paper") throw new Error("Settings were not persisted locally");
  await clickByText(page, "العودة إلى المحادثات");
  await page.waitForSelector(".chat-panel");
  const readingBackground = await page.$eval(".messages", node => getComputedStyle(node).backgroundImage);
  if (!readingBackground.includes("repeating-linear-gradient")) throw new Error("Paper reading background was not applied to messages");
  console.log("SERVICES_SETTINGS_E2E=passed");
} finally {
  await browser.close();
}

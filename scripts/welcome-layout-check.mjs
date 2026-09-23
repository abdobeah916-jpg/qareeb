import puppeteer from "puppeteer-core";

const browser = await puppeteer.launch({ executablePath: "/usr/bin/chromium", headless: true, args: ["--no-sandbox"] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto("http://localhost:3000/", { waitUntil: "networkidle0" });
  const layout = await page.evaluate(() => {
    const hero = document.querySelector(".welcome-hero")?.getBoundingClientRect();
    const copy = document.querySelector(".welcome-copy")?.getBoundingClientRect();
    return { clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth, hero, copy };
  });
  if (layout.scrollWidth !== layout.clientWidth) throw new Error(`Horizontal overflow: ${JSON.stringify(layout)}`);
  if (!layout.hero || !layout.copy || layout.hero.right > layout.clientWidth || layout.copy.right > layout.clientWidth) throw new Error(`Welcome content exceeds viewport: ${JSON.stringify(layout)}`);
  await page.evaluate(() => {
    const button = [...document.querySelectorAll("button")].find(item => item.textContent?.includes("ابدأ الآن"));
    if (!button) throw new Error("Welcome action is missing");
    button.click();
  });
  await page.waitForFunction(() => location.pathname === "/chat");
  const welcomeSeen = await page.evaluate(() => localStorage.getItem("qareeb-welcome-seen"));
  if (welcomeSeen !== "true") throw new Error("Welcome completion was not stored");
  console.log("WELCOME_LAYOUT=passed");
} finally {
  await browser.close();
}

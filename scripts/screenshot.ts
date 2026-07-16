/**
 * Headless full-page screenshot, for visual review of local pages (by Claude or
 * anyone without a browser at hand).
 *
 *   bun run shot <url-or-path> [outfile] [--width=1440] [--height=900] [--motion]
 *
 * Examples:
 *   bun run shot /landing                      # → /tmp/shot-landing.png
 *   bun run shot / /tmp/dash.png --width=390   # mobile-ish dashboard
 *
 * Emulates prefers-reduced-motion by default so scroll-reveal content is fully
 * visible in the capture (pass --motion to keep animations). Uses the Playwright
 * browsers cached in ~/Library/Caches/ms-playwright.
 */
import { chromium } from "playwright";

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const flags = process.argv.slice(2).filter((a) => a.startsWith("--"));
const flag = (name: string, dflt: number) =>
  Number(flags.find((f) => f.startsWith(`--${name}=`))?.split("=")[1] ?? dflt);

const target = args[0] ?? "/";
const url = target.startsWith("http") ? target : `http://localhost:5173${target}`;
const out =
  args[1] ?? `/tmp/shot-${(new URL(url).pathname.replaceAll("/", "-").replace(/^-|-$/g, "") || "root")}.png`;

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: flag("width", 1440), height: flag("height", 900) },
  reducedMotion: flags.includes("--motion") ? "no-preference" : "reduce",
});
try {
  await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
  await page.waitForTimeout(600); // fonts/late paints
  await page.screenshot({ path: out, fullPage: true });
  console.log(`✅ ${url} → ${out}`);
} catch (e) {
  console.error(`Failed to capture ${url}:`, e instanceof Error ? e.message : e);
  process.exit(1);
} finally {
  await browser.close();
}

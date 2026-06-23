import express from "express";
import puppeteer from "puppeteer";

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || "127.0.0.1";
const STATIC_BASE = process.env.STATIC_BASE || "http://127.0.0.1";
const NAV_TIMEOUT = Number(process.env.NAV_TIMEOUT_MS || 15000);
const RENDER_TIMEOUT = Number(process.env.RENDER_TIMEOUT_MS || 10000);

let browserPromise = null;
function getBrowser() {
  if (browserPromise) return browserPromise;
  browserPromise = puppeteer
    .launch({
      headless: "shell",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--hide-scrollbars",
      ],
    })
    .then((b) => {
      b.on("disconnected", () => {
        browserPromise = null;
      });
      return b;
    })
    .catch((e) => {
      browserPromise = null;
      throw e;
    });
  return browserPromise;
}

const app = express();
app.disable("x-powered-by");

app.get("/healthz", (_req, res) => res.type("text/plain").send("ok"));

app.get("/api", async (req, res) => {
  const text = String(req.query.text ?? "").slice(0, 200);
  const imgRaw = String(req.query.img ?? "0");
  const img = /^\d+$/.test(imgRaw) ? Number(imgRaw) : 0;

  let page;
  try {
    const browser = await getBrowser();
    page = await browser.newPage();
    await page.setViewport({ width: 1080, height: 1006, deviceScaleFactor: 1 });

    const target = `${STATIC_BASE}/?text=${encodeURIComponent(text)}&img=${img}`;
    await page.goto(target, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });

    await page.waitForFunction(
      () => {
        const cv = document.getElementById("c");
        if (!cv || !cv.width || !cv.height) return false;
        const ctx = cv.getContext("2d");
        if (!ctx) return false;
        const x = Math.floor(cv.width / 2);
        const y = Math.floor(cv.height / 2);
        const px = ctx.getImageData(x, y, 1, 1).data;
        return px[3] > 0;
      },
      { timeout: RENDER_TIMEOUT },
    );

    const size = await page.evaluate(() => {
      const cv = document.getElementById("c");
      return { w: cv.width, h: cv.height };
    });

    await page.setViewport({ width: size.w, height: size.h, deviceScaleFactor: 1 });

    const png = await page.screenshot({
      type: "png",
      clip: { x: 0, y: 0, width: size.w, height: size.h },
      omitBackground: false,
    });

    const safe = (text || "meme").replace(/[\\/:*?"<>|\r\n]+/g, "_").slice(0, 40);
    const buf = Buffer.isBuffer(png) ? png : Buffer.from(png);
    res
      .status(200)
      .set({
        "Content-Type": "image/png",
        "Content-Length": buf.length,
        "Content-Disposition": `inline; filename="${encodeURIComponent(safe)}.png"`,
        "Cache-Control": "public, max-age=3600",
      })
      .end(buf);
  } catch (e) {
    const msg = `${e?.name ?? "Error"}: ${e?.message ?? String(e)}\n${e?.stack ?? ""}`;
    res.status(500).type("text/plain; charset=utf-8").send(msg);
  } finally {
    if (page) {
      try { await page.close(); } catch {}
    }
  }
});

app.listen(PORT, HOST, () => {
  console.log(`meme-render listening on http://${HOST}:${PORT} (static base: ${STATIC_BASE})`);
});

async function shutdown() {
  try {
    if (browserPromise) {
      const b = await browserPromise;
      await b.close();
    }
  } catch {}
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

import express from "express";
import puppeteer from "puppeteer";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || "127.0.0.1";
const STATIC_BASE = process.env.STATIC_BASE || "http://127.0.0.1";
const NAV_TIMEOUT = Number(process.env.NAV_TIMEOUT_MS || 15000);
const RENDER_TIMEOUT = Number(process.env.RENDER_TIMEOUT_MS || 10000);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IMAGES_DIR = path.resolve(__dirname, "..", "images");
const EXTS = ["jpg", "jpeg", "png", "webp", "gif"];
const collator = new Intl.Collator("zh-Hans-CN");

function stripExt(name) {
  const i = name.lastIndexOf(".");
  if (i <= 0) return null;
  const ext = name.slice(i + 1).toLowerCase();
  if (!EXTS.includes(ext)) return null;
  return { base: name.slice(0, i), ext };
}

function pickByExtPriority(entries) {
  const byBase = new Map();
  for (const e of entries) {
    const cur = byBase.get(e.base);
    if (!cur || EXTS.indexOf(e.ext) < EXTS.indexOf(cur.ext)) byBase.set(e.base, e);
  }
  return [...byBase.keys()];
}

function scanManifest() {
  const out = {};
  let top;
  try {
    top = fs.readdirSync(IMAGES_DIR, { withFileTypes: true });
  } catch {
    return out;
  }
  const topFiles = [];
  const topDirs = [];
  for (const d of top) {
    if (d.name.startsWith(".")) continue;
    if (d.isDirectory()) topDirs.push(d.name);
    else if (d.isFile()) {
      const p = stripExt(d.name);
      if (p) topFiles.push(p);
    }
  }
  const standalone = pickByExtPriority(topFiles).sort(collator.compare);
  for (const base of standalone) out[base] = base;

  for (const dir of topDirs.sort(collator.compare)) {
    const sub = [];
    let entries;
    try {
      entries = fs.readdirSync(path.join(IMAGES_DIR, dir), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (e.name.startsWith(".") || !e.isFile()) continue;
      const p = stripExt(e.name);
      if (p) sub.push(p);
    }
    const bases = pickByExtPriority(sub).sort(collator.compare);
    if (!bases.length) continue;
    const group = {};
    for (const base of bases) group[base] = `${dir}/${base}`;
    out[dir] = group;
  }
  return out;
}

function resolveImg(img) {
  if (typeof img !== "string") return null;
  const trimmed = img.trim();
  if (!trimmed) return null;
  if (trimmed.includes("\\") || trimmed.startsWith("/")) return null;
  const norm = path.posix.normalize(trimmed);
  if (norm !== trimmed) return null;
  if (norm.includes("..")) return null;
  const segments = norm.split("/");
  if (segments.length > 2) return null;
  for (const ext of EXTS) {
    if (fs.existsSync(path.join(IMAGES_DIR, ...segments) + "." + ext)) return norm;
  }
  return null;
}

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

app.get("/api/manifest", (_req, res) => {
  res
    .status(200)
    .set({
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Access-Control-Allow-Origin": "*",
    })
    .send(JSON.stringify(scanManifest()));
});

app.get("/api", async (req, res) => {
  const text = String(req.query.text ?? "").slice(0, 200);
  const img = resolveImg(String(req.query.img ?? ""));
  if (!img) {
    res.status(400).type("text/plain; charset=utf-8").send("invalid or unknown img");
    return;
  }

  let page;
  try {
    const browser = await getBrowser();
    page = await browser.newPage();
    await page.setViewport({ width: 1080, height: 1006, deviceScaleFactor: 1 });

    const encodedImg = img.split("/").map(encodeURIComponent).join("/");
    const target = `${STATIC_BASE}/?text=${encodeURIComponent(text)}&img=${encodedImg}`;
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
  console.log(`meme-render listening on http://${HOST}:${PORT} (static base: ${STATIC_BASE}, images: ${IMAGES_DIR})`);
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

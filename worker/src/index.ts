import puppeteer from "@cloudflare/puppeteer";

interface Env {
  BROWSER: Fetcher;
}

const SOURCE_URL = "https://alangmeow.github.io/meme-opossum/";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const text = url.searchParams.get("text") ?? "";

    let browser;
    try {
      browser = await puppeteer.launch(env.BROWSER);
      const page = await browser.newPage();
      await page.setViewport({ width: 1080, height: 1006, deviceScaleFactor: 1 });

      const target = `${SOURCE_URL}?text=${encodeURIComponent(text)}`;
      await page.goto(target, { waitUntil: "domcontentloaded", timeout: 15000 });

      await page.waitForFunction(
        () => {
          const cv = document.getElementById("c") as HTMLCanvasElement | null;
          if (!cv) return false;
          const ctx = cv.getContext("2d");
          if (!ctx) return false;
          const px = ctx.getImageData(540, 503, 1, 1).data;
          return px[3] > 0;
        },
        { timeout: 10000 },
      );

      const png = await page.screenshot({
        type: "png",
        clip: { x: 0, y: 0, width: 1080, height: 1006 },
        omitBackground: false,
      });

      const safe = (text || "meme").replace(/[\\/:*?"<>|\r\n]+/g, "_").slice(0, 40);
      return new Response(png as BodyInit, {
        headers: {
          "Content-Type": "image/png",
          "Content-Disposition": `inline; filename="${encodeURIComponent(safe)}.png"`,
          "Cache-Control": "public, max-age=3600",
        },
      });
    } catch (e: any) {
      const msg = `${e?.name ?? "Error"}: ${e?.message ?? String(e)}\n${e?.stack ?? ""}`;
      return new Response(msg, { status: 500, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    } finally {
      if (browser) await browser.close();
    }
  },
} satisfies ExportedHandler<Env>;

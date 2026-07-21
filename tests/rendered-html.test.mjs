import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the Backpools exploration shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Backpools — Liminal Water Simulator<\/title>/i);
  assert.match(html, /LIMINAL WATER SIMULATOR/);
  assert.match(html, /BACKPOOLS/);
  assert.match(html, /Find what drifted/);
  assert.match(html, /Ping fruit/);
  assert.match(html, /WATERFORM\s*\/\s*LIVE/);
  assert.doesNotMatch(html, /codex-preview|Building your site|react-loading-skeleton/i);
});

test("keeps the starter loading preview out of the finished site", async () => {
  const [page, layout, css, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /from "three"/);
  assert.match(page, /OrbitControls/);
  assert.match(page, /stepWater/);
  assert.match(page, /addImpulse/);
  assert.match(page, /fruitSpots/);
  assert.match(layout, /Backpools — Liminal Water Simulator/);
  assert.match(css, /\.backpools-shell/);
  assert.match(css, /prefers-reduced-motion/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);

  await assert.rejects(access(new URL("../app/_sites-preview", import.meta.url)));
});

// Renders the social image and app icons from the mark. Run: node scripts/render-brand.cjs
const { chromium } = require("@playwright/test");
const fs = require("fs");
const font = (w) => `data:font/woff2;base64,${fs.readFileSync(`/home/claude/spec/src/fonts/manrope-latin-${w}-normal.woff2`).toString("base64")}`;
const mark = (size, radius = 14) => `<svg width="${size}" height="${size}" viewBox="0 0 64 64"><rect width="64" height="64" rx="${radius}" fill="#3d3fc4"/><circle cx="32" cy="27" r="13" fill="none" stroke="#fff" stroke-width="6"/><rect x="12" y="45" width="40" height="6" rx="3" fill="#fff"/></svg>`;
const css = `@font-face{font-family:M;src:url(${font(700)}) format("woff2");font-weight:700}@font-face{font-family:M;src:url(${font(400)}) format("woff2");font-weight:400}*{margin:0}body{font-family:M}`;
(async () => {
  const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome" });
  const p = await b.newPage();
  // social image 1200x630
  await p.setViewportSize({ width: 1200, height: 630 });
  await p.setContent(`<style>${css}</style><div style="width:1200px;height:630px;background:#1c1b19;color:#fff;display:flex;flex-direction:column;justify-content:center;padding:0 96px;box-sizing:border-box">
    <div style="display:flex;align-items:center;gap:28px">${mark(112, 22)}<span style="font-size:96px;font-weight:700;letter-spacing:-2px">Onpass</span></div>
    <p style="margin-top:36px;font-size:40px;line-height:1.3;max-width:900px;color:#e2e1de">Every recipe, spec and allergen menu for your kitchens, in one place.</p></div>`);
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: "/home/claude/spec/public/og.png" });
  // app icon 1024, square, no transparency (the store rounds the corners itself)
  await p.setViewportSize({ width: 1024, height: 1024 });
  await p.setContent(`<style>*{margin:0}body{background:#3d3fc4}</style>${mark(1024, 0)}`);
  await p.screenshot({ path: "/home/claude/replica/brand/app-icon-1024.png", omitBackground: false });
  // apple touch icon 180
  await p.setViewportSize({ width: 180, height: 180 });
  await p.setContent(`<style>*{margin:0}body{background:#3d3fc4}</style>${mark(180, 0)}`);
  await p.screenshot({ path: "/home/claude/spec/src/app/apple-icon.png" });
  await b.close();
})();

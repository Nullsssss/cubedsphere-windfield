// Folds the vite bundle back into a single self-contained index.html.
//
// The demo is deployed as one file on purpose: it means the Pages build has no
// module resolution to get wrong, and a reviewer can open index.html from disk.
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const dist = "dist";
const assets = join(dist, "assets");
const js = readdirSync(assets).find(f => f.endsWith(".js"));
const css = readdirSync(assets).find(f => f.endsWith(".css"));

let html = readFileSync(join(dist, "index.html"), "utf8");
const bundle = readFileSync(join(assets, js), "utf8");

html = html.replace(/<script[^>]*src="[^"]*"[^>]*><\/script>/, `<script type="module">\n${bundle}\n</script>`);
if (css) {
  const style = readFileSync(join(assets, css), "utf8");
  html = html.replace(/<link[^>]*rel="stylesheet"[^>]*>/, `<style>\n${style}\n</style>`);
}

writeFileSync("index.html", html);
console.log(`inlined ${js} -> index.html (${(html.length / 1024).toFixed(1)} kB)`);

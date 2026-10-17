// Empacota o app de browser (src/web/app.ts + @scrypted/client + vendor) num bundle
// IIFE, e grava src/generated/assets.ts exportando APP_JS e INDEX_HTML como strings.
// O servidor (src/main.ts) importa essas strings e serve inline — sem depender do
// sistema de arquivos do plugin em runtime (que varia por empacotamento do Scrypted).
import { build } from "esbuild";
import { nodeModulesPolyfillPlugin } from "esbuild-plugins-node-modules-polyfill";
import { readFileSync, mkdirSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const root = dirname(fileURLToPath(import.meta.url));
const web = join(root, "src", "web");
const gen = join(root, "src", "generated");

const result = await build({
  entryPoints: [join(web, "app.ts")],
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2020",
  minify: process.env.NODE_ENV === "production",
  sourcemap: false,
  write: false,
  logLevel: "info",
  define: {
    global: "globalThis",
    "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV || "development"),
  },
  inject: [join(root, "src", "web", "shims", "global.js")],
  plugins: [
    nodeModulesPolyfillPlugin({
      globals: { Buffer: true, process: true },
    }),
  ],
});

const appJs = result.outputFiles[0].text;
const indexHtml = readFileSync(join(web, "index.html"), "utf8");

// escapa pra caber num template literal
const esc = (s) => s.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");

mkdirSync(gen, { recursive: true });
writeFileSync(
  join(gen, "assets.ts"),
  `// GERADO por build-web.mjs — não editar à mão.\n` +
    `export const APP_JS = \`${esc(appJs)}\`;\n` +
    `export const INDEX_HTML = \`${esc(indexHtml)}\`;\n`
);
console.log(`[build:web] app.js ${appJs.length}B, index.html ${indexHtml.length}B -> src/generated/assets.ts`);

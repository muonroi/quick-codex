import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const vendorDir = path.resolve(root, "renderer/vendor");

const copy = (from, to) => {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
};

const resolvePkgFile = (pkg, rel) => path.resolve(root, "node_modules", pkg, rel);

const files = [
  { from: resolvePkgFile("xterm", "lib/xterm.js"), to: path.resolve(vendorDir, "xterm.js") },
  { from: resolvePkgFile("xterm", "css/xterm.css"), to: path.resolve(vendorDir, "xterm.css") },
  { from: resolvePkgFile("xterm-addon-fit", "lib/xterm-addon-fit.js"), to: path.resolve(vendorDir, "xterm-addon-fit.js") }
];

for (const file of files) {
  if (!fs.existsSync(file.from)) {
    throw new Error(`Missing vendor source: ${file.from}`);
  }
  copy(file.from, file.to);
}

console.log(`Vendored ${files.length} files into ${vendorDir}`);


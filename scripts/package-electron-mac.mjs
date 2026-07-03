import { packager } from "@electron/packager";
import { rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "dist-desktop");
const arch = process.arch === "arm64" ? "arm64" : "x64";

await rm(out, { recursive: true, force: true });

await packager({
  dir: root,
  name: "ARIDES Cargo Desktop",
  platform: "darwin",
  arch,
  out,
  overwrite: true,
  asar: true,
  prune: true,
  icon: path.join(root, "build", "arides"),
  ignore: [
    /^\/\.git($|\/)/,
    /^\/android($|\/)/,
    /^\/dist-desktop($|\/)/,
    /^\/www($|\/)/,
    /^\/node_modules\/\.cache($|\/)/
  ],
  appBundleId: "ee.arides.cargo.desktop",
  appCategoryType: "public.app-category.business"
});

console.log(`Built ARIDES Cargo Desktop for macOS (${arch}) in ${out}`);

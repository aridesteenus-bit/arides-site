import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const out = path.join(root, "www");
const operatorBaseUrl = "https://arides.ee/operator-desktop.html";
const operatorUrl = process.env.ARIDES_ADMIN_TOKEN
  ? `${operatorBaseUrl}?apiBase=https%3A%2F%2Farides.ee&tab=orders&adminToken=${encodeURIComponent(process.env.ARIDES_ADMIN_TOKEN)}`
  : `${operatorBaseUrl}?apiBase=https%3A%2F%2Farides.ee&tab=orders`;

const files = [
  "operator.js",
  "operator.css",
  "operator.webmanifest",
  "favicon.ico",
  "favicon-16x16.png",
  "favicon-32x32.png",
  "apple-touch-icon.png",
  "android-chrome-192x192.png",
  "android-chrome-512x512.png"
];

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

for (const file of files) {
  await cp(path.join(root, file), path.join(out, file));
}

await writeFile(path.join(out, "index.html"), `<!doctype html>
<html lang="et">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="theme-color" content="#07111d" />
  <title>ARIDES Operator</title>
  <link rel="icon" href="./favicon.ico" />
  <style>
    body{margin:0;min-height:100vh;display:grid;place-items:center;background:#050a12;color:#f4f8ff;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    main{width:min(420px,calc(100% - 32px));text-align:center}
    a{color:#8ec7ff}
  </style>
</head>
<body>
  <main>
    <h1>ARIDES Operator</h1>
    <p>Avan tellimuste töölauda...</p>
    <p><a href="${operatorUrl}">Ava käsitsi</a></p>
  </main>
  <script>window.location.replace("${operatorUrl}");</script>
</body>
</html>
`);

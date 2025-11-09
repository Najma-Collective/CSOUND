import { promises as fs } from "fs";
import path from "path";

const HTML_TEMPLATE = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>CSOUND – Bioluminescent Glade</title>
    <style>
      :root {
        color-scheme: dark;
      }
      html,
      body {
        margin: 0;
        padding: 0;
        height: 100%;
        background: #030914;
        color: #f6fbff;
        font-family: "Inter", "Helvetica Neue", Arial, sans-serif;
        letter-spacing: 0.04em;
      }
      body {
        min-height: 100vh;
        display: flex;
      }
      #csound-root {
        position: relative;
        flex: 1;
        display: flex;
        align-items: stretch;
        justify-content: stretch;
        overflow: hidden;
      }
      #csound-root canvas {
        width: 100%;
        height: 100%;
        display: block;
      }
      #csound-loading {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        text-transform: uppercase;
        font-size: 12px;
        letter-spacing: 0.2em;
        color: rgba(233, 244, 255, 0.72);
        animation: csound-loading-pulse 1.6s ease-in-out infinite;
        pointer-events: none;
        user-select: none;
      }
      @keyframes csound-loading-pulse {
        0%,
        100% {
          opacity: 0.35;
        }
        50% {
          opacity: 1;
        }
      }
    </style>
  </head>
  <body>
    <div id="csound-root">
      <div id="csound-loading">Summoning the glade…</div>
    </div>
    <script type="module" src="./index.js"></script>
  </body>
</html>
`;

export async function writeIndexHtml(distDir) {
  const filePath = path.join(distDir, "index.html");
  await fs.writeFile(filePath, HTML_TEMPLATE, "utf8");
}

export default writeIndexHtml;

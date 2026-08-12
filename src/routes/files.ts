import { Router, type IRouter } from "express";
import path from "node:path";
import fs from "node:fs";

// Public file server — serves mod files to customers without auth.
const ALLOWED: Record<string, string> = {
  cache_res: "cache_res",
};

const router: IRouter = Router();

// NOTE: in the esbuild ESM bundle __dirname is NOT defined at runtime
// (it is a bare identifier that throws TDZ/ReferenceError), so we resolve
// data/ relative to import.meta.dirname when available, else cwd().
function DATA_DIR(): string {
  // In the esbuild bundle this module lives at dist/index.mjs, and the
  // `data/` folder sits next to `dist/` at the project root. import.meta.dirname
  // for the bundle entry points at `dist`, so resolve `../data` from there.
  // NOTE: import.meta.dirname is undefined when not in a module context, and
  // must not fall back to bare __dirname (throws TDZ in ESM bundles).
  let distDir: string | undefined;
  try {
    const file = (import.meta as unknown as { filename?: string }).filename;
    if (typeof file === "string") distDir = path.dirname(file);
  } catch {
    distDir = undefined;
  }
  if (typeof distDir !== "string") {
    distDir = typeof process !== "undefined" ? process.cwd() : ".";
  }
  return path.resolve(distDir, "../data");
}

router.get("/files/:name", (req, res) => {
  const name = req.params.name;
  if (!ALLOWED[name] && name !== "cache_res") {
    res.status(404).send("Not found");
    return;
  }
  const target = ALLOWED[name] ?? name;
  const dir = DATA_DIR();
  const candidates = [
    path.join(dir, target),
    path.join(dir, `${target}.bin`),
    path.join(dir, `${target}.obb`),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      res.setHeader("content-type", "application/octet-stream");
      res.setHeader(
        "content-disposition",
        `attachment; filename="${path.basename(p)}"`,
      );
      res.setHeader("cache-control", "public, max-age=3600");
      return res.sendFile(p);
    }
  }
  res.status(404).send("Not found");
});

export default router;

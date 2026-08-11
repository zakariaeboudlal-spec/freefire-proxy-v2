import { Router, type IRouter } from "express";
import path from "node:path";
import fs from "node:fs";

// Public file server — serves mod files and the certificate to customers
// without auth (public CDN-like endpoints). Only specific files listed here.
const ALLOWED: Record<string, string> = {
  "cache_res": "cache_res",
  "cache_res.CfnFf59sr1SbsqQ6JqTKsEusjKs~3D": "cache_res",
};

const router: IRouter = Router();

function DATA_DIR(): string {
  return path.resolve(__dirname, "../../data");
}

router.get("/files/:name", (req, res) => {
  const name = req.params.name;
  const target = ALLOWED[name] ?? name;
  if (!ALLOWED[name] && name !== "cache_res") {
    res.status(404).send("Not found");
    return;
  }
  const dir = DATA_DIR();
  const candidates = [
    path.join(dir, target),
    path.join(dir, `${target}.bin`),
    path.join(dir, `${target}.obb`),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      res.setHeader("content-type", "application/octet-stream");
      res.setHeader("content-disposition", `attachment; filename="${path.basename(p)}"`);
      res.setHeader("cache-control", "public, max-age=3600");
      return res.sendFile(p);
    }
  }
  res.status(404).send("Not found");
});

export default router;

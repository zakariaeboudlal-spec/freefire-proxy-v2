import { Router } from "express";
import { z } from "zod";

const LoginBody = z.object({ password: z.string() });

const router = Router();
const SECRET = process.env.DASHBOARD_SECRET ?? "admin1234";
const TOKEN = `dashboard-${Buffer.from(SECRET).toString("base64")}`;

export function authMiddleware(req: any, res: any, next: any) {
  const header = req.headers["authorization"] ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (token !== TOKEN) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

router.post("/auth/login", (req, res) => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  if (parsed.data.password !== SECRET) {
    res.status(401).json({ error: "Invalid password" });
    return;
  }
  res.json({ token: TOKEN });
});

export default router;

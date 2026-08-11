import { Router } from "express";
import { dbOps } from "../bot/database.js";
import { authMiddleware } from "./auth.js";

const router = Router();

router.get("/sellers", authMiddleware, (_req, res) => {
  res.json(dbOps.getAllSellers());
});

router.post("/sellers", authMiddleware, (req, res) => {
  const { user_id, username } = req.body;
  if (!user_id) { res.status(400).json({ error: "user_id is required" }); return; }
  dbOps.addSeller(Number(user_id), username ?? null);
  const seller = dbOps.getSeller(Number(user_id));
  res.status(201).json(seller);
});

router.delete("/sellers/:userId", authMiddleware, (req, res) => {
  const userId = parseInt(req.params.userId);
  if (isNaN(userId)) { res.status(400).json({ error: "Invalid userId" }); return; }
  const removed = dbOps.removeSeller(userId);
  if (!removed) { res.status(404).json({ error: "Seller not found" }); return; }
  res.json({ success: true });
});

router.post("/sellers/:userId/balance", authMiddleware, (req, res) => {
  const userId = parseInt(req.params.userId);
  if (isNaN(userId)) { res.status(400).json({ error: "Invalid userId" }); return; }
  const { amount } = req.body;
  if (!amount || amount <= 0) { res.status(400).json({ error: "amount must be positive" }); return; }
  dbOps.addBalance(userId, Number(amount));
  const seller = dbOps.getSeller(userId);
  res.json(seller);
});

export default router;

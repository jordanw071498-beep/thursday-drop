import { Router, type IRouter } from "express";
import { getAuthProfile, serializeProfile } from "../lib/auth.js";

const router: IRouter = Router();

router.get("/profile", async (req, res): Promise<void> => {
  const profile = await getAuthProfile(req);
  if (!profile) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  res.json(serializeProfile(profile));
});

export default router;

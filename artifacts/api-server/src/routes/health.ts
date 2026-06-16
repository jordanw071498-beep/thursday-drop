import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { pool } from "@workspace/db";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/health", async (_req, res): Promise<void> => {
  let dbStatus: "connected" | "error" = "error";
  let dbError: string | undefined;

  try {
    const client = await pool.connect();
    await client.query("SELECT 1");
    client.release();
    dbStatus = "connected";
  } catch (err: any) {
    dbError = err?.message ?? "unknown error";
  }

  const status = dbStatus === "connected" ? 200 : 503;
  res.status(status).json({
    status: dbStatus === "connected" ? "ok" : "degraded",
    database: dbStatus,
    ...(dbError ? { database_error: dbError } : {}),
    timestamp: new Date().toISOString(),
  });
});

export default router;

import express, { type Express, type Request, type Response } from "express";
import { createServer, type Server } from "node:http";
import { fromZodError } from "zod-validation-error";
import { insertRouteSchema } from "@shared/schema";
import {
  GraphUnavailableError,
  routeOnCampusGraph,
} from "./graph";
import { graphRouteToResponse, routeResponseSchema } from "@/lib/route-contract";

/**
 * Application routes. All mounted under /api.
 */
export async function registerRoutes(app: Express): Promise<Server> {
  const api = express.Router();

  api.get("/health", (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  /**
   * Step-free routing across the surveyed campus graph (Feature 5).
   *
   * The response is validated against `routeResponseSchema` before it leaves the
   * process. That is not ceremony: this is the one place the app's route
   * geometry is produced in-house, and a malformed polyline would surface as an
   * inexplicable off-route loop on the user's screen rather than as an error.
   */
  api.post("/route", async (req: Request, res: Response, next) => {
    const parsed = insertRouteSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "Invalid route request.",
        details: fromZodError(parsed.error).message,
      });
      return;
    }

    const { from, to, buildingId, campusId, options } = parsed.data;

    try {
      const outcome = await routeOnCampusGraph({
        campusId,
        from: { latitude: from.lat, longitude: from.lng },
        to: { latitude: to.lat, longitude: to.lng },
        buildingId,
        options,
      });

      if (!outcome.ok) {
        // 409 rather than 404: the graph is fine, this pair of points is not
        // connected, which is a different thing for the client to explain.
        res.status(409).json({
          error: outcome.failure.message,
          reason: outcome.failure.reason,
        });
        return;
      }

      const payload = graphRouteToResponse(outcome.route);
      const validated = routeResponseSchema.safeParse(payload);
      if (!validated.success) {
        next(new Error("Generated an invalid route payload"));
        return;
      }

      res.json(validated.data);
    } catch (error) {
      if (error instanceof GraphUnavailableError) {
        // 503 with a Retry-After: the graph is unprovisioned, not missing, and
        // the client should fall back to OSRM rather than surface a failure.
        res.status(503).set("Retry-After", "60").json({ error: error.message });
        return;
      }
      next(error);
    }
  });

  app.use("/api", api);

  const httpServer = createServer(app);

  return httpServer;
}

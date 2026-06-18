import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { initPostgres } from "./src/db_postgres";

// Import Modular routes
import { authRouter } from "./src/backend/routes/auth";
import { mercadolivreRouter, mercadolivreCallbackHandler } from "./src/backend/routes/mercadolivre";
import { melhorenvioRouter, melhorenvioCallbackHandler } from "./src/backend/routes/melhorenvio";
import { productsRouter } from "./src/backend/routes/products";
import { ordersRouter } from "./src/backend/routes/orders";
import { costsRouter } from "./src/backend/routes/costs";
import { taxesRouter } from "./src/backend/routes/taxes";
import { dashboardRouter } from "./src/backend/routes/dashboard";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "50mb" }));

  // Initialize and check/seed Neon Postgres database on startup
  try {
    await initPostgres();
  } catch (err) {
    console.error("CRITICAL: Failed to link with Neon Postgres database:", err);
  }

  // --- Mounting Modular Routers ---
  app.use("/api/auth", authRouter);
  app.use("/api/integrations/mercadolivre", mercadolivreRouter);
  app.use("/api/integrations/melhorenvio", melhorenvioRouter);
  app.use("/api/products", productsRouter);
  app.use("/api/orders", ordersRouter);
  app.use("/api/costs", costsRouter);
  app.use("/api", taxesRouter); // Mounts /tax-factors, /tax-profiles, /simulator/skus
  app.use("/api/dashboard", dashboardRouter); // Mounts /overview, /top-products, /orders-without-cost, /ai-advisor

  // --- Direct Top-Level Redirect Callbacks Handling for complete coverage ---
  app.get(["/auth/callback", "/auth/callback/"], mercadolivreCallbackHandler);
  
  app.get([
    "/auth/melhorenvio/callback", 
    "/auth/melhorenvio/callback/", 
    "/melhor-envio", 
    "/melhor-envio/", 
    "/melhor-envio/teste",
    "/melhor-envio/auth/callback",
    "/melhor-envio/auth/callback/"
  ], melhorenvioCallbackHandler);


  // --- Vite Static Assets Middleware & SPA fallback ---
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();

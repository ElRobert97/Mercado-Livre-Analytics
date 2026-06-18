import express from "express";

export function getUserIdFromRequest(req: express.Request): string {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.substring(7);
  }
  return "user_robert"; // fallback default seed user
}

export function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Não autorizado. Por favor, faça login." });
  }
  const token = authHeader.substring(7);
  if (!token) {
    return res.status(401).json({ error: "Não autorizado. Por favor, faça login." });
  }
  next();
}

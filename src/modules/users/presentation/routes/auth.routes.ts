import { Router } from "express";
import { authController } from "../controllers/auth.controller";

const router = Router();

router.post("/register", (req, res) => authController.register(req, res));
router.post("/login", (req, res) => authController.login(req, res));
router.post("/logout", (req, res) => authController.logout(req, res));
router.get("/me", (req, res) => authController.getCurrentUser(req, res));

export default router;

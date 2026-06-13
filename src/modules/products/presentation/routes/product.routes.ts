import { Router } from "express";
import { productsController } from "../controllers/products.controller";

const router = Router();

router.get("/", (req, res) => productsController.getCosts(req, res));
router.get("/history/batches", (req, res) => productsController.getBatches(req, res));
router.get("/:sku", (req, res) => productsController.getCostBySku(req, res));
router.post("/", (req, res) => productsController.upsertCost(req, res));
router.delete("/:id", (req, res) => productsController.deleteCost(req, res));

export default router;

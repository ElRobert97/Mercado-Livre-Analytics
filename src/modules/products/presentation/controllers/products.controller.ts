import { Request, Response } from "express";
import { productRepository } from "../../infrastructure/repositories/postgres-product.repository";
import { sessionState } from "../../../../shared/utils/session";
import { normalizeSku } from "../../../../shared/helpers/sku";
import { ProductCost } from "../../../../shared/types";

export class ProductsController {
  async getCosts(req: Request, res: Response) {
    try {
      const userCosts = await productRepository.getUserCosts(sessionState.currentUserSession!);
      return res.json(userCosts);
    } catch (err: any) {
      return res.status(500).json({ error: "Erro ao buscar custos: " + err.message });
    }
  }

  async getCostBySku(req: Request, res: Response) {
    const sku = normalizeSku(req.params.sku).toUpperCase();
    try {
      const cost = await productRepository.getCostBySku(sessionState.currentUserSession!, sku);
      if (!cost) {
        return res.status(404).json({ error: "Custo por SKU não cadastrado." });
      }
      return res.json(cost);
    } catch (err: any) {
      return res.status(500).json({ error: "Erro ao obter SKU: " + err.message });
    }
  }

  async upsertCost(req: Request, res: Response) {
    let { sku, product_name, cost_unitary, currency } = req.body;
    if (!sku || cost_unitary === undefined || cost_unitary === null) {
      return res.status(400).json({ error: "SKU e Custo Unitário são obrigatórios." });
    }

    try {
      sku = normalizeSku(sku);
      const nowStr = new Date().toISOString();
      const newCost: ProductCost = {
        id: `cost_${Date.now()}`,
        user_id: sessionState.currentUserSession!,
        sku: sku.toUpperCase(),
        product_name: product_name || "Produto sem nome",
        cost_unitary: Number(cost_unitary),
        currency: currency || "BRL",
        source_file_name: "Registro Manual",
        imported_at: nowStr,
        created_at: nowStr,
        updated_at: nowStr
      };

      await productRepository.upsertProductCost(newCost);
      return res.json({ message: "Custo gravado com sucesso.", cost: newCost });
    } catch (err: any) {
      return res.status(500).json({ error: "Erro ao criar/atualizar custo: " + err.message });
    }
  }

  async deleteCost(req: Request, res: Response) {
    const id = req.params.id;
    try {
      await productRepository.deleteProductCost(id, sessionState.currentUserSession!);
      return res.json({ message: "Custo por SKU excluído com sucesso do Postgres." });
    } catch (err: any) {
      return res.status(500).json({ error: "Erro ao remover custo: " + err.message });
    }
  }

  async getBatches(req: Request, res: Response) {
    try {
      const batches = await productRepository.getUserBatches(sessionState.currentUserSession!);
      return res.json(batches);
    } catch (err: any) {
      return res.status(500).json({ error: "Erro de histórico de lotes: " + err.message });
    }
  }
}

export const productsController = new ProductsController();

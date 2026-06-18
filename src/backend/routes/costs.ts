import express from "express";
import { dbOps } from "../../db_postgres";
import { getUserIdFromRequest, requireAuth } from "../helpers/auth";
import { normalizeSku } from "../helpers/validation";
import { ProductCost, CostImportBatch } from "../../shared/types";

export const costsRouter = express.Router();

/**
 * Lists user product costs
 */
costsRouter.get("/", requireAuth, async (req, res) => {
  try {
    const userId = getUserIdFromRequest(req);
    const userCosts = await dbOps.getUserCosts(userId);
    res.json(userCosts);
  } catch (err: any) {
    res.status(500).json({ error: "Erro ao buscar custos: " + err.message });
  }
});

/**
 * Fetch cost for specific sku
 */
costsRouter.get("/:sku", requireAuth, async (req, res) => {
  const sku = normalizeSku(req.params.sku).toUpperCase();
  try {
    const userId = getUserIdFromRequest(req);
    const cost = await dbOps.getCostBySku(userId, sku);
    if (!cost) {
      return res.status(404).json({ error: "Custo por SKU não cadastrado." });
    }
    res.json(cost);
  } catch (err: any) {
    res.status(500).json({ error: "Erro ao obter SKU: " + err.message });
  }
});

/**
 * Creates or updates unitary cost
 */
costsRouter.post("/", requireAuth, async (req, res) => {
  let { sku, product_name, cost_unitary, currency } = req.body;
  if (!sku || cost_unitary === undefined || cost_unitary === null) {
    return res.status(400).json({ error: "SKU e Custo Unitário são obrigatórios." });
  }

  try {
    sku = normalizeSku(sku);
    const userId = getUserIdFromRequest(req);

    const nowStr = new Date().toISOString();
    const newCost: ProductCost = {
      id: `cost_${Date.now()}`,
      user_id: userId,
      sku: sku.toUpperCase(),
      product_name: product_name || "Produto sem nome",
      cost_unitary: Number(cost_unitary),
      currency: currency || "BRL",
      source_file_name: "Registro Manual",
      imported_at: nowStr,
      created_at: nowStr,
      updated_at: nowStr
    };

    await dbOps.upsertProductCost(newCost);
    res.status(201).json({ message: "Custo adicionado/atualizado com sucesso no Postgres.", cost: newCost });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: "Erro ao cadastrar custo: " + err.message });
  }
});

/**
 * Deletes single product cost entry
 */
costsRouter.delete("/:id", requireAuth, async (req, res) => {
  const id = req.params.id;
  try {
    const userId = getUserIdFromRequest(req);
    await dbOps.deleteProductCost(id, userId);
    res.json({ message: "Custo por SKU excluído com sucesso do Postgres." });
  } catch (err: any) {
    res.status(500).json({ error: "Erro ao remover custo: " + err.message });
  }
});

/**
 * Bulk spreadsheet import CSV parser
 */
costsRouter.post("/import", requireAuth, async (req, res) => {
  const { csvData, fileName } = req.body;
  if (!csvData) {
    return res.status(400).json({ error: "Os dados do CSV não foram enviados." });
  }

  const lines = csvData.split(/\r?\n/);
  if (lines.length < 2) {
    return res.status(400).json({ error: "Planilha vazia ou faltam colunas." });
  }

  // Detect delimiter: if first line contains ';', split on ';' to avoid dividing numbers with comma decimals
  const delimiter = lines[0].includes(";") ? ";" : ",";

  // Parse header column indexes
  const header = lines[0].toLowerCase().split(delimiter);
  const skuIdx = header.findIndex((h: string) => h.includes("sku"));
  const nameIdx = header.findIndex((h: string) => h.includes("product") || h.includes("name") || h.includes("nome") || h.includes("produto"));
  const costIdx = header.findIndex((h: string) => h.includes("cost") || h.includes("unitary") || h.includes("custo") || h.includes("unitario"));

  if (skuIdx === -1 || costIdx === -1) {
    return res.status(400).json({
      error: "Colunas mínimas necessárias não encontradas. Garanta as colunas: 'sku' e 'cost_unitary' (ou 'custo_unitario')."
    });
  }

  try {
    const userId = getUserIdFromRequest(req);
    let inserted = 0;
    let updated = 0;
    let failed = 0;
    const nowStr = new Date().toISOString();

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const columns = line.split(delimiter);
      let sku = columns[skuIdx]?.trim() || "";
      const rawCost = columns[costIdx]?.trim();
      const pName = nameIdx !== -1 ? columns[nameIdx]?.trim() : "Produto Importado";

      if (!sku || !rawCost) {
        failed++;
        continue;
      }

      sku = normalizeSku(sku);

      const costAmount = parseFloat(rawCost.replace(",", "."));
      if (isNaN(costAmount)) {
        failed++;
        continue;
      }

      // Look if cost exists in DB to increment counters
      const existingCost = await dbOps.getCostBySku(userId, sku);
      if (existingCost) {
        updated++;
      } else {
        inserted++;
      }

      const costToStore: ProductCost = {
        id: `cost_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        user_id: userId,
        sku: sku.toUpperCase(),
        product_name: pName || "Produto Importado",
        cost_unitary: costAmount,
        currency: "BRL",
        source_file_name: fileName || "upload.csv",
        imported_at: nowStr,
        created_at: nowStr,
        updated_at: nowStr
      };

      await dbOps.upsertProductCost(costToStore);
    }

    // Record batch history in DB
    const newBatch: CostImportBatch = {
      id: `batch_${Date.now()}`,
      user_id: userId,
      file_name: fileName || "upload_manual.csv",
      file_type: "csv",
      total_rows: inserted + updated + failed,
      inserted_rows: inserted,
      updated_rows: updated,
      failed_rows: failed,
      created_at: nowStr
    };

    await dbOps.createImportBatch(newBatch);

    res.json({
      message: "Processamento de planilha de custos concluído com sucesso!",
      batch: newBatch
    });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: "Erro crítico ao importar planilha: " + err.message });
  }
});

/**
 * Lists history of imported excel batches
 */
costsRouter.get("/history/batches", requireAuth, async (req, res) => {
  try {
    const userId = getUserIdFromRequest(req);
    const batches = await dbOps.getUserBatches(userId);
    res.json(batches);
  } catch (err: any) {
    res.status(500).json({ error: "Erro de histórico de lotes: " + err.message });
  }
});

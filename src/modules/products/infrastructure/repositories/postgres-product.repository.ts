import { pool } from "../../../../config/database";
import { ProductCost, CostImportBatch } from "../../../../shared/types";

export class PostgresProductRepository {
  async getUserCosts(userId: string): Promise<ProductCost[]> {
    const res = await pool.query(
      `SELECT id, user_id, sku, product_name, cost_unitary, currency, source_file_name, imported_at, created_at, updated_at 
       FROM costs WHERE user_id = $1 ORDER BY updated_at DESC`,
      [userId]
    );
    return res.rows.map(r => ({
      id: r.id,
      user_id: r.user_id,
      sku: r.sku,
      product_name: r.product_name,
      cost_unitary: Number(r.cost_unitary),
      currency: r.currency,
      source_file_name: r.source_file_name,
      imported_at: r.imported_at?.toISOString() || "",
      created_at: r.created_at?.toISOString() || "",
      updated_at: r.updated_at?.toISOString() || ""
    }));
  }

  async getCostBySku(userId: string, sku: string): Promise<ProductCost | null> {
    const res = await pool.query(
      `SELECT id, user_id, sku, product_name, cost_unitary, currency, source_file_name, imported_at, created_at, updated_at 
       FROM costs WHERE user_id = $1 AND sku = $2`,
      [userId, sku]
    );
    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    return {
      id: r.id,
      user_id: r.user_id,
      sku: r.sku,
      product_name: r.product_name,
      cost_unitary: Number(r.cost_unitary),
      currency: r.currency,
      source_file_name: r.source_file_name,
      imported_at: r.imported_at?.toISOString() || "",
      created_at: r.created_at?.toISOString() || "",
      updated_at: r.updated_at?.toISOString() || ""
    };
  }

  async upsertProductCost(cost: ProductCost): Promise<void> {
    await pool.query(
      `INSERT INTO costs (id, user_id, sku, product_name, cost_unitary, currency, source_file_name, imported_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id, sku) DO UPDATE SET
         product_name = EXCLUDED.product_name,
         cost_unitary = EXCLUDED.cost_unitary,
         currency = EXCLUDED.currency,
         source_file_name = EXCLUDED.source_file_name,
         imported_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP`,
      [cost.id, cost.user_id, cost.sku, cost.product_name, cost.cost_unitary, cost.currency, cost.source_file_name]
    );
  }

  async updateProductCostById(id: string, userId: string, productName: string, costUnitary: number, currency: string, importedAt: string): Promise<void> {
    await pool.query(
      `UPDATE costs 
       SET product_name = $1, cost_unitary = $2, currency = $3, imported_at = $4, updated_at = CURRENT_TIMESTAMP
       WHERE id = $5 AND user_id = $6`,
      [productName, costUnitary, currency, importedAt ? new Date(importedAt) : new Date(), id, userId]
    );
  }

  async deleteProductCost(id: string, userId: string): Promise<void> {
    await pool.query(
      `DELETE FROM costs WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
  }

  async getUserBatches(userId: string): Promise<CostImportBatch[]> {
    const res = await pool.query(
      `SELECT id, user_id, file_name, file_type, total_rows, inserted_rows, updated_rows, failed_rows, created_at 
       FROM batches WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId]
    );
    return res.rows.map(r => ({
      id: r.id,
      user_id: r.user_id,
      file_name: r.file_name,
      file_type: r.file_type,
      total_rows: r.total_rows,
      inserted_rows: r.inserted_rows,
      updated_rows: r.updated_rows,
      failed_rows: r.failed_rows,
      created_at: r.created_at?.toISOString() || ""
    }));
  }

  async createImportBatch(batch: CostImportBatch): Promise<void> {
    await pool.query(
      `INSERT INTO batches (id, user_id, file_name, file_type, total_rows, inserted_rows, updated_rows, failed_rows, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)`,
      [batch.id, batch.user_id, batch.file_name, batch.file_type, batch.total_rows, batch.inserted_rows, batch.updated_rows, batch.failed_rows]
    );
  }
}

export const productRepository = new PostgresProductRepository();

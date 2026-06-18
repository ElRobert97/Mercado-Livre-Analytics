import express from "express";
import { dbOps, pool } from "../../db_postgres";
import { getUserIdFromRequest, requireAuth } from "../helpers/auth";
import { calculateMedian } from "../helpers/math";
import { StateTaxProfile } from "../../shared/types";

export const taxesRouter = express.Router();

/**
 * Lists state tax factors (Legacy backward compatibility)
 */
taxesRouter.get("/tax-factors", requireAuth, async (req, res) => {
  try {
    const profiles = await dbOps.getStateTaxProfiles();
    const factors = profiles.map(p => ({
      id: `tax_${p.state_code.toLowerCase()}`,
      state_code: p.state_code,
      tax_factor: p.total_factor,
      active: p.active
    }));
    res.json(factors);
  } catch (err: any) {
    res.status(500).json({ error: "Erro ao buscar fatores tributários de estados: " + err.message });
  }
});

/**
 * Updates single tax factor (Legacy backward compatibility)
 */
taxesRouter.put("/tax-factors/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { tax_factor, active } = req.body;
    if (tax_factor === undefined || isNaN(Number(tax_factor))) {
      return res.status(400).json({ error: "O fator tributário (tax_factor) é obrigatório e deve ser um número válido." });
    }

    // Resolve state code from ID (e.g., 'tax_sp' -> 'SP')
    let stateCode = id.replace("tax_", "").toUpperCase();
    if (stateCode.length !== 2) {
      // Fallback search
      const profiles = await dbOps.getStateTaxProfiles();
      const found = profiles.find(p => p.state_code.toLowerCase() === id.replace("tax_", "").toLowerCase());
      stateCode = found ? found.state_code : stateCode;
    }

    // Fetch existing profile or build new
    const profiles = await dbOps.getStateTaxProfiles();
    const existing = profiles.find(p => p.state_code.toUpperCase() === stateCode.toUpperCase());
    
    const newTotal = Number(tax_factor);
    let activeVal = active !== false;
    let icms = newTotal;
    let difal = 0;
    if (existing) {
      if (stateCode === "SP") {
        icms = newTotal;
        difal = 0;
      } else {
        // Keep relative proportion if possible, else 50/50
        const sum = existing.icms_factor + existing.difal_factor;
        if (sum > 0) {
          icms = newTotal * (existing.icms_factor / sum);
          difal = newTotal * (existing.difal_factor / sum);
        } else {
          icms = newTotal * 0.5;
          difal = newTotal * 0.5;
        }
      }
    }

    await dbOps.updateStateTaxProfile({
      state_code: stateCode,
      icms_factor: icms,
      difal_factor: difal,
      total_factor: newTotal,
      source_type: "manual_override",
      active: activeVal
    });

    res.json({ message: "Fator tributário do estado atualizado com sucesso" });
  } catch (err: any) {
    res.status(500).json({ error: "Erro ao atualizar fator tributário do estado: " + err.message });
  }
});

/**
 * Lists state tax profiles
 */
taxesRouter.get("/tax-profiles", requireAuth, async (req, res) => {
  try {
    const profiles = await dbOps.getStateTaxProfiles();
    res.json(profiles);
  } catch (err: any) {
    res.status(500).json({ error: "Erro ao buscar perfis tributários: " + err.message });
  }
});

/**
 * Updates a state tax profile
 */
taxesRouter.put("/tax-profiles/:state_code", requireAuth, async (req, res) => {
  try {
    const { state_code } = req.params;
    const { icms_factor, difal_factor, active, source_type, valid_from, valid_to, notes } = req.body;

    if (icms_factor === undefined || isNaN(Number(icms_factor))) {
      return res.status(400).json({ error: "A alíquota de ICMS (icms_factor) é obrigatória e deve ser um número válido." });
    }
    if (difal_factor === undefined || isNaN(Number(difal_factor))) {
      return res.status(400).json({ error: "A alíquota de DIFAL (difal_factor) é obrigatória e deve ser um número válido." });
    }

    const icms = Number(icms_factor);
    const difal = Number(difal_factor);
    const total = icms + difal;

    const profile: StateTaxProfile = {
      state_code: state_code.toUpperCase(),
      icms_factor: icms,
      difal_factor: difal,
      total_factor: total,
      source_type: source_type || "manual_override",
      active: active !== false,
      valid_from,
      valid_to,
      notes
    };

    await dbOps.updateStateTaxProfile(profile);
    res.json({ message: "Perfil tributário do estado atualizado com sucesso", profile });
  } catch (err: any) {
    res.status(500).json({ error: "Erro ao atualizar perfil tributário: " + err.message });
  }
});

/**
 * Lists SKU medians with associated historical commissions & shipping costs
 */
taxesRouter.get("/simulator/skus", requireAuth, async (req, res) => {
  try {
    const userId = getUserIdFromRequest(req);
    
    // 1. Get all skus & purchase costs defined in the costs table
    const costsRes = await pool.query(
      "SELECT id, sku, product_name, cost_unitary, currency FROM costs WHERE user_id = $1 ORDER BY sku ASC",
      [userId]
    );
    
    const skuCosts = costsRes.rows;
    
    // 2. Fetch all order items and their shipping/fees for this user in matching orders
    const statsQuery = `
      SELECT 
        i.sku,
        o.shipping_cost_detail,
        o.shipping_amount,
        o.marketplace_fee_amount,
        o.total_amount,
        i.total_price,
        i.quantity
      FROM orders o
      JOIN items i ON i.order_id = o.id
      WHERE o.user_id = $1
        AND o.status <> 'cancelled'
    `;
    const statsRes = await pool.query(statsQuery, [userId]);
    
    // Group stats by SKU
    const statsBySku = new Map<string, any[]>();
    for (const r of statsRes.rows) {
      if (!r.sku) continue;
      const uppercaseSku = r.sku.toUpperCase();
      const arr = statsBySku.get(uppercaseSku) || [];
      arr.push(r);
      statsBySku.set(uppercaseSku, arr);
    }
    
    // Assemble response detailing median costs per SKU
    const skusWithMedians = skuCosts.map(item => {
      const uppercaseSku = item.sku.toUpperCase();
      const rows = statsBySku.get(uppercaseSku) || [];
      
      const shippingVals: number[] = [];
      const feeVals: number[] = [];
      let totalSalesCount = 0;
      
      for (const r of rows) {
        const shipDetailNum = r.shipping_cost_detail !== null && r.shipping_cost_detail !== undefined ? parseFloat(r.shipping_cost_detail) : null;
        const shipAmountNum = r.shipping_amount !== null && r.shipping_amount !== undefined ? parseFloat(r.shipping_amount) : 0;
        const finalShipVal = (shipDetailNum !== null && shipDetailNum > 0) ? shipDetailNum : shipAmountNum;
        
        if (finalShipVal > 0) {
          shippingVals.push(finalShipVal);
        }
        
        const mtkFee = parseFloat(r.marketplace_fee_amount || "0");
        const totPrice = parseFloat(r.total_price || "0");
        const totAmt = parseFloat(r.total_amount || "1");
        const qty = parseInt(r.quantity || "1");
        
        const proportionalFee = (mtkFee * (totPrice / (totAmt || 1))) / (qty || 1);
        if (proportionalFee > 0) {
          feeVals.push(proportionalFee);
        }
        
        totalSalesCount += qty;
      }
      
      const medianShipping = calculateMedian(shippingVals);
      const medianFee = calculateMedian(feeVals);
      
      return {
        sku: item.sku,
        product_name: item.product_name,
        purchase_cost: Number(item.cost_unitary),
        currency: item.currency || "BRL",
        median_shipping: medianShipping || 0,
        median_fee: medianFee || 0,
        historical_sales_count: totalSalesCount
      };
    });
    
    res.json(skusWithMedians);
  } catch (err: any) {
    console.error("[SKU MEDIANS ERROR]", err);
    res.status(500).json({ error: "Erro ao carregar medianas de SKUs: " + err.message });
  }
});

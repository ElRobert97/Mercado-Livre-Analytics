import { dbOps, pool } from "../../db_postgres";
import { CalculatedOrder, OrderItem, StateTaxProfile, ProductCost, OrderFinancialSummary } from "../../shared/types";
import { normalizeStateCode } from "./validation";

/**
 * Recalculates order profit in database after syncing or updating cost values
 */
export async function recalculate_order_profit(userId: string): Promise<void> {
  const { orders: rawOrders, items: rawItems } = await dbOps.getRawOrdersAndItems(userId);
  const costs = await dbOps.getUserCosts(userId);
  const profiles = await dbOps.getStateTaxProfiles();

  const costMap = new Map<string, number>();
  costs.forEach(c => costMap.set(c.sku.toUpperCase(), Number(c.cost_unitary)));

  const profileMap = new Map<string, StateTaxProfile>();
  profiles.forEach(p => {
    if (p.active) {
      profileMap.set(p.state_code.toUpperCase(), p);
    }
  });

  const fallbackProfile: StateTaxProfile = {
    state_code: "MEDIAN",
    icms_factor: 0.0721,
    difal_factor: 0.1305,
    total_factor: 0.2044,
    source_type: "median",
    active: true
  };

  const itemsByOrder = new Map<string, OrderItem[]>();
  rawItems.forEach(item => {
    const arr = itemsByOrder.get(item.order_id) || [];
    arr.push(item);
    itemsByOrder.set(item.order_id, arr);
  });

  for (const o of rawOrders) {
    const isCancelled = o.status.toLowerCase() === "cancelled";
    
    const orderItems = itemsByOrder.get(o.id) || [];
    let product_cost = 0;
    orderItems.forEach(item => {
      const uCost = costMap.get(item.sku.toUpperCase()) || 0;
      product_cost += (uCost * item.quantity);
    });

    const stateCode = normalizeStateCode(o.shipping_state);
    let profile = profileMap.get(stateCode);
    let calcMode: "report_state_factor" | "fallback_median" | "manual_override" = "report_state_factor";
    if (!profile) {
      profile = fallbackProfile;
      calcMode = "fallback_median";
    } else {
      if (profile.source_type === "manual_override") {
        calcMode = "manual_override";
      } else if (profile.source_type === "median") {
        calcMode = "fallback_median";
      }
    }

    const revenue = Number(o.total_amount) || 0;
    const icms_estimated = isCancelled ? 0 : (revenue * profile.icms_factor);
    const difal_estimated = isCancelled ? 0 : (revenue * profile.difal_factor);
    const tax_cost_total = icms_estimated + difal_estimated;
    const tax_factor_applied = profile.total_factor;

    const shipping_cost_detail = Number(o.shipping_cost_detail) || 0;
    const revenue_net = isCancelled ? 0 : (revenue - Number(o.discount_amount) - Number(o.marketplace_fee_amount) - shipping_cost_detail);
    const profit = isCancelled ? 0 : (revenue_net - product_cost - tax_cost_total);
    const margin_percent = isCancelled ? 0 : (revenue > 0 ? (profit / revenue) * 100 : 0);

    await pool.query(
      `UPDATE orders 
       SET tax_factor = $1, tax_cost = $2, difal_factor = $3, difal_cost = $4, profit = $5, margin_percent = $6, updated_at = CURRENT_TIMESTAMP
       WHERE id = $7`,
      [tax_factor_applied, icms_estimated, profile.difal_factor, difal_estimated, profit, margin_percent, o.id]
    );

    await dbOps.saveOrderTaxSummary({
      order_id: o.id,
      shipping_state: o.shipping_state || "Indefinido",
      tax_factor_applied,
      icms_estimated,
      difal_estimated,
      tax_cost_total,
      calculation_mode: calcMode,
      rule_version: "v1.0-simulacao-simples",
      calculated_at: new Date().toISOString()
    });
  }
}

/**
 * Calculates detailed order models in memory by merging costs and state tax codes
 */
export async function getCalculatedOrdersPostgres(userId: string): Promise<CalculatedOrder[]> {
  const { orders: rawOrders, items: rawItems } = await dbOps.getRawOrdersAndItems(userId);
  const costs = await dbOps.getUserCosts(userId);
  const accounts = await dbOps.getUserMLAccounts(userId);
  const profiles = await dbOps.getStateTaxProfiles();

  // Map cost to a lookup dictionary for rapid search
  const costMap = new Map<string, ProductCost>();
  costs.forEach(c => {
    costMap.set(c.sku.toUpperCase(), c);
  });

  const accountMap = new Map<string, string>();
  accounts.forEach(acc => {
    accountMap.set(acc.id, acc.nickname);
  });

  const profileMap = new Map<string, StateTaxProfile>();
  profiles.forEach(p => {
    if (p.active) {
      profileMap.set(p.state_code.toUpperCase(), p);
    }
  });

  const fallbackProfile: StateTaxProfile = {
    state_code: "MEDIAN",
    icms_factor: 0.0721,
    difal_factor: 0.1305,
    total_factor: 0.2044,
    source_type: "median",
    active: true
  };

  // Group items by order_id
  const itemsByOrder = new Map<string, OrderItem[]>();
  rawItems.forEach(item => {
    const arr = itemsByOrder.get(item.order_id) || [];
    arr.push(item);
    itemsByOrder.set(item.order_id, arr);
  });

  // First map all orders individually with their items, costs and local tax calculations
  const mappedOrders = rawOrders.map(order => {
    const parentAccountNickname = accountMap.get(order.ml_account_id) || "Desconhecida";
    const orderItems = itemsByOrder.get(order.id) || [];

    let totalCostOfOrder = 0;
    let hasPendingCost = false;

    const itemsWithCosts = orderItems.map(item => {
      const skuUpper = item.sku.toUpperCase();
      const matchedCost = costMap.get(skuUpper);
      
      let costUnit = matchedCost ? Number(matchedCost.cost_unitary) : 0;
      let costTotal = costUnit * item.quantity;

      if (!matchedCost) {
        hasPendingCost = true;
        costUnit = 0;
        costTotal = 0;
      }

      totalCostOfOrder += costTotal;

      return {
        sku: item.sku,
        product_name: item.product_name,
        quantity: item.quantity,
        unit_price: Number(item.unit_price),
        total_price: Number(item.total_price),
        cost_unitary: costUnit,
        cost_total: costTotal
      };
    });

    // Destination state profile estimation
    const stateCode = normalizeStateCode(order.shipping_state);
    let profile = profileMap.get(stateCode);
    if (!profile) {
      profile = fallbackProfile;
    }

    const total_amount_num = Number(order.total_amount);
    const isCancelled = order.status.toLowerCase() === "cancelled";
    
    const taxFactor = profile.total_factor;
    const tax_cost = isCancelled ? 0 : (total_amount_num * profile.icms_factor);
    const difal_factor = profile.difal_factor;
    const difal_cost = isCancelled ? 0 : (total_amount_num * profile.difal_factor);

    return {
      id: order.id,
      ml_order_id: order.ml_order_id,
      status: order.status,
      order_date: order.order_date,
      total_amount: total_amount_num,
      shipping_amount: Number(order.shipping_amount),
      discount_amount: Number(order.discount_amount),
      marketplace_fee_amount: Number(order.marketplace_fee_amount),
      nickname: parentAccountNickname,
      items: itemsWithCosts,
      totalCostOfOrder,
      hasPendingCost,
      pack_id: order.pack_id ? String(order.pack_id).trim() : undefined,
      shipping_city: order.shipping_city || undefined,
      shipping_municipality: order.shipping_municipality || undefined,
      shipping_state: order.shipping_state || undefined,
      shipping_cost_detail: order.shipping_cost_detail !== undefined && order.shipping_cost_detail !== null ? Number(order.shipping_cost_detail) : 0,
      ml_shipment_id: order.ml_shipment_id || undefined,
      ml_account_id: order.ml_account_id,
      updated_at: order.updated_at,
      created_at: order.created_at,
      taxFactor,
      tax_cost,
      difal_factor,
      difal_cost
    };
  });

  // Group orders by pack_id if definable
  const finalOrders: CalculatedOrder[] = [];
  const packMap = new Map<string, typeof mappedOrders>();

  for (const o of mappedOrders) {
    if (o.pack_id && o.pack_id !== "") {
      const arr = packMap.get(o.pack_id) || [];
      arr.push(o);
      packMap.set(o.pack_id, arr);
    } else {
      finalOrders.push(buildOrderFromCollection([o]));
    }
  }

  // Process all pack collections (Sum order info inside pack)
  for (const [packId, ordersInPack] of packMap.entries()) {
    finalOrders.push(buildOrderFromCollection(ordersInPack, packId));
  }

  return finalOrders;

  // Helper to consolidate order objects from collections
  function buildOrderFromCollection(collection: typeof mappedOrders, packId?: string): CalculatedOrder {
    if (collection.length === 1 && !packId) {
      // Quick path for individual orders without pack
      const order = collection[0];
      const isCancelled = order.status.toLowerCase() === "cancelled";
      const shipping_cost_detail = order.shipping_cost_detail;
      
      const revenue_net = isCancelled ? 0 : (order.total_amount - order.discount_amount - order.marketplace_fee_amount - shipping_cost_detail);
      const computedTotalCost = isCancelled ? 0 : order.totalCostOfOrder;
      
      const difal_cost = isCancelled ? 0 : (order.difal_cost || 0);
      const profit = isCancelled ? 0 : (revenue_net - computedTotalCost - order.tax_cost - difal_cost);
      const margin = isCancelled ? 0 : (order.total_amount > 0 ? (profit / order.total_amount) : 0);

      const summary: OrderFinancialSummary = {
        id: `summary_${order.id}`,
        order_id: order.id,
        revenue_gross: order.total_amount,
        revenue_net,
        total_cost: computedTotalCost,
        gross_profit: profit,
        margin_percent: margin,
        updated_at: order.updated_at,
        tax_factor: order.taxFactor,
        tax_cost: order.tax_cost,
        difal_factor: order.difal_factor,
        difal_cost
      };

      return {
        id: order.id,
        ml_order_id: order.ml_order_id,
        status: order.status,
        order_date: order.order_date,
        total_amount: order.total_amount,
        shipping_amount: order.shipping_amount,
        discount_amount: order.discount_amount,
        marketplace_fee_amount: order.marketplace_fee_amount,
        net_amount: revenue_net,
        nickname: order.nickname,
        items: order.items,
        financial_summary: summary,
        cost_pending: order.hasPendingCost,
        pack_id: undefined,
        shipping_city: order.shipping_city,
        shipping_municipality: order.shipping_municipality,
        shipping_state: order.shipping_state,
        shipping_cost_detail: order.shipping_cost_detail > 0 ? order.shipping_cost_detail : undefined,
        ml_shipment_id: order.ml_shipment_id,
        created_at: order.created_at
      };
    }

    // Pack consolidation flow
    const sorted = [...collection].sort((a, b) => a.id.localeCompare(b.id));
    const primary = sorted[0];

    // Sum gross / discount / commissions / cost inside standard pack
    const total_amount = sorted.reduce((sum, o) => sum + o.total_amount, 0);
    const discount_amount = sorted.reduce((sum, o) => sum + o.discount_amount, 0);
    const marketplace_fee_amount = sorted.reduce((sum, o) => sum + o.marketplace_fee_amount, 0);
    const totalCostOfPack = sorted.reduce((sum, o) => sum + o.totalCostOfOrder, 0);
    const hasPendingCost = sorted.some(o => o.hasPendingCost);

    // Take the shipping limits (the package is unique)
    const shipping_amount = Math.max(...sorted.map(o => o.shipping_amount));
    const shipping_cost_detail = Math.max(...sorted.map(o => o.shipping_cost_detail));

    // Sum the tax costs and difal costs of each individual items
    const tax_cost = sorted.reduce((sum, o) => sum + o.tax_cost, 0);
    const difal_cost = sorted.reduce((sum, o) => sum + (o.difal_cost || 0), 0);

    // Concatenate all item entries
    const items: any[] = [];
    sorted.forEach(o => {
      items.push(...o.items);
    });

    // Join standard order IDs inside the pack with safe separators
    const ml_order_id = Array.from(new Set(sorted.map(o => o.ml_order_id))).join(" + ");

    const isCancelled = sorted.every(o => o.status.toLowerCase() === "cancelled");
    const status = isCancelled ? "cancelled" : (sorted.find(o => o.status.toLowerCase() !== "cancelled")?.status || primary.status);

    const revenue_net = isCancelled ? 0 : (total_amount - discount_amount - marketplace_fee_amount - shipping_cost_detail);
    const computedTotalCost = isCancelled ? 0 : totalCostOfPack;
    
    const profit = isCancelled ? 0 : (revenue_net - computedTotalCost - tax_cost - difal_cost);
    const margin = isCancelled ? 0 : (total_amount > 0 ? (profit / total_amount) : 0);

    const summary: OrderFinancialSummary = {
      id: `summary_pack_${packId || primary.id}`,
      order_id: primary.id,
      revenue_gross: total_amount,
      revenue_net,
      total_cost: computedTotalCost,
      gross_profit: profit,
      margin_percent: margin,
      updated_at: primary.updated_at,
      tax_factor: primary.taxFactor,
      tax_cost,
      difal_factor: primary.difal_factor,
      difal_cost
    };

    return {
      id: primary.id,
      ml_order_id,
      status,
      order_date: primary.order_date,
      total_amount,
      shipping_amount,
      discount_amount,
      marketplace_fee_amount,
      net_amount: revenue_net,
      nickname: primary.nickname,
      items,
      financial_summary: summary,
      cost_pending: hasPendingCost,
      pack_id: packId,
      shipping_city: primary.shipping_city,
      shipping_municipality: primary.shipping_municipality,
      shipping_state: primary.shipping_state,
      shipping_cost_detail: shipping_cost_detail > 0 ? shipping_cost_detail : undefined,
      ml_shipment_id: primary.ml_shipment_id,
      created_at: primary.created_at
    };
  }
}

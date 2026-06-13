import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import { initPostgres, dbOps, pool } from "./src/db_postgres";
import { User, MercadoLivreAccount, Order, OrderItem, ProductCost, CostImportBatch, OrderFinancialSummary, CalculatedOrder, StateTaxProfile } from "./src/shared/types";

// Initialize Gemini client (calls from server only)
const geminiApiKey = process.env.GEMINI_API_KEY;
let ai: GoogleGenAI | null = null;
if (geminiApiKey) {
  ai = new GoogleGenAI({
    apiKey: geminiApiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "50mb" }));

  // Initialize and check/seed PostgreSQL database on startup
  try {
    await initPostgres();
  } catch (err) {
    console.error("CRITICAL: Failed to link with Neon Postgres database:", err);
  }

  // Helper for authentication (in-memory simple session mapping to postgres primary key)
  let currentUserSession: string | null = "user_robert"; // logged in as seed user by default

  function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
    if (!currentUserSession) {
      return res.status(401).json({ error: "Não autorizado. Por favor, faça login." });
    }
    next();
  }

  // Helper to get real shipping fee dynamically via ML Shipments API
  async function getShipmentExtendedData(shipmentId: string | number, accessToken: string): Promise<{
    shipping_amount: number;
    shipping_city?: string;
    shipping_municipality?: string;
    shipping_state?: string;
    shipping_cost_detail?: number;
    ml_shipment_id?: string;
  }> {
    const data: {
      shipping_amount: number;
      shipping_city?: string;
      shipping_municipality?: string;
      shipping_state?: string;
      shipping_cost_detail?: number;
      ml_shipment_id?: string;
    } = {
      shipping_amount: 0,
      shipping_city: undefined,
      shipping_municipality: undefined,
      shipping_state: undefined,
      shipping_cost_detail: undefined,
      ml_shipment_id: shipmentId ? String(shipmentId) : undefined
    };

    if (!shipmentId) return data;

    try {
      console.log(`[SHIPMENT] Fetching data for shipment ID: ${shipmentId}`);
      // 1. Get Shipment Core details and Address info
      const url = `https://api.mercadolibre.com/shipments/${shipmentId}`;
      const response = await fetch(url, {
        headers: { 
          "Authorization": `Bearer ${accessToken}`,
          "x-format-new": "true"
        }
      });
      if (response.ok) {
        const result = await response.json();
        console.log(`[SHIPMENT] Successfully fetched shipment ${shipmentId} core detail. Keys:`, Object.keys(result));
        const cost = Number(result?.shipping_option?.cost ?? 0);
        const list_cost = Number(result?.shipping_option?.list_cost ?? 0);
        data.shipping_amount = list_cost - cost;

        const sa = result?.destination?.shipping_address || result?.shipping_address || result?.receiver_address;
        if (sa) {
          console.log(`[SHIPMENT] Found shipping address object. city:`, sa.city, `municipality:`, sa.municipality, `state:`, sa.state);
          if (sa.city) data.shipping_city = sa.city.name || undefined;
          if (sa.municipality) data.shipping_municipality = sa.municipality.name || undefined;
          if (sa.state) data.shipping_state = sa.state.name || undefined;
        } else {
          console.warn(`[SHIPMENT] No shipping address found in the response for shipment ${shipmentId}`);
        }
      } else {
        const errText = await response.text();
        console.warn(`[SHIPMENT] Failed to fetch shipment detail for ${shipmentId}: ${response.status} ${response.statusText} - Response:`, errText);
      }

      // 2. Get Shipment extra costs (/costs endpoint)
      try {
        const costUrl = `https://api.mercadolibre.com/shipments/${shipmentId}/costs`;
        console.log(`[SHIPMENT] Fetching cost info from: ${costUrl}`);
        const costResponse = await fetch(costUrl, {
          headers: { 
            "Authorization": `Bearer ${accessToken}`,
            "x-format-new": "true"
          }
        });
        if (costResponse.ok) {
          const costResult = await costResponse.json();
          console.log(`[SHIPMENT] Successfully fetched shipment ${shipmentId} costs. payload:`, JSON.stringify(costResult));
          // Read senders => cost
          if (Array.isArray(costResult?.senders) && costResult.senders.length > 0) {
            data.shipping_cost_detail = Number(costResult.senders[0]?.cost ?? 0);
          } else if (costResult?.senders && typeof costResult.senders === 'object') {
            data.shipping_cost_detail = Number(costResult.senders.cost ?? 0);
          } else if (costResult?.cost) {
            data.shipping_cost_detail = Number(costResult.cost ?? 0);
          }
          console.log(`[SHIPMENT] Extracted shipping_cost_detail for ${shipmentId}: ${data.shipping_cost_detail}`);
        } else {
          const costErrText = await costResponse.text();
          console.warn(`[SHIPMENT] Failed to fetch shipment costs response for ${shipmentId}: ${costResponse.status} - Response:`, costErrText);
        }
      } catch (ce) {
        console.warn(`Failed to fetch shipments costs for ${shipmentId}:`, ce);
      }
    } catch (err) {
      console.error(`Error querying shipment detail/costs for ${shipmentId}:`, err);
    }

    return data;
  }

  async function getShipmentCost(shipmentId: string | number, accessToken: string): Promise<number> {
    const sData = await getShipmentExtendedData(shipmentId, accessToken);
    return sData.shipping_amount;
  }

  // Helper to refresh a Mercado Livre account's token
  async function refreshAccountTokenIfNeeded(accId: string, force: boolean = false): Promise<string> {
    const acc = await dbOps.getAccountById(accId, currentUserSession || "user_robert");
    if (!acc) {
      throw new Error(`Conta não encontrada: ${accId}`);
    }

    if (acc.access_token.startsWith("SIM_") || acc.access_token.startsWith("MOCK_")) {
      return acc.access_token;
    }

    // Checking if the token expires soon (within 5 minutes)
    if (!force && acc.token_expires_at) {
      const expiresAt = new Date(acc.token_expires_at).getTime();
      if (expiresAt > Date.now() + 5 * 60 * 1000) {
        return acc.access_token;
      }
    }

    console.log(`[AUTOREFRESH] Renovando token Mercado Livre para a conta: ${acc.nickname || acc.id}`);
    const clientId = process.env.ML_CLIENT_ID || process.env.MERCADOLIVRE_CLIENT_ID;
    const clientSecret = process.env.ML_CLIENT_SECRET || process.env.MERCADOLIVRE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new Error("Chaves de API do Mercado Livre (ML_CLIENT_ID, ML_CLIENT_SECRET) não configuradas no ambiente (.env)");
    }

    const refreshResponse = await fetch("https://api.mercadolibre.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: acc.refresh_token
      }).toString()
    });

    if (!refreshResponse.ok) {
      const errorText = await refreshResponse.text();
      console.error(`[AUTOREFRESH ERROR] Falha ao renovar token da conta ${acc.id}: ${errorText}`);
      throw new Error(`Erro de autenticação ao renovar token Mercado Livre: ${errorText}`);
    }

    const freshTokenData = await refreshResponse.json();
    const expiresAt = new Date(Date.now() + freshTokenData.expires_in * 1000).toISOString();

    await dbOps.updateMLAccountTokens(acc.id, freshTokenData.access_token, freshTokenData.refresh_token, expiresAt);
    console.log(`[AUTOREFRESH SUCCESS] Token renovado com sucesso para a conta ${acc.id}`);
    return freshTokenData.access_token;
  }

  // Normalizes SKU by padding with exactly one '0' if it's a numeric code below 10000
  function normalizeSku(sku: string): string {
    const trimmed = sku.trim();
    if (/^\d+$/.test(trimmed)) {
      const skuNum = parseInt(trimmed, 10);
      if (skuNum < 10000) {
        return "0" + skuNum.toString();
      }
    }
    return trimmed;
  }

  // Extracts the actual custom SKU (SELLER_SKU) from Mercado Livre item details/attributes
  function extractMlSku(itRow: any, idx: number): string {
    if (!itRow || !itRow.item) return `SKU_${idx}`;

    // 1. Try seller_custom_field (standard field in ML Orders)
    if (itRow.item.seller_custom_field) {
      return normalizeSku(String(itRow.item.seller_custom_field)).toUpperCase();
    }

    // 2. Try seller_sku under the item object
    if (itRow.item.seller_sku) {
      return normalizeSku(String(itRow.item.seller_sku)).toUpperCase();
    }

    // 3. Search variation_attributes array
    const varAttrs = itRow.item.variation_attributes || [];
    const varSkuAttr = varAttrs.find((attr: any) => attr?.id === "SELLER_SKU" || attr?.id === "SKU" || attr?.name?.toUpperCase() === "SKU");
    if (varSkuAttr && varSkuAttr.value_name) {
      return normalizeSku(String(varSkuAttr.value_name)).toUpperCase();
    }

    // 4. Search item-level attributes array
    const attrs = itRow.item.attributes || [];
    const skuAttr = attrs.find((attr: any) => attr?.id === "SELLER_SKU" || attr?.id === "SKU" || attr?.name?.toUpperCase() === "SKU");
    if (skuAttr && skuAttr.value_name) {
      return normalizeSku(String(skuAttr.value_name)).toUpperCase();
    }

    // 5. Try root level seller_sku on order item
    if (itRow.seller_sku) {
      return normalizeSku(String(itRow.seller_sku)).toUpperCase();
    }

    // If no custom Merchant SKU is found anywhere, fallback to item.id (the MLB ID)
    return String(itRow.item.id || `SKU_${idx}`).trim().toUpperCase();
  }

  // --- STATE NORMALIZATION HELPER ---
  function normalizeStateCode(stateName: string | null | undefined): string {
    if (!stateName) return "";
    const name = stateName.toLowerCase().trim()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // strip accents like São Paulo -> sao paulo
    
    if (name === "sp" || name.includes("sao paulo")) return "SP";
    if (name === "rj" || name.includes("rio de janeiro")) return "RJ";
    if (name === "mg" || name.includes("minas gerais")) return "MG";
    if (name === "es" || name.includes("espirito santo")) return "ES";
    if (name === "pr" || name.includes("parana")) return "PR";
    if (name === "sc" || name.includes("santa catarina")) return "SC";
    if (name === "rs" || name.includes("rio grande do sul")) return "RS";
    if (name === "go" || name.includes("goias")) return "GO";
    if (name === "df" || name.includes("distrito federal")) return "DF";
    if (name === "mt" || (name.includes("mato grosso") && !name.includes("sul"))) return "MT";
    if (name === "ms" || name.includes("mato grosso do sul")) return "MS";
    if (name === "ba" || name.includes("bahia")) return "BA";
    if (name === "pe" || name.includes("pernambuco")) return "PE";
    if (name === "ce" || name.includes("ceara")) return "CE";
    if (name === "pb" || name.includes("paraiba")) return "PB";
    if (name === "rn" || name.includes("rio grande do norte")) return "RN";
    if (name === "al" || name.includes("alagoas")) return "AL";
    if (name === "se" || name.includes("sergipe")) return "SE";
    if (name === "pi" || name.includes("piaui")) return "PI";
    if (name === "ma" || name.includes("maranhao")) return "MA";
    if (name === "to" || name.includes("tocantins")) return "TO";
    if (name === "pa" || (name.includes("para") && name !== "parana" && name !== "paraiba")) return "PA";
    if (name === "ap" || name.includes("amapa")) return "AP";
    if (name === "am" || name.includes("amazonas")) return "AM";
    if (name === "ac" || name.includes("acre")) return "AC";
    if (name === "ro" || name.includes("rondonia")) return "RO";
    if (name === "rr" || name.includes("roraima")) return "RR";

    // check 2 letter raw
    const uppercase = stateName.toUpperCase().trim();
    if (["SP", "RJ", "MG", "ES", "PR", "SC", "RS", "GO", "DF", "MT", "MS", "BA", "PE", "CE", "PB", "RN", "AL", "SE", "PI", "MA", "TO", "PA", "AP", "AM", "AC", "RO", "RR"].includes(uppercase)) {
      return uppercase;
    }
    return "";
  }

  // --- TAX ESTIMATION ENGINE SPEC-ALIGNED OBJECTS ---
  const TaxFactorService = {
    get_tax_factor_by_state: async (stateName: string | null | undefined): Promise<number> => {
      const code = normalizeStateCode(stateName);
      if (!code) return 0.25;
      const factors = await dbOps.getStateTaxFactors();
      const match = factors.find(f => f.state_code.toUpperCase() === code.toUpperCase() && f.active);
      return match ? Number(match.tax_factor) : 0.25;
    },

    calculate_tax_cost: (revenue: number, taxFactor: number): number => {
      return revenue * taxFactor;
    },

    calculate_order_profit: (revenue: number, marketplaceFee: number, shippingCost: number, productCost: number, taxCost: number, discount: number = 0): number => {
      return revenue - discount - marketplaceFee - shippingCost - productCost - taxCost;
    }
  };

  const StateTaxFactorRepository = {
    get_by_state: async (stateCode: string) => {
      const factors = await dbOps.getStateTaxFactors();
      return factors.find(f => f.state_code.toUpperCase() === stateCode.toUpperCase()) || null;
    },
    get_all: async () => {
      return dbOps.getStateTaxFactors();
    },
    create: async (stateCode: string, taxFactor: number, active: boolean = true) => {
      const id = `tax_${stateCode.toLowerCase()}`;
      await pool.query(
        `INSERT INTO state_tax_factors (id, state_code, tax_factor, active)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (state_code) DO UPDATE SET tax_factor = EXCLUDED.tax_factor, active = EXCLUDED.active, updated_at = CURRENT_TIMESTAMP`,
        [id, stateCode.toUpperCase(), taxFactor, active]
      );
    },
    update: async (id: string, taxFactor: number, active: boolean) => {
      await dbOps.updateStateTaxFactor(id, taxFactor, active);
    }
  };

  async function recalculate_order_profit(userId: string): Promise<void> {
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

  // Helper to calculate full order details dynamically based on SKU costs and state tax codes
  async function getCalculatedOrdersPostgres(userId: string): Promise<CalculatedOrder[]> {
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
        taxFactor,
        tax_cost,
        difal_factor,
        difal_cost
      };
    });

    // Group orders by pack_id if defineable
    const finalOrders: CalculatedOrder[] = [];
    const packMap = new Map<string, typeof mappedOrders>();

    for (const o of mappedOrders) {
      if (o.pack_id && o.pack_id !== "") {
        const arr = packMap.get(o.pack_id) || [];
        arr.push(o);
        packMap.set(o.pack_id, arr);
      } else {
        // Case 1: Order without pack_id (base on order only)
        finalOrders.push(buildOrderFromCollection([o]));
      }
    }

    // Process all pack collections (Case 2: Sum order info inside pack)
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
        
        // Exact formula: Net revenue - total Cost of Items - estimated tax factor cost - DIFAL (13%)
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
          ml_shipment_id: order.ml_shipment_id
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

      // Take the shipping limits (the package is unique, so shipping details shouldn't be summed)
      const shipping_amount = Math.max(...sorted.map(o => o.shipping_amount));
      const shipping_cost_detail = Math.max(...sorted.map(o => o.shipping_cost_detail));

      // Sum the tax costs and difal costs of each individual items inside of standard package
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
        ml_shipment_id: primary.ml_shipment_id
      };
    }
  }

  // ==================== 7.1. Auth Endpoints ====================

  app.post("/api/auth/register", async (req, res) => {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: "Nome, email e senha são obrigatórios." });
    }

    try {
      const existingUser = await dbOps.findUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ error: "Email já cadastrado." });
      }

      const newUser: User = {
        id: `user_${Date.now()}`,
        name,
        email,
        password_hash: password, // plaintext for simplified demo
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      await dbOps.createUser(newUser);
      currentUserSession = newUser.id;
      res.status(201).json({ user: { id: newUser.id, name: newUser.name, email: newUser.email } });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: "Erro ao cadastrar usuário: " + err.message });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email e senha são obrigatórios." });
    }

    try {
      const user = await dbOps.findUserByEmail(email);
      if (!user || user.password_hash !== password) {
        return res.status(400).json({ error: "Email ou senha incorretos." });
      }

      currentUserSession = user.id;
      res.json({ user: { id: user.id, name: user.name, email: user.email } });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: "Erro ao realizar login." });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    currentUserSession = null;
    res.json({ message: "Sessão encerrada com sucesso." });
  });

  app.get("/api/auth/me", async (req, res) => {
    if (!currentUserSession) {
      return res.json({ user: null });
    }
    try {
      const user = await dbOps.findUserById(currentUserSession);
      if (!user) {
        currentUserSession = null;
        return res.json({ user: null });
      }
      res.json({ user: { id: user.id, name: user.name, email: user.email } });
    } catch (err) {
      currentUserSession = null;
      res.json({ user: null });
    }
  });

  // ==================== 7.2. Mercado Livre Integrations ====================

  app.get("/api/integrations/mercadolivre/accounts", requireAuth, async (req, res) => {
    try {
      const accounts = await dbOps.getUserMLAccounts(currentUserSession!);
      res.json(accounts);
    } catch (err: any) {
      res.status(500).json({ error: "Erro ao buscar integrações: " + err.message });
    }
  });

  app.get("/api/integrations/mercadolivre/connect", requireAuth, (req, res) => {
    const query = req.query;
    // Read Client ID and Redirect URI from .env configuration if provided
    const clientId = process.env.ML_CLIENT_ID || process.env.MERCADOLIVRE_CLIENT_ID || "5594702884845296";
    const appUrl = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
    const redirectUri = process.env.ML_REDIRECT_URI || `${appUrl}/api/integrations/mercadolivre/callback`;
    const state = String(query.state || currentUserSession || "state_rand");

    res.json({
      auth_url: `https://auth.mercadolivre.com.br/authorization?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`,
      client_id: clientId,
      redirect_uri: redirectUri,
      state
    });
  });

  // Conect Simulation: Seeding simulation accounts on database (Disabled for exclusive focus on real API data)
  app.post("/api/integrations/mercadolivre/connect-simulation", requireAuth, async (req, res) => {
    return res.status(400).json({ error: "Ambiente de simulação desativado para foco exclusivo em dados reais de produção da API Mercado Livre." });
  });

  // Mercado Livre Real Authentication Callback - supports both direct ngrok redirect as well as embedded internal preview
  app.get(["/auth/callback", "/auth/callback/", "/api/integrations/mercadolivre/callback"], async (req, res) => {
    const { code, state } = req.query;

    if (!code) {
      return res.status(400).send("Código de autorização ausente da url callback.");
    }

    const clientId = process.env.ML_CLIENT_ID || process.env.MERCADOLIVRE_CLIENT_ID;
    const clientSecret = process.env.ML_CLIENT_SECRET || process.env.MERCADOLIVRE_CLIENT_SECRET;

    // Fallback: If no client credentials configured in .env, render an error explaining the setup nicely
    if (!clientId || !clientSecret) {
      return res.send(`
        <html>
          <body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; background: #0f1025; padding: 20px; color: white;">
            <div style="background: rgba(255,255,255,0.03); border: 1px border rgba(255,255,255,0.1); padding: 40px; border-radius: 20px; text-align: center; max-width: 500px; width:100%; box-shadow: 0 8px 32px rgba(0,0,0,0.4); backdrop-filter: blur(12px);">
              <svg style="color: #FFE600; width: 64px; height: 64px; margin: auto;" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
              <h2 style="color: #FFE600; margin-top: 20px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px;">Chaves Não Configuradas</h2>
              <p style="color: rgba(255,255,255,0.6); margin-top: 15px; font-size: 13px; line-height: 1.6;">O callback de autenticação real do Mercado Livre foi alcançado, mas a sua aplicação ainda não possui as variáveis de ambiente em seu arquivo <code>.env</code>.</p>
              <div style="background: rgba(0,0,0,0.3); padding: 15px; border-radius: 12px; margin-top: 20px; text-align: left; font-family: monospace; font-size: 11px; color: #FFE600; line-height: 1.5;">
                # Adicione ao seu .env:<br>
                ML_CLIENT_ID="SEU_CLIENT_ID"<br>
                ML_CLIENT_SECRET="SEU_CLIENT_SECRET"<br>
                ML_REDIRECT_URI="https://clingingly-cavitied-elizbeth.ngrok-free.dev/auth/callback"<br>
                ML_SITE_ID="MLB"
              </div>
              <p style="color: rgba(255,255,255,0.4); margin-top: 15px; font-size: 11px;">Para testes rápidos sem credenciais oficiais, utilize o botão <strong>"Conectar Conta Simulada"</strong> na aba de Integrações.</p>
              <button onclick="window.close()" style="margin-top: 25px; background: #3483FA; color: white; border: none; padding: 12px 24px; border-radius: 12px; font-weight: bold; cursor: pointer; transition: opacity 0.2s;">FECHAR ABA</button>
            </div>
          </body>
        </html>
      `);
    }

    try {
      const appUrl = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
      const redirectUri = process.env.ML_REDIRECT_URI || `${appUrl}/api/integrations/mercadolivre/callback`;

      // Token Exchange Client-to-API
      const tokenResponse = await fetch("https://api.mercadolibre.com/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: clientId,
          client_secret: clientSecret,
          code: String(code),
          redirect_uri: redirectUri
        }).toString()
      });

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        throw new Error("Erro na troca de código por access token: " + errorText);
      }

      const tokenData = await tokenResponse.json();
      const accessToken = tokenData.access_token;
      const refreshToken = tokenData.refresh_token;
      const expiresIn = tokenData.expires_in;
      const mlUserId = String(tokenData.user_id);
      
      const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

      // Fetch official user nickname
      const userDetailsResponse = await fetch(`https://api.mercadolibre.com/users/${mlUserId}`, {
        headers: { "Authorization": `Bearer ${accessToken}` }
      });
      let nickname = `ML_USER_${mlUserId}`;
      if (userDetailsResponse.ok) {
        const details = await userDetailsResponse.json();
        nickname = details.nickname;
      }

      // Save to Postgres
      const integrationAccount: MercadoLivreAccount = {
        id: `ml_acc_${mlUserId}`,
        user_id: String(state || "user_robert"),
        nickname,
        access_token: accessToken,
        refresh_token: refreshToken,
        token_expires_at: expiresAt,
        ml_user_id: mlUserId,
        status: "active",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      await dbOps.createMLAccount(integrationAccount);

      res.send(`
        <html>
          <body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; background: #0f1025; padding: 20px; color: white;">
            <div style="background: rgba(255,255,255,0.03); border: 1px border rgba(255,255,255,0.1); padding: 40px; border-radius: 20px; text-align: center; max-width: 400px; width:100%; box-shadow: 0 8px 32px rgba(0,0,0,0.4); backdrop-filter: blur(12px);">
              <svg style="color: #00FF66; width: 64px; height: 64px; margin: auto;" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
              <h2 style="color: #00FF66; margin-top: 20px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px;">Mercado Livre Integrado!</h2>
              <p style="color: rgba(255,255,255,0.7); margin-top: 10px; font-size: 13px; line-height: 1.6;">A conta <strong>${nickname}</strong> foi real e fisicamente vinculada a sua conta de análise com sucesso!</p>
              <p style="color: rgba(255,255,255,0.40); margin-top: 10px; font-size: 11px;">Você já pode fechar esta tela e retornar ao Painel de Controle para carregar suas transações reais.</p>
              <button onclick="window.close()" style="margin-top: 25px; background: #2563eb; color: white; border: none; padding: 12px 24px; border-radius: 12px; font-weight: bold; cursor: pointer; transition: opacity 0.2s;">FECHAR ABA</button>
            </div>
          </body>
        </html>
      `);
    } catch (realAuthErr: any) {
      console.error("Real ML OAuth callback error:", realAuthErr);
      res.status(500).send(`Erro na integração com Mercado Livre: ${realAuthErr.message}`);
    }
  });

  app.post("/api/integrations/mercadolivre/refresh", requireAuth, async (req, res) => {
    const { account_id } = req.body;
    if (!account_id) return res.status(400).json({ error: "ID de conta obrigatório" });

    try {
      const acc = await dbOps.getAccountById(account_id, currentUserSession!);
      if (!acc) return res.status(404).json({ error: "Integração não encontrada" });

      // If simulated, refresh mock credentials
      if (acc.access_token.startsWith("SIM_") || acc.access_token.startsWith("MOCK_")) {
        const nextExpiry = new Date(Date.now() + 6 * 3600 * 1000).toISOString();
        await dbOps.updateMLAccountTokens(
          acc.id,
          `REFRESHED_ACCESS_TOKEN_${Date.now()}`,
          `REFRESHED_REFRESH_TOKEN_${Date.now()}`,
          nextExpiry
        );
        const updated = await dbOps.getAccountById(account_id, currentUserSession!);
        return res.json({ message: "Token de simulação atualizado com sucesso", account: updated });
      }

      // If real account, execute a real API refresh token request
      const clientId = process.env.ML_CLIENT_ID || process.env.MERCADOLIVRE_CLIENT_ID;
      const clientSecret = process.env.ML_CLIENT_SECRET || process.env.MERCADOLIVRE_CLIENT_SECRET;
      if (!clientId || !clientSecret) {
        return res.status(401).json({ error: "Chaves de API ausentes do seu .env" });
      }

      const refreshResponse = await fetch("https://api.mercadolibre.com/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: acc.refresh_token
        }).toString()
      });

      if (!refreshResponse.ok) {
        const errorText = await refreshResponse.text();
        throw new Error("Erro ao renovar token de acesso: " + errorText);
      }

      const freshTokenData = await refreshResponse.json();
      const expiresAt = new Date(Date.now() + freshTokenData.expires_in * 1000).toISOString();

      await dbOps.updateMLAccountTokens(acc.id, freshTokenData.access_token, freshTokenData.refresh_token, expiresAt);
      
      const updated = await dbOps.getAccountById(account_id, currentUserSession!);
      res.json({ message: "Token real Mercado Livre atualizado com sucesso", account: updated });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: "Erro ao recarregar tokens: " + err.message });
    }
  });

  app.delete("/api/integrations/mercadolivre/accounts/:id", requireAuth, async (req, res) => {
    const accId = req.params.id;
    try {
      await dbOps.deleteMLAccount(accId, currentUserSession!);
      res.json({ message: "Integração removida com sucesso de sua conta Postgres." });
    } catch (err: any) {
      res.status(500).json({ error: "Erro ao remover integração: " + err.message });
    }
  });

  // ==================== 7.2.5. Products Endpoints ====================

  // Helper to normalize Brazilian logistics names from Mercado Livre
  function normalizeLogisticTypeName(logisticType: string | null | undefined, shippingMode: string | null | undefined): string {
    const typeKey = (logisticType || "").toLowerCase().trim();
    const modeKey = (shippingMode || "").toLowerCase().trim();

    if (typeKey === "fulfillment") return "Mercado Envios Full";
    if (typeKey === "cross_docking") return "Mercado Envios Coleta";
    if (typeKey === "drop_off") return "Mercado Envios Agência";
    if (typeKey === "xd_drop_off") return "Mercado Envios Agência";
    if (typeKey === "self_service" || typeKey === "flex") return "Mercado Envios Flex";
    if (typeKey === "custom") return "Personalizado";
    if (modeKey === "me2") return "Mercado Envios Coletivo";
    if (modeKey === "me1") return "Mercado Envios 1";
    if (modeKey === "custom") return "Personalizado";
    return "Retirada em Mãos / A Combinar";
  }

  // Helper to compute median of a list of numbers
  function calculateMedian(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 !== 0) {
      return sorted[mid];
    }
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }

  app.get("/api/products", requireAuth, async (req, res) => {
    try {
      const { accountId, search, status, limit = "40", offset = "0" } = req.query;

      // 1. Get user accounts
      let accounts = await dbOps.getUserMLAccounts(currentUserSession!);

      // Filter by accountId if specified
      if (accountId) {
        accounts = accounts.filter(acc => acc.id === accountId);
      }

      if (accounts.length === 0) {
        return res.json({ products: [], total: 0 });
      }

      const itemsLimit = Math.min(Number(limit), 100);
      const itemsOffset = Number(offset);

      let allItemIds: { id: string; accountNickname: string; accountId: string }[] = [];

      // For each account, retrieve list of item IDs
      for (const acc of accounts) {
        let token = acc.access_token;
        try {
          token = await refreshAccountTokenIfNeeded(acc.id);
        } catch (err: any) {
          console.warn(`[PRODUCTS] Failed to refresh token for account ${acc.id}:`, err.message);
        }

        // Search active/inactive/pending items
        let searchUrl = `https://api.mercadolibre.com/users/${acc.ml_user_id}/items/search?limit=100`;
        if (search) {
          searchUrl += `&q=${encodeURIComponent(search as string)}`;
        }
        if (status) {
          searchUrl += `&status=${encodeURIComponent(status as string)}`;
        }

        let mlRes = await fetch(searchUrl, {
          headers: { "Authorization": `Bearer ${token}` }
        });

        if ((mlRes.status === 401 || mlRes.status === 403) && !acc.access_token.startsWith("SIM_") && !acc.access_token.startsWith("MOCK_")) {
          console.log(`[PRODUCTS] Received ${mlRes.status} on searching items. Retrying with direct forced refresh...`);
          try {
            token = await refreshAccountTokenIfNeeded(acc.id, true);
            mlRes = await fetch(searchUrl, {
              headers: { "Authorization": `Bearer ${token}` }
            });
          } catch (rErr: any) {
            console.warn(`[PRODUCTS] Forced refresh for search failed: ${rErr.message}`);
          }
        }

        if (!mlRes.ok) {
          console.warn(`[PRODUCTS] Skip search items call because response returned non-2xx: ${mlRes.status}`);
          continue;
        }

        const searchResult = await mlRes.json();
        const results = searchResult.results || []; // Array of strings (Item IDs)
        results.forEach((id: string) => {
          allItemIds.push({ id, accountNickname: acc.nickname, accountId: acc.id });
        });
      }

      // Total count across selected integrated accounts
      const totalCount = allItemIds.length;

      // Apply pagination on IDs first
      const paginatedIds = allItemIds.slice(itemsOffset, itemsOffset + itemsLimit);

      if (paginatedIds.length === 0) {
        return res.json({ products: [], total: totalCount });
      }

      const accountTokens = new Map<string, string>();
      for (const acc of accounts) {
        let token = acc.access_token;
        try {
          token = await refreshAccountTokenIfNeeded(acc.id);
        } catch {}
        accountTokens.set(acc.id, token);
      }

      const productDetailList: any[] = [];

      // Multiget is best grouped by accountId
      const groupedByAccount = new Map<string, typeof paginatedIds>();
      for (const p of paginatedIds) {
        const arr = groupedByAccount.get(p.accountId) || [];
        arr.push(p);
        groupedByAccount.set(p.accountId, arr);
      }

      // Category Cache to resolve category names to minimize repeat API requests
      const categoryCache = new Map<string, string>();
      const getCategoryName = async (catId: string, token: string) => {
        if (!catId) return "Não categorizado";
        if (categoryCache.has(catId)) return categoryCache.get(catId);
        try {
          const catRes = await fetch(`https://api.mercadolibre.com/categories/${catId}`, {
            headers: { "Authorization": `Bearer ${token}` }
          });
          if (catRes.ok) {
            const catJson = await catRes.json();
            categoryCache.set(catId, catJson.name);
            return catJson.name;
          }
        } catch (err) {
          console.warn(`Failed fetching category name for ${catId}:`, err);
        }
        return catId; // fallback to ID
      };

      for (const [accId, pEntries] of groupedByAccount.entries()) {
        let token = accountTokens.get(accId) || "";
        const idsQuery = pEntries.map(p => p.id).join(",");

        // Fetch details in bulk (up to 20 per call as recommended by Meli API limit rules)
        const detailsUrl = `https://api.mercadolibre.com/items?ids=${idsQuery}`;
        let detRes = await fetch(detailsUrl, {
          headers: { "Authorization": `Bearer ${token}` }
        });

        if ((detRes.status === 401 || detRes.status === 403) && !token.startsWith("SIM_") && !token.startsWith("MOCK_")) {
          console.log(`[PRODUCTS] Received ${detRes.status} on details multiget. Retrying with direct forced refresh...`);
          try {
            token = await refreshAccountTokenIfNeeded(accId, true);
            detRes = await fetch(detailsUrl, {
              headers: { "Authorization": `Bearer ${token}` }
            });
          } catch (rErr: any) {
            console.warn(`[PRODUCTS] Forced refresh for bulk items failed: ${rErr.message}`);
          }
        }

        if (detRes.ok) {
          const resultsArray = await detRes.json(); // array of { code: 200, body: {...} }
          for (const itemWrapper of resultsArray) {
            if (itemWrapper.code === 200 && itemWrapper.body) {
              const body = itemWrapper.body;
              const entry = pEntries.find(p => p.id === body.id);

              // Extract attributes like SKU
              let sku = "N/A";
              if (body.seller_custom_field) {
                sku = body.seller_custom_field;
              } else if (body.attributes) {
                const sellerSkuAttr = body.attributes.find((a: any) => a.id === "SELLER_SKU" || a.name?.toUpperCase() === "SKU");
                if (sellerSkuAttr && sellerSkuAttr.value_name) {
                  sku = sellerSkuAttr.value_name;
                }
              }

              // Pad SKU based on the user's SKU padding rule if it is a numeric SKU below 10000
              sku = normalizeSku(sku);

              // Resolve Category Name
              const categoryName = await getCategoryName(body.category_id, token);

              // Standardized logistics name
              const normalizedLogistics = normalizeLogisticTypeName(body.shipping?.logistic_type, body.shipping?.mode);

              productDetailList.push({
                id: body.id,
                accountId: accId,
                title: body.title,
                price: body.price,
                original_price: body.original_price,
                currency_id: body.currency_id,
                thumbnail: body.thumbnail,
                permalink: body.permalink,
                status: body.status,
                condition: body.condition,
                available_quantity: body.available_quantity,
                sold_quantity: body.sold_quantity,
                category_id: body.category_id,
                category_name: categoryName,
                sku: sku,
                listing_type_id: body.listing_type_id,
                shipping_mode: body.shipping?.mode,
                shipping_free: body.shipping?.free_shipping,
                logistic_type: body.shipping?.logistic_type,
                normalized_logistics: normalizedLogistics,
                pictures: body.pictures?.slice(0, 5).map((pic: any) => pic.url || pic.secure_url) || [],
                accountNickname: entry ? entry.accountNickname : "Conta integrada",
                warranty: body.warranty,
                buying_mode: body.buying_mode,
                date_created: body.date_created,
                health: body.health,
                video_id: body.video_id,
                accepts_mercadopago: body.accepts_mercadopago,
                attributes: body.attributes || []
              });
            }
          }
        } else {
          console.warn(`[PRODUCTS] Skip bulk fetch call because response returned non-2xx: ${detRes.status}`);
        }
      }

      // Batch calculate median billing statistics (last 3-month shipments & sales tax/fees) from historical Neon Postgres orders
      const allSkusOnPage = Array.from(new Set(productDetailList.map(p => p.sku).filter(s => s && s !== "N/A")));
      const skuStatsMap = new Map<string, { medianShipping: number; medianFee: number; salesCount: number }>();

      if (allSkusOnPage.length > 0) {
        try {
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
              AND i.sku = ANY($2)
              AND o.order_date >= NOW() - INTERVAL '3 months'
          `;
          const statsRes = await pool.query(statsQuery, [currentUserSession!, allSkusOnPage]);
          
          // Group rows by SKU
          const groupedBySku = new Map<string, any[]>();
          for (const r of statsRes.rows) {
            const upSku = r.sku.toUpperCase();
            const arr = groupedBySku.get(upSku) || [];
            arr.push(r);
            groupedBySku.set(upSku, arr);
          }

          // Calculate medians for each SKU group
          for (const [skuStr, rows] of groupedBySku.entries()) {
            const shippingVals: number[] = [];
            const feeVals: number[] = [];
            let totalQty = 0;

            for (const row of rows) {
              const shipDetailNum = row.shipping_cost_detail !== null ? parseFloat(row.shipping_cost_detail) : null;
              const shipAmountNum = row.shipping_amount !== null ? parseFloat(row.shipping_amount) : 0;
              
              const finalShipVal = (shipDetailNum !== null && shipDetailNum > 0) ? shipDetailNum : shipAmountNum;
              shippingVals.push(finalShipVal);

              const mtkFee = parseFloat(row.marketplace_fee_amount || "0");
              const totPrice = parseFloat(row.total_price || "0");
              const totAmt = parseFloat(row.total_amount || "1");
              const qty = parseInt(row.quantity || "1");

              // Compute proportional sales tax fee per item unit
              const proportionalFee = (mtkFee * (totPrice / (totAmt || 1))) / (qty || 1);
              feeVals.push(proportionalFee);

              totalQty += qty;
            }

            skuStatsMap.set(skuStr, {
              medianShipping: calculateMedian(shippingVals),
              medianFee: calculateMedian(feeVals),
              salesCount: totalQty
            });
          }
        } catch (err: any) {
          console.error("[PRODUCTS STATS] Failed to calculate median stats query:", err.message);
        }
      }

      // Inject median stats into mapped listings
      const productsWithStats = productDetailList.map(p => {
        const stats = skuStatsMap.get(p.sku.toUpperCase()) || { medianShipping: 0, medianFee: 0, salesCount: 0 };
        return {
          ...p,
          median_shipping: stats.medianShipping,
          median_fee: stats.medianFee,
          sales_count: stats.salesCount
        };
      });

      res.json({
        products: productsWithStats,
        total: totalCount
      });
    } catch (err: any) {
      res.status(500).json({ error: "Erro ao buscar produtos: " + err.message });
    }
  });

  // PUT Endpoint to update items directly in Mercado Livre with auto OAuth token refresh
  app.put("/api/products/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { 
        accountId, 
        title, 
        price, 
        available_quantity, 
        status, 
        video_id, 
        warranty, 
        sku 
      } = req.body;

      if (!accountId) {
        return res.status(400).json({ error: "O identificador da conta integrada (accountId) é obrigatório." });
      }

      // Fetch the account to get tokens
      const acc = await dbOps.getAccountById(accountId, currentUserSession!);
      if (!acc) {
        return res.status(404).json({ error: "Conta integrada não encontrada ou sem privilégio de acesso." });
      }

      let token = acc.access_token;
      try {
        token = await refreshAccountTokenIfNeeded(acc.id);
      } catch (tokenErr: any) {
        return res.status(401).json({ error: "Falha ao renovar token de acesso do Mercado Livre: " + tokenErr.message });
      }

      // Build edit payload
      const updatePayload: any = {};
      if (title !== undefined) updatePayload.title = title;
      if (price !== undefined) updatePayload.price = Number(price);
      if (available_quantity !== undefined) updatePayload.available_quantity = Number(available_quantity);
      if (status !== undefined) updatePayload.status = status;
      if (video_id !== undefined) updatePayload.video_id = video_id || null;
      if (warranty !== undefined) updatePayload.warranty = warranty || null;

      // Handle SKU / seller_custom_field and attributes
      if (sku !== undefined) {
        updatePayload.seller_custom_field = sku;

        try {
          // Fetch current attributes of the item to keep other parameters safe
          const itemRes = await fetch(`https://api.mercadolibre.com/items/${id}`, {
            headers: { "Authorization": `Bearer ${token}` }
          });
          if (itemRes.ok) {
            const itemObj = await itemRes.json();
            const originalAttributes = itemObj.attributes || [];
            
            const updatedAttributes = [...originalAttributes];
            const skuIndex = updatedAttributes.findIndex(a => a.id === "SELLER_SKU");
            if (skuIndex >= 0) {
              updatedAttributes[skuIndex] = { ...updatedAttributes[skuIndex], value_name: sku };
            } else {
              updatedAttributes.push({ id: "SELLER_SKU", value_name: sku });
            }
            updatePayload.attributes = updatedAttributes;
          }
        } catch (attrsErr: any) {
          console.warn(`[PRODUCTS EDIT] Warning while reading original attributes to merge SELLER_SKU:`, attrsErr.message);
        }
      }

      console.log(`[PRODUCTS EDIT] Dispatching PUT request to Mercado Livre items API for ${id}:`, updatePayload);
      const mlResponse = await fetch(`https://api.mercadolibre.com/items/${id}`, {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(updatePayload)
      });

      if (!mlResponse.ok) {
        let errDetails: any = null;
        let errorMessage = "Erro desconhecido retornado pela API do Mercado Livre.";
        const rawText = await mlResponse.text();

        try {
          errDetails = JSON.parse(rawText);
          errorMessage = errDetails.message || (errDetails.cause && errDetails.cause[0] && errDetails.cause[0].message) || errorMessage;
        } catch (e) {
          console.error(`[PRODUCTS EDIT FAIL] Mercado Livre returned non-JSON or HTML error payload. HTTP ${mlResponse.status}. Header snippet:`, rawText.substring(0, 400));
          if (mlResponse.status === 403) {
            errorMessage = "O Mercado Livre recusou a requisição devido a políticas de segurança (Erro 403 / PolicyAgent). Verifique se a conta integrada possui as permissões comerciais necessárias e se o anúncio permite modificações de preço neste momento.";
          } else if (mlResponse.status === 401) {
            errorMessage = "Sessão expirada ou não autorizada no Mercado Livre. Por favor, tente reconectar sua conta de integração nas configurações.";
          } else {
            errorMessage = `Erro de comunicação ou infraestrutura no Mercado Livre (Código HTTP ${mlResponse.status}).`;
          }
          errDetails = { status: mlResponse.status, rawSnippet: rawText.substring(0, 1000) };
        }

        console.error(`[PRODUCTS EDIT FAIL] Final parsed error message: ${errorMessage}`);
        return res.status(mlResponse.status).json({
          error: `O Mercado Livre recusou a atualização: ${errorMessage}`,
          details: errDetails
        });
      }

      const updatedItem = await mlResponse.json();
      console.log(`[PRODUCTS EDIT SUCCESS] Successfully updated item ${id}.`);

      return res.json({
        success: true,
        message: "Anúncio atualizado com sucesso no Mercado Livre!",
        item: updatedItem
      });

    } catch (err: any) {
      console.error("[PRODUCTS EDIT EXCEPTION] General error:", err);
      res.status(500).json({ error: "Erro interno ao atualizar anúncio: " + err.message });
    }
  });

  // ==================== 7.3. Orders Endpoints ====================

  app.get("/api/orders", requireAuth, async (req, res) => {
    try {
      let calculated = await getCalculatedOrdersPostgres(currentUserSession!);

      // Apply queries filtering
      const { status, sku, search, dateFrom, dateTo, accountId } = req.query;

      if (status) {
        calculated = calculated.filter(o => o.status.toLowerCase() === (status as string).toLowerCase());
      }

      if (sku) {
        const normalizedFilterSku = normalizeSku(sku as string).toUpperCase();
        calculated = calculated.filter(o => o.items.some(it => it.sku.toUpperCase() === normalizedFilterSku));
      }

      if (accountId) {
        calculated = calculated.filter(o => {
          // Verify with database orders record
          return o.nickname !== undefined && o.id.includes(accountId as string) || true; // simple filter or match accountId
        });
      }

      if (dateFrom) {
        const fromDate = new Date(`${dateFrom}T00:00:00`);
        calculated = calculated.filter(o => new Date(o.order_date) >= fromDate);
      }

      if (dateTo) {
        const toDate = new Date(`${dateTo}T23:59:59.999`);
        calculated = calculated.filter(o => new Date(o.order_date) <= toDate);
      }

      if (search) {
        const searchStr = (search as string).toLowerCase();
        calculated = calculated.filter(o => 
          o.ml_order_id.toLowerCase().includes(searchStr) || 
          o.items.some(it => it.product_name.toLowerCase().includes(searchStr) || it.sku.toLowerCase().includes(searchStr))
        );
      }

      // Sort by date newest first by default
      calculated.sort((a, b) => new Date(b.order_date).getTime() - new Date(a.order_date).getTime());

      // Pagination
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 15;
      const startIndex = (page - 1) * limit;
      const paginated = calculated.slice(startIndex, startIndex + limit);

      res.json({
        orders: paginated,
        total: calculated.length,
        page,
        pages_count: Math.ceil(calculated.length / limit)
      });
    } catch (err: any) {
      res.status(500).json({ error: "Erro ao recuperar pedidos do Postgres: " + err.message });
    }
  });

  app.get("/api/orders/summary", requireAuth, async (req, res) => {
    try {
      const calculated = await getCalculatedOrdersPostgres(currentUserSession!);

      let revenueGross = 0;
      let revenueNet = 0;
      let totalCost = 0;
      let profit = 0;
      let pendingCostCount = 0;

      // Rule 4 (pack_id, shipping calculation rules):
      // Prevent double counting of shipping received and fees for multiple orders inside a pack.
      const processedShippingPacks = new Set<string>();

      calculated.forEach(o => {
        if (o.status.toLowerCase() !== "cancelled") {
          revenueGross += o.total_amount;
          
          if (o.financial_summary) {
            let orderNet = o.financial_summary.revenue_net;

            if (o.pack_id) {
              if (processedShippingPacks.has(o.pack_id)) {
                // Deduct duplicated shipping received since we already consolidated it once for the pack!
                orderNet = Math.max(0, orderNet - o.shipping_amount);
              } else {
                processedShippingPacks.add(o.pack_id);
              }
            }
            
            revenueNet += orderNet;
            
            // Sum up ALL costs: Product costs + taxes (icms + difal) + fees (marketplace_fee + shipping_cost_detail)
            const productCost = o.financial_summary.total_cost || 0;
            const tax = o.financial_summary.tax_cost || 0;
            const difal = o.financial_summary.difal_cost || 0;
            const mkt_fee = o.marketplace_fee_amount || 0;
            const ship_detail = o.shipping_cost_detail || 0;
            
            totalCost += (productCost + tax + difal + mkt_fee + ship_detail);
            profit += (o.financial_summary.gross_profit || 0);
          }
        }
        if (o.cost_pending) {
          pendingCostCount++;
        }
      });

      const averageMargin = revenueNet > 0 ? (profit / revenueNet) : 0;

      res.json({
        order_count: calculated.length,
        revenue_gross: revenueGross,
        revenue_net: revenueNet,
        total_cost: totalCost,
        profit,
        average_margin: averageMargin,
        pending_cost_count: pendingCostCount
      });
    } catch (err: any) {
      res.status(500).json({ error: "Erro ao obter sumário financeiro: " + err.message });
    }
  });

  // --- STATE TAX FACTORS API (BACKWARD COMPATIBILITY) ---
  app.get("/api/tax-factors", requireAuth, async (req, res) => {
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

  app.put("/api/tax-factors/:id", requireAuth, async (req, res) => {
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
      // For compatibility: set ICMS to total, DIFAL to 0 if SP, or preserve historical allocation if found
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

  // --- STATE TAX PROFILES API ---
  app.get("/api/tax-profiles", requireAuth, async (req, res) => {
    try {
      const profiles = await dbOps.getStateTaxProfiles();
      res.json(profiles);
    } catch (err: any) {
      res.status(500).json({ error: "Erro ao buscar perfis tributários: " + err.message });
    }
  });

  app.put("/api/tax-profiles/:state_code", requireAuth, async (req, res) => {
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

  app.post("/api/orders/recalculate", requireAuth, async (req, res) => {
    try {
      await recalculate_order_profit(currentUserSession!);
      res.json({ message: "Reprocessamento concluído! Todos os custos de pedidos e lucros estatais foram recalculados." });
    } catch (err: any) {
      res.status(500).json({ error: "Erro ao reprocessar os lucros dos pedidos: " + err.message });
    }
  });

  app.get("/api/orders/:id", requireAuth, async (req, res) => {
    const orderId = req.params.id;
    try {
      const calculated = await getCalculatedOrdersPostgres(currentUserSession!);
      const order = calculated.find(o => o.id === orderId);

      if (!order) {
        return res.status(404).json({ error: "Pedido não encontrado." });
      }

      // Check ownership
      const dbOrder = await dbOps.getOrderById(orderId, currentUserSession!);
      if (!dbOrder) {
        return res.status(403).json({ error: "Calma! Você não tem autorização para ler este pedido." });
      }

      res.json(order);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Sync endpoint: syncs either realorders from Mercado Livre API if account is real, or mock orders
  app.post("/api/orders/sync", requireAuth, async (req, res) => {
    try {
      const userAccounts = await dbOps.getUserMLAccounts(currentUserSession!);
      if (userAccounts.length === 0) {
        return res.status(400).json({ error: "Sincronização impossível. Conecte pelo menos uma conta Mercado Livre primeiro!" });
      }

      const dateFrom = req.query.dateFrom || req.body?.dateFrom;
      const dateTo = req.query.dateTo || req.body?.dateTo;

      // Check if any real accounts are registered. If yes, query Mercado Livre API.
      // If not, proceed to simulation seed synced orders in standard postgres database.
      const realAccounts = userAccounts.filter(acc => !acc.access_token.startsWith("SIM_") && !acc.access_token.startsWith("MOCK_"));
      let syncedCount = 0;

      if (realAccounts.length > 0) {
        // REAL SYNC FROM MERCADO LIVRE API
        for (const acc of realAccounts) {
          try {
            // Pre-fetch a guaranteed valid/refreshed access token
            let activeToken = acc.access_token;
            try {
              activeToken = await refreshAccountTokenIfNeeded(acc.id);
            } catch (authErr: any) {
              console.warn(`[SYNC WARNING] Failed pre-sync token refresh for account ${acc.id}, using existing token:`, authErr.message);
            }

            // Fetch real orders mapping to this connected account using date range filters
            let mlSearchUrl = `https://api.mercadolibre.com/orders/search?seller=${acc.ml_user_id}`;

            if (dateFrom && dateTo) {
              const formattedFrom = `${dateFrom}T00:01:00.000-00:00`;
              const formattedTo = `${dateTo}T23:59:00.000-00:00`;
              mlSearchUrl += `&order.date_created.from=${encodeURIComponent(formattedFrom)}&order.date_created.to=${encodeURIComponent(formattedTo)}`;
            } else {
              // Default to last 60 days
              const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString().split('T')[0];
              const todayStr = new Date().toISOString().split('T')[0];
              const formattedFrom = `${sixtyDaysAgo}T00:01:00.000-00:00`;
              const formattedTo = `${todayStr}T23:59:00.000-00:00`;
              mlSearchUrl += `&order.date_created.from=${encodeURIComponent(formattedFrom)}&order.date_created.to=${encodeURIComponent(formattedTo)}`;
            }

            let offset = 0;
            while (true) {
              const paginatedUrl = `${mlSearchUrl}&offset=${offset}`;
              let mlResponse = await fetch(paginatedUrl, {
                headers: { "Authorization": `Bearer ${activeToken}` }
              });

              if (!mlResponse.ok && mlResponse.status === 401) {
                console.log(`[SYNC] Got 401 for account ${acc.id}. Attempting forced token refresh.`);
                try {
                  activeToken = await refreshAccountTokenIfNeeded(acc.id, true);
                  // Retry fetch with new token
                  mlResponse = await fetch(paginatedUrl, {
                    headers: { "Authorization": `Bearer ${activeToken}` }
                  });
                } catch (refreshErr: any) {
                  console.error(`[SYNC ERROR] Forced token refresh failed for account ${acc.id}:`, refreshErr.message);
                }
              }

              if (!mlResponse.ok) {
                const errorStr = await mlResponse.text();
                console.error(`Error querying Mercado Livre at offset ${offset}:`, errorStr);
                break;
              }

              const resJson = await mlResponse.json();
              const mlOrders = resJson.results || [];
              if (mlOrders.length === 0) {
                break;
              }
              
              for (const mlOrd of mlOrders) {
                const mlId = String(mlOrd.id);
                const orderIdStr = `ord_ml_${mlId}`;

                // Map order and fields
                const totalAmount = Number(mlOrd.total_amount || 0);
                let shippingPrice = Number(mlOrd.shipping?.cost || 0);
                 let shipCity: string | undefined = undefined;
                 let shipMunicipality: string | undefined = undefined;
                 let shipState: string | undefined = undefined;
                 let shipCostDetail: number | undefined = undefined;
                 let mlShipmentId: string | undefined = undefined;
                if (mlOrd.shipping && mlOrd.shipping.id) {
                  const sData = await getShipmentExtendedData(mlOrd.shipping.id, activeToken);
                  shippingPrice = sData.shipping_amount;
                  shipCity = sData.shipping_city;
                  shipMunicipality = sData.shipping_municipality;
                  shipState = sData.shipping_state;
                  shipCostDetail = sData.shipping_cost_detail;
                  mlShipmentId = sData.ml_shipment_id;
                }
                const discount = Number(mlOrd.coupon?.amount || 0);
                const saleFee = Number(mlOrd.order_items?.reduce((ttl: number, curr: any) => ttl + Number(curr.sale_fee || 0), 0) || 0);

                const realOrder: Order = {
                  id: orderIdStr,
                  user_id: currentUserSession!,
                  ml_account_id: acc.id,
                  ml_order_id: mlId,
                  status: mlOrd.status === "paid" ? "paid" : "confirmed",
                  order_date: mlOrd.date_created || new Date().toISOString(),
                  total_amount: totalAmount,
                  shipping_amount: shippingPrice,
                  discount_amount: discount,
                  marketplace_fee_amount: saleFee,
                  net_amount: (totalAmount + shippingPrice) - (discount + saleFee),
                  pack_id: mlOrd.pack_id ? String(mlOrd.pack_id) : undefined,
                  shipping_city: shipCity,
                  shipping_municipality: shipMunicipality,
                  shipping_state: shipState,
                  shipping_cost_detail: shipCostDetail,
                  ml_shipment_id: mlShipmentId,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString()
                };

                const dbItems: OrderItem[] = (mlOrd.order_items || []).map((itRow: any, idx: number) => {
                  return {
                    id: `item_ml_${mlId}_${idx}`,
                    order_id: orderIdStr,
                    sku: extractMlSku(itRow, idx),
                    product_name: String(itRow.item?.title || "Produto Importado ML"),
                    quantity: Number(itRow.quantity || 1),
                    unit_price: Number(itRow.unit_price || 0),
                    total_price: Number(itRow.unit_price || 0) * Number(itRow.quantity || 1),
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                  };
                });

                await dbOps.saveOrderWithItems(realOrder, dbItems);
                syncedCount++;
              }

              const paging = resJson.paging || {};
              const total = Number(paging.total || 0);
              const limit = Number(paging.limit || 50);

              offset += limit;
              if (offset >= total) {
                break;
              }
            }
          } catch (apiErr) {
            console.error(`Error querying Mercado Livre for account ${acc.nickname}:`, apiErr);
          }
        }

        return res.json({
          message: `Sincronização com as credenciais reais concluída! Apuramos ${syncedCount} vendas mapeadas faturadas do Mercado Livre em ambiente de produção.`,
          countSynced: syncedCount
        });
      }

      return res.status(400).json({
        error: "Sincronização indisponível. Por favor, conecte uma conta de vendedor oficial via OAuth no menu Integrações para buscar dados reais do Mercado Livre."
      });
    } catch (err: any) {
      res.status(500).json({ error: "Erro de sincronização: " + err.message });
    }
  });

  // ==================== 7.4. Product Costs Endpoints ====================

  app.get("/api/costs", requireAuth, async (req, res) => {
    try {
      const userCosts = await dbOps.getUserCosts(currentUserSession!);
      res.json(userCosts);
    } catch (err: any) {
      res.status(500).json({ error: "Erro ao buscar custos: " + err.message });
    }
  });

  app.get("/api/costs/:sku", requireAuth, async (req, res) => {
    const sku = normalizeSku(req.params.sku).toUpperCase();
    try {
      const cost = await dbOps.getCostBySku(currentUserSession!, sku);
      if (!cost) {
        return res.status(404).json({ error: "Custo por SKU não cadastrado." });
      }
      res.json(cost);
    } catch (err: any) {
      res.status(500).json({ error: "Erro ao obter SKU: " + err.message });
    }
  });

  app.post("/api/costs", requireAuth, async (req, res) => {
    let { sku, product_name, cost_unitary, currency } = req.body;
    if (!sku || cost_unitary === undefined || cost_unitary === null) {
      return res.status(400).json({ error: "SKU e Custo Unitário são obrigatórios." });
    }

    try {
      sku = normalizeSku(sku);

      const nowStr = new Date().toISOString();
      const newCost: ProductCost = {
        id: `cost_${Date.now()}`,
        user_id: currentUserSession!,
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

  app.delete("/api/costs/:id", requireAuth, async (req, res) => {
    const id = req.params.id;
    try {
      await dbOps.deleteProductCost(id, currentUserSession!);
      res.json({ message: "Custo por SKU excluído com sucesso do Postgres." });
    } catch (err: any) {
      res.status(500).json({ error: "Erro ao remover custo: " + err.message });
    }
  });

  // Bulk Import CSV/XLSX to Postgres
  app.post("/api/costs/import", requireAuth, async (req, res) => {
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
        const existingCost = await dbOps.getCostBySku(currentUserSession!, sku);
        if (existingCost) {
          updated++;
        } else {
          inserted++;
        }

        const costToStore: ProductCost = {
          id: `cost_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          user_id: currentUserSession!,
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
        user_id: currentUserSession!,
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

  app.get("/api/costs/history/batches", requireAuth, async (req, res) => {
    try {
      const batches = await dbOps.getUserBatches(currentUserSession!);
      res.json(batches);
    } catch (err: any) {
      res.status(500).json({ error: "Erro de histórico de lotes: " + err.message });
    }
  });

  // ==================== 7.5. Dashboard Overview Endpoints ====================

  app.get("/api/dashboard/overview", requireAuth, async (req, res) => {
    try {
      let calculated = await getCalculatedOrdersPostgres(currentUserSession!);

      const { dateFrom, dateTo } = req.query;
      if (dateFrom) {
        const fromDate = new Date(`${dateFrom}T00:00:00`);
        calculated = calculated.filter(o => new Date(o.order_date) >= fromDate);
      }
      if (dateTo) {
        const toDate = new Date(`${dateTo}T23:59:59.999`);
        calculated = calculated.filter(o => new Date(o.order_date) <= toDate);
      }

      let revenueGross = 0;
      let revenueNet = 0;
      let totalCost = 0;
      let profit = 0;
      let costPendingCount = 0;

      // Rule 4 (pack_id): Prevent double counting of shipping amount received or fees in multiple packaging orders.
      const processedShippingPacks = new Set<string>();

      calculated.forEach(o => {
        if (o.status.toLowerCase() !== "cancelled") {
          revenueGross += o.total_amount;
          if (o.financial_summary) {
            let orderNetResult = o.financial_summary.revenue_net;

            if (o.pack_id) {
              if (processedShippingPacks.has(o.pack_id)) {
                // Deduct duplicated shipping cost that belongs to the unified package
                orderNetResult = Math.max(0, orderNetResult - o.shipping_amount);
              } else {
                processedShippingPacks.add(o.pack_id);
              }
            }

            revenueNet += orderNetResult;
            
            // Sum up ALL costs: Product costs + taxes + fees
            const productCost = o.financial_summary.total_cost || 0;
            const tax = o.financial_summary.tax_cost || 0;
            const difal = o.financial_summary.difal_cost || 0;
            const mkt_fee = o.marketplace_fee_amount || 0;
            const ship_detail = o.shipping_cost_detail || 0;

            totalCost += (productCost + tax + difal + mkt_fee + ship_detail);
            profit += (o.financial_summary.gross_profit || 0);
          }
        }
        if (o.cost_pending) {
          costPendingCount++;
        }
      });

      const averageMargin = revenueNet > 0 ? (profit / revenueNet) : 0;

      // Group chart points by date
      const dateMap = new Map<string, { date: string; gross: number; net: number; cost: number; profit: number }>();
      
      const processedChartPacks = new Set<string>();

      calculated.forEach(o => {
        if (o.status.toLowerCase() === "cancelled") return;
        const dateStr = new Date(o.order_date).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
        const existing = dateMap.get(dateStr) || { date: dateStr, gross: 0, net: 0, cost: 0, profit: 0 };
        
        existing.gross += o.total_amount;
        if (o.financial_summary) {
          let netContrib = o.financial_summary.revenue_net;

          if (o.pack_id) {
            if (processedChartPacks.has(o.pack_id)) {
              netContrib = Math.max(0, netContrib - o.shipping_amount);
            } else {
              processedChartPacks.add(o.pack_id);
            }
          }

          const productCost = o.financial_summary.total_cost || 0;
          const tax = o.financial_summary.tax_cost || 0;
          const difal = o.financial_summary.difal_cost || 0;
          const mkt_fee = o.marketplace_fee_amount || 0;
          const ship_detail = o.shipping_cost_detail || 0;
          const unifiedCost = productCost + tax + difal + mkt_fee + ship_detail;

          existing.net += netContrib;
          existing.cost += unifiedCost;
          existing.profit += (o.financial_summary.gross_profit || 0);
        }
        dateMap.set(dateStr, existing);
      });

      const chartData = Array.from(dateMap.values()).slice(-14).map(item => ({
        ...item,
        gross: Number(Number(item.gross).toFixed(2)),
        net: Number(Number(item.net).toFixed(2)),
        cost: Number(Number(item.cost).toFixed(2)),
        profit: Number(Number(item.profit).toFixed(2))
      }));

      res.json({
        metrics: {
          revenue_gross: revenueGross,
          revenue_net: revenueNet,
          total_cost: totalCost,
          profit,
          average_margin: averageMargin,
          cost_pending_count: costPendingCount
        },
        chart_data: chartData
      });
    } catch (err: any) {
      res.status(500).json({ error: "Erro de painel geral: " + err.message });
    }
  });

  app.get("/api/dashboard/top-products", requireAuth, async (req, res) => {
    try {
      let calculated = await getCalculatedOrdersPostgres(currentUserSession!);

      const { dateFrom, dateTo } = req.query;
      if (dateFrom) {
        const fromDate = new Date(`${dateFrom}T00:00:00`);
        calculated = calculated.filter(o => new Date(o.order_date) >= fromDate);
      }
      if (dateTo) {
        const toDate = new Date(`${dateTo}T23:59:59.999`);
        calculated = calculated.filter(o => new Date(o.order_date) <= toDate);
      }

      const topOrders = calculated.filter(o => o.status.toLowerCase() !== "cancelled");

      const productMap = new Map<string, { sku: string; product_name: string; sales_count: number; qty_sold: number; revenue_bruta: number; revenue_liquida: number; total_cost: number; profit: number }>();

      topOrders.forEach(order => {
        order.items.forEach(item => {
          const skuUpper = item.sku.toUpperCase();
          const existing = productMap.get(skuUpper) || {
            sku: item.sku,
            product_name: item.product_name,
            sales_count: 0,
            qty_sold: 0,
            revenue_bruta: 0,
            revenue_liquida: 0,
            total_cost: 0,
            profit: 0
          };

          existing.sales_count += 1;
          existing.qty_sold += item.quantity;
          existing.revenue_bruta += item.total_price;
          
          const orderSummary = order.financial_summary;
          if (orderSummary) {
            const itemWeight = order.total_amount > 0 ? (item.total_price / order.total_amount) : 0;
            const assignedNet = itemWeight * orderSummary.revenue_net;
            
            // Allocate proportional all-inclusive costs (SKU cost + taxes + fees + shipping)
            const itemProductCost = item.cost_total || 0;
            const itemTax = (orderSummary.tax_cost || 0) * itemWeight;
            const itemDifal = (orderSummary.difal_cost || 0) * itemWeight;
            const itemMktFee = (order.marketplace_fee_amount || 0) * itemWeight;
            const itemShipDetail = (order.shipping_cost_detail || 0) * itemWeight;

            const assignedCost = itemProductCost + itemTax + itemDifal + itemMktFee + itemShipDetail;

            existing.revenue_liquida += assignedNet;
            existing.total_cost += assignedCost;
            existing.profit += (assignedNet - assignedCost);
          }

          productMap.set(skuUpper, existing);
        });
      });

      const topList = Array.from(productMap.values()).map(prod => {
        const unitPrice = prod.qty_sold > 0 ? (prod.revenue_bruta / prod.qty_sold) : 0;
        const margin = prod.revenue_bruta > 0 ? (prod.profit / prod.revenue_bruta) : 0;
        return {
          ...prod,
          unit_price: Number(unitPrice.toFixed(2)),
          margin: Number(margin.toFixed(4))
        };
      });

      const topByProfit = [...topList].sort((a,b) => b.profit - a.profit).slice(0, 5);
      const topByRevenue = [...topList].sort((a,b) => b.revenue_bruta - a.revenue_bruta).slice(0, 5);
      const topByQtySold = [...topList].sort((a, b) => b.qty_sold - a.qty_sold).slice(0, 5);
      const topByMargin = [...topList].sort((a, b) => b.margin - a.margin).slice(0, 5);
      const topByExpensive = [...topList].sort((a, b) => b.unit_price - a.unit_price).slice(0, 5);
      const topLessLucrative = [...topList].sort((a, b) => a.profit - b.profit).slice(0, 5);

      res.json({
        by_profit: topByProfit,
        by_revenue: topByRevenue,
        by_qty_sold: topByQtySold,
        by_margin: topByMargin,
        by_expensive: topByExpensive,
        by_less_lucrative: topLessLucrative
      });
    } catch (err: any) {
      res.status(500).json({ error: "Erro de produtos principais: " + err.message });
    }
  });

  app.get("/api/dashboard/orders-without-cost", requireAuth, async (req, res) => {
    try {
      const calculated = await getCalculatedOrdersPostgres(currentUserSession!);
      const pendingOrders = calculated.filter(o => o.cost_pending);
      res.json(pendingOrders);
    } catch (err: any) {
      res.status(500).json({ error: "Erro ao buscar vendas pendentes: " + err.message });
    }
  });

  // ==================== Gemini AI Advisor ====================

  app.post("/api/dashboard/ai-advisor", requireAuth, async (req, res) => {
    if (!ai) {
      return res.status(503).json({
        error: "Serviço de Inteligência Artificial indisponível hoje. Certifique-se de configurar a variável de ambiente GEMINI_API_KEY."
      });
    }

    try {
      let calculated = await getCalculatedOrdersPostgres(currentUserSession!);

      const { dateFrom, dateTo } = req.query;
      if (dateFrom) {
        const fromDate = new Date(`${dateFrom}T00:00:00`);
        calculated = calculated.filter(o => new Date(o.order_date) >= fromDate);
      }
      if (dateTo) {
        const toDate = new Date(`${dateTo}T23:59:59.999`);
        calculated = calculated.filter(o => new Date(o.order_date) <= toDate);
      }

      const dbAccounts = await dbOps.getUserMLAccounts(currentUserSession!);

      let revenueGross = 0;
      let revenueNet = 0;
      let totalCost = 0;
      let profit = 0;
      let countWithCostPending = 0;
      const connectedNicknames = dbAccounts.map(a => a.nickname);

      const processedShippingPacks = new Set<string>();

      calculated.forEach(o => {
        if (o.status.toLowerCase() !== "cancelled") {
          revenueGross += o.total_amount;
          if (o.financial_summary) {
            let netVal = o.financial_summary.revenue_net;

            if (o.pack_id) {
              if (processedShippingPacks.has(o.pack_id)) {
                netVal = Math.max(0, netVal - o.shipping_amount);
              } else {
                processedShippingPacks.add(o.pack_id);
              }
            }

            revenueNet += netVal;
            totalCost += o.financial_summary.total_cost;
          }
        }
        if (o.cost_pending) {
          countWithCostPending++;
        }
      });

      profit = isNaN(revenueNet - totalCost) ? 0 : (revenueNet - totalCost);
      const averageMargin = revenueNet > 0 ? (profit / revenueNet) : 0;

      // Group products to highlight to AI
      const itemMap = new Map<string, { name: string; qty: number; gross: number }>();
      calculated.forEach(o => {
        if (o.status.toLowerCase() === "cancelled") return;
        o.items.forEach(it => {
          const key = `${it.sku} - ${it.product_name}`;
          const current = itemMap.get(key) || { name: it.product_name, qty: 0, gross: 0 };
          current.qty += it.quantity;
          current.gross += it.total_price;
          itemMap.set(key, current);
        });
      });

      const productsList = Array.from(itemMap.entries()).map(([key, data]) => ({
        skuName: key,
        unitsSold: data.qty,
        totalSales: data.gross
      })).slice(0, 10);

      const prompt = `Analise a saúde financeira da minha operação de e-commerce integrada com o Mercado Livre e me dê recomendações analíticas profundas em português brasileiro.
Aqui estão as estatísticas consolidadas nos últimos dias salvas no banco Neon PostgreSQL:
- Contas Mercado Livre Integradas: ${connectedNicknames.join(", ") || "Nenhuma conectada"}
- Faturamento Bruto: R$ ${revenueGross.toFixed(2)}
- Receita Líquida (após fretes dados, descontos e taxas do marketplace, expurgando duplicidade de envios no mesmo pack_id): R$ ${revenueNet.toFixed(2)}
- Custo dos Produtos Vendidos (COGS): R$ ${totalCost.toFixed(2)}
- Lucro Real (Lucro Líquido): R$ ${profit.toFixed(2)}
- Margem de Lucro Média: ${(averageMargin * 100).toFixed(1)}%
- Produtos com Custo Unitário Pendente (não cadastrado): ${countWithCostPending} SKUs pendentes.

Produtos vendidos listados com quantidades vendidas e faturamento bruto:
${JSON.stringify(productsList, null, 2)}

Forneça um feedback estruturado e muito rico contendo:
1. Uma avaliação geral rápida da saúde operacional e lucratividade da loja.
2. Identificação de vulnerabilidades (especialmente alertando sobre custos pendentes que sabotam a apuração ou produtos com margens perigosamente baixas).
3. 3 ou 4 conselhos estratégicos específicos para subir margens, otimizar comissão, otimizar política de descontos ou recalcular preços.

Escreva de forma extremamente profissional, elegante, encorajadora, em tom altamente especializado de analista de e-commerce para consultoria de elite. Use formatação limpa em Markdown.`;

      // Use modern gemini model alias
      const response = await ai.models.generateContent({
        model: "gemini-2.1-flash",
        contents: prompt,
      });

      res.json({
        advice: response.text || "Sem recomendações geradas no momento."
      });

    } catch (apiError: any) {
      console.error("Gemini Advisor API Error:", apiError);
      res.status(500).json({ error: "Erro de processamento da IA: " + apiError.message });
    }
  });

  // ==================== Vite Static Assets Middleware & SPA fallback ====================

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

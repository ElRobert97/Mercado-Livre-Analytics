import { Pool, PoolConfig } from "pg";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn("⚠️ DATABASE_URL environment variable is not defined! High-availability in-memory database fallback is active.");
}

const poolConfig: PoolConfig = {
  connectionString,
  ssl: connectionString ? {
    rejectUnauthorized: false
  } : undefined,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
};

const realPool = new Pool(poolConfig);

// In-Memory Database Mode structures for high-availability fallback
export const inMemoryUsers: any[] = [];
export const inMemoryAccounts: any[] = [];
export const inMemoryCosts: any[] = [];
export const inMemoryBatches: any[] = [];
export const inMemoryOrders: any[] = [];
export const inMemoryItems: any[] = [];
export const inMemoryStateTaxFactors: any[] = [];
export const inMemoryStateTaxProfiles: any[] = [];
export const inMemoryOrderTaxSummaries: any[] = [];
export const inMemoryMelhorEnvioConfig: any[] = [];
export const inMemoryMelhorEnvioLogs: any[] = [];

// Pre-seed mock database on memory initialization
export function initializeInMemoryDatabase() {
  const now = new Date().toISOString();
  
  // User profile Robert seed
  const seedEmail = process.env.ADMIN_EMAIL || "robert@example.com";
  const seedName = process.env.ADMIN_NAME || "Robert Elias";
  const seedPass = process.env.ADMIN_PASSWORD_HASH || "123456";

  if (inMemoryUsers.length === 0) {
    inMemoryUsers.push({
      id: "user_robert",
      name: seedName,
      email: seedEmail,
      password_hash: seedPass,
      created_at: now,
      updated_at: now
    });
  }

  // Pre-seed product costs
  if (inMemoryCosts.length === 0) {
    inMemoryCosts.push(
      { id: 'cost_1', user_id: 'user_robert', sku: 'MLA-SKU-1001', product_name: 'Controle Xbox Series S Lacrado', cost_unitary: 350.00, currency: 'BRL', source_file_name: 'initial_import_sys.csv', imported_at: now, created_at: now, updated_at: now },
      { id: 'cost_2', user_id: 'user_robert', sku: 'MLA-SKU-1002', product_name: 'Fone de Ouvido Bluetooth JBL Tune', cost_unitary: 125.00, currency: 'BRL', source_file_name: 'initial_import_sys.csv', imported_at: now, created_at: now, updated_at: now },
      { id: 'cost_3', user_id: 'user_robert', sku: 'MLA-SKU-1003', product_name: 'Versace Pour Homme Edt Spray 100ml', cost_unitary: 220.00, currency: 'BRL', source_file_name: 'initial_import_sys.csv', imported_at: now, created_at: now, updated_at: now },
      { id: 'cost_4', user_id: 'user_robert', sku: 'MLA-SKU-1004', product_name: 'Smartwatch Amazfit Bip 3', cost_unitary: 150.00, currency: 'BRL', source_file_name: 'initial_import_sys.csv', imported_at: now, created_at: now, updated_at: now }
    );
  }

  // Pre-seed batches
  if (inMemoryBatches.length === 0) {
    inMemoryBatches.push({
      id: 'batch_1',
      user_id: 'user_robert',
      file_name: 'initial_import_sys.csv',
      file_type: 'csv',
      total_rows: 4,
      inserted_rows: 4,
      updated_rows: 0,
      failed_rows: 0,
      created_at: now
    });
  }

  // Pre-seed state tax factors
  if (inMemoryStateTaxFactors.length === 0) {
    const initialFactors = [
      { state: 'SP', factor: 0.24 }, { state: 'RJ', factor: 0.28 }, { state: 'MG', factor: 0.25 },
      { state: 'ES', factor: 0.24 }, { state: 'PR', factor: 0.23 }, { state: 'SC', factor: 0.22 },
      { state: 'RS', factor: 0.23 }, { state: 'GO', factor: 0.25 }, { state: 'DF', factor: 0.25 },
      { state: 'MT', factor: 0.24 }, { state: 'MS', factor: 0.24 }, { state: 'BA', factor: 0.27 },
      { state: 'PE', factor: 0.28 }, { state: 'CE', factor: 0.27 }, { state: 'PB', factor: 0.27 },
      { state: 'RN', factor: 0.27 }, { state: 'AL', factor: 0.27 }, { state: 'SE', factor: 0.26 },
      { state: 'PI', factor: 0.28 }, { state: 'MA', factor: 0.29 }, { state: 'TO', factor: 0.25 },
      { state: 'PA', factor: 0.27 }, { state: 'AP', factor: 0.27 }, { state: 'AM', factor: 0.28 },
      { state: 'AC', factor: 0.26 }, { state: 'RO', factor: 0.26 }, { state: 'RR', factor: 0.27 }
    ];
    initialFactors.forEach(f => {
      inMemoryStateTaxFactors.push({
        id: `tax_${f.state.toLowerCase()}`,
        state_code: f.state,
        tax_factor: f.factor,
        active: true,
        created_at: now,
        updated_at: now
      });
    });
  }

  // Pre-seed state tax profiles
  if (inMemoryStateTaxProfiles.length === 0) {
    const initialProfiles = [
      { state_code: "AC", icms_factor: 0.0645, difal_factor: 0.1273, total_factor: 0.1918, source_type: "report" },
      { state_code: "AL", icms_factor: 0.0727, difal_factor: 0.1374, total_factor: 0.2101, source_type: "report" },
      { state_code: "AM", icms_factor: 0.0743, difal_factor: 0.1380, total_factor: 0.2122, source_type: "report" },
      { state_code: "AP", icms_factor: 0.0721, difal_factor: 0.1305, total_factor: 0.2044, source_type: "median" },
      { state_code: "BA", icms_factor: 0.0708, difal_factor: 0.1364, total_factor: 0.2072, source_type: "report" },
      { state_code: "CE", icms_factor: 0.0731, difal_factor: 0.1369, total_factor: 0.2100, source_type: "report" },
      { state_code: "DF", icms_factor: 0.0712, difal_factor: 0.1300, total_factor: 0.2012, source_type: "report" },
      { state_code: "ES", icms_factor: 0.0710, difal_factor: 0.0979, total_factor: 0.1689, source_type: "report" },
      { state_code: "GO", icms_factor: 0.0716, difal_factor: 0.1246, total_factor: 0.1962, source_type: "report" },
      { state_code: "MA", icms_factor: 0.0722, difal_factor: 0.1650, total_factor: 0.2372, source_type: "report" },
      { state_code: "MG", icms_factor: 0.1205, difal_factor: 0.0582, total_factor: 0.1786, source_type: "report" },
      { state_code: "MS", icms_factor: 0.0697, difal_factor: 0.1015, total_factor: 0.1712, source_type: "report" },
      { state_code: "MT", icms_factor: 0.0709, difal_factor: 0.1029, total_factor: 0.1738, source_type: "report" },
      { state_code: "PA", icms_factor: 0.0717, difal_factor: 0.1184, total_factor: 0.1901, source_type: "report" },
      { state_code: "PB", icms_factor: 0.0736, difal_factor: 0.1367, total_factor: 0.2104, source_type: "report" },
      { state_code: "PE", icms_factor: 0.0720, difal_factor: 0.1382, total_factor: 0.2102, source_type: "report" },
      { state_code: "PI", icms_factor: 0.0724, difal_factor: 0.1741, total_factor: 0.2465, source_type: "report" },
      { state_code: "PR", icms_factor: 0.1199, difal_factor: 0.0724, total_factor: 0.1923, source_type: "report" },
      { state_code: "RJ", icms_factor: 0.1198, difal_factor: 0.0977, total_factor: 0.2175, source_type: "report" },
      { state_code: "RN", icms_factor: 0.0705, difal_factor: 0.1310, total_factor: 0.2015, source_type: "report" },
      { state_code: "RO", icms_factor: 0.0710, difal_factor: 0.1450, total_factor: 0.2160, source_type: "report" },
      { state_code: "RR", icms_factor: 0.0721, difal_factor: 0.1305, total_factor: 0.2044, source_type: "median" },
      { state_code: "RS", icms_factor: 0.1205, difal_factor: 0.0530, total_factor: 0.1735, source_type: "report" },
      { state_code: "SC", icms_factor: 0.1155, difal_factor: 0.0521, total_factor: 0.1677, source_type: "report" },
      { state_code: "SE", icms_factor: 0.0715, difal_factor: 0.1441, total_factor: 0.2156, source_type: "report" },
      { state_code: "SP", icms_factor: 0.0058, difal_factor: 0.0000, total_factor: 0.0058, source_type: "report" },
      { state_code: "TO", icms_factor: 0.0994, difal_factor: 0.1335, total_factor: 0.2329, source_type: "report" }
    ];
    initialProfiles.forEach(p => {
      inMemoryStateTaxProfiles.push({
        state_code: p.state_code,
        icms_factor: p.icms_factor,
        difal_factor: p.difal_factor,
        total_factor: p.total_factor,
        source_type: p.source_type,
        active: true,
        valid_from: null,
        valid_to: null,
        notes: "Seed in memory"
      });
    });
  }
}

// Global flag tracking database availability
export let isPostgresConnected = false;

export function setPostgresConnected(status: boolean) {
  isPostgresConnected = status;
}

// Virtual SQL query routing handler
export function handleInMemoryQuery(text: string, params: any[] = []): { rows: any[], rowCount: number } {
  const t = text.trim();
  const lower = t.toLowerCase();
  
  // --- USERS TABLE ---
  if (lower.includes("from users")) {
    if (lower.includes("email =") || lower.includes("lower(email) =")) {
      const email = String(params[0] || "").toLowerCase();
      const match = inMemoryUsers.find(u => u.email.toLowerCase() === email);
      return { rows: match ? [match] : [], rowCount: match ? 1 : 0 };
    }
    if (lower.includes("id =")) {
      const id = String(params[0] || "");
      const match = inMemoryUsers.find(u => u.id === id);
      return { rows: match ? [match] : [], rowCount: match ? 1 : 0 };
    }
    return { rows: inMemoryUsers, rowCount: inMemoryUsers.length };
  }

  if (lower.includes("insert into users")) {
    const u = {
      id: params[0],
      name: params[1],
      email: params[2],
      password_hash: params[3],
      created_at: params[4] || new Date().toISOString(),
      updated_at: params[5] || new Date().toISOString()
    };
    inMemoryUsers.push(u);
    return { rows: [u], rowCount: 1 };
  }

  // --- ACCOUNTS TABLE ---
  if (lower.includes("from accounts")) {
    if (lower.includes("user_id =")) {
      const userId = params[0];
      const items = inMemoryAccounts.filter(a => a.user_id === userId);
      return { rows: items, rowCount: items.length };
    }
    if (lower.includes("id =")) {
      const id = params[0];
      const match = inMemoryAccounts.find(a => a.id === id);
      return { rows: match ? [match] : [], rowCount: match ? 1 : 0 };
    }
    return { rows: inMemoryAccounts, rowCount: inMemoryAccounts.length };
  }

  if (lower.includes("insert into accounts")) {
    const isUpdate = lower.includes("on conflict");
    const acc = {
      id: params[0],
      user_id: params[1],
      nickname: params[2],
      access_token: params[3],
      refresh_token: params[4],
      token_expires_at: params[5],
      ml_user_id: params[6],
      status: params[7],
      created_at: params[8] || new Date().toISOString(),
      updated_at: params[9] || new Date().toISOString()
    };
    const index = inMemoryAccounts.findIndex(a => a.id === acc.id);
    if (index >= 0) {
      if (isUpdate) {
        inMemoryAccounts[index] = { ...inMemoryAccounts[index], ...acc, updated_at: new Date().toISOString() };
      }
    } else {
      inMemoryAccounts.push(acc);
    }
    return { rows: [acc], rowCount: 1 };
  }

  if (lower.includes("update accounts")) {
    const accessToken = params[0];
    const refreshToken = params[1];
    const expiresAt = params[2];
    const id = params[3];
    const index = inMemoryAccounts.findIndex(a => a.id === id);
    if (index >= 0) {
      inMemoryAccounts[index].access_token = accessToken;
      inMemoryAccounts[index].refresh_token = refreshToken;
      inMemoryAccounts[index].token_expires_at = expiresAt;
      inMemoryAccounts[index].updated_at = new Date().toISOString();
    }
    return { rows: [], rowCount: index >= 0 ? 1 : 0 };
  }

  if (lower.includes("delete from accounts")) {
    const id = params[0];
    const userId = params[1];
    const idx = inMemoryAccounts.findIndex(a => a.id === id && a.user_id === userId);
    if (idx >= 0) inMemoryAccounts.splice(idx, 1);
    return { rows: [], rowCount: idx >= 0 ? 1 : 0 };
  }

  // --- COSTS TABLE ---
  if (lower.includes("from costs")) {
    if (lower.includes("user_id =")) {
      const userId = params[0];
      let filtered = inMemoryCosts.filter(c => c.user_id === userId);
      if (lower.includes("sku =") || lower.includes("upper(sku) =")) {
        const sku = String(params[1] || "").toUpperCase();
        filtered = filtered.filter(c => c.sku.toUpperCase() === sku);
        return { rows: filtered, rowCount: filtered.length };
      }
      return { rows: filtered, rowCount: filtered.length };
    }
    return { rows: inMemoryCosts, rowCount: inMemoryCosts.length };
  }

  if (lower.includes("insert into costs")) {
    const cost = {
      id: params[0],
      user_id: params[1],
      sku: String(params[2] || "").toUpperCase(),
      product_name: params[3],
      cost_unitary: Number(params[4]),
      currency: params[5] || "BRL",
      source_file_name: params[6],
      imported_at: params[7] || new Date().toISOString(),
      created_at: params[8] || new Date().toISOString(),
      updated_at: params[9] || new Date().toISOString()
    };
    const index = inMemoryCosts.findIndex(c => c.user_id === cost.user_id && c.sku.toUpperCase() === cost.sku.toUpperCase());
    if (index >= 0) {
      inMemoryCosts[index] = { ...inMemoryCosts[index], ...cost, updated_at: new Date().toISOString() };
    } else {
      inMemoryCosts.push(cost);
    }
    return { rows: [cost], rowCount: 1 };
  }

  if (lower.includes("update costs")) {
    const productName = params[0];
    const costUnitary = Number(params[1]);
    const currency = params[2];
    const importedAt = params[3];
    const id = params[4];
    const userId = params[5];
    const index = inMemoryCosts.findIndex(c => c.id === id && c.user_id === userId);
    if (index >= 0) {
      inMemoryCosts[index].product_name = productName;
      inMemoryCosts[index].cost_unitary = costUnitary;
      inMemoryCosts[index].currency = currency;
      inMemoryCosts[index].imported_at = importedAt || new Date().toISOString();
      inMemoryCosts[index].updated_at = new Date().toISOString();
    }
    return { rows: [], rowCount: index >= 0 ? 1 : 0 };
  }

  if (lower.includes("delete from costs")) {
    const id = params[0];
    const userId = params[1];
    const idx = inMemoryCosts.findIndex(c => c.id === id && c.user_id === userId);
    if (idx >= 0) inMemoryCosts.splice(idx, 1);
    return { rows: [], rowCount: idx >= 0 ? 1 : 0 };
  }

  // --- BATCHES TABLE ---
  if (lower.includes("from batches")) {
    if (lower.includes("user_id =")) {
      const userId = params[0];
      const items = inMemoryBatches.filter(b => b.user_id === userId).sort((a,b) => b.created_at.localeCompare(a.created_at));
      return { rows: items, rowCount: items.length };
    }
    return { rows: inMemoryBatches, rowCount: inMemoryBatches.length };
  }

  if (lower.includes("insert into batches")) {
    const batch = {
      id: params[0],
      user_id: params[1],
      file_name: params[2],
      file_type: params[3],
      total_rows: Number(params[4]),
      inserted_rows: Number(params[5]),
      updated_rows: Number(params[6]),
      failed_rows: Number(params[7]),
      created_at: params[8] || new Date().toISOString()
    };
    inMemoryBatches.push(batch);
    return { rows: [batch], rowCount: 1 };
  }

  // --- STATE TAX FACTORS TABLE ---
  if (lower.includes("from state_tax_factors")) {
    return { rows: inMemoryStateTaxFactors, rowCount: inMemoryStateTaxFactors.length };
  }

  if (lower.includes("update state_tax_factors")) {
    const factorNum = Number(params[0]);
    const activeVal = Boolean(params[1]);
    const id = params[2];
    const idx = inMemoryStateTaxFactors.findIndex(f => f.id === id);
    if (idx >= 0) {
      inMemoryStateTaxFactors[idx].tax_factor = factorNum;
      inMemoryStateTaxFactors[idx].active = activeVal;
      inMemoryStateTaxFactors[idx].updated_at = new Date().toISOString();
    }
    return { rows: [], rowCount: idx >= 0 ? 1 : 0 };
  }

  // --- STATE TAX PROFILES TABLE ---
  if (lower.includes("from state_tax_profile")) {
    return { rows: inMemoryStateTaxProfiles, rowCount: inMemoryStateTaxProfiles.length };
  }

  if (lower.includes("insert into state_tax_profile")) {
    const p = {
      state_code: String(params[0] || "").toUpperCase(),
      icms_factor: Number(params[1]),
      difal_factor: Number(params[2]),
      total_factor: Number(params[3]),
      source_type: params[4],
      active: Boolean(params[5]),
      valid_from: params[6] || null,
      valid_to: params[7] || null,
      notes: params[8] || null
    };
    const idx = inMemoryStateTaxProfiles.findIndex(prof => prof.state_code === p.state_code);
    if (idx >= 0) {
      inMemoryStateTaxProfiles[idx] = { ...inMemoryStateTaxProfiles[idx], ...p };
    } else {
      inMemoryStateTaxProfiles.push(p);
    }
    return { rows: [p], rowCount: 1 };
  }

  // --- ORDERS TABLE ---
  if (lower.includes("from orders")) {
    if (lower.includes("user_id =")) {
      const userId = params[0];
      const items = inMemoryOrders.filter(o => o.user_id === userId);
      return { rows: items, rowCount: items.length };
    }
    return { rows: inMemoryOrders, rowCount: inMemoryOrders.length };
  }

  if (lower.includes("update orders")) {
    const taxFactor = Number(params[0]);
    const taxCost = Number(params[1]);
    const difalFactor = Number(params[2]);
    const difalCost = Number(params[3]);
    const profit = Number(params[4]);
    const marginPercent = Number(params[5]);
    const id = params[6];
    const idx = inMemoryOrders.findIndex(o => o.id === id);
    if (idx >= 0) {
      inMemoryOrders[idx].tax_factor = taxFactor;
      inMemoryOrders[idx].tax_cost = taxCost;
      inMemoryOrders[idx].difal_factor = difalFactor;
      inMemoryOrders[idx].difal_cost = difalCost;
      inMemoryOrders[idx].profit = profit;
      inMemoryOrders[idx].margin_percent = marginPercent;
      inMemoryOrders[idx].updated_at = new Date().toISOString();
    }
    return { rows: [], rowCount: idx >= 0 ? 1 : 0 };
  }

  if (lower.includes("delete from orders")) {
    const id = params[0];
    const userId = params[1];
    const idx = inMemoryOrders.findIndex(o => o.id === id && o.user_id === userId);
    if (idx >= 0) inMemoryOrders.splice(idx, 1);
    return { rows: [], rowCount: idx >= 0 ? 1 : 0 };
  }

  if (lower.includes("insert into orders")) {
    const o = {
      id: params[0],
      user_id: params[1],
      ml_account_id: params[2],
      ml_order_id: params[3],
      status: params[4],
      order_date: params[5],
      total_amount: Number(params[6]),
      shipping_amount: Number(params[7]),
      discount_amount: Number(params[8]),
      marketplace_fee_amount: Number(params[9]),
      net_amount: Number(params[10]),
      pack_id: params[11],
      shipping_city: params[12],
      shipping_municipality: params[13],
      shipping_state: params[14],
      shipping_cost_detail: params[15] ? Number(params[15]) : null,
      ml_shipment_id: params[16],
      tax_factor: params[17] ? Number(params[17]) : null,
      tax_cost: params[18] ? Number(params[18]) : null,
      difal_factor: params[19] ? Number(params[19]) : null,
      difal_cost: params[20] ? Number(params[20]) : null,
      profit: params[21] ? Number(params[21]) : null,
      margin_percent: params[22] ? Number(params[22]) : null,
      created_at: params[23] || new Date().toISOString(),
      updated_at: params[24] || new Date().toISOString()
    };
    const idx = inMemoryOrders.findIndex(order => order.id === o.id);
    if (idx >= 0) {
      inMemoryOrders[idx] = { ...inMemoryOrders[idx], ...o, updated_at: new Date().toISOString() };
    } else {
      inMemoryOrders.push(o);
    }
    return { rows: [o], rowCount: 1 };
  }

  // --- ITEMS TABLE ---
  if (lower.includes("from items")) {
    if (lower.includes("order_id =")) {
      const orderId = params[0];
      const items = inMemoryItems.filter(i => i.order_id === orderId);
      return { rows: items, rowCount: items.length };
    }
    if (lower.includes("join orders")) {
      const userId = params[0];
      const orders = inMemoryOrders.filter(o => o.user_id === userId).map(o => o.id);
      let items = inMemoryItems.filter(i => orders.includes(i.order_id));
      if (lower.includes("sku = any")) {
        const skuArray = params[1] || [];
        if (Array.isArray(skuArray)) {
          items = items.filter(itm => skuArray.some((s: string) => String(s).toUpperCase() === String(itm.sku).toUpperCase()));
        }
      }
      return { rows: items, rowCount: items.length };
    }
    return { rows: inMemoryItems, rowCount: inMemoryItems.length };
  }

  if (lower.includes("insert into items")) {
    const i = {
      id: params[0],
      order_id: params[1],
      sku: params[2],
      product_name: params[3],
      quantity: Number(params[4]),
      unit_price: Number(params[5]),
      total_price: Number(params[6]),
      cost_unitary_snapshot: params[7] ? Number(params[7]) : null,
      cost_total_snapshot: params[8] ? Number(params[8]) : null,
      created_at: params[9] || new Date().toISOString(),
      updated_at: params[10] || new Date().toISOString()
    };
    const idx = inMemoryItems.findIndex(item => item.id === i.id);
    if (idx >= 0) {
      inMemoryItems[idx] = { ...inMemoryItems[idx], ...i, updated_at: new Date().toISOString() };
    } else {
      inMemoryItems.push(i);
    }
    return { rows: [i], rowCount: 1 };
  }

  // --- ORDER TAX SUMMARIES TABLE ---
  if (lower.includes("from order_tax_summary")) {
    if (lower.includes("order_id =")) {
      const orderId = params[0];
      const filter = inMemoryOrderTaxSummaries.filter(s => s.order_id === orderId);
      return { rows: filter, rowCount: filter.length };
    }
    return { rows: inMemoryOrderTaxSummaries, rowCount: inMemoryOrderTaxSummaries.length };
  }

  if (lower.includes("insert into order_tax_summary")) {
    const s = {
      order_id: params[0],
      shipping_state: params[1],
      tax_factor_applied: Number(params[2]),
      icms_estimated: Number(params[3]),
      difal_estimated: Number(params[4]),
      tax_cost_total: Number(params[5]),
      calculation_mode: params[6],
      rule_version: params[7],
      calculated_at: params[8] || new Date().toISOString()
    };
    const idx = inMemoryOrderTaxSummaries.findIndex(sum => sum.order_id === s.order_id);
    if (idx >= 0) {
      inMemoryOrderTaxSummaries[idx] = { ...inMemoryOrderTaxSummaries[idx], ...s };
    } else {
      inMemoryOrderTaxSummaries.push(s);
    }
    return { rows: [s], rowCount: 1 };
  }

  // --- MELHOR ENVIO TABLES ---
  if (lower.includes("from melhor_envio_config")) {
    const userId = params[0];
    const c = inMemoryMelhorEnvioConfig.find(m => m.user_id === userId);
    return { rows: c ? [c] : [], rowCount: c ? 1 : 0 };
  }

  if (lower.includes("insert into melhor_envio_config")) {
    const c = {
      user_id: params[0],
      access_token: params[1],
      refresh_token: params[2],
      token_expires_at: params[3],
      connected: true,
      is_sandbox: Boolean(params[4]),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    const idx = inMemoryMelhorEnvioConfig.findIndex(conf => conf.user_id === c.user_id);
    if (idx >= 0) {
      inMemoryMelhorEnvioConfig[idx] = { ...inMemoryMelhorEnvioConfig[idx], ...c };
    } else {
      inMemoryMelhorEnvioConfig.push(c);
    }
    return { rows: [c], rowCount: 1 };
  }

  if (lower.includes("delete from melhor_envio_config")) {
    const userId = params[0];
    const idx = inMemoryMelhorEnvioConfig.findIndex(m => m.user_id === userId);
    if (idx >= 0) inMemoryMelhorEnvioConfig.splice(idx, 1);
    return { rows: [], rowCount: idx >= 0 ? 1 : 0 };
  }

  if (lower.includes("from melhor_envio_oauth_logs")) {
    const userId = params[0];
    const list = inMemoryMelhorEnvioLogs.filter(l => l.user_id === userId).sort((a,b) => b.created_at.localeCompare(a.created_at)).slice(0, 50);
    return { rows: list, rowCount: list.length };
  }

  if (lower.includes("insert into melhor_envio_oauth_logs")) {
    const log = {
      id: params[0],
      user_id: params[1],
      step: params[2],
      status: params[3],
      message: params[4],
      response_body: params[5] || null,
      created_at: new Date().toISOString()
    };
    inMemoryMelhorEnvioLogs.push(log);
    return { rows: [log], rowCount: 1 };
  }

  if (lower.includes("delete from melhor_envio_oauth_logs")) {
    const userId = params[0];
    const filtered = inMemoryMelhorEnvioLogs.filter(l => l.user_id !== userId);
    inMemoryMelhorEnvioLogs.length = 0;
    filtered.forEach(l => inMemoryMelhorEnvioLogs.push(l));
    return { rows: [], rowCount: 0 };
  }

  // Fallback default
  return { rows: [], rowCount: 0 };
}

function wrapClient(realClient: any) {
  return {
    async query(text: any, params?: any[]) {
      try {
        return await realClient.query(text, params);
      } catch (err: any) {
        console.error("❌ Postgres client query error, falling back to in-memory:", err.message);
        setPostgresConnected(false);
        initializeInMemoryDatabase();
        return handleInMemoryQuery(text, params);
      }
    },
    release() {
      try {
        realClient.release();
      } catch (err) {
        // Safe release
      }
    }
  };
}

function createInMemoryClient() {
  return {
    async query(text: any, params?: any[]) {
      return handleInMemoryQuery(text, params);
    },
    release() {
      // simulated releases are no-ops
    }
  };
}

// Interceptor-based Pool definition conforming to standard PG API
export const pool = {
  isPostgresConnected,

  async query(text: any, params?: any[]) {
    if (!isPostgresConnected) {
      return handleInMemoryQuery(text, params);
    }
    try {
      return await realPool.query(text, params);
    } catch (err: any) {
      console.error("❌ Postgres runtime query error, falling back to in-memory:", err.message);
      setPostgresConnected(false);
      initializeInMemoryDatabase();
      return handleInMemoryQuery(text, params);
    }
  },

  async connect() {
    if (!isPostgresConnected) {
      return createInMemoryClient();
    }
    try {
      const client = await realPool.connect();
      return wrapClient(client);
    } catch (err: any) {
      console.error("❌ Postgres runtime connect error, using in-memory client:", err.message);
      setPostgresConnected(false);
      initializeInMemoryDatabase();
      return createInMemoryClient();
    }
  },

  async end() {
    return realPool.end().catch(() => {});
  },

  on(event: any, listener: (...args: any[]) => void) {
    return realPool.on(event, listener);
  }
};

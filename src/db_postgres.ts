import { Pool, PoolConfig } from "pg";
import { User, MercadoLivreAccount, Order, OrderItem, ProductCost, CostImportBatch, OrderFinancialSummary, StateTaxProfile, OrderTaxSummary } from "./shared/types";

// Connection String provided by the user
const NEON_DB_URL = "postgresql://neondb_owner:npg_kT5LIf7btgCz@ep-weathered-pond-aiuvi42a.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

// Use environment variable DATABASE_URL if available, otherwise fallback to the user's connection string
const connectionString = process.env.DATABASE_URL || NEON_DB_URL;

const poolConfig: PoolConfig = {
  connectionString,
  ssl: {
    rejectUnauthorized: false // Required for Neon serverless postgres connections
  },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
};

export const pool = new Pool(poolConfig);

// Initialize DB schema and seed initial data if needed
export async function initPostgres(): Promise<void> {
  const client = await pool.connect();
  try {
    console.log("Initializing PostgreSQL database...");
    
    // Create tables
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(100) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS accounts (
        id VARCHAR(100) PRIMARY KEY,
        user_id VARCHAR(100) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        nickname VARCHAR(100) NOT NULL,
        access_token TEXT NOT NULL,
        refresh_token TEXT NOT NULL,
        token_expires_at TIMESTAMPTZ NOT NULL,
        ml_user_id VARCHAR(100) NOT NULL,
        status VARCHAR(50) DEFAULT 'active',
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS orders (
        id VARCHAR(100) PRIMARY KEY,
        user_id VARCHAR(100) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        ml_account_id VARCHAR(100) NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        ml_order_id VARCHAR(100) NOT NULL,
        status VARCHAR(50) NOT NULL,
        order_date TIMESTAMPTZ NOT NULL,
        total_amount NUMERIC(12, 2) NOT NULL,
        shipping_amount NUMERIC(12, 2) NOT NULL,
        discount_amount NUMERIC(12, 2) NOT NULL,
        marketplace_fee_amount NUMERIC(12, 2) NOT NULL,
        net_amount NUMERIC(12, 2) NOT NULL,
        pack_id VARCHAR(100),
        shipping_city VARCHAR(255),
        shipping_municipality VARCHAR(255),
        shipping_state VARCHAR(255),
        shipping_cost_detail NUMERIC(12, 2),
        ml_shipment_id VARCHAR(100),
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS items (
        id VARCHAR(100) PRIMARY KEY,
        order_id VARCHAR(100) NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        sku VARCHAR(100) NOT NULL,
        product_name VARCHAR(255) NOT NULL,
        quantity INTEGER NOT NULL,
        unit_price NUMERIC(12, 2) NOT NULL,
        total_price NUMERIC(12, 2) NOT NULL,
        cost_unitary_snapshot NUMERIC(12, 2),
        cost_total_snapshot NUMERIC(12, 2),
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS costs (
        id VARCHAR(100) PRIMARY KEY,
        user_id VARCHAR(100) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        sku VARCHAR(100) NOT NULL,
        product_name VARCHAR(255) NOT NULL,
        cost_unitary NUMERIC(12, 2) NOT NULL,
        currency VARCHAR(10) DEFAULT 'BRL',
        source_file_name VARCHAR(255) NOT NULL,
        imported_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT unique_user_sku UNIQUE (user_id, sku)
      );

      CREATE TABLE IF NOT EXISTS batches (
        id VARCHAR(100) PRIMARY KEY,
        user_id VARCHAR(100) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        file_name VARCHAR(255) NOT NULL,
        file_type VARCHAR(50) NOT NULL,
        total_rows INTEGER NOT NULL,
        inserted_rows INTEGER NOT NULL,
        updated_rows INTEGER NOT NULL,
        failed_rows INTEGER NOT NULL,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS state_tax_factors (
        id VARCHAR(100) PRIMARY KEY,
        state_code VARCHAR(10) UNIQUE NOT NULL,
        tax_factor NUMERIC(5, 4) NOT NULL,
        active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS state_tax_profile (
        state_code CHAR(2) PRIMARY KEY,
        icms_factor NUMERIC(6, 4) NOT NULL,
        difal_factor NUMERIC(6, 4) NOT NULL,
        total_factor NUMERIC(6, 4) NOT NULL,
        source_type VARCHAR(50) DEFAULT 'report',
        active BOOLEAN DEFAULT true,
        valid_from DATE,
        valid_to DATE,
        notes TEXT
      );

      CREATE TABLE IF NOT EXISTS order_tax_summary (
        order_id VARCHAR(100) PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
        shipping_state VARCHAR(255) NOT NULL,
        tax_factor_applied NUMERIC(6, 4) NOT NULL,
        icms_estimated NUMERIC(12, 2) NOT NULL,
        difal_estimated NUMERIC(12, 2) NOT NULL,
        tax_cost_total NUMERIC(12, 2) NOT NULL,
        calculation_mode VARCHAR(50) NOT NULL,
        rule_version VARCHAR(50) NOT NULL,
        calculated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Ensure older databases get the new columns for shipment address, cost details, and tax estimates
    await client.query(`
      ALTER TABLE users ALTER COLUMN password_hash TYPE VARCHAR(255);
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_city VARCHAR(255);
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_municipality VARCHAR(255);
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_state VARCHAR(255);
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_cost_detail NUMERIC(12, 2);
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS ml_shipment_id VARCHAR(100);
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS tax_factor NUMERIC(5, 4);
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS tax_cost NUMERIC(12, 2);
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS difal_factor NUMERIC(5, 4);
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS difal_cost NUMERIC(12, 2);
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS profit NUMERIC(12, 2);
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS margin_percent NUMERIC(12, 2);
    `);

    // Check if seeding is required for tax factors
    const factorCheck = await client.query("SELECT COUNT(*) FROM state_tax_factors");
    const factorCount = parseInt(factorCheck.rows[0].count);
    if (factorCount === 0) {
      console.log("Seeding state tax factors...");
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
      for (const item of initialFactors) {
        await client.query(`
          INSERT INTO state_tax_factors (id, state_code, tax_factor, active)
          VALUES ($1, $2, $3, true)
          ON CONFLICT (state_code) DO NOTHING
        `, [`tax_${item.state.toLowerCase()}`, item.state, item.factor]);
      }
      console.log("State tax factors seeded successfully.");
    }

    // Check if seeding is required for state_tax_profile
    const profileCheck = await client.query("SELECT COUNT(*) FROM state_tax_profile");
    const profileCount = parseInt(profileCheck.rows[0].count);
    if (profileCount === 0) {
      console.log("Seeding state tax profiles...");
      const initialProfiles = [
        { state_code: "AC", icms: 0.0645, difal: 0.1273, total: 0.1918, source: "report" },
        { state_code: "AL", icms: 0.0727, difal: 0.1374, total: 0.2101, source: "report" },
        { state_code: "AM", icms: 0.0743, difal: 0.1380, total: 0.2122, source: "report" },
        { state_code: "AP", icms: 0.0721, difal: 0.1305, total: 0.2044, source: "median" },
        { state_code: "BA", icms: 0.0708, difal: 0.1364, total: 0.2072, source: "report" },
        { state_code: "CE", icms: 0.0731, difal: 0.1369, total: 0.2100, source: "report" },
        { state_code: "DF", icms: 0.0712, difal: 0.1300, total: 0.2012, source: "report" },
        { state_code: "ES", icms: 0.0710, difal: 0.0979, total: 0.1689, source: "report" },
        { state_code: "GO", icms: 0.0716, difal: 0.1246, total: 0.1962, source: "report" },
        { state_code: "MA", icms: 0.0722, difal: 0.1650, total: 0.2372, source: "report" },
        { state_code: "MG", icms: 0.1205, difal: 0.0582, total: 0.1786, source: "report" },
        { state_code: "MS", icms: 0.0697, difal: 0.1015, total: 0.1712, source: "report" },
        { state_code: "MT", icms: 0.0709, difal: 0.1029, total: 0.1738, source: "report" },
        { state_code: "PA", icms: 0.0717, difal: 0.1184, total: 0.1901, source: "report" },
        { state_code: "PB", icms: 0.0736, difal: 0.1367, total: 0.2104, source: "report" },
        { state_code: "PE", icms: 0.0720, difal: 0.1382, total: 0.2102, source: "report" },
        { state_code: "PI", icms: 0.0724, difal: 0.1741, total: 0.2465, source: "report" },
        { state_code: "PR", icms: 0.1199, difal: 0.0724, total: 0.1923, source: "report" },
        { state_code: "RJ", icms: 0.1198, difal: 0.0977, total: 0.2175, source: "report" },
        { state_code: "RN", icms: 0.0705, difal: 0.1310, total: 0.2015, source: "report" },
        { state_code: "RO", icms: 0.0710, difal: 0.1450, total: 0.2160, source: "report" },
        { state_code: "RR", icms: 0.0721, difal: 0.1305, total: 0.2044, source: "median" },
        { state_code: "RS", icms: 0.1205, difal: 0.0530, total: 0.1735, source: "report" },
        { state_code: "SC", icms: 0.1155, difal: 0.0521, total: 0.1677, source: "report" },
        { state_code: "SE", icms: 0.0715, difal: 0.1441, total: 0.2156, source: "report" },
        { state_code: "SP", icms: 0.0058, difal: 0.0000, total: 0.0058, source: "report" },
        { state_code: "TO", icms: 0.0994, difal: 0.1335, total: 0.2329, source: "report" }
      ];

      for (const p of initialProfiles) {
        await client.query(`
          INSERT INTO state_tax_profile (state_code, icms_factor, difal_factor, total_factor, source_type, active)
          VALUES ($1, $2, $3, $4, $5, true)
          ON CONFLICT (state_code) DO NOTHING
        `, [p.state_code, p.icms, p.difal, p.total, p.source]);
      }
      console.log("State tax profiles seeded successfully.");
    }

    // Check if seeding is required (if table users is empty)
    const userCheck = await client.query("SELECT COUNT(*) FROM users");
    const userCount = parseInt(userCheck.rows[0].count);

    if (userCount === 0) {
      console.log("PostgreSQL database is empty. Performing initial user profile seed...");
      
      const now = new Date().toISOString();

      // Seed User Robert - keeping profile active for sessions
      await client.query(`
        INSERT INTO users (id, name, email, password_hash, created_at, updated_at)
        VALUES ('user_robert', 'Robert Elias', 'eliasrobert45@gmail.com', '123456', $1, $1)
      `, [now]);

      // Seed Product Costs so they can still map real SKU matches
      await client.query(`
        INSERT INTO costs (id, user_id, sku, product_name, cost_unitary, currency, source_file_name, imported_at, created_at, updated_at)
        VALUES 
          ('cost_1', 'user_robert', 'MLA-SKU-1001', 'Controle Xbox Series S Lacrado', 350.00, 'BRL', 'initial_import_sys.csv', $1, $1, $1),
          ('cost_2', 'user_robert', 'MLA-SKU-1002', 'Fone de Ouvido Bluetooth JBL Tune', 125.00, 'BRL', 'initial_import_sys.csv', $1, $1, $1),
          ('cost_3', 'user_robert', 'MLA-SKU-1003', 'Versace Pour Homme Edt Spray 100ml', 220.00, 'BRL', 'initial_import_sys.csv', $1, $1, $1),
          ('cost_4', 'user_robert', 'MLA-SKU-1004', 'Smartwatch Amazfit Bip 3', 150.00, 'BRL', 'initial_import_sys.csv', $1, $1, $1)
        ON CONFLICT (user_id, sku) DO NOTHING
      `, [now]);

      // Seed Import Batches info
      await client.query(`
        INSERT INTO batches (id, user_id, file_name, file_type, total_rows, inserted_rows, updated_rows, failed_rows, created_at)
        VALUES ('batch_1', 'user_robert', 'initial_import_sys.csv', 'csv', 4, 4, 0, 0, $1)
      `, [now]);

      console.log("Database initialized with user profile and key product costs.");
    }

    // Active purge to make sure no pre-existing mock accounts or mock orders remain in database
    console.log("Purging any pre-existing or residual simulated/mock data to clean up the workspace...");
    
    // Purge items connected to mock orders
    await client.query(`
      DELETE FROM items WHERE order_id IN (
        SELECT id FROM orders WHERE ml_account_id IN (
          SELECT id FROM accounts WHERE access_token LIKE 'MOCK_%' OR access_token LIKE 'SIM_%' OR id IN ('acc_1', 'acc_2')
        )
      )
    `);
    
    await client.query(`
      DELETE FROM items WHERE order_id IN (
        SELECT id FROM orders WHERE id NOT LIKE 'ord_ml_%'
      )
    `);

    // Purge orders connected to mock accounts
    await client.query(`
      DELETE FROM orders WHERE ml_account_id IN (
        SELECT id FROM accounts WHERE access_token LIKE 'MOCK_%' OR access_token LIKE 'SIM_%' OR id IN ('acc_1', 'acc_2')
      )
    `);

    // Purge mock orders
    await client.query(`
      DELETE FROM orders WHERE id NOT LIKE 'ord_ml_%'
    `);

    // Purge mock integration accounts
    await client.query(`
      DELETE FROM accounts WHERE access_token LIKE 'MOCK_%' OR access_token LIKE 'SIM_%' OR id IN ('acc_1', 'acc_2')
    `);

    console.log("Purging completed: Only real products and real synced orders/accounts are active in Neon Postgres!");

    // One-time automatic backfill of order_tax_summary for any existing orders on startup
    const summaryCheck = await client.query("SELECT COUNT(*) FROM order_tax_summary");
    const summaryCount = parseInt(summaryCheck.rows[0].count);
    if (summaryCount === 0) {
      console.log("Analyzing orders for initial tax simulation backfill...");
      const ordersRes = await client.query("SELECT id, shipping_state, total_amount, status FROM orders");
      if (ordersRes.rows.length > 0) {
        console.log(`Backfilling ${ordersRes.rows.length} orders with state tax summaries...`);
        const profilesRes = await client.query("SELECT * FROM state_tax_profile");
        const profileMap = new Map<string, any>();
        profilesRes.rows.forEach((p: any) => profileMap.set(p.state_code.toUpperCase(), p));

        const fallback = { icms_factor: 0.0721, difal_factor: 0.1305, total_factor: 0.2044, source_type: "median" };

        const statesMap: Record<string, string> = {
          "SAO PAULO": "SP", "SÃO PAULO": "SP", "SP": "SP",
          "RIO DE JANEIRO": "RJ", "RJ": "RJ",
          "MINAS GERAIS": "MG", "MG": "MG",
          "ESPIRITO SANTO": "ES", "ESPÍRITO SANTO": "ES", "ES": "ES",
          "PARANA": "PR", "PARANÁ": "PR", "PR": "PR",
          "SANTA CATARINA": "SC", "SC": "SC",
          "RIO GRANDE DO SUL": "RS", "RS": "RS",
          "GOIAS": "GO", "GOIÁS": "GO", "GO": "GO",
          "DISTRITO FEDERAL": "DF", "DF": "DF",
          "MATO GROSSO": "MT", "MT": "MT",
          "MATO GROSSO DO SUL": "MS", "MS": "MS",
          "BAHIA": "BA", "BA": "BA",
          "PERNAMBUCO": "PE", "PE": "PE",
          "CEARA": "CE", "CEARÁ": "CE", "CE": "CE",
          "PARAIBA": "PB", "PARAÍBA": "PB", "PB": "PB",
          "RIO GRANDE DO NORTE": "RN", "RN": "RN",
          "ALAGOAS": "AL", "AL": "AL",
          "SERGIPE": "SE", "SE": "SE",
          "PIAUI": "PI", "PIAUÍ": "PI", "PI": "PI",
          "MARANHAO": "MA", "MARANHÃO": "MA", "MA": "MA",
          "TOCANTINS": "TO", "TO": "TO",
          "PARA": "PA", "PARÁ": "PA", "PA": "PA",
          "AMAPA": "AP", "AMAPÁ": "AP", "AP": "AP",
          "AMAZONAS": "AM", "AM": "AM",
          "ACRE": "AC", "AC": "AC",
          "RONDONIA": "RO", "RONDÔNIA": "RO", "RO": "RO",
          "RORAIMA": "RR", "RR": "RR"
        };

        for (const o of ordersRes.rows) {
          const rawState = (o.shipping_state || "").trim().toUpperCase();
          const stateCode = statesMap[rawState] || "";
          let profile = profileMap.get(stateCode) || fallback;
          
          let calcMode = "report_state_factor";
          if (profile.source_type === "median" || !stateCode) {
            calcMode = "fallback_median";
          } else if (profile.source_type === "manual_override") {
            calcMode = "manual_override";
          }

          const revenue = Number(o.total_amount) || 0;
          const isCancelled = o.status.toLowerCase() === "cancelled";
          const icms_estimated = isCancelled ? 0 : (revenue * Number(profile.icms_factor));
          const difal_estimated = isCancelled ? 0 : (revenue * Number(profile.difal_factor));
          const tax_cost_total = icms_estimated + difal_estimated;
          const tax_factor_applied = Number(profile.total_factor);

          await client.query(`
            INSERT INTO order_tax_summary (order_id, shipping_state, tax_factor_applied, icms_estimated, difal_estimated, tax_cost_total, calculation_mode, rule_version)
            VALUES ($1, $2, $3, $4, $5, $6, $7, 'v1.0-simulacao-simples-backfill')
            ON CONFLICT (order_id) DO UPDATE SET
              shipping_state = EXCLUDED.shipping_state,
              tax_factor_applied = EXCLUDED.tax_factor_applied,
              icms_estimated = EXCLUDED.icms_estimated,
              difal_estimated = EXCLUDED.difal_estimated,
              tax_cost_total = EXCLUDED.tax_cost_total,
              calculation_mode = EXCLUDED.calculation_mode,
              rule_version = EXCLUDED.rule_version,
              calculated_at = CURRENT_TIMESTAMP
          `, [o.id, o.shipping_state || "Indefinido", tax_factor_applied, icms_estimated, difal_estimated, tax_cost_total, calcMode]);
        }
        console.log(`Successfully backfilled ${ordersRes.rows.length} orders with state tax summaries.`);
      }
    }
  } catch (err) {
    console.error("Error setting up PostgreSQL database schema or seeding:", err);
    throw err;
  } finally {
    client.release();
  }
}

// Database helper operations
export const dbOps = {
  // --- USERS ---
  async findUserByEmail(email: string): Promise<User | null> {
    const res = await pool.query("SELECT * FROM users WHERE LOWER(email) = LOWER($1)", [email]);
    return res.rows[0] || null;
  },

  async findUserById(id: string): Promise<User | null> {
    const res = await pool.query("SELECT * FROM users WHERE id = $1", [id]);
    return res.rows[0] || null;
  },

  async createUser(user: User): Promise<User> {
    await pool.query(
      `INSERT INTO users (id, name, email, password_hash, created_at, updated_at) 
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [user.id, user.name, user.email, user.password_hash, user.created_at, user.updated_at]
    );
    return user;
  },

  // --- ACCOUNTS ---
  async getUserMLAccounts(userId: string): Promise<MercadoLivreAccount[]> {
    const res = await pool.query("SELECT * FROM accounts WHERE user_id = $1 ORDER BY nickname ASC", [userId]);
    return res.rows;
  },

  async getAccountById(id: string, userId: string): Promise<MercadoLivreAccount | null> {
    const res = await pool.query("SELECT * FROM accounts WHERE id = $1 AND user_id = $2", [id, userId]);
    return res.rows[0] || null;
  },

  async createMLAccount(acc: MercadoLivreAccount): Promise<MercadoLivreAccount> {
    await pool.query(
      `INSERT INTO accounts (id, user_id, nickname, access_token, refresh_token, token_expires_at, ml_user_id, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (id) DO UPDATE SET
         user_id = EXCLUDED.user_id,
         nickname = EXCLUDED.nickname,
         access_token = EXCLUDED.access_token,
         refresh_token = EXCLUDED.refresh_token,
         token_expires_at = EXCLUDED.token_expires_at,
         ml_user_id = EXCLUDED.ml_user_id,
         status = EXCLUDED.status,
         updated_at = EXCLUDED.updated_at`,
      [acc.id, acc.user_id, acc.nickname, acc.access_token, acc.refresh_token, acc.token_expires_at, acc.ml_user_id, acc.status, acc.created_at, acc.updated_at]
    );
    return acc;
  },

  async updateMLAccountTokens(id: string, accessToken: string, refreshToken: string, expiresAt: string): Promise<void> {
    await pool.query(
      `UPDATE accounts 
       SET access_token = $1, refresh_token = $2, token_expires_at = $3, updated_at = CURRENT_TIMESTAMP
       WHERE id = $4`,
      [accessToken, refreshToken, expiresAt, id]
    );
  },

  async deleteMLAccount(id: string, userId: string): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Retrieve all order IDs for this integration account
      const ordersRes = await client.query("SELECT id FROM orders WHERE ml_account_id = $1 AND user_id = $2", [id, userId]);
      const orderIds = ordersRes.rows.map((row: any) => row.id);

      if (orderIds.length > 0) {
        // Manually delete items linked to these orders
        await client.query("DELETE FROM items WHERE order_id = ANY($1)", [orderIds]);
        // Manually delete the orders
        await client.query("DELETE FROM orders WHERE ml_account_id = $1 AND user_id = $2", [id, userId]);
      }

      // Finally delete the account
      await client.query("DELETE FROM accounts WHERE id = $1 AND user_id = $2", [id, userId]);

      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  },

  // --- COSTS ---
  async getUserCosts(userId: string): Promise<ProductCost[]> {
    const res = await pool.query("SELECT * FROM costs WHERE user_id = $1 ORDER BY sku ASC", [userId]);
    return res.rows;
  },

  async getCostBySku(userId: string, sku: string): Promise<ProductCost | null> {
    const res = await pool.query("SELECT * FROM costs WHERE user_id = $1 AND UPPER(sku) = UPPER($2)", [userId, sku]);
    return res.rows[0] || null;
  },

  async upsertProductCost(cost: ProductCost): Promise<void> {
    await pool.query(
      `INSERT INTO costs (id, user_id, sku, product_name, cost_unitary, currency, source_file_name, imported_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (user_id, sku) DO UPDATE 
       SET product_name = EXCLUDED.product_name,
           cost_unitary = EXCLUDED.cost_unitary,
           currency = EXCLUDED.currency,
           source_file_name = EXCLUDED.source_file_name,
           imported_at = EXCLUDED.imported_at,
           updated_at = CURRENT_TIMESTAMP`,
      [cost.id, cost.user_id, cost.sku.toUpperCase(), cost.product_name, cost.cost_unitary, cost.currency, cost.source_file_name, cost.imported_at, cost.created_at, cost.updated_at]
    );
  },

  async updateProductCostById(id: string, userId: string, productName: string, costUnitary: number, currency: string, importedAt: string): Promise<void> {
    await pool.query(
      `UPDATE costs 
       SET product_name = $1, cost_unitary = $2, currency = $3, imported_at = $4, updated_at = CURRENT_TIMESTAMP
       WHERE id = $5 AND user_id = $6`,
      [productName, costUnitary, currency, importedAt, id, userId]
    );
  },

  async deleteProductCost(id: string, userId: string): Promise<void> {
    await pool.query("DELETE FROM costs WHERE id = $1 AND user_id = $2", [id, userId]);
  },

  // --- BATCHES ---
  async getUserBatches(userId: string): Promise<CostImportBatch[]> {
    const res = await pool.query("SELECT * FROM batches WHERE user_id = $1 ORDER BY created_at DESC", [userId]);
    return res.rows;
  },

  async createImportBatch(batch: CostImportBatch): Promise<void> {
    await pool.query(
      `INSERT INTO batches (id, user_id, file_name, file_type, total_rows, inserted_rows, updated_rows, failed_rows, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [batch.id, batch.user_id, batch.file_name, batch.file_type, batch.total_rows, batch.inserted_rows, batch.updated_rows, batch.failed_rows, batch.created_at]
    );
  },

  // --- ORDERS & ITEMS ---
  async getRawOrdersAndItems(userId: string): Promise<{ orders: Order[]; items: OrderItem[] }> {
    const ordersRes = await pool.query("SELECT * FROM orders WHERE user_id = $1", [userId]);
    const itemsRes = await pool.query(
      `SELECT items.* FROM items 
       JOIN orders ON items.order_id = orders.id 
       WHERE orders.user_id = $1`,
      [userId]
    );
    return {
      orders: ordersRes.rows,
      items: itemsRes.rows
    };
  },

  async getOrderById(orderId: string, userId: string): Promise<Order | null> {
    const res = await pool.query("SELECT * FROM orders WHERE id = $1 AND user_id = $2", [orderId, userId]);
    return res.rows[0] || null;
  },

  async getOrderItems(orderId: string): Promise<OrderItem[]> {
    const res = await pool.query("SELECT * FROM items WHERE order_id = $1 ORDER BY id ASC", [orderId]);
    return res.rows;
  },

  async saveOrderWithItems(order: Order, items: OrderItem[]): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      
      // Upsert order
      await client.query(
        `INSERT INTO orders (id, user_id, ml_account_id, ml_order_id, status, order_date, total_amount, shipping_amount, discount_amount, marketplace_fee_amount, net_amount, pack_id, shipping_city, shipping_municipality, shipping_state, shipping_cost_detail, ml_shipment_id, tax_factor, tax_cost, difal_factor, difal_cost, profit, margin_percent, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)
         ON CONFLICT (id) DO UPDATE 
         SET status = EXCLUDED.status,
             total_amount = EXCLUDED.total_amount,
             shipping_amount = EXCLUDED.shipping_amount,
             discount_amount = EXCLUDED.discount_amount,
             marketplace_fee_amount = EXCLUDED.marketplace_fee_amount,
             net_amount = EXCLUDED.net_amount,
             pack_id = EXCLUDED.pack_id,
             shipping_city = EXCLUDED.shipping_city,
             shipping_municipality = EXCLUDED.shipping_municipality,
             shipping_state = EXCLUDED.shipping_state,
             shipping_cost_detail = EXCLUDED.shipping_cost_detail,
             ml_shipment_id = EXCLUDED.ml_shipment_id,
             tax_factor = EXCLUDED.tax_factor,
             tax_cost = EXCLUDED.tax_cost,
             difal_factor = EXCLUDED.difal_factor,
             difal_cost = EXCLUDED.difal_cost,
             profit = EXCLUDED.profit,
             margin_percent = EXCLUDED.margin_percent,
             updated_at = CURRENT_TIMESTAMP`,
        [
          order.id, order.user_id, order.ml_account_id, order.ml_order_id, order.status, order.order_date,
          order.total_amount, order.shipping_amount, order.discount_amount, order.marketplace_fee_amount,
          order.net_amount, order.pack_id,
          order.shipping_city || null, order.shipping_municipality || null, order.shipping_state || null,
          order.shipping_cost_detail !== undefined ? order.shipping_cost_detail : null,
          order.ml_shipment_id || null,
          (order as any).tax_factor !== undefined ? (order as any).tax_factor : null,
          (order as any).tax_cost !== undefined ? (order as any).tax_cost : null,
          (order as any).difal_factor !== undefined ? (order as any).difal_factor : null,
          (order as any).difal_cost !== undefined ? (order as any).difal_cost : null,
          (order as any).profit !== undefined ? (order as any).profit : null,
          (order as any).margin_percent !== undefined ? (order as any).margin_percent : null,
          order.created_at, order.updated_at
        ]
      );

      // Save items
      for (const item of items) {
        await client.query(
          `INSERT INTO items (id, order_id, sku, product_name, quantity, unit_price, total_price, cost_unitary_snapshot, cost_total_snapshot, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           ON CONFLICT (id) DO UPDATE 
           SET quantity = EXCLUDED.quantity,
               unit_price = EXCLUDED.unit_price,
               total_price = EXCLUDED.total_price,
               cost_unitary_snapshot = EXCLUDED.cost_unitary_snapshot,
               cost_total_snapshot = EXCLUDED.cost_total_snapshot,
               updated_at = CURRENT_TIMESTAMP`,
          [
            item.id, item.order_id, item.sku, item.product_name, item.quantity, item.unit_price, item.total_price,
            item.cost_unitary_snapshot || null, item.cost_total_snapshot || null, item.created_at, item.updated_at
          ]
        );
      }

      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  },

  // --- STATE TAX FACTORS ---
  async getStateTaxFactors(): Promise<any[]> {
    const res = await pool.query("SELECT * FROM state_tax_factors ORDER BY state_code ASC");
    return res.rows;
  },

  async updateStateTaxFactor(id: string, taxFactor: number, active: boolean): Promise<void> {
    await pool.query(
      `UPDATE state_tax_factors
       SET tax_factor = $1, active = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [taxFactor, active, id]
    );
  },

  // --- STATE TAX PROFILES ---
  async getStateTaxProfiles(): Promise<StateTaxProfile[]> {
    const res = await pool.query("SELECT * FROM state_tax_profile ORDER BY state_code ASC");
    return res.rows.map(row => ({
      state_code: row.state_code,
      icms_factor: Number(row.icms_factor),
      difal_factor: Number(row.difal_factor),
      total_factor: Number(row.total_factor),
      source_type: row.source_type,
      active: row.active,
      valid_from: row.valid_from,
      valid_to: row.valid_to,
      notes: row.notes
    }));
  },

  async updateStateTaxProfile(profile: StateTaxProfile): Promise<void> {
    await pool.query(
      `INSERT INTO state_tax_profile (state_code, icms_factor, difal_factor, total_factor, source_type, active, valid_from, valid_to, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (state_code) DO UPDATE SET
         icms_factor = EXCLUDED.icms_factor,
         difal_factor = EXCLUDED.difal_factor,
         total_factor = EXCLUDED.total_factor,
         source_type = EXCLUDED.source_type,
         active = EXCLUDED.active,
         valid_from = EXCLUDED.valid_from,
         valid_to = EXCLUDED.valid_to,
         notes = EXCLUDED.notes`,
      [
        profile.state_code.toUpperCase(),
        profile.icms_factor,
        profile.difal_factor,
        profile.total_factor,
        profile.source_type,
        profile.active,
        profile.valid_from || null,
        profile.valid_to || null,
        profile.notes || null
      ]
    );
  },

  // --- ORDER TAX SUMMARIES ---
  async saveOrderTaxSummary(summary: OrderTaxSummary): Promise<void> {
    await pool.query(
      `INSERT INTO order_tax_summary (order_id, shipping_state, tax_factor_applied, icms_estimated, difal_estimated, tax_cost_total, calculation_mode, rule_version, calculated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (order_id) DO UPDATE SET
         shipping_state = EXCLUDED.shipping_state,
         tax_factor_applied = EXCLUDED.tax_factor_applied,
         icms_estimated = EXCLUDED.icms_estimated,
         difal_estimated = EXCLUDED.difal_estimated,
         tax_cost_total = EXCLUDED.tax_cost_total,
         calculation_mode = EXCLUDED.calculation_mode,
         rule_version = EXCLUDED.rule_version,
         calculated_at = CURRENT_TIMESTAMP`,
      [
        summary.order_id,
        summary.shipping_state,
        summary.tax_factor_applied,
        summary.icms_estimated,
        summary.difal_estimated,
        summary.tax_cost_total,
        summary.calculation_mode,
        summary.rule_version,
        summary.calculated_at
      ]
    );
  },

  async getOrderTaxSummaries(): Promise<OrderTaxSummary[]> {
    const res = await pool.query("SELECT * FROM order_tax_summary");
    return res.rows.map(row => ({
      order_id: row.order_id,
      shipping_state: row.shipping_state,
      tax_factor_applied: Number(row.tax_factor_applied),
      icms_estimated: Number(row.icms_estimated),
      difal_estimated: Number(row.difal_estimated),
      tax_cost_total: Number(row.tax_cost_total),
      calculation_mode: row.calculation_mode,
      rule_version: row.rule_version,
      calculated_at: row.calculated_at
    }));
  },

  async getOrderTaxSummaryById(orderId: string): Promise<OrderTaxSummary | null> {
    const res = await pool.query("SELECT * FROM order_tax_summary WHERE order_id = $1", [orderId]);
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      order_id: row.order_id,
      shipping_state: row.shipping_state,
      tax_factor_applied: Number(row.tax_factor_applied),
      icms_estimated: Number(row.icms_estimated),
      difal_estimated: Number(row.difal_estimated),
      tax_cost_total: Number(row.tax_cost_total),
      calculation_mode: row.calculation_mode,
      rule_version: row.rule_version,
      calculated_at: row.calculated_at
    };
  }
};

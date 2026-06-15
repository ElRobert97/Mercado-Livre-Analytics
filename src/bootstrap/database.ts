import { pool } from "../config/database";

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

    // Ensure older databases get any new columns for shipment address, cost details, and tax estimates
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

    // Active purge to make sure no pre-existing mock data remains
    console.log("Purging any pre-existing or residual simulated/mock data to clean up the workspace...");
    
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

    console.log("Purging completed.");

    // Backfill of order_tax_summary for existing orders on startup if needed
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
        console.log(`Successfully backfilled ${ordersRes.rows.length} orders.`);
      }
    }
  } catch (err) {
    console.error("Error setting up PostgreSQL database schema or seeding:", err);
    throw err;
  } finally {
    client.release();
  }
}

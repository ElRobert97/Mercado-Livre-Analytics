import { Pool, PoolConfig } from "pg";
import { User, MercadoLivreAccount, Order, OrderItem, ProductCost, CostImportBatch, OrderFinancialSummary } from "./types";

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
        password_hash VARCHAR(100) NOT NULL,
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
    `);

    // Ensure older databases get the new columns for shipment address and cost details
    await client.query(`
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_city VARCHAR(255);
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_municipality VARCHAR(255);
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_state VARCHAR(255);
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_cost_detail NUMERIC(12, 2);
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS ml_shipment_id VARCHAR(100);
    `);

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
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
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
        `INSERT INTO orders (id, user_id, ml_account_id, ml_order_id, status, order_date, total_amount, shipping_amount, discount_amount, marketplace_fee_amount, net_amount, pack_id, shipping_city, shipping_municipality, shipping_state, shipping_cost_detail, ml_shipment_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
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
             updated_at = CURRENT_TIMESTAMP`,
        [
          order.id, order.user_id, order.ml_account_id, order.ml_order_id, order.status, order.order_date,
          order.total_amount, order.shipping_amount, order.discount_amount, order.marketplace_fee_amount,
          order.net_amount, order.pack_id,
          order.shipping_city || null, order.shipping_municipality || null, order.shipping_state || null,
          order.shipping_cost_detail !== undefined ? order.shipping_cost_detail : null,
          order.ml_shipment_id || null,
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
  }
};

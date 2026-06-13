import { Pool, PoolConfig } from "pg";

const NEON_DB_URL = "postgresql://neondb_owner:npg_kT5LIf7btgCz@ep-weathered-pond-aiuvi42a.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";
const connectionString = process.env.DATABASE_URL || NEON_DB_URL;

const poolConfig: PoolConfig = {
  connectionString,
  ssl: {
    rejectUnauthorized: false
  },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
};

export const pool = new Pool(poolConfig);

import { pool } from "../../../../config/database";
import { User } from "../../../../shared/types";

export class PostgresUserRepository {
  async findUserByEmail(email: string): Promise<User | null> {
    const res = await pool.query(
      "SELECT id, name, email, password_hash, created_at, updated_at FROM users WHERE email = $1", 
      [email]
    );
    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    return {
      id: r.id,
      name: r.name,
      email: r.email,
      password_hash: r.password_hash,
      created_at: r.created_at?.toISOString() || "",
      updated_at: r.updated_at?.toISOString() || ""
    };
  }

  async findUserById(id: string): Promise<User | null> {
    const res = await pool.query(
      "SELECT id, name, email, password_hash, created_at, updated_at FROM users WHERE id = $1", 
      [id]
    );
    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    return {
      id: r.id,
      name: r.name,
      email: r.email,
      password_hash: r.password_hash,
      created_at: r.created_at?.toISOString() || "",
      updated_at: r.updated_at?.toISOString() || ""
    };
  }

  async createUser(user: User): Promise<User> {
    await pool.query(
      `INSERT INTO users (id, name, email, password_hash, created_at, updated_at)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [user.id, user.name, user.email, user.password_hash]
    );
    return user;
  }
}

export const userRepository = new PostgresUserRepository();

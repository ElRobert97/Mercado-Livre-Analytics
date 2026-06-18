import express from "express";
import { dbOps } from "../../db_postgres";
import { hashPassword, verifyPassword } from "../helpers/password";
import { User } from "../../shared/types";

export const authRouter = express.Router();

authRouter.post("/register", async (req, res) => {
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
      password_hash: hashPassword(password),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await dbOps.createUser(newUser);
    res.status(201).json({ user: { id: newUser.id, name: newUser.name, email: newUser.email } });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: "Erro ao cadastrar usuário: " + err.message });
  }
});

authRouter.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Email e senha são obrigatórios." });
  }

  try {
    const user = await dbOps.findUserByEmail(email);
    if (!user || !verifyPassword(password, user.password_hash)) {
      return res.status(400).json({ error: "Email ou senha incorretos." });
    }

    res.json({ user: { id: user.id, name: user.name, email: user.email } });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: "Erro ao realizar login." });
  }
});

authRouter.post("/logout", (req, res) => {
  res.json({ message: "Sessão encerrada com sucesso." });
});

authRouter.get("/me", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.json({ user: null });
  }
  const userId = authHeader.substring(7);
  if (!userId) {
    return res.json({ user: null });
  }
  try {
    const user = await dbOps.findUserById(userId);
    if (!user) {
      return res.json({ user: null });
    }
    res.json({ user: { id: user.id, name: user.name, email: user.email } });
  } catch (err) {
    res.json({ user: null });
  }
});

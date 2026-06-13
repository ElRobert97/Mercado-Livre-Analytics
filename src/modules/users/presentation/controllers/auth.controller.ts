import { Request, Response } from "express";
import { authService } from "../../application/services/auth.service";
import { sessionState } from "../../../../shared/utils/session";

export class AuthController {
  async register(req: Request, res: Response) {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: "Nome, email e senha são obrigatórios." });
    }

    try {
      const userDto = await authService.register({
        name,
        email,
        password_hash: password
      });
      sessionState.currentUserSession = userDto.id;
      return res.status(201).json({ user: userDto });
    } catch (err: any) {
      console.error(err);
      return res.status(500).json({ error: "Erro ao cadastrar usuário: " + err.message });
    }
  }

  async login(req: Request, res: Response) {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email e senha são obrigatórios." });
    }

    try {
      const userDto = await authService.login(email, password);
      sessionState.currentUserSession = userDto.id;
      return res.json({ user: userDto });
    } catch (err: any) {
      console.error(err);
      return res.status(400).json({ error: err.message || "Erro ao realizar login" });
    }
  }

  async logout(req: Request, res: Response) {
    sessionState.currentUserSession = null;
    return res.json({ message: "Sessão encerrada com sucesso." });
  }

  async getCurrentUser(req: Request, res: Response) {
    if (!sessionState.currentUserSession) {
      return res.json({ user: null });
    }
    try {
      const userDto = await authService.findUserById(sessionState.currentUserSession);
      if (!userDto) {
        sessionState.currentUserSession = null;
        return res.json({ user: null });
      }
      return res.json({ user: userDto });
    } catch (err) {
      sessionState.currentUserSession = null;
      return res.json({ user: null });
    }
  }
}

export const authController = new AuthController();

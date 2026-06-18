import express from "express";
import { dbOps } from "../../db_postgres";
import { getUserIdFromRequest, requireAuth } from "../helpers/auth";
import { refreshAccountTokenIfNeeded } from "../helpers/mlHelper";
import { MercadoLivreAccount } from "../../shared/types";

export const mercadolivreRouter = express.Router();

/**
 * Lists connected ML accounts
 */
mercadolivreRouter.get("/accounts", requireAuth, async (req, res) => {
  try {
    const userId = getUserIdFromRequest(req);
    const accounts = await dbOps.getUserMLAccounts(userId);
    res.json(accounts);
  } catch (err: any) {
    res.status(500).json({ error: "Erro ao buscar integrações: " + err.message });
  }
});

/**
 * Returns OAuth authorization URL details
 */
mercadolivreRouter.get("/connect", requireAuth, (req, res) => {
  const query = req.query;
  const clientId = process.env.ML_CLIENT_ID || process.env.MERCADOLIVRE_CLIENT_ID || "5594702884845296";
  const appUrl = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
  const redirectUri = process.env.ML_REDIRECT_URI || `${appUrl}/api/integrations/mercadolivre/callback`;
  const userId = getUserIdFromRequest(req);
  const state = String(query.state || userId || "state_rand");

  res.json({
    auth_url: `https://auth.mercadolivre.com.br/authorization?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`,
    client_id: clientId,
    redirect_uri: redirectUri,
    state
  });
});

/**
 * Stub connect-simulation (Simulation disabled)
 */
mercadolivreRouter.post("/connect-simulation", requireAuth, async (req, res) => {
  return res.status(400).json({ error: "Ambiente de simulação desativado para foco exclusivo em dados reais de produção da API Mercado Livre." });
});

/**
 * Manually refresh accounts tokens
 */
mercadolivreRouter.post("/refresh", requireAuth, async (req, res) => {
  const { account_id } = req.body;
  if (!account_id) return res.status(400).json({ error: "ID de conta obrigatório" });
  try {
    const newToken = await refreshAccountTokenIfNeeded(account_id, true);
    res.json({ success: true, token: newToken });
  } catch (err: any) {
    console.error("Refresh error:", err);
    res.status(500).json({ error: err.message || "Erro durante renovação forçada de token" });
  }
});

/**
 * Delete account integration
 */
mercadolivreRouter.delete("/accounts/:id", requireAuth, async (req, res) => {
  try {
    const accountId = req.params.id;
    const userId = getUserIdFromRequest(req);
    
    // Check if account belongs to user
    const userAccs = await dbOps.getUserMLAccounts(userId);
    const owns = userAccs.some(a => a.id === accountId);
    if (!owns) {
      return res.status(403).json({ error: "Não autorizado a remover esta conta." });
    }

    await dbOps.deleteMLAccount(accountId, userId);
    res.json({ success: true, message: "Conexão de conta Mercado Livre desfeita com sucesso!" });
  } catch (err: any) {
    res.status(500).json({ error: "Erro ao desfazer conexão: " + err.message });
  }
});

/**
 * Complete OAuth callback logic (shared handler)
 */
export async function mercadolivreCallbackHandler(req: express.Request, res: express.Response) {
  const { code, state } = req.query;

  if (!code) {
    return res.status(400).send("Código de autorização ausente da url callback.");
  }

  const clientId = process.env.ML_CLIENT_ID || process.env.MERCADOLIVRE_CLIENT_ID;
  const clientSecret = process.env.ML_CLIENT_SECRET || process.env.MERCADOLIVRE_CLIENT_SECRET;

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
              ML_REDIRECT_URI="${process.env.ML_REDIRECT_URI || "Sua Redirect URI"}"<br>
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

    const userDetailsResponse = await fetch(`https://api.mercadolibre.com/users/${mlUserId}`, {
      headers: { "Authorization": `Bearer ${accessToken}` }
    });
    let nickname = `ML_USER_${mlUserId}`;
    if (userDetailsResponse.ok) {
      const details = await userDetailsResponse.json();
      nickname = details.nickname;
    }

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
}

// Attach callback internally as well
mercadolivreRouter.get(["/callback", "/callback/"], mercadolivreCallbackHandler);

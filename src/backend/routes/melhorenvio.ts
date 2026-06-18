import express from "express";
import { dbOps } from "../../db_postgres";
import { getUserIdFromRequest, requireAuth } from "../helpers/auth";

export const melhorenvioRouter = express.Router();

const ME_USER_EMAIL = process.env.MELHOR_ENVIO_USER_EMAIL;
const ME_USER_AGENT = process.env.MELHOR_ENVIO_USER_AGENT;
const ME_BASE_URL = (process.env.MELHOR_ENVIO_BASE_URL || "https://www.melhorenvio.com.br").trim().replace(/\/$/, "");

function getMelhorEnvioRedirectUri(req: any): string {
  let redirectUri = process.env.MELHOR_ENVIO_REDIRECT_URI ? process.env.MELHOR_ENVIO_REDIRECT_URI.trim() : "";
  
  let appUrl = process.env.APP_URL;
  if (appUrl) {
    appUrl = appUrl.trim().replace(/\/$/, "");
  } else {
    const proto = req.headers["x-forwarded-proto"] || req.protocol || "https";
    const host = req.get("host") || "localhost:3000";
    const protocol = proto.split(",")[0].trim();
    appUrl = `${protocol}://${host}`;
  }

  // If redirectUri is set from environment
  if (redirectUri) {
    // If it's a relative path starting with /, prepend appUrl
    if (redirectUri.startsWith("/")) {
      return `${appUrl}${redirectUri}`;
    }
    return redirectUri;
  }

  return `${appUrl}/melhor-envio`;
}

function extractUserIdFromState(state: unknown): string | null {
  if (state === undefined || state === null) return null;
  const raw = String(state).trim();
  if (!raw) return null;

  // Accept either a plain userId or a structured state like "userId|nonce".
  const candidate = raw.split(/[|:]/)[0].trim();
  if (!candidate || candidate === "state_rand" || candidate === "teste") return null;

  // Keep the parser permissive to accept any JWT, email, UUID or username tokens, but reject obvious HTML tags or empty values
  if (candidate.length < 3 || candidate.includes("<") || candidate.includes(">")) return null;

  return candidate;
}

/**
 * Returns OAuth redirection parameters for Melhor Envio
 */
melhorenvioRouter.get("/connect", requireAuth, async (req, res) => {
  const query = req.query;
  const rawId = process.env.MELHOR_ENVIO_ID || process.env.MELHOR_ENVIO_CLIENT_ID;
  const clientId = rawId ? String(rawId).replace(/[\s\n\r]/g, "") : "";
  const redirectUri = getMelhorEnvioRedirectUri(req);
  const userId = getUserIdFromRequest(req);
  const state = String(query.state || userId || "state_rand");

  const baseUrl = ME_BASE_URL;

  const scopes = "cart-read cart-write companies-read companies-write coupons-read coupons-write notifications-read orders-read products-read products-write purchases-read shipping-calculate shipping-cancel shipping-checkout shipping-companies shipping-generate shipping-preview shipping-print shipping-share shipping-tracking ecommerce-shipping transactions-read users-read users-write";
  const authUrl = `${baseUrl}/oauth/authorize?client_id=${clientId || ""}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&state=${encodeURIComponent(state)}&scope=${encodeURIComponent(scopes)}`;

  // Log connection starting point in database for high visibility
  await dbOps.addMelhorEnvioLog(
    userId,
    "AUTH_START",
    "INFO",
    `URL de autorização de Produção gerada com sucesso. Usando escopos regulamentados de cálculo, checkouts de fretes e rastreios.`,
    JSON.stringify({
      target_url: authUrl,
      client_id: clientId ? `${clientId.substring(0, 4)}***` : "MISSING_ENV",
      redirect_uri: redirectUri,
      state
    })
  );

  res.json({
    auth_url: authUrl,
    client_id: clientId || null,
    redirect_uri: redirectUri,
    state
  });
});

/**
 * Connection Status
 */
melhorenvioRouter.get("/status", requireAuth, async (req, res) => {
  try {
    const userId = getUserIdFromRequest(req);
    const conf = await dbOps.getMelhorEnvioToken(userId);
    if (conf && conf.connected) {
      return res.json({ connected: true, is_sandbox: false });
    }
    return res.json({ connected: false });
  } catch (err: any) {
    console.error("Error getting ME status:", err);
    res.status(500).json({ error: "Erro ao obter status do Melhor Envio" });
  }
});

/**
 * Manual/Callback Token Save
 */
melhorenvioRouter.post("/save-token", requireAuth, async (req, res) => {
  try {
    const userId = getUserIdFromRequest(req);
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ error: "Token é obrigatório" });
    }
    await dbOps.saveMelhorEnvioToken(userId, token, undefined, undefined, false);
    
    await dbOps.addMelhorEnvioLog(
      userId,
      "PERSIST_TOKEN_SUCCESS",
      "SUCCESS",
      "Integração de Produção ativada! Token de acesso registrado para o usuário de forma segura no banco PostgreSQL.",
      JSON.stringify({ token_preview: `${token.substring(0, 6)}...` })
    );

    res.json({ success: true, message: "Token salvo com sucesso." });
  } catch (err: any) {
    console.error("Error saving ME token:", err);
    res.status(500).json({ error: "Erro ao salvar token" });
  }
});

/**
 * Connection Disconnect
 */
melhorenvioRouter.post("/disconnect", requireAuth, async (req, res) => {
  try {
    const userId = getUserIdFromRequest(req);
    await dbOps.deleteMelhorEnvioToken(userId);
    res.json({ success: true, message: "Conexão com Melhor Envio encerrada" });
  } catch (err: any) {
    console.error("Error disconnecting ME:", err);
    res.status(500).json({ error: "Erro ao desconectar Melhor Envio" });
  }
});

/**
 * Fetch Real Labels
 */
melhorenvioRouter.get("/labels", requireAuth, async (req, res) => {
  try {
    const userId = getUserIdFromRequest(req);
    const meConfig = await dbOps.getMelhorEnvioToken(userId);
    if (!meConfig || !meConfig.connected) {
      return res.json({ labels: [], connected: false });
    }

    const baseUrl = ME_BASE_URL;
    console.log(`[MELHOR ENVIO] Fetching real labels from ${baseUrl} for user ${userId}`);

    const headers: Record<string, string> = {
      "Authorization": `Bearer ${meConfig.access_token}`,
      "Accept": "application/json",
    };
    if (ME_USER_AGENT) headers["User-Agent"] = ME_USER_AGENT;
    else headers["User-Agent"] = "Integração BRT";
    if (ME_USER_EMAIL) headers["email"] = ME_USER_EMAIL;
    else headers["email"] = "eliasrobert45@gmail.com";

    let reportData: any = null;
    let reportOk = false;

    try {
      const response = await fetch(`${baseUrl}/api/v2/me/shipment/report`, {
        method: "GET",
        headers: {
          ...headers,
          "Content-Type": "application/json"
        }
      });

      const responseText = await response.text();
      console.log(`[MELHOR ENVIO] Report response (status ${response.status}):`, responseText.substring(0, 200));

      if (response.ok) {
        try {
          reportData = JSON.parse(responseText);
          reportOk = true;
        } catch (jsonErr: any) {
          console.warn("[MELHOR ENVIO] Report response 200 OK but was not a valid JSON. Content starts with:", responseText.substring(0, 150));
          await dbOps.addMelhorEnvioLog(
            userId,
            "LABELS_REPORT_PARSE_ERR",
            "ERROR",
            "A API /shipment/report retornou 200 OK mas o corpo não é JSON válido (muitas vezes HTML). Tentando fallback automático.",
            responseText.substring(0, 500)
          );
        }
      } else {
        console.warn(`[MELHOR ENVIO] Report API status ${response.status}: ${responseText.substring(0, 150)}`);
        await dbOps.addMelhorEnvioLog(
          userId,
          "LABELS_REPORT_ERR_CODELOG",
          "ERROR",
          `A API /shipment/report retornou erro HTTP ${response.status}. Tentando fallback automático.`,
          responseText.substring(0, 500)
        );
      }
    } catch (fetchErr: any) {
      console.error("[MELHOR ENVIO] Error calling ME Report API:", fetchErr.message);
    }

    if (reportOk && reportData) {
      let labels = Array.isArray(reportData) ? reportData : (reportData && Array.isArray(reportData.data) ? reportData.data : []);
      return res.json({ labels, connected: true, real: true });
    }

    // Fallback: Fetch shipments info directly
    try {
      let fallbackUrl = `${baseUrl}/api/v2/me/shipments`;
      console.log(`[MELHOR ENVIO] Executing fallback to GET ${fallbackUrl}`);

      const responseGet = await fetch(fallbackUrl, {
        method: "GET",
        headers
      });

      const textGet = await responseGet.text();
      console.log(`[MELHOR ENVIO] Shipments fallback (status ${responseGet.status}):`, textGet.substring(0, 200));

      if (responseGet.ok) {
        try {
          const dataGet = JSON.parse(textGet);
          let labels = Array.isArray(dataGet) ? dataGet : (dataGet && Array.isArray(dataGet.data) ? dataGet.data : []);
          return res.json({ labels, connected: true, real: true });
        } catch (e) {
          console.error("[MELHOR ENVIO] GET /shipments response was OK but not a valid JSON. Body starts with:", textGet.substring(0, 150));
          await dbOps.addMelhorEnvioLog(
            userId,
            "LABELS_GET_PARSE_ERR",
            "ERROR",
            "A API de listagem de envios (shipments) retornou resposta não-JSON (HTML).",
            textGet.substring(0, 1000)
          );
          return res.status(500).json({ 
            error: "Melhor Envio retornou formato de dados inválido (HTML).", 
            html_preview: textGet.substring(0, 1000) 
          });
        }
      } else {
        console.warn(`[MELHOR ENVIO] GET /shipments failure: ${textGet.substring(0, 150)}`);
        await dbOps.addMelhorEnvioLog(
          userId,
          "LABELS_GET_REST_ERR",
          "ERROR",
          `Falha ao recuperar listagem de envios (status ${responseGet.status}).`,
          textGet.substring(0, 1000)
        );
        return res.status(responseGet.status).json({
          error: `API do Melhor Envio retornou erro ${responseGet.status}`,
          html_preview: textGet.substring(0, 1000)
        });
      }
    } catch (getErr: any) {
      console.error("[MELHOR ENVIO] GET /shipments fetch error:", getErr.message);
      return res.status(500).json({ error: `Erro na requisição ao Melhor Envio do Servidor: ${getErr.message}` });
    }
  } catch (err: any) {
    console.error("Error retrieving ME labels:", err);
    res.status(500).json({ error: "Erro ao carregar etiquetas do Melhor Envio" });
  }
});

/**
 * Shipping Quote Calculations
 */
melhorenvioRouter.post("/quote", requireAuth, async (req, res) => {
  try {
    const userId = getUserIdFromRequest(req);
    const meConfig = await dbOps.getMelhorEnvioToken(userId);
    if (!meConfig || !meConfig.connected) {
      return res.json({ connected: false });
    }

    const { fromPostalCode, toPostalCode, weight, width, height, length } = req.body;
    const baseUrl = ME_BASE_URL;

    // Normalize CEP inputs explicitly (removing '.' and '-')
    const cleanFrom = String(fromPostalCode || "").replace(/\D/g, "");
    const cleanTo = String(toPostalCode || "").replace(/\D/g, "");

    if (cleanFrom.length !== 8 || cleanTo.length !== 8) {
      const errMsg = `CEP inválido informado para cálculo de frete. O CEP de origem (${cleanFrom}) ou o CEP de destino (${cleanTo}) deve possuir exatamente 8 números.`;
      console.warn(`[MELHOR ENVIO] ${errMsg}`);
      await dbOps.addMelhorEnvioLog(
        userId,
        "QUOTE_ERROR",
        "ERROR",
        errMsg,
        JSON.stringify({ original_from: fromPostalCode, original_to: toPostalCode })
      );
      return res.status(400).json({ error: errMsg });
    }

    const payload = {
      from: {
        postal_code: cleanFrom
      },
      to: {
        postal_code: cleanTo
      },
      products: [
        {
          id: "default_item",
          width: Number(width) || 10,
          height: Number(height) || 10,
          length: Number(length) || 10,
          weight: Number(weight) || 1,
          insurance_value: 0,
          quantity: 1
        }
      ]
    };

    await dbOps.addMelhorEnvioLog(
      userId,
      "QUOTE_START",
      "INFO",
      `Iniciando busca de fretes de CEP ${cleanFrom} para CEP ${cleanTo} via API oficial de Produção do Melhor Envio.`,
      JSON.stringify({ payload })
    );

    const headers: Record<string, string> = {
      "Authorization": `Bearer ${meConfig.access_token}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    };
    if (ME_USER_AGENT) headers["User-Agent"] = ME_USER_AGENT;
    else headers["User-Agent"] = "Integração BRT";
    if (ME_USER_EMAIL) headers["email"] = ME_USER_EMAIL;
    else headers["email"] = "eliasrobert45@gmail.com";

    const response = await fetch(`${baseUrl}/api/v2/me/shipment/calculate`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn(`[MELHOR ENVIO] Calculate returned error: ${errorText}`);
      await dbOps.addMelhorEnvioLog(
        userId,
        "QUOTE_FAILED",
        "ERROR",
        "A API do Melhor Envio recusou os parâmetros da simulação de frete.",
        errorText
      );
      return res.status(response.status).json({ error: errorText });
    }

    const rawText = await response.text();
    let data;
    try {
      data = JSON.parse(rawText);
    } catch (parseErr) {
      console.error("[MELHOR ENVIO] Quote response was not valid JSON:", rawText.substring(0, 500));
      await dbOps.addMelhorEnvioLog(
        userId,
        "QUOTE_PARSE_FAILED",
        "ERROR",
        "A API do Melhor Envio retornou um formato de dados inválido (provavelmente HTML).",
        rawText.substring(0, 1000)
      );
      return res.status(500).json({ 
        error: "Melhor Envio retornou formato de dados inválido ao calcular frete (HTML).", 
        html_preview: rawText.substring(0, 1000) 
      });
    }

    const list = Array.isArray(data) ? data : [];
    const formatted = list.map((item: any) => ({
      id: item.id,
      name: item.name,
      price: item.price ? Number(item.price) : 0,
      custom_price: item.custom_price ? Number(item.custom_price) : (item.price ? Number(item.price) : 0),
      discount: item.discount ? Number(item.discount) : 0,
      delivery_time: item.delivery_time || 0,
      error: item.error || null,
      company: item.company ? {
        id: item.company.id,
        name: item.company.name,
        picture: item.company.picture || `https://api.dicebear.com/7.x/initials/svg?seed=${item.company.name}`
      } : {
        id: item.id,
        name: item.name || "Transportadora",
        picture: "https://api.dicebear.com/7.x/initials/svg?seed=ME"
      }
    }));

    await dbOps.addMelhorEnvioLog(
      userId,
      "QUOTE_SUCCESS",
      "SUCCESS",
      `Cotação de fretes realizada com sucesso! Retornadas ${formatted.length} opções disponíveis de entrega no ambiente de Produção.`,
      JSON.stringify(formatted.map(o => ({ transportadora: o.name, preco: `R$ ${o.price}`, prazo: `${o.delivery_time} dias` })))
    );

    return res.json({ connected: true, quotes: formatted });
  } catch (err: any) {
    console.error("Error calculating Melhor Envio quote:", err);
    res.status(500).json({ error: "Erro ao cotar frete no Melhor Envio" });
  }
});

/**
 * Shared OAuth Callback logic for Melhor Envio
 */
export async function melhorenvioCallbackHandler(req: express.Request, res: express.Response) {
  const { code, state } = req.query;

  const userIdFromState = extractUserIdFromState(state);
  const logUserId = userIdFromState || "user_robert"; // default fallback user for logging

  console.log(`[MELHOR ENVIO CALLBACK] Executing handler. Query Params - Code: ${code ? "PRESENT" : "ABSENT"}, State: ${state || "NONE"}`);

  // Register callback initialization log
  await dbOps.addMelhorEnvioLog(
    logUserId,
    "CALLBACK_RECEIVED",
    "INFO",
    `Callback do Melhor Envio alcançado com sucesso pelo navegador. Código (Code) recebido na rota. State: "${state || "nenhum"}"`
  );

  if (!code) {
    const errMsg = "Código de autorização ausente da url callback.";
    await dbOps.addMelhorEnvioLog(logUserId, "CALLBACK_ERROR", "ERROR", errMsg);
    return res.status(400).send(errMsg);
  }

  const rawId = process.env.MELHOR_ENVIO_ID || process.env.MELHOR_ENVIO_CLIENT_ID;
  const rawSecret = process.env.MELHOR_ENVIO_SECRET || process.env.MELHOR_ENVIO_CLIENT_SECRET;

  const clientId = rawId ? String(rawId).replace(/[\s\n\r]/g, "") : "";
  const clientSecret = rawSecret ? String(rawSecret).trim() : "";

  console.log(`[MELHOR ENVIO CALLBACK] Process env parameters resolved. Client ID length: ${clientId.length}, Client Secret length: ${clientSecret.length}`);

  if (!clientId || !clientSecret) {
    const errMsg = "Critical error: Credenciais (MELHOR_ENVIO_ID, MELHOR_ENVIO_SECRET) estão ausentes.";
    console.error(`[MELHOR ENVIO CALLBACK] ${errMsg}`);
    await dbOps.addMelhorEnvioLog(logUserId, "CALLBACK_ERROR", "ERROR", "Variáveis de ambiente MELHOR_ENVIO_ID ou MELHOR_ENVIO_SECRET não estão configuradas no servidor.");
    return res.send(`
      <html>
        <body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; background: #0f1025; padding: 20px; color: white;">
          <div style="background: rgba(255,255,255,0.03); border: 1px border rgba(255,255,255,0.1); padding: 40px; border-radius: 20px; text-align: center; max-width: 500px; width:100%; box-shadow: 0 8px 32px rgba(0,0,0,0.4); backdrop-filter: blur(12px);">
            <svg style="color: #FFE600; width: 64px; height: 64px; margin: auto;" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
            <h2 style="color: #FFE600; margin-top: 20px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px;">Credenciais Ausentes</h2>
            <p style="color: rgba(255,255,255,0.6); margin-top: 15px; font-size: 13px; line-height: 1.6;">O callback de autenticação foi alcançado, mas a sua aplicação ainda não possui as variáveis de ambiente <code>MELHOR_ENVIO_ID</code> e <code>MELHOR_ENVIO_SECRET</code> em seu arquivo <code>.env</code> do painel de controle do AI Studio.</p>
            <button onclick="window.close()" style="margin-top: 25px; background: #3483FA; color: white; border: none; padding: 12px 24px; border-radius: 12px; font-weight: bold; cursor: pointer; transition: opacity 0.2s;">FECHAR ABA</button>
          </div>
        </body>
      </html>
    `);
  }

  try {
    const baseUrl = ME_BASE_URL;
    const redirectUri = getMelhorEnvioRedirectUri(req);

    console.log(`[MELHOR ENVIO] Starting production token exchange. Redirect URI is: ${redirectUri}. URL: ${baseUrl}/oauth/token`);
    
    await dbOps.addMelhorEnvioLog(
      logUserId,
      "TOKEN_EXCHANGE_START",
      "INFO",
      `Solicitando obtenção de token ao Melhor Envio de Produção. Métodos de transporte: JSON -> URL-Encoded. URL: ${baseUrl}/oauth/token`,
      JSON.stringify({
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
        is_sandbox: false
      })
    );

    let tokenResponse;
    let errorDetails = "";
    let usingFormat = "Form-Urlencoded";

    const formBody = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      client_secret: clientSecret,
      code: String(code),
      redirect_uri: redirectUri
    }).toString();

    try {
      console.log(`[MELHOR ENVIO] Trying form-urlencoded token exchange.`);
      tokenResponse = await fetch(`${baseUrl}/oauth/token`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/x-www-form-urlencoded",
          "Accept": "application/json",
          "User-Agent": ME_USER_AGENT || "Mozilla/5.0",
          ...(ME_USER_EMAIL ? { "email": ME_USER_EMAIL } : {})
        },
        body: formBody
      });

      console.log(`[MELHOR ENVIO] Form-urlencoded response status: ${tokenResponse.status}`);
      if (!tokenResponse.ok) {
        const rawErr = await tokenResponse.clone().text();
        errorDetails = `Form error: ${rawErr}`;
        console.warn(`[MELHOR ENVIO] Token request failed: ${rawErr}`);

        // Optional fallback for providers that accept JSON bodies.
        usingFormat = "JSON";
        tokenResponse = await fetch(`${baseUrl}/oauth/token`, {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": ME_USER_AGENT || "Mozilla/5.0",
            ...(ME_USER_EMAIL ? { "email": ME_USER_EMAIL } : {})
          },
          body: JSON.stringify({
            grant_type: "authorization_code",
            client_id: clientId,
            client_secret: clientSecret,
            code: String(code),
            redirect_uri: redirectUri
          })
        });

        console.log(`[MELHOR ENVIO] JSON response status: ${tokenResponse.status}`);
        if (!tokenResponse.ok) {
          const rawErrJson = await tokenResponse.clone().text();
          errorDetails = `${errorDetails} | JSON error: ${rawErrJson}`;
          console.warn(`[MELHOR ENVIO] JSON token request failed: ${rawErrJson}`);
          throw new Error("TOKEN_EXCHANGE_FAILED");
        }
      }
    } catch (jsonErr) {
      throw jsonErr;
    }

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.clone().text();
      console.error(`[MELHOR ENVIO] Both auth formats failed. Error contents: ${errorText}`);
      
      await dbOps.addMelhorEnvioLog(
        logUserId,
        "TOKEN_EXCHANGE_FAILED",
        "ERROR",
        `Erro retornado pelo Melhor Envio ao trocar o CODE por Token de Produção. Tentativas em JSON e Urlencoded falharam.`,
        errorText
      );

      throw new Error(`Troca de código por token falhou em ambos os formatos. Resposta do Melhor Envio: ${errorText} | Detalhes anteriores: ${errorDetails}`);
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;
    
    console.log(`[MELHOR ENVIO] Successfully exchanged token! Access token length: ${accessToken?.length || 0}`);

    await dbOps.addMelhorEnvioLog(
      logUserId,
      "TOKEN_EXCHANGE_SUCCESS",
      "SUCCESS",
      `Autenticação concluída! Token de acesso recebido do Melhor Envio no formato ${usingFormat}.`,
      JSON.stringify({
        token_preview: accessToken ? `${accessToken.substring(0, 10)}***` : "NULL",
        refresh_token_preview: tokenData.refresh_token ? `${tokenData.refresh_token.substring(0, 10)}***` : "NULL",
        expires_in: tokenData.expires_in,
        scope: tokenData.scope
      })
    );

    if (userIdFromState) {
      let expiresAtStr: string | undefined;
      if (tokenData.expires_in) {
        expiresAtStr = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();
      }
      await dbOps.saveMelhorEnvioToken(userIdFromState, accessToken, tokenData.refresh_token, expiresAtStr, false);
      console.log(`[MELHOR ENVIO] Successfully persisted token to Postgres for user ${userIdFromState}. Sandbox: false`);
      
      await dbOps.addMelhorEnvioLog(
        userIdFromState,
        "DB_PERSISTENCE",
        "SUCCESS",
        `Parâmetros e chaves do portal Melhor Envio salvos de forma resiliente no Postgres para o usuário "${userIdFromState}".`
      );
    } else {
      console.warn(`[MELHOR ENVIO] Warning: state parameter "${state}" could not be parsed to a valid user ID. Client-side postMessage/fetch will perform the integration save fallback.`);
      
      await dbOps.addMelhorEnvioLog(
        logUserId,
        "DB_PERSISTENCE_WARNING",
        "INFO",
        `O state recebido ("${state}") não continha um ID de usuário reconhecido. A gravação no banco de dados dependerá da etapa cliente no front-end.`
      );
    }

    res.send(`
      <html>
        <body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; background: #0f1025; padding: 20px; color: white;">
          <div style="background: rgba(255,255,255,0.03); border: 1px border rgba(255,255,255,0.1); padding: 40px; border-radius: 20px; text-align: center; max-width: 400px; width:100%; box-shadow: 0 8px 32px rgba(0,0,0,0.4); backdrop-filter: blur(12px);">
            <svg style="color: #00FF66; width: 64px; height: 64px; margin: auto;" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path></svg>
            <h2 style="color: #00FF66; margin-top: 20px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px;">Melhor Envio Conectado!</h2>
            <p style="color: rgba(255,255,255,0.7); margin-top: 10px; font-size: 13px; line-height: 1.6;">O token de produção real do Melhor Envio foi gerado e associado à sua sessão segura.</p>
            <p style="color: rgba(255,255,255,0.40); margin-top: 10px; font-size: 11px;" id="saving-status">Salvando credenciais com segurança...</p>
            <script>
              try {
                localStorage.setItem("meli_analytics_me_token", ${JSON.stringify(accessToken)});
                localStorage.setItem("meli_analytics_me_connected", "true");
              } catch(e) {
                console.error(e);
              }

              const userToken = localStorage.getItem("ml_user_token");
              const targetRedirect = "/?tab=melhorenvio";

              const doFinish = () => {
                document.getElementById("saving-status").innerText = "Redirecionando de volta ao app...";
                if (window.opener) {
                  console.log("[MELHOR ENVIO POPUP] Emitting success info via postMessage to parent window");
                  window.opener.postMessage({ 
                    type: "OAUTH_AUTH_SUCCESS",
                    accessToken: ${JSON.stringify(accessToken)},
                    isSandbox: false
                  }, "*");
                  setTimeout(() => {
                    window.close();
                  }, 1500);
                } else {
                  setTimeout(() => {
                    window.location.href = targetRedirect;
                  }, 1500);
                }
              };

              // Make a secure frontend POST request using local auth token to guarantee persistence
              if (userToken) {
                console.log("[MELHOR ENVIO WEB] Authenticated session found. Writing background save check to DB...");
                fetch("/api/integrations/melhorenvio/save-token", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "Authorization": "Bearer " + userToken
                  },
                  body: JSON.stringify({
                    token: "${accessToken}"
                  })
                })
                .then(r => r.json())
                .then(data => {
                  console.log("[MELHOR ENVIO WEB] Manual save verified on server:", data);
                  doFinish();
                })
                .catch(err => {
                  console.error("[MELHOR ENVIO WEB] Error writing manual save:", err);
                  doFinish();
                });
              } else {
                console.warn("[MELHOR ENVIO WEB] No auth token found in localStorage.");
                doFinish();
              }
            </script>
          </div>
        </body>
      </html>
    `);
  } catch (realAuthErr: any) {
    console.error("[MELHOR ENVIO] Callback handler error:", realAuthErr);
    
    await dbOps.addMelhorEnvioLog(
      logUserId,
      "CALLBACK_CRITICAL_ERROR",
      "ERROR",
      `Erro fatal de callbacks do Melhor Envio: ${realAuthErr.message || "Erro desconhecido"}`
    );

    res.status(500).send(`
      <html>
        <body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; background: #0f1025; padding: 20px; color: white;">
          <div style="background: rgba(255,255,255,0.03); border: 1px border rgba(255,255,255,0.1); padding: 40px; border-radius: 20px; text-align: center; max-width: 500px; width:100%; box-shadow: 0 8px 32px rgba(0,0,0,0.4); backdrop-filter: blur(12px);">
            <svg style="color: #FF4A4A; width: 64px; height: 64px; margin: auto;" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            <h2 style="color: #FF4A4A; margin-top: 20px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px;">Erro na Integração</h2>
            <p style="color: rgba(255,255,255,0.6); margin-top: 15px; font-size: 13px; line-height: 1.6;">Ocorreu uma falha durante o processo de autenticação com o Melhor Envio.</p>
            <pre style="background: rgba(0,0,0,0.3); border-radius: 8px; color: #FFAAAA; padding: 10px; font-size: 11px; text-align: left; max-height: 150px; overflow-y: auto; margin-top: 15px;">${realAuthErr.message || "Erro desconhecido"}</pre>
            <button onclick="window.close()" style="margin-top: 25px; background: #FF4A4A; color: white; border: none; padding: 12px 24px; border-radius: 12px; font-weight: bold; cursor: pointer;">FECHAR ABA</button>
          </div>
        </body>
      </html>
    `);
  }
}

// Redirect callbacks mapping inside the router itself for cleanliness
melhorenvioRouter.get([
  "/callback", 
  "/callback/",
  "/melhor-envio",
  "/auth/callback",
  "/auth/callback/",
  "/melhor-envio/auth/callback",
  "/melhor-envio/auth/callback/"
], melhorenvioCallbackHandler);

// Retrieve active integration logs for current user session
melhorenvioRouter.get("/logs", requireAuth, async (req, res) => {
  try {
    const userId = getUserIdFromRequest(req);
    const logs = await dbOps.getMelhorEnvioLogs(userId);
    res.json({ logs });
  } catch (err: any) {
    console.error("Error fetching integration logs:", err);
    res.status(500).json({ error: "Erro ao buscar logs." });
  }
});

// Clear active integration logs for current user session
melhorenvioRouter.post("/logs/clear", requireAuth, async (req, res) => {
  try {
    const userId = getUserIdFromRequest(req);
    await dbOps.clearMelhorEnvioLogs(userId);
    res.json({ success: true, message: "Histórico de logs limpo com sucesso." });
  } catch (err: any) {
    console.error("Error clearing integration logs:", err);
    res.status(500).json({ error: "Erro ao limpar logs." });
  }
});

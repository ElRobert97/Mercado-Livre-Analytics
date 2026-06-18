import { pool, dbOps } from "../../db_postgres";

/**
 * Helper to get real shipping fee dynamically via ML Shipments API
 */
export async function getShipmentExtendedData(shipmentId: string | number, accessToken: string): Promise<{
  shipping_amount: number;
  shipping_city?: string;
  shipping_municipality?: string;
  shipping_state?: string;
  shipping_cost_detail?: number;
  ml_shipment_id?: string;
}> {
  const data: {
    shipping_amount: number;
    shipping_city?: string;
    shipping_municipality?: string;
    shipping_state?: string;
    shipping_cost_detail?: number;
    ml_shipment_id?: string;
  } = {
    shipping_amount: 0,
    shipping_city: undefined,
    shipping_municipality: undefined,
    shipping_state: undefined,
    shipping_cost_detail: undefined,
    ml_shipment_id: shipmentId ? String(shipmentId) : undefined
  };

  if (!shipmentId) return data;

  try {
    console.log(`[SHIPMENT] Fetching data for shipment ID: ${shipmentId}`);
    // 1. Get Shipment Core details and Address info
    const url = `https://api.mercadolibre.com/shipments/${shipmentId}`;
    const response = await fetch(url, {
      headers: { 
        "Authorization": `Bearer ${accessToken}`,
        "x-format-new": "true"
      }
    });
    if (response.ok) {
      const result = await response.json();
      console.log(`[SHIPMENT] Successfully fetched shipment ${shipmentId} core detail. Keys:`, Object.keys(result));
      const cost = Number(result?.shipping_option?.cost ?? 0);
      const list_cost = Number(result?.shipping_option?.list_cost ?? 0);
      data.shipping_amount = list_cost - cost;

      const sa = result?.destination?.shipping_address || result?.shipping_address || result?.receiver_address;
      if (sa) {
        console.log(`[SHIPMENT] Found shipping address object. city:`, sa.city, `municipality:`, sa.municipality, `state:`, sa.state);
        if (sa.city) data.shipping_city = sa.city.name || undefined;
        if (sa.municipality) data.shipping_municipality = sa.municipality.name || undefined;
        if (sa.state) data.shipping_state = sa.state.name || undefined;
      } else {
        console.warn(`[SHIPMENT] No shipping address found in the response for shipment ${shipmentId}`);
      }
    } else {
      const errText = await response.text();
      console.warn(`[SHIPMENT] Failed to fetch shipment detail for ${shipmentId}: ${response.status} ${response.statusText} - Response:`, errText);
    }

    // 2. Get Shipment extra costs (/costs endpoint)
    try {
      const costUrl = `https://api.mercadolibre.com/shipments/${shipmentId}/costs`;
      console.log(`[SHIPMENT] Fetching cost info from: ${costUrl}`);
      const costResponse = await fetch(costUrl, {
        headers: { 
          "Authorization": `Bearer ${accessToken}`,
          "x-format-new": "true"
        }
      });
      if (costResponse.ok) {
        const costResult = await costResponse.json();
        console.log(`[SHIPMENT] Successfully fetched shipment ${shipmentId} costs. payload:`, JSON.stringify(costResult));
        // Read senders => cost
        if (Array.isArray(costResult?.senders) && costResult.senders.length > 0) {
          data.shipping_cost_detail = Number(costResult.senders[0]?.cost ?? 0);
        } else if (costResult?.senders && typeof costResult.senders === 'object') {
          data.shipping_cost_detail = Number(costResult.senders.cost ?? 0);
        } else if (costResult?.cost) {
          data.shipping_cost_detail = Number(costResult.cost ?? 0);
        }
        console.log(`[SHIPMENT] Extracted shipping_cost_detail for ${shipmentId}: ${data.shipping_cost_detail}`);
      } else {
        const costErrText = await costResponse.text();
        console.warn(`[SHIPMENT] Failed to fetch shipment costs response for ${shipmentId}: ${costResponse.status} - Response:`, costErrText);
      }
    } catch (ce) {
      console.warn(`Failed to fetch shipments costs for ${shipmentId}:`, ce);
    }
  } catch (err) {
    console.error(`Error querying shipment detail/costs for ${shipmentId}:`, err);
  }

  return data;
}

export async function getShipmentCost(shipmentId: string | number, accessToken: string): Promise<number> {
  const sData = await getShipmentExtendedData(shipmentId, accessToken);
  return sData.shipping_amount;
}

/**
 * Helper to refresh a Mercado Livre account's token
 */
export async function refreshAccountTokenIfNeeded(accId: string, force: boolean = false): Promise<string> {
  const res = await pool.query("SELECT * FROM accounts WHERE id = $1", [accId]);
  const acc = res.rows[0];
  if (!acc) {
    throw new Error(`Conta não encontrada: ${accId}`);
  }

  if (acc.access_token.startsWith("SIM_") || acc.access_token.startsWith("MOCK_")) {
    return acc.access_token;
  }

  // Checking if the token expires soon (within 5 minutes)
  if (!force && acc.token_expires_at) {
    const expiresAt = new Date(acc.token_expires_at).getTime();
    if (expiresAt > Date.now() + 5 * 60 * 1000) {
      return acc.access_token;
    }
  }

  console.log(`[AUTOREFRESH] Renovando token Mercado Livre para a conta: ${acc.nickname || acc.id}`);
  const clientId = process.env.ML_CLIENT_ID || process.env.MERCADOLIVRE_CLIENT_ID;
  const clientSecret = process.env.ML_CLIENT_SECRET || process.env.MERCADOLIVRE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Chaves de API do Mercado Livre (ML_CLIENT_ID, ML_CLIENT_SECRET) não configuradas no ambiente (.env)");
  }

  const refreshResponse = await fetch("https://api.mercadolibre.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: acc.refresh_token
    }).toString()
  });

  if (!refreshResponse.ok) {
    const errorText = await refreshResponse.text();
    console.error(`[AUTOREFRESH ERROR] Falha ao renovar token da conta ${acc.id}: ${errorText}`);
    throw new Error(`Erro de autenticação ao renovar token Mercado Livre: ${errorText}`);
  }

  const freshTokenData = await refreshResponse.json();
  const expiresAt = new Date(Date.now() + freshTokenData.expires_in * 1000).toISOString();

  await dbOps.updateMLAccountTokens(acc.id, freshTokenData.access_token, freshTokenData.refresh_token, expiresAt);
  console.log(`[AUTOREFRESH SUCCESS] Token renovado com sucesso para a conta ${acc.id}`);
  return freshTokenData.access_token;
}

import express from "express";
import { dbOps, pool } from "../../db_postgres";
import { getUserIdFromRequest, requireAuth } from "../helpers/auth";
import { refreshAccountTokenIfNeeded } from "../helpers/mlHelper";
import { normalizeSku } from "../helpers/validation";
import { calculateMedian, normalizeLogisticTypeName } from "../helpers/math";

export const productsRouter = express.Router();

/**
 * Fetch products from Mercado Livre accounts with performance stats
 */
productsRouter.get("/", requireAuth, async (req, res) => {
  try {
    const { accountId, search, status, limit = "40", offset = "0" } = req.query;
    const userId = getUserIdFromRequest(req);

    // 1. Get user accounts
    let accounts = await dbOps.getUserMLAccounts(userId);

    // Filter by accountId if specified
    if (accountId) {
      accounts = accounts.filter(acc => acc.id === accountId);
    }

    if (accounts.length === 0) {
      return res.json({ products: [], total: 0 });
    }

    const itemsLimit = Math.min(Number(limit), 100);
    const itemsOffset = Number(offset);

    let allItemIds: { id: string; accountNickname: string; accountId: string }[] = [];

    // For each account, retrieve list of item IDs
    for (const acc of accounts) {
      let token = acc.access_token;
      try {
        token = await refreshAccountTokenIfNeeded(acc.id);
      } catch (err: any) {
        console.warn(`[PRODUCTS] Failed to refresh token for account ${acc.id}:`, err.message);
      }

      // Search active/inactive/pending items
      let searchUrl = `https://api.mercadolibre.com/users/${acc.ml_user_id}/items/search?limit=100`;
      if (search) {
        searchUrl += `&q=${encodeURIComponent(search as string)}`;
      }
      if (status) {
        searchUrl += `&status=${encodeURIComponent(status as string)}`;
      }

      let mlRes = await fetch(searchUrl, {
        headers: { "Authorization": `Bearer ${token}` }
      });

      if ((mlRes.status === 401 || mlRes.status === 403) && !acc.access_token.startsWith("SIM_") && !acc.access_token.startsWith("MOCK_")) {
        console.log(`[PRODUCTS] Received ${mlRes.status} on searching items. Retrying with direct forced refresh...`);
        try {
          token = await refreshAccountTokenIfNeeded(acc.id, true);
          mlRes = await fetch(searchUrl, {
            headers: { "Authorization": `Bearer ${token}` }
          });
        } catch (rErr: any) {
          console.warn(`[PRODUCTS] Forced refresh for search failed: ${rErr.message}`);
        }
      }

      if (!mlRes.ok) {
        console.warn(`[PRODUCTS] Skip search items call because response returned non-2xx: ${mlRes.status}`);
        continue;
      }

      const searchResult = await mlRes.json();
      const results = searchResult.results || []; // Array of strings (Item IDs)
      results.forEach((id: string) => {
        allItemIds.push({ id, accountNickname: acc.nickname, accountId: acc.id });
      });
    }

    // Total count across selected integrated accounts
    const totalCount = allItemIds.length;

    // Apply pagination on IDs first
    const paginatedIds = allItemIds.slice(itemsOffset, itemsOffset + itemsLimit);

    if (paginatedIds.length === 0) {
      return res.json({ products: [], total: totalCount });
    }

    const accountTokens = new Map<string, string>();
    for (const acc of accounts) {
      let token = acc.access_token;
      try {
        token = await refreshAccountTokenIfNeeded(acc.id);
      } catch {}
      accountTokens.set(acc.id, token);
    }

    const productDetailList: any[] = [];

    // Multiget is best grouped by accountId
    const groupedByAccount = new Map<string, typeof paginatedIds>();
    for (const p of paginatedIds) {
      const arr = groupedByAccount.get(p.accountId) || [];
      arr.push(p);
      groupedByAccount.set(p.accountId, arr);
    }

    // Category Cache to resolve category names to minimize repeat API requests
    const categoryCache = new Map<string, string>();
    const getCategoryName = async (catId: string, token: string) => {
      if (!catId) return "Não categorizado";
      if (categoryCache.has(catId)) return categoryCache.get(catId);
      try {
        const catRes = await fetch(`https://api.mercadolibre.com/categories/${catId}`, {
          headers: { "Authorization": `Bearer ${token}` }
        });
        if (catRes.ok) {
          const catJson = await catRes.json();
          categoryCache.set(catId, catJson.name);
          return catJson.name;
        }
      } catch (err) {
        console.warn(`Failed fetching category name for ${catId}:`, err);
      }
      return catId; // fallback to ID
    };

    for (const [accId, pEntries] of groupedByAccount.entries()) {
      let token = accountTokens.get(accId) || "";
      const idsQuery = pEntries.map(p => p.id).join(",");

      // Fetch details in bulk (up to 20 per call as recommended by Meli API limit rules)
      const detailsUrl = `https://api.mercadolibre.com/items?ids=${idsQuery}`;
      let detRes = await fetch(detailsUrl, {
        headers: { "Authorization": `Bearer ${token}` }
      });

      if ((detRes.status === 401 || detRes.status === 403) && !token.startsWith("SIM_") && !token.startsWith("MOCK_")) {
        console.log(`[PRODUCTS] Received ${detRes.status} on details multiget. Retrying with direct forced refresh...`);
        try {
          token = await refreshAccountTokenIfNeeded(accId, true);
          detRes = await fetch(detailsUrl, {
            headers: { "Authorization": `Bearer ${token}` }
          });
        } catch (rErr: any) {
          console.warn(`[PRODUCTS] Forced refresh for bulk items failed: ${rErr.message}`);
        }
      }

      if (detRes.ok) {
        const resultsArray = await detRes.ok ? await detRes.json() : []; 
        for (const itemWrapper of resultsArray) {
          if (itemWrapper.code === 200 && itemWrapper.body) {
            const body = itemWrapper.body;
            const entry = pEntries.find(p => p.id === body.id);

            // Extract attributes like SKU
            let sku = "N/A";
            if (body.seller_custom_field) {
              sku = body.seller_custom_field;
            } else if (body.attributes) {
              const sellerSkuAttr = body.attributes.find((a: any) => a.id === "SELLER_SKU" || a.name?.toUpperCase() === "SKU");
              if (sellerSkuAttr && sellerSkuAttr.value_name) {
                sku = sellerSkuAttr.value_name;
              }
            }

            // Pad SKU based on the user's SKU padding rule if it is a numeric SKU below 10000
            sku = normalizeSku(sku);

            // Resolve Category Name
            const categoryName = await getCategoryName(body.category_id, token);

            // Standardized logistics name
            const normalizedLogistics = normalizeLogisticTypeName(body.shipping?.logistic_type, body.shipping?.mode);

            productDetailList.push({
              id: body.id,
              accountId: accId,
              title: body.title,
              price: body.price,
              original_price: body.original_price,
              currency_id: body.currency_id,
              thumbnail: body.thumbnail,
              permalink: body.permalink,
              status: body.status,
              condition: body.condition,
              available_quantity: body.available_quantity,
              sold_quantity: body.sold_quantity,
              category_id: body.category_id,
              category_name: categoryName,
              sku: sku,
              listing_type_id: body.listing_type_id,
              shipping_mode: body.shipping?.mode,
              shipping_free: body.shipping?.free_shipping,
              logistic_type: body.shipping?.logistic_type,
              normalized_logistics: normalizedLogistics,
              pictures: body.pictures?.slice(0, 5).map((pic: any) => pic.url || pic.secure_url) || [],
              accountNickname: entry ? entry.accountNickname : "Conta integrada",
              warranty: body.warranty,
              buying_mode: body.buying_mode,
              date_created: body.date_created,
              health: body.health,
              video_id: body.video_id,
              accepts_mercadopago: body.accepts_mercadopago,
              attributes: body.attributes || []
            });
          }
        }
      } else {
        console.warn(`[PRODUCTS] Skip bulk fetch call because response returned non-2xx: ${detRes.status}`);
      }
    }

    // Batch calculate median billing statistics (last 3-month shipments & sales tax/fees) from historical Neon Postgres orders
    const allSkusOnPage = Array.from(new Set(productDetailList.map(p => p.sku).filter(s => s && s !== "N/A")));
    const skuStatsMap = new Map<string, { medianShipping: number; medianFee: number; salesCount: number }>();

    if (allSkusOnPage.length > 0) {
      try {
        const statsQuery = `
          SELECT 
            i.sku,
            o.shipping_cost_detail,
            o.shipping_amount,
            o.marketplace_fee_amount,
            o.total_amount,
            i.total_price,
            i.quantity
          FROM orders o
          JOIN items i ON i.order_id = o.id
          WHERE o.user_id = $1
            AND i.sku = ANY($2)
            AND o.order_date >= NOW() - INTERVAL '3 months'
        `;
        const statsRes = await pool.query(statsQuery, [userId, allSkusOnPage]);
        
        // Group rows by SKU
        const groupedBySku = new Map<string, any[]>();
        for (const r of statsRes.rows) {
          const upSku = r.sku.toUpperCase();
          const arr = groupedBySku.get(upSku) || [];
          arr.push(r);
          groupedBySku.set(upSku, arr);
        }

        // Calculate medians for each SKU group
        for (const [skuStr, rows] of groupedBySku.entries()) {
          const shippingVals: number[] = [];
          const feeVals: number[] = [];
          let totalQty = 0;

          for (const row of rows) {
            const shipDetailNum = row.shipping_cost_detail !== null ? parseFloat(row.shipping_cost_detail) : null;
            const shipAmountNum = row.shipping_amount !== null ? parseFloat(row.shipping_amount) : 0;
            
            const finalShipVal = (shipDetailNum !== null && shipDetailNum > 0) ? shipDetailNum : shipAmountNum;
            shippingVals.push(finalShipVal);

            const mtkFee = parseFloat(row.marketplace_fee_amount || "0");
            const totPrice = parseFloat(row.total_price || "0");
            const totAmt = parseFloat(row.total_amount || "1");
            const qty = parseInt(row.quantity || "1");

            // Compute proportional sales tax fee per item unit
            const proportionalFee = (mtkFee * (totPrice / (totAmt || 1))) / (qty || 1);
            feeVals.push(proportionalFee);

            totalQty += qty;
          }

          skuStatsMap.set(skuStr, {
            medianShipping: calculateMedian(shippingVals),
            medianFee: calculateMedian(feeVals),
            salesCount: totalQty
          });
        }
      } catch (err: any) {
        console.error("[PRODUCTS STATS] Failed to calculate median stats query:", err.message);
      }
    }

    // Inject median stats into mapped listings
    const productsWithStats = productDetailList.map(p => {
      const stats = skuStatsMap.get(p.sku.toUpperCase()) || { medianShipping: 0, medianFee: 0, salesCount: 0 };
      return {
        ...p,
        median_shipping: stats.medianShipping,
        median_fee: stats.medianFee,
        sales_count: stats.salesCount
      };
    });

    res.json({
      products: productsWithStats,
      total: totalCount
    });
  } catch (err: any) {
    res.status(500).json({ error: "Erro ao buscar produtos: " + err.message });
  }
});

/**
 * Update products directly in Mercado Livre
 */
productsRouter.put("/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      accountId, 
      title, 
      price, 
      available_quantity, 
      status, 
      video_id, 
      warranty, 
      sku 
    } = req.body;

    if (!accountId) {
      return res.status(400).json({ error: "O identificador da conta integrada (accountId) é obrigatório." });
    }

    const userId = getUserIdFromRequest(req);

    // Fetch the account to get tokens
    const acc = await dbOps.getAccountById(accountId, userId);
    if (!acc) {
      return res.status(404).json({ error: "Conta integrada não encontrada ou sem privilégio de acesso." });
    }

    let token = acc.access_token;
    try {
      token = await refreshAccountTokenIfNeeded(acc.id);
    } catch (tokenErr: any) {
      return res.status(401).json({ error: "Falha ao renovar token de acesso do Mercado Livre: " + tokenErr.message });
    }

    // Build edit payload
    const updatePayload: any = {};
    if (title !== undefined) updatePayload.title = title;
    if (price !== undefined) updatePayload.price = Number(price);
    if (available_quantity !== undefined) updatePayload.available_quantity = Number(available_quantity);
    if (status !== undefined) updatePayload.status = status;
    if (video_id !== undefined) updatePayload.video_id = video_id || null;
    if (warranty !== undefined) updatePayload.warranty = warranty || null;

    // Handle SKU / seller_custom_field and attributes
    if (sku !== undefined) {
      updatePayload.seller_custom_field = sku;

      try {
        // Fetch current attributes of the item to keep other parameters safe
        const itemRes = await fetch(`https://api.mercadolibre.com/items/${id}`, {
          headers: { "Authorization": `Bearer ${token}` }
        });
        if (itemRes.ok) {
          const itemObj = await itemRes.json();
          const originalAttributes = itemObj.attributes || [];
          
          const updatedAttributes = [...originalAttributes];
          const skuIndex = updatedAttributes.findIndex(a => a.id === "SELLER_SKU");
          if (skuIndex >= 0) {
            updatedAttributes[skuIndex] = { ...updatedAttributes[skuIndex], value_name: sku };
          } else {
            updatedAttributes.push({ id: "SELLER_SKU", value_name: sku });
          }
          updatePayload.attributes = updatedAttributes;
        }
      } catch (attrsErr: any) {
        console.warn(`[PRODUCTS EDIT] Warning while reading original attributes to merge SELLER_SKU:`, attrsErr.message);
      }
    }

    console.log(`[PRODUCTS EDIT] Dispatching PUT request to Mercado Livre items API for ${id}:`, updatePayload);
    const mlResponse = await fetch(`https://api.mercadolibre.com/items/${id}`, {
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(updatePayload)
    });

    if (!mlResponse.ok) {
      let errDetails: any = null;
      let errorMessage = "Erro desconhecido retornado pela API do Mercado Livre.";
      const rawText = await mlResponse.text();

      try {
        errDetails = JSON.parse(rawText);
        errorMessage = errDetails.message || (errDetails.cause && errDetails.cause[0] && errDetails.cause[0].message) || errorMessage;
      } catch (e) {
        console.error(`[PRODUCTS EDIT FAIL] Mercado Livre returned non-JSON or HTML error payload. HTTP ${mlResponse.status}. Header snippet:`, rawText.substring(0, 400));
        if (mlResponse.status === 403) {
          errorMessage = "O Mercado Livre recusou a requisição devido a políticas de segurança (Erro 403 / PolicyAgent). Verifique se a conta integrada possui as permissões comerciais necessárias e se o anúncio permite modificações de preço neste momento.";
        } else if (mlResponse.status === 401) {
          errorMessage = "Sessão expirada ou não autorizada no Mercado Livre. Por favor, tente reconectar sua conta de integração nas configurações.";
        } else {
          errorMessage = `Erro de comunicação ou infraestrutura no Mercado Livre (Código HTTP ${mlResponse.status}).`;
        }
        errDetails = { status: mlResponse.status, rawSnippet: rawText.substring(0, 1000) };
      }

      console.error(`[PRODUCTS EDIT FAIL] Final parsed error message: ${errorMessage}`);
      return res.status(mlResponse.status).json({
        error: `O Mercado Livre recusou a atualização: ${errorMessage}`,
        details: errDetails
      });
    }

    const resJson = await mlResponse.json();
    res.json({ success: true, item: resJson });
  } catch (err: any) {
    console.error("Products edit dispatcher exception:", err);
    res.status(500).json({ error: "Erro ao atualizar produto no Mercado Livre: " + err.message });
  }
});

import { dbOps } from "../../db_postgres";
import { SyncJob, Order, OrderItem } from "../../shared/types";
import { refreshAccountTokenIfNeeded, getShipmentExtendedData } from "../helpers/mlHelper";
import { extractMlSku } from "../helpers/validation";
import { recalculate_order_profit } from "../helpers/profit";

export const syncJobsQueue = new Map<string, SyncJob>();
let isProcessingQueue = false;

/**
 * Triggers background queue processing
 */
export function triggerQueueProcessing() {
  if (isProcessingQueue) {
    return;
  }

  isProcessingQueue = true;

  (async () => {
    try {
      while (true) {
        // Find next waiting / pending job
        let nextJob: SyncJob | null = null;
        for (const [_, job] of syncJobsQueue.entries()) {
          if (job.status === "pending") {
            nextJob = job;
            break;
          }
        }

        if (!nextJob) {
          break; // No more pending jobs
        }

        // Process the job
        await executeSyncJob(nextJob);
      }
    } catch (queueErr) {
      console.error("Queue processor encountered error:", queueErr);
    } finally {
      isProcessingQueue = false;
    }
  })();
}

/**
 * Executes a single sync job
 */
async function executeSyncJob(job: SyncJob) {
  job.status = "processing";
  job.message = "Inicializando sincronização de vendas...";
  job.progress = 5;

  try {
    const userAccounts = await dbOps.getUserMLAccounts(job.userId);
    const realAccounts = userAccounts.filter(
      acc => !acc.access_token.startsWith("SIM_") && !acc.access_token.startsWith("MOCK_")
    );

    if (realAccounts.length === 0) {
      job.status = "failed";
      job.progress = 100;
      job.error = "Por favor, conecte uma conta Mercado Livre real via OAuth no menu Integrações para buscar dados atualizados da API.";
      job.message = "Sincronização desabilitada em contas simulador. Conecte sua conta de produção.";
      return;
    }

    job.progress = 15;
    job.message = "Negociando credenciais reais do Mercado Livre...";
    let syncedCount = 0;
    let accIdx = 0;

    for (const acc of realAccounts) {
      accIdx++;
      job.progress = 15 + Math.floor((accIdx / realAccounts.length) * 65);
      job.message = `Sincronizando transações da loja: ${acc.nickname || acc.id}...`;

      // Wait 1000ms pause to ensure we do not hit database lock or ML rate limits
      await new Promise(resolve => setTimeout(resolve, 1000));

      let activeToken = acc.access_token;
      try {
        activeToken = await refreshAccountTokenIfNeeded(acc.id);
      } catch (authErr: any) {
        console.warn(`[SYNC PRE] Refresh failed:`, authErr.message);
      }

      let mlSearchUrl = `https://api.mercadolibre.com/orders/search?seller=${acc.ml_user_id}`;
      const dateFrom = job.dateFrom;
      const dateTo = job.dateTo;
      if (dateFrom && dateTo) {
        const formattedFrom = `${dateFrom}T00:01:00.000-00:00`;
        const formattedTo = `${dateTo}T23:59:00.000-00:00`;
        mlSearchUrl += `&order.date_created.from=${encodeURIComponent(formattedFrom)}&order.date_created.to=${encodeURIComponent(formattedTo)}`;
      } else {
        const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString().split('T')[0];
        const todayStr = new Date().toISOString().split('T')[0];
        const formattedFrom = `${sixtyDaysAgo}T00:01:00.000-00:00`;
        const formattedTo = `${todayStr}T23:59:00.000-00:00`;
        mlSearchUrl += `&order.date_created.from=${encodeURIComponent(formattedFrom)}&order.date_created.to=${encodeURIComponent(formattedTo)}`;
      }

      let offset = 0;
      while (true) {
        const paginatedUrl = `${mlSearchUrl}&offset=${offset}`;
        let mlResponse = await fetch(paginatedUrl, {
          headers: { "Authorization": `Bearer ${activeToken}` }
        });

        if (!mlResponse.ok && mlResponse.status === 401) {
          try {
            activeToken = await refreshAccountTokenIfNeeded(acc.id, true);
            mlResponse = await fetch(paginatedUrl, {
              headers: { "Authorization": `Bearer ${activeToken}` }
            });
          } catch (err) {
            console.error(err);
          }
        }

        if (!mlResponse.ok) {
          break;
        }

        const resJson = await mlResponse.json();
        const mlOrders = resJson.results || [];
        if (mlOrders.length === 0) {
          break;
        }

        for (const mlOrd of mlOrders) {
          const mlId = String(mlOrd.id);
          const orderIdStr = `ord_ml_${mlId}`;

          const totalAmount = Number(mlOrd.total_amount || 0);
          let shippingPrice = Number(mlOrd.shipping?.cost || 0);
          let shipCity, shipMunicipality, shipState, shipCostDetail, mlShipmentId;

          if (mlOrd.shipping && mlOrd.shipping.id) {
            const sData = await getShipmentExtendedData(mlOrd.shipping.id, activeToken);
            shippingPrice = sData.shipping_amount;
            shipCity = sData.shipping_city;
            shipMunicipality = sData.shipping_municipality;
            shipState = sData.shipping_state;
            shipCostDetail = sData.shipping_cost_detail;
            mlShipmentId = sData.ml_shipment_id;
          }

          const discount = Number(mlOrd.coupon?.amount || 0);
          const saleFee = Number(mlOrd.order_items?.reduce((ttl: number, curr: any) => ttl + Number(curr.sale_fee || 0), 0) || 0);

          const realOrder: Order = {
            id: orderIdStr,
            user_id: job.userId,
            ml_account_id: acc.id,
            ml_order_id: mlId,
            status: mlOrd.status === "paid" ? "paid" : "confirmed",
            order_date: mlOrd.date_created || new Date().toISOString(),
            total_amount: totalAmount,
            shipping_amount: shippingPrice,
            discount_amount: discount,
            marketplace_fee_amount: saleFee,
            net_amount: (totalAmount + shippingPrice) - (discount + saleFee),
            pack_id: mlOrd.pack_id ? String(mlOrd.pack_id) : undefined,
            shipping_city: shipCity,
            shipping_municipality: shipMunicipality,
            shipping_state: shipState,
            shipping_cost_detail: shipCostDetail,
            ml_shipment_id: mlShipmentId,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };

          const dbItems: OrderItem[] = (mlOrd.order_items || []).map((itRow: any, idx: number) => ({
            id: `item_ml_${mlId}_${idx}`,
            order_id: orderIdStr,
            sku: extractMlSku(itRow, idx),
            product_name: String(itRow.item?.title || "Produto Importado ML"),
            quantity: Number(itRow.quantity || 1),
            unit_price: Number(itRow.unit_price || 0),
            total_price: Number(itRow.unit_price || 0) * Number(itRow.quantity || 1),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }));

          await dbOps.saveOrderWithItems(realOrder, dbItems);
          syncedCount++;

          // Yield control briefly (50ms gap) to prevent CPU resource limits
          await new Promise(resolve => setTimeout(resolve, 50));
        }

        const paging = resJson.paging || {};
        const total = Number(paging.total || 0);
        const limit = Number(paging.limit || 50);

        offset += limit;
        if (offset >= total) {
          break;
        }
      }
    }

    // Recalculate order profit in database after syncing
    try {
      await recalculate_order_profit(job.userId);
    } catch (recalcErr) {
      console.warn("Recalculation warns:", recalcErr);
    }

    job.status = "completed";
    job.progress = 100;
    job.countSynced = syncedCount;
    job.message = `Sincronização com Mercado Livre executada! Total de ${syncedCount} transações mapeadas da conta.`;
  } catch (jobErr: any) {
    console.error("Job sync exception:", jobErr);
    job.status = "failed";
    job.progress = 100;
    job.error = jobErr.message;
    job.message = "A tarefa falhou durante o processamento: " + jobErr.message;
  }
}

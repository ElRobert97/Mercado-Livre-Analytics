import express from "express";
import { dbOps } from "../../db_postgres";
import { getUserIdFromRequest, requireAuth } from "../helpers/auth";
import { normalizeSku } from "../helpers/validation";
import { getCalculatedOrdersPostgres, recalculate_order_profit } from "../helpers/profit";
import { syncJobsQueue, triggerQueueProcessing } from "../services/orderSyncService";
import { CalculatedOrder, OrderFinancialSummary, SyncJob } from "../../shared/types";

export const ordersRouter = express.Router();

/**
 * List calculated orders with queries filtering and page pagination
 */
ordersRouter.get("/", requireAuth, async (req, res) => {
  try {
    const userId = getUserIdFromRequest(req);
    let calculated = await getCalculatedOrdersPostgres(userId);

    // Apply queries filtering
    const { status, sku, search, dateFrom, dateTo, accountId } = req.query;

    if (status) {
      calculated = calculated.filter(o => o.status.toLowerCase() === (status as string).toLowerCase());
    }

    if (sku) {
      const normalizedFilterSku = normalizeSku(sku as string).toUpperCase();
      calculated = calculated.filter(o => o.items.some(it => it.sku.toUpperCase() === normalizedFilterSku));
    }

    if (accountId) {
      calculated = calculated.filter(o => {
        return (o.nickname !== undefined && o.id.includes(accountId as string)) || true;
      });
    }

    if (dateFrom) {
      const fromDate = new Date(`${dateFrom}T00:00:00`);
      calculated = calculated.filter(o => new Date(o.order_date) >= fromDate);
    }

    if (dateTo) {
      const toDate = new Date(`${dateTo}T23:59:59.999`);
      calculated = calculated.filter(o => new Date(o.order_date) <= toDate);
    }

    if (search) {
      const searchStr = (search as string).toLowerCase();
      calculated = calculated.filter(o => 
        o.ml_order_id.toLowerCase().includes(searchStr) || 
        o.items.some(it => it.product_name.toLowerCase().includes(searchStr) || it.sku.toLowerCase().includes(searchStr))
      );
    }

    // Sort by date newest first by default
    calculated.sort((a, b) => new Date(b.order_date).getTime() - new Date(a.order_date).getTime());

    // Pagination
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 15;
    const startIndex = (page - 1) * limit;
    const paginated = calculated.slice(startIndex, startIndex + limit);

    res.json({
      orders: paginated,
      total: calculated.length,
      page,
      pages_count: Math.ceil(calculated.length / limit)
    });
  } catch (err: any) {
    res.status(500).json({ error: "Erro ao recuperar pedidos do Postgres: " + err.message });
  }
});

/**
 * Get aggregated sales summary metrics
 */
ordersRouter.get("/summary", requireAuth, async (req, res) => {
  try {
    const userId = getUserIdFromRequest(req);
    const calculated = await getCalculatedOrdersPostgres(userId);

    let revenueGross = 0;
    let revenueNet = 0;
    let totalCost = 0;
    let profit = 0;
    let pendingCostCount = 0;

    // Prevent double counting of shipping received and fees for multiple orders inside a pack
    const processedShippingPacks = new Set<string>();

    calculated.forEach(o => {
      if (o.status.toLowerCase() !== "cancelled") {
        revenueGross += o.total_amount;
        
        if (o.financial_summary) {
          let orderNet = o.financial_summary.revenue_net;

          if (o.pack_id) {
            if (processedShippingPacks.has(o.pack_id)) {
              // Deduct duplicated shipping received since we already consolidated it once for the pack
              orderNet = Math.max(0, orderNet - o.shipping_amount);
            } else {
              processedShippingPacks.add(o.pack_id);
            }
          }
          
          revenueNet += orderNet;
          
          // Sum up ALL costs: Product costs + taxes (icms + difal) + fees (marketplace_fee + shipping_cost_detail)
          const productCost = o.financial_summary.total_cost || 0;
          const tax = o.financial_summary.tax_cost || 0;
          const difal = o.financial_summary.difal_cost || 0;
          const mkt_fee = o.marketplace_fee_amount || 0;
          const ship_detail = o.shipping_cost_detail || 0;
          
          totalCost += (productCost + tax + difal + mkt_fee + ship_detail);
          profit += (o.financial_summary.gross_profit || 0);
        }
      }
      if (o.cost_pending) {
        pendingCostCount++;
      }
    });

    const averageMargin = revenueNet > 0 ? (profit / revenueNet) : 0;

    res.json({
      order_count: calculated.length,
      revenue_gross: revenueGross,
      revenue_net: revenueNet,
      total_cost: totalCost,
      profit,
      average_margin: averageMargin,
      pending_cost_count: pendingCostCount
    });
  } catch (err: any) {
    res.status(500).json({ error: "Erro ao obter sumário financeiro: " + err.message });
  }
});

/**
 * Re-trigger global profit assessment calculations
 */
ordersRouter.post("/recalculate", requireAuth, async (req, res) => {
  try {
    const userId = getUserIdFromRequest(req);
    await recalculate_order_profit(userId);
    res.json({ message: "Reprocessamento concluído! Todos os custos de pedidos e lucros estatais foram recalculados." });
  } catch (err: any) {
    res.status(500).json({ error: "Erro ao reprocessar os lucros dos pedidos: " + err.message });
  }
});

/**
 * Queue sync worker trigger to refresh orders from Mercado Livre
 */
ordersRouter.post("/sync", requireAuth, async (req, res) => {
  try {
    const userId = getUserIdFromRequest(req);
    const userAccounts = await dbOps.getUserMLAccounts(userId);
    if (userAccounts.length === 0) {
      return res.status(400).json({ error: "Sincronização impossível. Conecte pelo menos uma conta Mercado Livre primeiro!" });
    }

    const dateFrom = req.query.dateFrom || req.body?.dateFrom;
    const dateTo = req.query.dateTo || req.body?.dateTo;

    // Check for any currently active jobs for this user
    const activeUserJobs = Array.from(syncJobsQueue.values()).filter(
      j => j.userId === userId && (j.status === "pending" || j.status === "processing")
    );
    if (activeUserJobs.length > 0) {
      return res.status(400).json({ 
        error: "Já existe uma tarefa de sincronização ativa para sua conta na fila de processamento secundário de jobs." 
      });
    }

    // Create and enqueue a sync job
    const jobId = `sync_job_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const newJob: SyncJob = {
      id: jobId,
      userId,
      status: "pending",
      progress: 0,
      message: "Tarefa adicionada à fila de processamento secundário...",
      dateFrom: dateFrom ? String(dateFrom) : undefined,
      dateTo: dateTo ? String(dateTo) : undefined
    };

    syncJobsQueue.set(jobId, newJob);

    // Trigger queue processing asynchronously
    triggerQueueProcessing();

    res.status(202).json({
      message: "Sincronização adicionada à fila com sucesso.",
      jobId,
      status: "pending"
    });
  } catch (err: any) {
    res.status(500).json({ error: "Erro de fila: " + err.message });
  }
});

/**
 * Get job status details
 */
ordersRouter.get("/sync/status/:id", requireAuth, (req, res) => {
  const jobId = req.params.id;
  const job = syncJobsQueue.get(jobId);
  if (!job) {
    return res.status(404).json({ error: "Tarefa de sincronização não localizada." });
  }
  const userId = getUserIdFromRequest(req);
  if (job.userId !== userId) {
    return res.status(403).json({ error: "Acesso não autorizado a esta tarefa!" });
  }
  res.json(job);
});

/**
 * Get individual order details
 */
ordersRouter.get("/:id", requireAuth, async (req, res) => {
  const orderId = req.params.id;
  try {
    const userId = getUserIdFromRequest(req);
    const calculated = await getCalculatedOrdersPostgres(userId);
    const order = calculated.find(o => o.id === orderId);

    if (!order) {
      return res.status(404).json({ error: "Pedido não encontrado." });
    }

    // Check ownership
    const dbOrder = await dbOps.getOrderById(orderId, userId);
    if (!dbOrder) {
      return res.status(403).json({ error: "Calma! Você não tem autorização para ler este pedido." });
    }

    res.json(order);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

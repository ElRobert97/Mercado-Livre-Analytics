import express from "express";
import { ai } from "../helpers/gemini";
import { dbOps } from "../../db_postgres";
import { getUserIdFromRequest, requireAuth } from "../helpers/auth";
import { getCalculatedOrdersPostgres } from "../helpers/profit";

export const dashboardRouter = express.Router();

/**
 * Returns overall business statistics and daily gross metrics for the 14-day history chart
 */
dashboardRouter.get("/overview", requireAuth, async (req, res) => {
  try {
    const userId = getUserIdFromRequest(req);
    let calculated = await getCalculatedOrdersPostgres(userId);

    const { dateFrom, dateTo } = req.query;
    if (dateFrom) {
      const fromDate = new Date(`${dateFrom}T00:00:00`);
      calculated = calculated.filter(o => new Date(o.order_date) >= fromDate);
    }
    if (dateTo) {
      const toDate = new Date(`${dateTo}T23:59:59.999`);
      calculated = calculated.filter(o => new Date(o.order_date) <= toDate);
    }

    let revenueGross = 0;
    let revenueNet = 0;
    let totalCost = 0;
    let profit = 0;
    let costPendingCount = 0;

    // Rule 4 (pack_id): Prevent double counting of shipping amount received or fees in multiple packaging orders.
    const processedShippingPacks = new Set<string>();

    calculated.forEach(o => {
      if (o.status.toLowerCase() !== "cancelled") {
        revenueGross += o.total_amount;
        if (o.financial_summary) {
          let orderNetResult = o.financial_summary.revenue_net;

          if (o.pack_id) {
            if (processedShippingPacks.has(o.pack_id)) {
              // Deduct duplicated shipping cost that belongs to the unified package
              orderNetResult = Math.max(0, orderNetResult - o.shipping_amount);
            } else {
              processedShippingPacks.add(o.pack_id);
            }
          }

          revenueNet += orderNetResult;
          
          // Sum up ALL costs: Product costs + taxes + fees
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
        costPendingCount++;
      }
    });

    const averageMargin = revenueNet > 0 ? (profit / revenueNet) : 0;

    // Group chart points by date
    const dateMap = new Map<string, { date: string; gross: number; net: number; cost: number; profit: number }>();
    
    const processedChartPacks = new Set<string>();

    calculated.forEach(o => {
      if (o.status.toLowerCase() === "cancelled") return;
      const dateStr = new Date(o.order_date).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
      const existing = dateMap.get(dateStr) || { date: dateStr, gross: 0, net: 0, cost: 0, profit: 0 };
      
      existing.gross += o.total_amount;
      if (o.financial_summary) {
        let netContrib = o.financial_summary.revenue_net;

        if (o.pack_id) {
          if (processedChartPacks.has(o.pack_id)) {
            netContrib = Math.max(0, netContrib - o.shipping_amount);
          } else {
            processedChartPacks.add(o.pack_id);
          }
        }

        const productCost = o.financial_summary.total_cost || 0;
        const tax = o.financial_summary.tax_cost || 0;
        const difal = o.financial_summary.difal_cost || 0;
        const mkt_fee = o.marketplace_fee_amount || 0;
        const ship_detail = o.shipping_cost_detail || 0;
        const unifiedCost = productCost + tax + difal + mkt_fee + ship_detail;

        existing.net += netContrib;
        existing.cost += unifiedCost;
        existing.profit += (o.financial_summary.gross_profit || 0);
      }
      dateMap.set(dateStr, existing);
    });

    const chartData = Array.from(dateMap.values()).slice(-14).map(item => ({
      ...item,
      gross: Number(Number(item.gross).toFixed(2)),
      net: Number(Number(item.net).toFixed(2)),
      cost: Number(Number(item.cost).toFixed(2)),
      profit: Number(Number(item.profit).toFixed(2))
    }));

    res.json({
      metrics: {
        revenue_gross: revenueGross,
        revenue_net: revenueNet,
        total_cost: totalCost,
        profit,
        average_margin: averageMargin,
        cost_pending_count: costPendingCount
      },
      chart_data: chartData
    });
  } catch (err: any) {
    res.status(500).json({ error: "Erro de painel geral: " + err.message });
  }
});

/**
 * Lists top selling SKU listings across multiple sorting metrics
 */
dashboardRouter.get("/top-products", requireAuth, async (req, res) => {
  try {
    const userId = getUserIdFromRequest(req);
    let calculated = await getCalculatedOrdersPostgres(userId);

    const { dateFrom, dateTo } = req.query;
    if (dateFrom) {
      const fromDate = new Date(`${dateFrom}T00:00:00`);
      calculated = calculated.filter(o => new Date(o.order_date) >= fromDate);
    }
    if (dateTo) {
      const toDate = new Date(`${dateTo}T23:59:59.999`);
      calculated = calculated.filter(o => new Date(o.order_date) <= toDate);
    }

    const topOrders = calculated.filter(o => o.status.toLowerCase() !== "cancelled");

    const productMap = new Map<string, { sku: string; product_name: string; sales_count: number; qty_sold: number; revenue_bruta: number; revenue_liquida: number; total_cost: number; profit: number }>();

    topOrders.forEach(order => {
      order.items.forEach(item => {
        const skuUpper = item.sku.toUpperCase();
        const existing = productMap.get(skuUpper) || {
          sku: item.sku,
          product_name: item.product_name,
          sales_count: 0,
          qty_sold: 0,
          revenue_bruta: 0,
          revenue_liquida: 0,
          total_cost: 0,
          profit: 0
        };

        existing.sales_count += 1;
        existing.qty_sold += item.quantity;
        existing.revenue_bruta += item.total_price;
        
        const orderSummary = order.financial_summary;
        if (orderSummary) {
          const itemWeight = order.total_amount > 0 ? (item.total_price / order.total_amount) : 0;
          const assignedNet = itemWeight * orderSummary.revenue_net;
          
          // Allocate proportional all-inclusive costs (SKU cost + taxes + fees + shipping)
          const itemProductCost = item.cost_total || 0;
          const itemTax = (orderSummary.tax_cost || 0) * itemWeight;
          const itemDifal = (orderSummary.difal_cost || 0) * itemWeight;
          const itemMktFee = (order.marketplace_fee_amount || 0) * itemWeight;
          const itemShipDetail = (order.shipping_cost_detail || 0) * itemWeight;

          const assignedCost = itemProductCost + itemTax + itemDifal + itemMktFee + itemShipDetail;

          existing.revenue_liquida += assignedNet;
          existing.total_cost += assignedCost;
          existing.profit += (assignedNet - assignedCost);
        }

        productMap.set(skuUpper, existing);
      });
    });

    const topList = Array.from(productMap.values()).map(prod => {
      const unitPrice = prod.qty_sold > 0 ? (prod.revenue_bruta / prod.qty_sold) : 0;
      const margin = prod.revenue_bruta > 0 ? (prod.profit / prod.revenue_bruta) : 0;
      return {
        ...prod,
        unit_price: Number(unitPrice.toFixed(2)),
        margin: Number(margin.toFixed(4))
      };
    });

    const topByProfit = [...topList].sort((a,b) => b.profit - a.profit).slice(0, 5);
    const topByRevenue = [...topList].sort((a,b) => b.revenue_bruta - a.revenue_bruta).slice(0, 5);
    const topByQtySold = [...topList].sort((a, b) => b.qty_sold - a.qty_sold).slice(0, 5);
    const topByMargin = [...topList].sort((a, b) => b.margin - a.margin).slice(0, 5);
    const topByExpensive = [...topList].sort((a, b) => b.unit_price - a.unit_price).slice(0, 5);
    const topLessLucrative = [...topList].sort((a, b) => a.profit - b.profit).slice(0, 5);

    res.json({
      by_profit: topByProfit,
      by_revenue: topByRevenue,
      by_qty_sold: topByQtySold,
      by_margin: topByMargin,
      by_expensive: topByExpensive,
      by_less_lucrative: topLessLucrative
    });
  } catch (err: any) {
    res.status(500).json({ error: "Erro de produtos principais: " + err.message });
  }
});

/**
 * Filter orders seeking those with cost_pending alert flag
 */
dashboardRouter.get("/orders-without-cost", requireAuth, async (req, res) => {
  try {
    const userId = getUserIdFromRequest(req);
    const calculated = await getCalculatedOrdersPostgres(userId);
    const pendingOrders = calculated.filter(o => o.cost_pending);
    res.json(pendingOrders);
  } catch (err: any) {
    res.status(500).json({ error: "Erro ao buscar vendas pendentes: " + err.message });
  }
});

/**
 * Gemini-based AI Advisor report generation
 */
dashboardRouter.post("/ai-advisor", requireAuth, async (req, res) => {
  if (!ai) {
    return res.status(503).json({
      error: "Serviço de Inteligência Artificial indisponível hoje. Certifique-se de configurar a variável de ambiente GEMINI_API_KEY."
    });
  }

  try {
    const userId = getUserIdFromRequest(req);
    let calculated = await getCalculatedOrdersPostgres(userId);

    const { dateFrom, dateTo } = req.query;
    if (dateFrom) {
      const fromDate = new Date(`${dateFrom}T00:00:00`);
      calculated = calculated.filter(o => new Date(o.order_date) >= fromDate);
    }
    if (dateTo) {
      const toDate = new Date(`${dateTo}T23:59:59.999`);
      calculated = calculated.filter(o => new Date(o.order_date) <= toDate);
    }

    const dbAccounts = await dbOps.getUserMLAccounts(userId);

    let revenueGross = 0;
    let revenueNet = 0;
    let totalCost = 0;
    let profit = 0;
    let countWithCostPending = 0;
    const connectedNicknames = dbAccounts.map(a => a.nickname);

    const processedShippingPacks = new Set<string>();

    calculated.forEach(o => {
      if (o.status.toLowerCase() !== "cancelled") {
        revenueGross += o.total_amount;
        if (o.financial_summary) {
          let netVal = o.financial_summary.revenue_net;

          if (o.pack_id) {
            if (processedShippingPacks.has(o.pack_id)) {
              netVal = Math.max(0, netVal - o.shipping_amount);
            } else {
              processedShippingPacks.add(o.pack_id);
            }
          }

          revenueNet += netVal;
          totalCost += o.financial_summary.total_cost;
        }
      }
      if (o.cost_pending) {
        countWithCostPending++;
      }
    });

    profit = isNaN(revenueNet - totalCost) ? 0 : (revenueNet - totalCost);
    const averageMargin = revenueNet > 0 ? (profit / revenueNet) : 0;

    // Group products to highlight to AI
    const itemMap = new Map<string, { name: string; qty: number; gross: number }>();
    calculated.forEach(o => {
      if (o.status.toLowerCase() === "cancelled") return;
      o.items.forEach(it => {
        const key = `${it.sku} - ${it.product_name}`;
        const current = itemMap.get(key) || { name: it.product_name, qty: 0, gross: 0 };
        current.qty += it.quantity;
        current.gross += it.total_price;
        itemMap.set(key, current);
      });
    });

    const productsList = Array.from(itemMap.entries()).map(([key, data]) => ({
      skuName: key,
      unitsSold: data.qty,
      totalSales: data.gross
    })).slice(0, 10);

    const prompt = `Analise a saúde financeira da minha operação de e-commerce integrada com o Mercado Livre e me dê recomendações analíticas profundas em português brasileiro.
Aqui estão as estatísticas consolidadas nos últimos dias salvas no banco Neon PostgreSQL:
- Contas Mercado Livre Integradas: ${connectedNicknames.join(", ") || "Nenhuma conectada"}
- Faturamento Bruto: R$ ${revenueGross.toFixed(2)}
- Receita Líquida (após fretes dados, descontos e taxas do marketplace, expurgando duplicidade de envios no mesmo pack_id): R$ ${revenueNet.toFixed(2)}
- Custo dos Produtos Vendidos (COGS): R$ ${totalCost.toFixed(2)}
- Lucro Real (Lucro Líquido): R$ ${profit.toFixed(2)}
- Margem de Lucro Média: ${(averageMargin * 100).toFixed(1)}%
- Produtos com Custo Unitário Pendente (não cadastrado): ${countWithCostPending} SKUs pendentes.

Produtos vendidos listados com quantidades vendidas e faturamento bruto:
${JSON.stringify(productsList, null, 2)}

Forneça um feedback estruturado e muito rico contendo:
1. Uma avaliação geral rápida da saúde operacional e lucratividade da loja.
2. Identificação de vulnerabilidades (especialmente alertando sobre custos pendentes que sabotam a apuração ou produtos com margens perigosamente baixas).
3. 3 ou 4 conselhos estratégicos específicos para subir margens, otimizar comissão, otimizar política de descontos ou recalcular preços.

Escreva de forma extremamente profissional, elegante, encorajadora, em tom altamente especializado de analista de e-commerce para consultoria de elite. Use formatação limpa em Markdown.`;

    // Use modern gemini model alias
    const response = await ai.models.generateContent({
      model: "gemini-2.1-flash",
      contents: prompt,
    });

    res.json({
      advice: response.text || "Sem recomendações geradas no momento."
    });

  } catch (apiError: any) {
    console.error("Gemini Advisor API Error:", apiError);
    res.status(500).json({ error: "Erro de processamento da IA: " + apiError.message });
  }
});

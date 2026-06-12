import { CalculatedOrder, MercadoLivreAccount, ProductCost, CostImportBatch, OrderFinancialSummary, StateTaxProfile } from "../types";

// Setup base URL which is empty by default since it proxies Express server
const BASE_URL = "";

export async function checkAuth() {
  const res = await fetch(`${BASE_URL}/api/auth/me`);
  return res.json();
}

export async function login(email: string, password: string) {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Erro ao realizar login");
  }
  return res.json();
}

export async function register(name: string, email: string, password: string) {
  const res = await fetch(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, password })
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Erro ao realizar cadastro");
  }
  return res.json();
}

export async function logout() {
  const res = await fetch(`${BASE_URL}/api/auth/logout`, { method: "POST" });
  return res.json();
}

export async function getMLAccounts(): Promise<MercadoLivreAccount[]> {
  const res = await fetch(`${BASE_URL}/api/integrations/mercadolivre/accounts`);
  if (!res.ok) throw new Error("Erro ao buscar contas integradas");
  return res.json();
}

export async function connectMockAccount(nickname: string): Promise<MercadoLivreAccount> {
  const res = await fetch(`${BASE_URL}/api/integrations/mercadolivre/connect-simulation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nickname })
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Erro ao conectar conta simulada");
  }
  return res.json();
}

export async function deleteMLAccount(id: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/integrations/mercadolivre/accounts/${id}`, {
    method: "DELETE"
  });
  if (!res.ok) throw new Error("Erro ao remover conta integrada");
}

export async function getOrders(params: {
  page?: number;
  limit?: number;
  status?: string;
  sku?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
}): Promise<{ orders: CalculatedOrder[]; total: number; page: number; pages_count: number }> {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, val]) => {
    if (val !== undefined && val !== "") {
      query.set(key, String(val));
    }
  });

  const res = await fetch(`${BASE_URL}/api/orders?${query.toString()}`);
  if (!res.ok) throw new Error("Erro ao buscar pedidos");
  return res.json();
}

export async function getOrderDetails(id: string): Promise<CalculatedOrder> {
  const res = await fetch(`${BASE_URL}/api/orders/${id}`);
  if (!res.ok) throw new Error("Erro ao buscar detalhes do pedido");
  return res.json();
}

export async function syncMLOrders(dateFrom?: string, dateTo?: string): Promise<{ message: string; countSynced: number }> {
  const query = new URLSearchParams();
  if (dateFrom) query.set("dateFrom", dateFrom);
  if (dateTo) query.set("dateTo", dateTo);
  const res = await fetch(`${BASE_URL}/api/orders/sync?${query.toString()}`, { method: "POST" });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Erro ao sincronizar pedidos");
  }
  return res.json();
}

export async function getMLProducts(params: {
  accountId?: string;
  search?: string;
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<{ products: any[]; total: number }> {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, val]) => {
    if (val !== undefined && val !== "") {
      query.set(key, String(val));
    }
  });

  const res = await fetch(`${BASE_URL}/api/products?${query.toString()}`);
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Erro ao carregar anúncios");
  }
  return res.json();
}

export async function updateMLProduct(
  id: string,
  data: {
    accountId: string;
    title?: string;
    price?: number;
    available_quantity?: number;
    status?: string;
    video_id?: string;
    warranty?: string;
    sku?: string;
  }
): Promise<{ success: boolean; message: string; item: any }> {
  const res = await fetch(`${BASE_URL}/api/products/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Erro ao atualizar anúncio");
  }
  return res.json();
}

export async function getProductCosts(): Promise<ProductCost[]> {
  const res = await fetch(`${BASE_URL}/api/costs`);
  if (!res.ok) throw new Error("Erro ao buscar custos de produtos");
  return res.json();
}

export async function createOrUpdateCost(cost: {
  sku: string;
  product_name?: string;
  cost_unitary: number;
  currency?: string;
}): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/costs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cost)
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Erro ao cadastrar custo");
  }
}

export async function deleteCost(id: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/costs/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Erro ao remover custo");
}

export async function importCostsCSV(csvData: string, fileName: string): Promise<{ message: string; batch: CostImportBatch }> {
  const res = await fetch(`${BASE_URL}/api/costs/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ csvData, fileName })
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Erro ao importar planilha");
  }
  return res.json();
}

export async function getImportBatches(): Promise<CostImportBatch[]> {
  const res = await fetch(`${BASE_URL}/api/costs/history/batches`);
  if (!res.ok) throw new Error("Erro ao buscar histórico de lotes");
  return res.json();
}

export async function getDashboardOverview(dateFrom?: string, dateTo?: string): Promise<{
  metrics: {
    revenue_gross: number;
    revenue_net: number;
    total_cost: number;
    profit: number;
    average_margin: number;
    cost_pending_count: number;
  };
  chart_data: Array<{
    date: string;
    gross: number;
    net: number;
    cost: number;
    profit: number;
  }>;
}> {
  const query = new URLSearchParams();
  if (dateFrom) query.set("dateFrom", dateFrom);
  if (dateTo) query.set("dateTo", dateTo);
  const res = await fetch(`${BASE_URL}/api/dashboard/overview?${query.toString()}`);
  if (!res.ok) throw new Error("Erro ao buscar visão geral");
  return res.json();
}

export async function getTopProducts(dateFrom?: string, dateTo?: string): Promise<{
  by_profit: Array<{
    sku: string;
    product_name: string;
    sales_count: number;
    qty_sold: number;
    revenue_bruta: number;
    revenue_liquida: number;
    total_cost: number;
    profit: number;
  }>;
  by_revenue: Array<{
    sku: string;
    product_name: string;
    sales_count: number;
    qty_sold: number;
    revenue_bruta: number;
    revenue_liquida: number;
    total_cost: number;
    profit: number;
  }>;
}> {
  const query = new URLSearchParams();
  if (dateFrom) query.set("dateFrom", dateFrom);
  if (dateTo) query.set("dateTo", dateTo);
  const res = await fetch(`${BASE_URL}/api/dashboard/top-products?${query.toString()}`);
  if (!res.ok) throw new Error("Erro ao buscar produtos principais");
  return res.json();
}

export async function getOrdersWithoutCost(): Promise<CalculatedOrder[]> {
  const res = await fetch(`${BASE_URL}/api/dashboard/orders-without-cost`);
  if (!res.ok) throw new Error("Erro ao buscar itens pendentes de custo");
  return res.json();
}

export async function getAiAdvisorReport(dateFrom?: string, dateTo?: string): Promise<{ advice: string }> {
  const query = new URLSearchParams();
  if (dateFrom) query.set("dateFrom", dateFrom);
  if (dateTo) query.set("dateTo", dateTo);
  const res = await fetch(`${BASE_URL}/api/dashboard/ai-advisor?${query.toString()}`, { method: "POST" });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Erro de resposta da IA");
  }
  return res.json();
}

export async function getStateTaxFactors(): Promise<any[]> {
  const res = await fetch(`${BASE_URL}/api/tax-factors`);
  if (!res.ok) throw new Error("Erro ao buscar fatores tributários");
  return res.json();
}

export async function updateStateTaxFactor(id: string, taxFactor: number, active: boolean): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/tax-factors/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tax_factor: taxFactor, active })
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Erro ao atualizar fator tributário");
  }
}

export async function recalculateOrderProfit(): Promise<{ message: string }> {
  const res = await fetch(`${BASE_URL}/api/orders/recalculate`, { method: "POST" });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Erro ao reprocessar lucros dos pedidos");
  }
  return res.json();
}

export async function getStateTaxProfiles(): Promise<StateTaxProfile[]> {
  const res = await fetch(`${BASE_URL}/api/tax-profiles`);
  if (!res.ok) throw new Error("Erro ao buscar perfis tributários");
  return res.json();
}

export async function updateStateTaxProfile(profile: StateTaxProfile): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/tax-profiles/${profile.state_code}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(profile)
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Erro ao atualizar perfil tributário");
  }
}

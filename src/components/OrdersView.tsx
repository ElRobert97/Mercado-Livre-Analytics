import React, { useEffect, useState } from "react";
import { getOrders, getOrderDetails, syncMLOrders } from "../services/api";
import { CalculatedOrder } from "../types";
import { Search, Filter, AlertCircle, ShoppingBag, Eye, Calendar, Sparkles, X, XCircle, ArrowUpRight, DollarSign, Wallet, RefreshCw, Landmark } from "lucide-react";
import TaxFactorsConfig from "./TaxFactorsConfig";

export default function OrdersView() {
  const [orders, setOrders] = useState<CalculatedOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setPagesCount] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search/Filter states
  const [activeTab, setActiveTab] = useState<"orders" | "tax">("orders");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [sku, setSku] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Detailed Modal states
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [detailOrder, setDetailOrder] = useState<CalculatedOrder | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const loadOrders = async (targetPage = page) => {
    setLoading(true);
    setError(null);
    try {
      const res = await getOrders({
        page: targetPage,
        limit: 10,
        status,
        sku,
        search,
        dateFrom,
        dateTo
      });
      setOrders(res.orders);
      setTotal(res.total);
      setPagesCount(res.pages_count);
      setPage(res.page);
    } catch (err: any) {
      setError(err.message || "Erro ao carregar lista de pedidos");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders(1);
  }, [status, dateFrom, dateTo]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadOrders(1);
  };

  // Detailed Order Drawer Loader
  const handleOpenDetail = async (id: string) => {
    setSelectedOrderId(id);
    setDetailLoading(true);
    setDetailError(null);
    try {
      const res = await getOrderDetails(id);
      setDetailOrder(res);
    } catch (err: any) {
      setDetailError(err.message || "Erro ao obter detalhes financeiros do pedido");
    } finally {
      setDetailLoading(false);
    }
  };

  const handleCloseDetail = () => {
    setSelectedOrderId(null);
    setDetailOrder(null);
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);
  };

  const formatDate = (isoStr: string) => {
    return new Date(isoStr).toLocaleDateString("pt-BR", { 
      day: "2-digit", 
      month: "2-digit", 
      year: "numeric", 
      hour: "2-digit", 
      minute: "2-digit" 
    });
  };

  return (
    <div className="max-w-7xl mx-auto px-1 space-y-6 pb-16">
      {/* Dynamic Tab Toggle */}
      <div className="flex border-b border-white/10 gap-6">
        <button
          onClick={() => setActiveTab("orders")}
          className={`pb-4 text-xs font-black uppercase tracking-wider transition-all border-b-2 flex items-center gap-2 cursor-pointer ${
            activeTab === "orders"
              ? "border-yellow-400 text-yellow-400"
              : "border-transparent text-white/40 hover:text-white/60"
          }`}
          id="tab-orders"
        >
          <ShoppingBag className="h-4 w-4" />
          Pedidos Integrados
        </button>
        <button
          onClick={() => setActiveTab("tax")}
          className={`pb-4 text-xs font-black uppercase tracking-wider transition-all border-b-2 flex items-center gap-2 cursor-pointer ${
            activeTab === "tax"
              ? "border-yellow-400 text-yellow-400"
              : "border-transparent text-white/40 hover:text-white/60"
          }`}
          id="tab-tax-config"
        >
          <Landmark className="h-4 w-4" />
          Fatores de Imposto por Estado
        </button>
      </div>

      {activeTab === "tax" ? (
        <TaxFactorsConfig onRecalculateComplete={() => loadOrders(1)} />
      ) : (
        <>
          {/* Search & Filter cards */}
          <div className="glass-card rounded-2xl p-6 relative overflow-hidden">
        <form onSubmit={handleSearchSubmit} className="space-y-4">
          <div className="flex flex-col md:flex-row gap-4">
            {/* Search Input bar */}
            <div className="relative flex-1">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-white/30">
                <Search className="h-4.5 w-4.5" />
              </span>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por ID do Pedido, SKU, ou Nome do produto..."
                className="pl-10 pr-4 py-3 bg-[#0a0b1c]/90 relative block w-full rounded-xl border border-white/10 placeholder-white/30 text-white text-xs focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 transition-all font-semibold"
              />
            </div>

            {/* SKU Specific Search input */}
            <div className="w-full md:w-48 relative">
              <input
                type="text"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                placeholder="SKU exato..."
                className="px-4 py-3 bg-[#0a0b1c]/90 relative block w-full rounded-xl border border-white/10 placeholder-white/30 text-white text-xs focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 transition-all font-semibold"
              />
            </div>

            {/* Status Select bar */}
            <div className="w-full md:w-48">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="px-4 py-3 bg-[#0a0b1c]/95 relative block w-full rounded-xl border border-white/10 text-white text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 cursor-pointer"
              >
                <option value="" className="bg-[#0f1025] text-white">Todos os status</option>
                <option value="paid" className="bg-[#0f1025] text-white">Confirmados (Aprovado)</option>
                <option value="confirmed" className="bg-[#0f1025] text-white">Aguardando Pagto</option>
                <option value="cancelled" className="bg-[#0f1025] text-white">Cancelados</option>
              </select>
            </div>

            <button
              type="submit"
              className="bg-[#3483FA] text-white hover:bg-[#3483FA]/80 font-bold text-xs py-3 px-6 rounded-xl hover:scale-[1.02] transition-colors border border-[#3483FA]/20 cursor-pointer shrink-0"
            >
              PESQUISAR
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs font-semibold text-white/50 pt-3 border-t border-white/5">
            <span className="flex items-center gap-1.5"><Calendar className="h-4 w-4 text-white/40" /> Período comercial:</span>
            <div className="flex items-center gap-3">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="bg-[#0a0b1c] text-white rounded-xl border border-white/10 p-2 font-bold text-[10px] uppercase tracking-wider focus:outline-none focus:ring-1 focus:ring-yellow-400 cursor-pointer [color-scheme:dark]"
              />
              <span className="text-white/30 text-[10px] uppercase tracking-wider">até</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="bg-[#0a0b1c] text-white rounded-xl border border-white/10 p-2 font-bold text-[10px] uppercase tracking-wider focus:outline-none focus:ring-1 focus:ring-yellow-400 cursor-pointer [color-scheme:dark]"
              />

              {dateFrom && dateTo && (
                <button
                  type="button"
                  onClick={async () => {
                    setLoading(true);
                    setError(null);
                    try {
                      const res = await syncMLOrders(dateFrom, dateTo);
                      alert(res.message);
                      loadOrders(1);
                    } catch (err: any) {
                      setError(err.message || "Erro ao sincronizar período");
                    } finally {
                      setLoading(false);
                    }
                  }}
                  disabled={loading}
                  className="flex items-center gap-1.5 bg-yellow-400 hover:bg-yellow-350 text-slate-950 font-black text-[9px] uppercase tracking-wider px-3.5 py-2 rounded-xl transition-all cursor-pointer shadow-lg active:scale-95 disabled:opacity-50"
                  title="Sincroniza do Mercado Livre apenas os pedidos dentro desta faixa de datas"
                >
                  <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
                  Sincronizar Período
                </button>
              )}
            </div>
            
            {/* Soft cleaners buttons */}
            {(search || sku || status || dateFrom || dateTo) && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setSku("");
                  setStatus("");
                  setDateFrom("");
                  setDateTo("");
                  setTimeout(() => loadOrders(1), 50);
                }}
                className="text-red-400 hover:text-red-300 font-bold ml-auto flex items-center gap-1 cursor-pointer transition-colors"
              >
                <XCircle className="h-4 w-4" strokeWidth={2.5} /> Limpar Filtros
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Main Table section */}
      <div className="glass-card rounded-2xl border border-white/10 overflow-hidden">
        {loading ? (
          <div className="py-24 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-400 mx-auto"></div>
            <p className="text-white/40 text-xs font-bold uppercase tracking-widest mt-4">Buscando transações comerciais...</p>
          </div>
        ) : error ? (
          <div className="py-16 text-center text-white/50 text-xs">
            <AlertCircle className="h-8 w-8 text-red-400 mx-auto mb-2" />
            {error}
          </div>
        ) : orders.length === 0 ? (
          <div className="py-24 text-center text-white/40 text-xs">
            <ShoppingBag className="h-8 w-8 text-white/30 mx-auto mb-3" />
            Nenhuma venda correspondente encontrada. Sincronize pedidos na barra superior!
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-white/2 border-b border-white/5 text-[9px] uppercase font-bold text-white/40 tracking-wider">
                  <th className="py-4 px-6">ID Pedido / Loja</th>
                  <th className="py-4 px-6">Data Venda</th>
                  <th className="py-4 px-6">Produtos Adquiridos</th>
                  <th className="py-4 px-6 text-right">Faturamento Bruto</th>
                  <th className="py-4 px-6 text-right">Margem Líquida %</th>
                  <th className="py-4 px-6">Status</th>
                  <th className="py-4 px-6 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-xs font-semibold text-white/80">
                {orders.map((o) => {
                  const summary = o.financial_summary;
                  const isCancelled = o.status.toLowerCase() === "cancelled";
                  const marginPercent = summary ? (summary.margin_percent * 100) : 0;

                  return (
                    <tr 
                      key={o.id} 
                      className={`hover:bg-white/5 transition-colors ${
                        o.cost_pending ? "bg-yellow-400/2" : ""
                      }`}
                    >
                      {/* ID / Integration */}
                      <td className="py-4 px-6">
                        <p className="font-extrabold text-white font-mono tracking-tight">{o.ml_order_id}</p>
                        <span className="text-[10px] text-white/40 font-bold uppercase tracking-wider">{o.nickname}</span>
                      </td>

                      {/* Date */}
                      <td className="py-4 px-6 text-white/50 font-mono text-[11px]">
                        {formatDate(o.order_date)}
                      </td>

                      {/* Products */}
                      <td className="py-4 px-6 max-w-sm">
                        <div className="space-y-1">
                          {o.items.map((item, idx) => (
                            <div key={idx} className="flex items-center gap-1.5">
                              <span className="text-[10px] font-bold text-white/55 font-mono shrink-0 bg-white/5 border border-white/5 py-0.5 px-1.5 rounded-md">
                                {item.quantity}x
                              </span>
                              <span className="truncate block font-bold text-white max-w-[200px]" title={item.product_name}>
                                {item.product_name}
                              </span>
                            </div>
                          ))}
                        </div>
                      </td>

                      {/* Gross amount */}
                      <td className="py-4 px-6 text-right font-extrabold text-white font-mono">
                        {formatCurrency(o.total_amount)}
                      </td>

                      {/* Margin % */}
                      <td className="py-4 px-6 text-right font-mono">
                        {isCancelled ? (
                          <span className="text-white/30">-</span>
                        ) : o.cost_pending ? (
                          <div className="flex flex-col items-end">
                            <span className="bg-yellow-400/10 text-[#FFE600] text-[9px] px-2.5 py-1 rounded-full border border-yellow-400/20 font-bold uppercase tracking-wider animate-pulse-subtle">
                              Custo Pendente
                            </span>
                          </div>
                        ) : (
                          <span className={`font-black ${marginPercent >= 15 ? "text-[#00FF66]" : marginPercent >= 5 ? "text-[#FFE600]" : "text-red-400"}`}>
                            {marginPercent.toFixed(1)}%
                          </span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-4 px-6">
                        <span className={`inline-block text-[9px] px-2.5 py-1 rounded-full font-bold uppercase tracking-wider ${
                          o.status.toLowerCase() === "paid" 
                            ? "bg-emerald-500/10 text-[#00FF66] border border-emerald-500/20" 
                            : o.status.toLowerCase() === "confirmed"
                            ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                            : "bg-red-500/10 text-red-400 border border-red-500/20"
                        }`}>
                          {o.status.toLowerCase() === "paid" ? "Aprovado" : o.status.toLowerCase() === "confirmed" ? "Pendente" : "Cancelado"}
                        </span>
                      </td>

                      {/* Detail triggers */}
                      <td className="py-4 px-6 text-center">
                        <button
                          onClick={() => handleOpenDetail(o.id)}
                          className="bg-white/5 text-white/70 border border-white/5 font-bold hover:bg-yellow-400 hover:text-slate-950 p-2 rounded-xl transition-all cursor-pointer shadow-sm flex items-center justify-center mx-auto"
                          title="Análise Financeira Completa"
                        >
                          <Eye className="h-4.5 w-4.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-white/5 px-6 py-4 bg-black/10">
                <span className="text-xs text-white/50 font-bold uppercase tracking-wider">
                  MOSTRANDO {orders.length} DE {total} PEDIDOS DE VENDA.
                </span>

                <div className="flex items-center gap-1.5">
                  <button
                    disabled={page === 1}
                    onClick={() => loadOrders(page - 1)}
                    className="px-3 py-1.5 border border-white/10 rounded-lg text-xs font-bold text-white/70 hover:bg-white/5 transition-colors disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer disabled:cursor-not-allowed"
                  >
                    Anterior
                  </button>

                  {Array.from({ length: totalPages }).map((_, i) => (
                    <button
                      key={i}
                      onClick={() => loadOrders(i + 1)}
                      className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                        page === i + 1
                          ? "bg-yellow-400 text-slate-950 shadow-md font-bold"
                          : "border border-white/10 text-white/80 hover:bg-white/5"
                      }`}
                    >
                      {i + 1}
                    </button>
                  ))}

                  <button
                    disabled={page === totalPages}
                    onClick={() => loadOrders(page + 1)}
                    className="px-3 py-1.5 border border-white/10 rounded-lg text-xs font-bold text-white/70 hover:bg-white/5 transition-colors disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer disabled:cursor-not-allowed"
                  >
                    Próxima
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      </>
    )}

      {/* 5. Detailed Drawer/Modal of Order (Finance apuration) */}
      {selectedOrderId && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex justify-end animate-fade-in">
          {/* Close click interceptor */}
          <div className="absolute inset-0" onClick={handleCloseDetail}></div>

          {/* Slider Drawer body */}
          <div className="glass-modal w-full max-w-xl h-screen relative shadow-2xl flex flex-col justify-between z-10 border-l border-white/10 p-0 overflow-y-auto">
            {detailLoading ? (
              <div className="h-full flex flex-col items-center justify-center p-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-400"></div>
                <p className="text-white/40 font-bold uppercase tracking-wider text-xs mt-4">Calculando demonstrativo líquido...</p>
              </div>
            ) : detailError ? (
              <div className="h-full flex flex-col items-center justify-center p-12 text-center text-white/60 text-xs gap-3">
                <XCircle className="h-10 w-10 text-red-400" />
                <p>{detailError}</p>
                <button onClick={handleCloseDetail} className="bg-white/10 hover:bg-white/25 text-white font-bold px-4 py-2 rounded-xl cursor-pointer">Fechar</button>
              </div>
            ) : detailOrder ? (
              <div className="flex flex-col h-full justify-between text-white">
                {/* Header */}
                <div className="p-6 border-b border-white/5 flex items-center justify-between bg-black/40">
                  <div>
                    <span className="text-[9px] bg-yellow-400 text-slate-950 font-black px-2.5 py-1 rounded-full uppercase tracking-wider">{detailOrder.nickname}</span>
                    <h3 className="font-extrabold text-lg mt-3 font-mono text-white">Pedido #{detailOrder.ml_order_id}</h3>
                    <p className="text-[10px] text-white/40 font-bold font-mono mt-1.5 uppercase tracking-wider">{formatDate(detailOrder.order_date)}</p>
                  </div>
                  <button 
                    onClick={handleCloseDetail}
                    className="p-2 text-white/40 hover:text-white hover:bg-white/5 rounded-xl transition-colors cursor-pointer"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                {/* Calculation breakdown body */}
                <div className="flex-1 p-6 space-y-6 overflow-y-auto">
                  {/* Financial Equations cards */}
                  <div>
                    <h4 className="text-white/40 font-bold uppercase text-[9px] tracking-widest mb-3">Apuração Financeira Real</h4>
                    
                    {/* Formulas showcase table detail schema */}
                    <div className="bg-black/25 rounded-2xl p-5 border border-white/5">
                      <div className="space-y-3 font-semibold text-xs">
                        <div className="flex justify-between pb-2.5 border-b border-white/5">
                          <span className="text-white/50">Faturamento Bruto (Preço do Produto)</span>
                          <span className="font-mono text-white">{formatCurrency(detailOrder.total_amount)}</span>
                        </div>
                        {detailOrder.discount_amount > 0 && (
                          <div className="flex justify-between pb-2.5 border-b border-white/5 text-red-400">
                            <span>Descontos / Cupons Co-financiados (-)</span>
                            <span className="font-mono">-{formatCurrency(detailOrder.discount_amount)}</span>
                          </div>
                        )}
                        <div className="flex justify-between pb-2.5 border-b border-white/5 text-red-400">
                          <span>Taxas & Comissões Mercado Livre (-)</span>
                          <span className="font-mono">-{formatCurrency(detailOrder.marketplace_fee_amount)}</span>
                        </div>
                        {detailOrder.shipping_cost_detail !== undefined && Number(detailOrder.shipping_cost_detail) > 0 && (
                          <div className="flex justify-between pb-2.5 border-b border-white/5 text-red-400">
                            <span>Frete / Coparticipação de Envio do Vendedor (-)</span>
                            <span className="font-mono">-{formatCurrency(detailOrder.shipping_cost_detail)}</span>
                          </div>
                        )}
                        <div className="flex justify-between pb-2.5 border-b border-white/5 pt-1 font-bold text-white/95 bg-white/2 px-2.5 py-1.5 rounded-lg border border-white/5">
                          <span className="text-white/60">Saldo do Repasse Mercado Livre (=)</span>
                          <span className="font-mono">{formatCurrency(detailOrder.net_amount)}</span>
                        </div>
                        {detailOrder.financial_summary?.difal_factor !== undefined && Number(detailOrder.financial_summary.difal_factor) > 0 && (
                          <div className="flex justify-between pb-2.5 border-b border-white/5 text-red-400">
                            <span>DIFAL Estimado ({detailOrder.shipping_state || "Destino"}) ({(Number(detailOrder.financial_summary.difal_factor) * 100).toFixed(2)}%) (-)</span>
                            <span className="font-mono">-{formatCurrency(detailOrder.financial_summary.difal_cost)}</span>
                          </div>
                        )}
                        {detailOrder.financial_summary?.tax_cost !== undefined && (
                          <div className="flex justify-between pb-2.5 border-b border-white/5 text-red-400">
                            <span>
                              ICMS Estimado ({detailOrder.shipping_state || "Destino"}{" "}
                              {detailOrder.financial_summary.tax_factor !== undefined 
                                ? `(${(Math.max(0, Number(detailOrder.financial_summary.tax_factor) - Number(detailOrder.financial_summary.difal_factor || 0)) * 100).toFixed(2)}%)` 
                                : ""}
                              ) (-)
                            </span>
                            <span className="font-mono">-{formatCurrency(detailOrder.financial_summary.tax_cost)}</span>
                          </div>
                        )}
                        <div className="flex justify-between pb-2.5 border-b border-white/5 text-red-300">
                          <span>Custo Unitário dos Produtos (COGS) (-)</span>
                          <span className="font-mono">-{formatCurrency(detailOrder.financial_summary?.total_cost || 0)}</span>
                        </div>
                        <div className="flex justify-between pt-1 text-white font-black bg-white/5 p-3 rounded-xl border border-white/10">
                          <span>Lucro Real Líquido Estimado</span>
                          <span className="font-mono tracking-tight text-sm text-[#00FF66]">
                            {detailOrder.status.toLowerCase() === "cancelled" 
                              ? formatCurrency(0) 
                              : formatCurrency(detailOrder.financial_summary?.gross_profit || 0)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* COGS Costs Breakdown */}
                  <div>
                    <h4 className="text-white/40 font-bold uppercase text-[9px] tracking-widest mb-3">Custos de Compra Unitário (COGS)</h4>
                    <div className="space-y-3">
                      {detailOrder.items.map((item, idx) => (
                        <div key={idx} className="bg-white/2 rounded-xl border border-white/5 p-4 flex items-center justify-between">
                          <div>
                            <p className="text-xs font-bold text-white truncate max-w-[280px]">{item.product_name}</p>
                            <span className="text-[10px] text-white/30 font-mono font-bold uppercase tracking-wider">{item.sku} ({item.quantity} un)</span>
                          </div>

                          <div className="text-right">
                            {item.cost_total === 0 ? (
                              <span className="text-yellow-400 bg-yellow-400/10 text-[9px] font-black uppercase tracking-wider py-1 px-2.5 rounded-full border border-yellow-400/20">Custo Pendente</span>
                            ) : (
                              <>
                                <p className="text-xs font-extrabold text-white font-mono">{formatCurrency(item.cost_total || 0)}</p>
                                <span className="text-[10px] text-white/40 font-mono">{formatCurrency(item.cost_unitary || 0)} cada</span>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Shipment & Address Detail Card */}
                  <div>
                    <h4 className="text-white/40 font-bold uppercase text-[9px] tracking-widest mb-3">Informações de Envio (Mercado Envios)</h4>
                    <div className="bg-[#0a0b1c]/60 rounded-2xl p-5 border border-white/10 space-y-4">
                      {/* Address Fields */}
                      <div>
                        <span className="text-[9px] font-extrabold text-white/40 uppercase tracking-widest">Endereço de Destino</span>
                        <div className="mt-2 text-[11px] grid grid-cols-3 gap-2">
                          <div className="bg-[#0f1027]/70 p-2 rounded-xl border border-white/5">
                            <span className="text-[8px] text-white/40 uppercase font-bold block mb-0.5">Estado</span>
                            <p className="font-semibold text-white truncate">{detailOrder.shipping_state || "Não informado"}</p>
                          </div>
                          <div className="bg-[#0f1027]/70 p-2 rounded-xl border border-white/5">
                            <span className="text-[8px] text-white/40 uppercase font-bold block mb-0.5">Cidade</span>
                            <p className="font-semibold text-white truncate">{detailOrder.shipping_city || "Não informado"}</p>
                          </div>
                          <div className="bg-[#0f1027]/70 p-2 rounded-xl border border-white/5">
                            <span className="text-[8px] text-white/40 uppercase font-bold block mb-0.5">Município</span>
                            <p className="font-semibold text-white truncate">{detailOrder.shipping_municipality || "Não informado"}</p>
                          </div>
                        </div>
                      </div>

                      {/* Cost details table */}
                      <div className="border-t border-white/5 pt-3">
                        <span className="text-[9px] font-extrabold text-white/40 uppercase tracking-widest block mb-2">Custos de Envio Detalhados</span>
                        <div className="overflow-hidden rounded-xl border border-white/5">
                          <table className="w-full text-[11px] text-left">
                            <thead className="bg-[#0f1027]/80 text-white/50 text-[9.5px] uppercase font-bold tracking-wider">
                              <tr>
                                <th className="p-2.5">Descrição</th>
                                <th className="p-2.5 text-right font-mono">Valor</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5 bg-[#070817]/40">
                              {/* Buyer shipping cost */}
                              <tr>
                                <td className="p-2.5 font-medium text-white/70">Frete pago pelo comprador</td>
                                <td className="p-2.5 text-right font-mono font-bold text-white">
                                  {formatCurrency(detailOrder.shipping_amount)}
                                </td>
                              </tr>
                              {/* Senders carrier cost */}
                              <tr>
                                <td className="p-2.5 font-medium text-white/70">Custo Real de Envio (ML Carrier)</td>
                                <td className="p-2.5 text-right font-mono font-bold text-yellow-400">
                                  {detailOrder.shipping_cost_detail !== undefined && detailOrder.shipping_cost_detail !== null && detailOrder.shipping_cost_detail !== 0 ? (
                                    formatCurrency(detailOrder.shipping_cost_detail)
                                  ) : (
                                    "Isento ou Integrado"
                                  )}
                                </td>
                              </tr>
                              {/* Difference / Net Shipping Cost */}
                              {detailOrder.shipping_cost_detail !== undefined && detailOrder.shipping_cost_detail !== null && detailOrder.shipping_cost_detail !== 0 && (
                                <tr className="bg-[#0f1027]/40">
                                  <td className="p-2.5 font-extrabold text-white">Saldo Líquido de Envio</td>
                                  <td className={`p-2.5 text-right font-mono font-black ${
                                    (detailOrder.shipping_amount - detailOrder.shipping_cost_detail) >= 0 ? 'text-emerald-400' : 'text-red-400'
                                  }`}>
                                    {formatCurrency(detailOrder.shipping_amount - detailOrder.shipping_cost_detail)}
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                        {detailOrder.ml_shipment_id && (
                          <div className="text-[8px] font-mono font-bold text-white/30 text-right mt-1.5 uppercase tracking-wider">
                            ID de Envio: {detailOrder.ml_shipment_id}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Profitability Outcome Card */}
                  {detailOrder.financial_summary && (
                    <div className={`rounded-2xl p-5 border text-center ${
                      detailOrder.status.toLowerCase() === "cancelled"
                        ? "bg-white/5 border-white/15 text-white/65"
                        : detailOrder.financial_summary.gross_profit >= 15
                        ? "bg-emerald-500/10 border border-emerald-500/20 text-[#00FF66]"
                        : detailOrder.financial_summary.gross_profit >= 0
                        ? "bg-yellow-500/10 border border-yellow-500/20 text-[#FFE600]"
                        : "bg-red-500/10 border border-red-500/20 text-red-400"
                    }`}>
                      {detailOrder.status.toLowerCase() === "cancelled" ? (
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wider">Venda Cancelada</p>
                          <p className="text-[10px] text-white/40 mt-1 uppercase tracking-wider font-bold">Nenhum custo ou receita aplicados para transações descontinuadas.</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 divide-x divide-white/10">
                          <div>
                            <span className="text-[9px] font-extrabold text-white/40 uppercase tracking-widest">Lucro Real Líquido</span>
                            <p className="text-lg font-black mt-2 font-mono truncate">
                              {formatCurrency(detailOrder.financial_summary.gross_profit)}
                            </p>
                          </div>
                          <div>
                            <span className="text-[9px] font-extrabold text-white/40 uppercase tracking-widest">Margem Operacional</span>
                            <p className="text-lg font-black mt-2 font-mono">
                              {(detailOrder.financial_summary.margin_percent * 100).toFixed(1)}%
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="p-4 border-t border-white/5 bg-black/20 pb-6 flex items-center justify-end">
                  <button
                    onClick={handleCloseDetail}
                    className="bg-white/10 hover:bg-white/15 text-white border border-white/10 font-bold text-xs px-5 py-2.5 rounded-xl cursor-pointer shadow-sm transition-all"
                  >
                    Fechar painel
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

import React, { useEffect, useState } from "react";
import KPIs from "./KPIs";
import { getDashboardOverview, getTopProducts, getAiAdvisorReport } from "../services/api";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from "recharts";
import { Sparkles, ShoppingBag, ShieldAlert, BadgeAlert, TrendingUp, HelpCircle, CheckCircle, ArrowRight, Calendar, Filter, X } from "lucide-react";

interface DashboardViewProps {
  onNavigateToCosts: () => void;
}

export default function DashboardView({ onNavigateToCosts }: DashboardViewProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overview, setOverview] = useState<any>(null);
  const [topProducts, setTopProducts] = useState<any>(null);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(isNaN(val) ? 0 : val);
  };

  // Date filters in BRL format (DD/MM/YYYY)
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    const iso = d.toISOString().split("T")[0];
    const parts = iso.split("-");
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  });
  const [dateTo, setDateTo] = useState(() => {
    const d = new Date();
    const iso = d.toISOString().split("T")[0];
    const parts = iso.split("-");
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  });

  // Helper to convert DD/MM/YYYY to YYYY-MM-DD
  const toIsoFormat = (brlStr: string) => {
    if (!brlStr) return "";
    const parts = brlStr.split("/");
    if (parts.length !== 3) return "";
    const day = parts[0].trim().padStart(2, "0");
    const month = parts[1].trim().padStart(2, "0");
    const year = parts[2].trim();
    if (year.length !== 4) return "";
    return `${year}-${month}-${day}`;
  };

  // Helper to convert DD/MM/YYYY to browser's YYYY-MM-DD value for input type="date"
  const getIsoForPicker = (brlStr: string) => {
    const iso = toIsoFormat(brlStr);
    return iso || "";
  };

  // Helper to handle date changes from native calendar picker
  const handleDatePickerChange = (valStr: string, setter: (v: string) => void) => {
    if (!valStr) return;
    const parts = valStr.split("-"); // YYYY-MM-DD
    if (parts.length === 3) {
      setter(`${parts[2]}/${parts[1]}/${parts[0]}`);
    }
  };

  // Helper for typing auto-masking formatted DD/MM/YYYY
  const handleDateInputChange = (val: string, setter: (v: string) => void) => {
    const cleaned = val.replace(/[^0-9]/g, "");
    let formatted = cleaned;
    
    if (cleaned.length > 0) {
      if (cleaned.length <= 2) {
        formatted = cleaned;
      } else if (cleaned.length <= 4) {
        formatted = `${cleaned.substring(0, 2)}/${cleaned.substring(2)}`;
      } else {
        formatted = `${cleaned.substring(0, 2)}/${cleaned.substring(2, 4)}/${cleaned.substring(4, 8)}`;
      }
    }
    
    setter(formatted);
  };

  // AI Advisor state
  const [aiReport, setAiReport] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const loadData = async (fromBrl?: string, toBrl?: string) => {
    setLoading(true);
    setError(null);
    try {
      const fromIso = toIsoFormat(fromBrl || "");
      const toIso = toIsoFormat(toBrl || "");
      const [overviewRes, topProductsRes] = await Promise.all([
        getDashboardOverview(fromIso, toIso),
        getTopProducts(fromIso, toIso),
      ]);
      setOverview(overviewRes);
      setTopProducts(topProductsRes);
    } catch (err: any) {
      setError(err.message || "Erro ao carregar do banco de dados");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(dateFrom, dateTo);
  }, []);

  const handleApplyFilter = (e: React.FormEvent) => {
    e.preventDefault();
    loadData(dateFrom, dateTo);
    // Refresh the AI advice as well when filters change if it was already generated
    if (aiReport) {
      setAiReport(null);
    }
  };

  const handleClearFilter = () => {
    setDateFrom("");
    setDateTo("");
    loadData("", "");
    if (aiReport) {
      setAiReport(null);
    }
  };

  const handleAskAi = async () => {
    setAiLoading(true);
    setAiError(null);
    setAiReport(null);
    try {
      const fromIso = toIsoFormat(dateFrom);
      const toIso = toIsoFormat(dateTo);
      const res = await getAiAdvisorReport(fromIso, toIso);
      setAiReport(res.advice);
    } catch (err: any) {
      setAiError(err.message || "Não foi possível gerar análise pela IA neste momento.");
    } finally {
      setAiLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 min-h-[50vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-400"></div>
        <p className="text-xs font-bold text-white/50 uppercase tracking-widest mt-4">Montando demonstrativos financeiros...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="glass-card border border-red-500/20 p-6 rounded-2xl mx-auto max-w-2xl mt-10 relative overflow-hidden">
        <h3 className="text-red-400 font-extrabold text-base">Falha na Conexão dos Dados</h3>
        <p className="text-red-200 text-xs mt-2">{error}</p>
        <button onClick={() => loadData(dateFrom, dateTo)} className="mt-4 bg-red-600/20 hover:bg-red-600/40 border border-red-500/30 text-white font-bold text-xs py-2 px-4 rounded-xl shadow-sm transition-all cursor-pointer">
          Tentar Reestabelecer
        </button>
      </div>
    );
  }

  const { metrics, chart_data } = overview;
  const hasPendingCosts = metrics.cost_pending_count > 0;

  return (
    <div className="space-y-8 pb-16">
      {/* Date filter bar */}
      <div className="glass-card rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-4 border border-white/5 shadow-sm">
        <div className="flex items-center gap-2 text-white/80 font-extrabold text-xs uppercase tracking-wider font-mono">
          <Calendar className="h-4.5 w-4.5 text-yellow-400" />
          <span>Filtrar Resultados por Período:</span>
        </div>

        <form onSubmit={handleApplyFilter} className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-end">
          <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-2.5 py-1.5 focus-within:border-yellow-400/50 transition-colors relative">
            <span className="text-[10px] text-white/40 uppercase tracking-widest font-mono font-bold">Desde:</span>
            <input
              type="text"
              placeholder="DD/MM/AAAA"
              value={dateFrom}
              onChange={e => handleDateInputChange(e.target.value, setDateFrom)}
              className="bg-transparent text-xs font-bold text-white focus:outline-none w-24 placeholder-white/20 text-center font-mono"
            />
            {/* Native hidden date picker overlay for calendar click */}
            <div className="relative hover:bg-white/10 p-1.5 rounded-md transition-colors cursor-pointer text-white/50 hover:text-white flex items-center justify-center" title="Selecionar data">
              <Calendar className="h-3.5 w-3.5 text-yellow-400" />
              <input
                type="date"
                value={getIsoForPicker(dateFrom)}
                onChange={e => handleDatePickerChange(e.target.value, setDateFrom)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10 [color-scheme:dark]"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-2.5 py-1.5 focus-within:border-yellow-400/50 transition-colors relative">
            <span className="text-[10px] text-white/40 uppercase tracking-widest font-mono font-bold">Até:</span>
            <input
              type="text"
              placeholder="DD/MM/AAAA"
              value={dateTo}
              onChange={e => handleDateInputChange(e.target.value, setDateTo)}
              className="bg-transparent text-xs font-bold text-white focus:outline-none w-24 placeholder-white/20 text-center font-mono"
            />
            {/* Native hidden date picker overlay for calendar click */}
            <div className="relative hover:bg-white/10 p-1.5 rounded-md transition-colors cursor-pointer text-white/50 hover:text-white flex items-center justify-center" title="Selecionar data">
              <Calendar className="h-3.5 w-3.5 text-yellow-400" />
              <input
                type="date"
                value={getIsoForPicker(dateTo)}
                onChange={e => handleDatePickerChange(e.target.value, setDateTo)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10 [color-scheme:dark]"
              />
            </div>
          </div>

          <button
            type="submit"
            className="flex items-center gap-1.5 bg-yellow-400 hover:bg-yellow-350 active:scale-95 text-slate-950 font-black text-[10px] uppercase tracking-wider px-4 py-2.5 rounded-xl transition-all cursor-pointer shadow-md"
          >
            <Filter className="h-3.5 w-3.5" />
            Filtrar
          </button>

          {(dateFrom || dateTo) && (
            <button
              type="button"
              onClick={handleClearFilter}
              className="flex items-center gap-1 bg-white/5 hover:bg-white/15 text-white/70 hover:text-white font-extrabold text-[10px] uppercase tracking-wider px-3 py-2.5 rounded-xl transition-all cursor-pointer border border-white/5"
            >
              <X className="h-3.5 w-3.5" />
              Limpar
            </button>
          )}
        </form>
      </div>

      {/* 1. KPIs section */}
      <KPIs metrics={metrics} />

      {/* Warning alert if pending costs exist */}
      {hasPendingCosts && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-5 flex items-start gap-4 shadow-sm animate-pulse-subtle">
          <BadgeAlert className="h-5 w-5 text-[#FFE600] flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="text-amber-300 font-extrabold text-sm">Atenção: Pedidos com Custos Pendentes!</h4>
            <p className="text-amber-100/70 text-xs mt-1 leading-relaxed">
              Existem <strong>{metrics.cost_pending_count} pedidos ou itens</strong> sem custo unitário cadastrado no sistema. 
              Sem esses custos cadastrados, a margem de lucro real e o lucro líquido ficam distorcidos ou superfaturados!
            </p>
          </div>
          <button
            onClick={onNavigateToCosts}
            className="flex items-center gap-1.5 bg-yellow-400 hover:bg-yellow-350 text-slate-950 font-black text-[10px] uppercase tracking-wider px-4 py-2.5 rounded-xl shadow-lg shadow-yellow-400/10 transition-all cursor-pointer shrink-0"
          >
            Cadastrar Custos SKU
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* 2. Charts and top items row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Plot chart (Revenue & Profit timelines) */}
        <div className="glass-card rounded-2xl p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="font-extrabold text-white tracking-tight text-base">Evolução de Fluxo Comercial</h3>
              <p className="text-xs text-white/40 mt-1 font-semibold">Comparativo de faturamento bruto vs margem liquida recuperada por data.</p>
            </div>
            <div className="flex gap-4 text-[10px] font-bold uppercase tracking-wider">
              <span className="flex items-center gap-1.5 text-[#3483FA]">
                <span className="h-2 w-2 rounded-full bg-[#3483FA] block"></span>
                Bruto
              </span>
              <span className="flex items-center gap-1.5 text-purple-400">
                <span className="h-2 w-2 rounded-full bg-purple-400 block"></span>
                Custos
              </span>
              <span className="flex items-center gap-1.5 text-[#00FF66]">
                <span className="h-2 w-2 rounded-full bg-[#00FF66] block"></span>
                Lucro Real
              </span>
            </div>
          </div>

          <div className="h-80 w-full font-mono text-xs">
            {chart_data && chart_data.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chart_data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorGross" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3483FA" stopOpacity={0.25}/>
                      <stop offset="95%" stopColor="#3483FA" stopOpacity={0.01}/>
                    </linearGradient>
                    <linearGradient id="colorNet" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#00FF66" stopOpacity={0.25}/>
                      <stop offset="95%" stopColor="#00FF66" stopOpacity={0.01}/>
                    </linearGradient>
                    <linearGradient id="colorCost" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#A855F7" stopOpacity={0.25}/>
                      <stop offset="95%" stopColor="#A855F7" stopOpacity={0.01}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255, 255, 255, 0.05)" />
                  <XAxis dataKey="date" stroke="rgba(255, 255, 255, 0.4)" fontSize={10} axisLine={false} tickLine={false} />
                  <YAxis 
                    stroke="rgba(255, 255, 255, 0.4)" 
                    fontSize={10} 
                    axisLine={false} 
                    tickLine={false}
                    tickFormatter={(value) => Number(value).toFixed(2)}
                  />
                  <Tooltip 
                    contentStyle={{ background: "#0a0b1c", borderRadius: "12px", border: "1px solid rgba(255, 255, 255, 0.1)", color: "white" }}
                    itemStyle={{ color: "#ffffff", padding: "2px 0" }}
                    formatter={(value: any, name: any) => [
                      new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value)),
                      name
                    ]}
                  />
                  <Area type="monotone" name="Fat. Bruto" dataKey="gross" stroke="#3483FA" strokeWidth={2.5} fillOpacity={1} fill="url(#colorGross)" />
                  <Area type="monotone" name="Custos" dataKey="cost" stroke="#A855F7" strokeWidth={2.5} fillOpacity={1} fill="url(#colorCost)" />
                  <Area type="monotone" name="Lucro Real" dataKey="profit" stroke="#00FF66" strokeWidth={2.5} fillOpacity={1} fill="url(#colorNet)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-white/30 font-sans">
                Nenhum pedido sincronizado nos últimos dias.
              </div>
            )}
          </div>
        </div>

        {/* Top products list cards */}
        <div className="glass-card rounded-2xl p-6 flex flex-col justify-between">
          <div>
            <div className="border-b border-white/5 pb-4 mb-4">
              <h3 className="font-extrabold text-white tracking-tight text-base flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-yellow-400" />
                Destaques do Catálogo
              </h3>
              <p className="text-xs text-white/40 mt-1 font-semibold">Ranking dos produtos mais lucrativos vendidos recentemente.</p>
            </div>

            <div className="space-y-4">
              {topProducts && topProducts.by_profit.length > 0 ? (
                topProducts.by_profit.map((prod: any, idx: number) => (
                  <div key={prod.sku} className="flex items-center justify-between group py-1 border-b border-white/2 hover:border-white/5 transition-all">
                    <div className="space-y-1 max-w-[180px]">
                      <p className="text-xs font-extrabold text-white truncate" title={prod.product_name}>
                        {prod.product_name}
                      </p>
                      <p className="text-[9px] text-white/30 font-mono font-bold uppercase tracking-wider">{prod.sku}</p>
                    </div>

                    <div className="text-right">
                      <p className="text-xs font-black text-[#00FF66]">
                        {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(prod.profit)}
                      </p>
                      <p className="text-[10px] text-white/50 font-bold whitespace-nowrap">{prod.qty_sold} un. vendidas</p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-xs text-white/30 text-center py-6">Nenhum dado comercial consolidado.</p>
              )}
            </div>
          </div>

          <button
            onClick={onNavigateToCosts}
            className="w-full text-center py-3 bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl text-xs font-bold text-white/70 hover:text-white cursor-pointer mt-6 transition-all"
          >
            Gerenciar custos globais de SKU
          </button>
        </div>
      </div>

      {/* Advanced Product Analytics Section */}
      <div className="space-y-6">
        <div className="border-b border-white/5 pb-3">
          <h3 className="text-sm font-extrabold text-white tracking-widest uppercase font-mono flex items-center gap-2">
            <TrendingUp className="h-4.5 w-4.5 text-yellow-400" />
            Análise Avançada de Performance de Produtos (Top 5)
          </h3>
          <p className="text-xs text-white/45 mt-1 font-semibold">Gargalos e trações: volume de vendas, margens líquidas reais, precificação unitária média e produtos de margem crítica no catálogo.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          
          {/* 1. Volume: Mais Vendidos */}
          <div className="glass-card rounded-2xl p-5 flex flex-col justify-between border border-white/5">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-white/5 mb-4">
                <span className="text-xs font-extrabold text-white uppercase tracking-wider">📦 Mais Vendidos</span>
                <span className="text-[9px] text-[#FFE600] font-bold uppercase tracking-widest bg-yellow-400/10 px-2 py-0.5 rounded-md">Qtd Vendida</span>
              </div>
              <div className="space-y-4">
                {topProducts && topProducts.by_qty_sold && topProducts.by_qty_sold.length > 0 ? (
                  topProducts.by_qty_sold.map((prod: any, idx: number) => (
                    <div key={prod.sku} className="flex items-center justify-between py-1 border-b border-white/2 hover:border-white/5 transition-all text-xs">
                      <div className="max-w-[130px] space-y-0.5">
                        <p className="font-extrabold text-white truncate" title={prod.product_name}>{prod.product_name}</p>
                        <p className="text-[9px] text-white/30 font-mono font-bold uppercase tracking-wider">{prod.sku}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-mono font-black text-yellow-400">{prod.qty_sold} un</p>
                        <p className="text-[9px] text-white/40 font-mono font-bold">{formatCurrency(prod.revenue_bruta)}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-white/30 text-center py-6">Sem dados consolidados.</p>
                )}
              </div>
            </div>
          </div>

          {/* 2. Rentabilidade: Melhores Margens */}
          <div className="glass-card rounded-2xl p-5 flex flex-col justify-between border border-white/5">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-white/5 mb-4">
                <span className="text-xs font-extrabold text-white uppercase tracking-wider">📈 Melhores Margens</span>
                <span className="text-[9px] text-[#00FF66] font-bold uppercase tracking-widest bg-emerald-500/10 px-2 py-0.5 rounded-md">Margem %</span>
              </div>
              <div className="space-y-4">
                {topProducts && topProducts.by_margin && topProducts.by_margin.length > 0 ? (
                  topProducts.by_margin.map((prod: any, idx: number) => (
                    <div key={prod.sku} className="flex items-center justify-between py-1 border-b border-white/2 hover:border-white/5 transition-all text-xs">
                      <div className="max-w-[130px] space-y-0.5">
                        <p className="font-extrabold text-white truncate" title={prod.product_name}>{prod.product_name}</p>
                        <p className="text-[9px] text-white/30 font-mono font-bold uppercase tracking-wider">{prod.sku}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-mono font-black text-[#00FF66]">{(prod.margin * 100).toFixed(1)}%</p>
                        <p className="text-[9px] text-white/40 font-mono font-bold">{formatCurrency(prod.profit)} lq.</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-white/30 text-center py-6">Sem dados consolidados.</p>
                )}
              </div>
            </div>
          </div>

          {/* 3. Preço: Mais Caros */}
          <div className="glass-card rounded-2xl p-5 flex flex-col justify-between border border-white/5">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-white/5 mb-4">
                <span className="text-xs font-extrabold text-white uppercase tracking-wider">💎 Mais Caros (Unit.)</span>
                <span className="text-[9px] text-blue-400 font-bold uppercase tracking-widest bg-blue-500/10 px-2 py-0.5 rounded-md">P. Unitário</span>
              </div>
              <div className="space-y-4">
                {topProducts && topProducts.by_expensive && topProducts.by_expensive.length > 0 ? (
                  topProducts.by_expensive.map((prod: any, idx: number) => (
                    <div key={prod.sku} className="flex items-center justify-between py-1 border-b border-white/2 hover:border-white/5 transition-all text-xs">
                      <div className="max-w-[130px] space-y-0.5">
                        <p className="font-extrabold text-white truncate" title={prod.product_name}>{prod.product_name}</p>
                        <p className="text-[9px] text-white/30 font-mono font-bold uppercase tracking-wider">{prod.sku}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-mono font-black text-blue-400">{formatCurrency(prod.unit_price)}</p>
                        <p className="text-[9px] text-white/40 font-mono font-bold">{prod.qty_sold} un. vend</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-white/30 text-center py-6">Sem dados consolidados.</p>
                )}
              </div>
            </div>
          </div>

          {/* 4. Crítico: Menos Lucrativos ou Prejuízo */}
          <div className="glass-card rounded-2xl p-5 flex flex-col justify-between border border-white/5">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-white/5 mb-4">
                <span className="text-xs font-extrabold text-white uppercase tracking-wider">⚠️ Menos Lucrativos</span>
                <span className="text-[9px] text-red-400 font-bold uppercase tracking-widest bg-red-500/10 px-2 py-0.5 rounded-md">Lucro Mínimo</span>
              </div>
              <div className="space-y-4">
                {topProducts && topProducts.by_less_lucrative && topProducts.by_less_lucrative.length > 0 ? (
                  topProducts.by_less_lucrative.map((prod: any, idx: number) => (
                    <div key={prod.sku} className="flex items-center justify-between py-1 border-b border-white/2 hover:border-white/5 transition-all text-xs">
                      <div className="max-w-[130px] space-y-0.5">
                        <p className="font-extrabold text-white truncate" title={prod.product_name}>{prod.product_name}</p>
                        <p className="text-[9px] text-white/30 font-mono font-bold uppercase tracking-wider">{prod.sku}</p>
                      </div>
                      <div className="text-right">
                        <p className={`font-mono font-black ${prod.profit < 0 ? "text-red-400 bg-red-500/10 px-1 py-0.5 rounded" : "text-amber-400"}`}>
                          {formatCurrency(prod.profit)}
                        </p>
                        <p className="text-[9px] text-white/40 font-mono font-bold">{(prod.margin * 100).toFixed(1)}% margem</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-white/30 text-center py-6">Sem dados consolidados.</p>
                )}
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* 3. AI Coach block integration */}
      <div className="glass-card rounded-3xl p-8 relative overflow-hidden">
        {/* Floating background gradient circles */}
        <div className="absolute top-[-50px] right-[-50px] w-96 h-96 rounded-full bg-yellow-400/5 blur-3xl"></div>
        <div className="absolute bottom-[-50px] left-[-50px] w-80 h-80 rounded-full bg-blue-500/5 blur-3xl"></div>

        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 border-b border-white/5 pb-6 mb-6">
          <div className="space-y-2">
            <span className="bg-yellow-400/10 text-yellow-400 border border-yellow-400/20 px-3.5 py-1.5 rounded-full text-[9px] font-bold tracking-widest uppercase flex items-center gap-1.5 width-fit">
              <Sparkles className="h-3.5 w-3.5" />
              IA Gemini Integrada
            </span>
            <h3 className="text-xl font-extrabold text-white tracking-tight">Assessoria Estratégica AI</h3>
            <p className="text-xs text-white/50 leading-relaxed max-w-xl font-medium">
              Análise instantânea de rentabilidade. O Gemini estuda seu catálogo de faturamento, margens, comissões coletadas e custos SKU ativos para sugerir alterações de preços e otimizações de comissões!
            </p>
          </div>

          <button
            onClick={handleAskAi}
            disabled={aiLoading}
            className={`flex items-center gap-2 px-6 py-3.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all shadow-lg cursor-pointer shrink-0 ${
              aiLoading
                ? "bg-white/5 border-white/5 text-white/35 cursor-wait"
                : "bg-yellow-400 text-slate-950 hover:bg-yellow-350 hover:shadow-yellow-400/20"
            }`}
          >
            <Sparkles className={`h-4 w-4 ${aiLoading ? "animate-pulse" : ""}`} />
            {aiLoading ? "Processando Relatório..." : "Gerar Relatório de Lucratividade"}
          </button>
        </div>

        {/* Output area */}
        {aiLoading && (
          <div className="py-12 flex flex-col items-center justify-center space-y-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-400"></div>
            <p className="text-xs text-white/40 font-bold tracking-wider uppercase italic animate-pulse">O analisador Gemini está processando a saúde comercial de sua loja...</p>
          </div>
        )}

        {aiError && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-350 p-4 rounded-xl text-xs flex gap-2">
            <ShieldAlert className="h-4.5 w-4.5 text-red-400 shrink-0 mt-0.5" />
            <p className="font-semibold">{aiError}</p>
          </div>
        )}

        {aiReport && (
          <div className="bg-black/35 rounded-2xl p-6 border border-white/5 max-h-[500px] overflow-y-auto leading-relaxed text-sm text-slate-200 prose prose-invert font-sans whitespace-pre-line tracking-wide">
            {/* Direct typography pairing render */}
            <div className="space-y-4 pt-1">
              {aiReport}
            </div>
          </div>
        )}

        {!aiLoading && !aiReport && !aiError && (
          <div className="text-white/40 text-center py-6 text-xs font-semibold uppercase tracking-wider italic">
            Clique no botão acima para iniciar sua consultoria analítica preditiva de vendas.
          </div>
        )}
      </div>
    </div>
  );
}

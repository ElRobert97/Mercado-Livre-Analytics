import React, { useState, useEffect } from "react";
import { 
  Cloud, 
  MapPin, 
  Truck, 
  Calculator, 
  CheckCircle2, 
  XSquare, 
  Code, 
  ExternalLink, 
  RefreshCw, 
  DollarSign, 
  Layers, 
  Info, 
  Check, 
  ChevronRight, 
  Sparkles,
  Search,
  BadgeAlert,
  AlertTriangle,
  ClipboardCheck,
  TrendingUp,
  Package,
  Calendar,
  ShieldCheck,
  Lock,
  ChevronDown
} from "lucide-react";
import { 
  MelhorEnvioLabel, 
  calculateMEQuote, 
  getMELabels, 
  QuoteResponse 
} from "../services/melhorenvio";
import { 
  getOrders, 
  getMelhorEnvioConnectUrl,
  getMelhorEnvioStatus,
  saveMelhorEnvioTokenServer,
  disconnectMelhorEnvioServer,
  getMelhorEnvioLabelsReal,
  calculateMelhorEnvioQuoteReal
} from "../services/api";
import { CalculatedOrder } from "../types";
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  BarChart, 
  Bar 
} from "recharts";

function calculateMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const half = Math.floor(sorted.length / 2);
  if (sorted.length % 2 !== 0) {
    return sorted[half];
  }
  return (sorted[half - 1] + sorted[half]) / 2.0;
}

export default function MelhorEnvioView() {
  const [connected, setConnected] = useState(false);
  const [tokenInput, setTokenInput] = useState("");
  const [realAuthUrl, setRealAuthUrl] = useState<string>("");
  const [activeSubTab, setActiveSubTab] = useState<"quote" | "comparison" | "debug">("quote");
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Quote state
  const [originCEP, setOriginCEP] = useState("96020360");
  const [destCEP, setDestCEP] = useState("01018020");
  const [weight, setWeight] = useState(1.5);
  const [width, setWidth] = useState(15);
  const [height, setHeight] = useState(10);
  const [length, setLength] = useState(20);
  const [quoteResults, setQuoteResults] = useState<QuoteResponse[]>([]);
  const [quoting, setQuoting] = useState(false);

  // Comparison & Charts state
  const [labels, setLabels] = useState<MelhorEnvioLabel[]>([]);
  const [mlOrders, setMlOrders] = useState<CalculatedOrder[]>([]);
  const [chartData, setChartData] = useState<any[]>([]);
  const [loadingCompare, setLoadingCompare] = useState(false);

  // Median analytics computations of labels
  const medianByStateDest = React.useMemo(() => {
    if (!labels || labels.length === 0) return [];
    const groups: { [state: string]: number[] } = {};
    labels.forEach(lbl => {
      const state = lbl.to?.state_abbr || "Desconhecido";
      if (!groups[state]) {
        groups[state] = [];
      }
      groups[state].push(lbl.price);
    });

    return Object.keys(groups).map(state => {
      const prices = groups[state];
      const median = calculateMedian(prices);
      const average = prices.reduce((acc, c) => acc + c, 0) / prices.length;
      return {
        state,
        median,
        average,
        count: prices.length
      };
    }).sort((a, b) => b.median - a.median);
  }, [labels]);

  const medianByStatus = React.useMemo(() => {
    if (!labels || labels.length === 0) return [];
    const groups: { [status: string]: number[] } = {};
    labels.forEach(lbl => {
      const status = lbl.status || "Desconhecido";
      if (!groups[status]) {
        groups[status] = [];
      }
      groups[status].push(lbl.price);
    });

    return Object.keys(groups).map(status => {
      const prices = groups[status];
      const median = calculateMedian(prices);
      const average = prices.reduce((acc, c) => acc + c, 0) / prices.length;
      return {
        status,
        median,
        average,
        count: prices.length
      };
    }).sort((a, b) => b.median - a.median);
  }, [labels]);

  // Debug payload viewer state
  const [debugResponseType, setDebugResponseType] = useState<"200" | "400">("200");

  useEffect(() => {
    const init = async () => {
      try {
        const status = await getMelhorEnvioStatus();
        setConnected(status.connected);
        await loadComparisonData(status.connected);
      } catch (err) {
        console.error("Error loading secure status:", err);
        await loadComparisonData(false);
      }
    };

    init();

    getMelhorEnvioConnectUrl()
      .then(data => {
        if (data && data.auth_url) {
          setRealAuthUrl(data.auth_url);
        }
      })
      .catch(err => console.error("Error loading secure Melhor Envio connect URL:", err));
  }, []);

  const handleConnectSimulated = async () => {
    try {
      await saveMelhorEnvioTokenServer("simulated_prod_token_melhorenvio_2026_xyz", true);
      setConnected(true);
      await loadComparisonData(true);
      setSuccessMsg("Integração com Melhor Envio Simulação/Production estabelecida com sucesso!");
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (err: any) {
      setErrorMsg(err.message || "Erro ao conectar conta simulada.");
    }
  };

  const handleConnectReal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenInput.trim()) {
      setErrorMsg("O token pessoal de acesso é obrigatório.");
      return;
    }
    try {
      await saveMelhorEnvioTokenServer(tokenInput, false);
      setConnected(true);
      await loadComparisonData(true);
      setSuccessMsg("Token real do Melhor Envio conectado no sistema.");
      setTokenInput("");
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (err: any) {
      setErrorMsg(err.message || "Erro ao salvar token de conexão real.");
    }
  };

  const handleDisconnect = async () => {
    try {
      await disconnectMelhorEnvioServer();
      setConnected(false);
      await loadComparisonData(false);
      setSuccessMsg("Conexão com Melhor Envio encerrada.");
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setErrorMsg(err.message || "Erro ao desconectar do servidor.");
    }
  };

  const handleCalculateQuote = async (e: React.FormEvent) => {
    e.preventDefault();
    setQuoting(true);
    setErrorMsg(null);
    try {
      if (connected) {
        const quoteRes = await calculateMelhorEnvioQuoteReal({
          fromPostalCode: originCEP,
          toPostalCode: destCEP,
          weight,
          width,
          height,
          length
        });
        if (quoteRes && quoteRes.quotes) {
          setQuoteResults(quoteRes.quotes);
          return;
        }
      }

      // Default mocked calculation if disconnected
      const results = await calculateMEQuote({
        fromPostalCode: originCEP,
        toPostalCode: destCEP,
        weight,
        width,
        height,
        length
      });
      setQuoteResults(results);
    } catch (err: any) {
      setErrorMsg("Erro ao realizar cotação de frete. Verifique as dimensões e CEPs.");
    } finally {
      setQuoting(false);
    }
  };

  const loadComparisonData = async (isMeConnectedState?: boolean) => {
    setLoadingCompare(true);
    try {
      const isMeConnected = isMeConnectedState !== undefined ? isMeConnectedState : connected;

      // Load standard synced orders from API
      const res = await getOrders({ limit: 100 });
      const ordersList = res?.orders || [];
      setMlOrders(ordersList);

      // Build consolidated chart data by date using 'created_at' in both tables
      let meLabelsList: MelhorEnvioLabel[] = [];
      if (isMeConnected) {
        const serverLabelsRes = await getMelhorEnvioLabelsReal();
        meLabelsList = serverLabelsRes.labels || [];
      } else {
        meLabelsList = getMELabels();
      }
      setLabels(meLabelsList);

      // Only status types recommended: released, posted, delivered, undelivered, suspended
      const allowedMeStatuses = ["released", "posted", "delivered", "undelivered", "suspended"];
      const filteredMeLabels = meLabelsList.filter(l => allowedMeStatuses.includes(l.status));

      // We group values by Date
      const dateMap: { [date: string]: { mlCost: number; meCost: number; mlCount: number; meCount: number } } = {};

      // 1. Accumulate Mercado Livre orders
      ordersList.forEach(order => {
        if (!order.created_at) return;
        // Format to YYYY-MM-DD
        const dateStr = order.created_at.substring(0, 10);
        const cost = order.shipping_cost_detail || order.shipping_amount || 0;
        if (cost > 0) {
          if (!dateMap[dateStr]) {
            dateMap[dateStr] = { mlCost: 0, meCost: 0, mlCount: 0, meCount: 0 };
          }
          dateMap[dateStr].mlCost += cost;
          dateMap[dateStr].mlCount += 1;
        }
      });

      // 2. Accumulate Melhor Envio Labels
      filteredMeLabels.forEach(label => {
        if (!label.created_at) return;
        const dateStr = label.created_at.substring(0, 10);
        const cost = label.price; // Use price field as requested
        if (cost > 0) {
          if (!dateMap[dateStr]) {
            dateMap[dateStr] = { mlCost: 0, meCost: 0, mlCount: 0, meCount: 0 };
          }
          dateMap[dateStr].meCost += cost;
          dateMap[dateStr].meCount += 1;
        }
      });

      // Format to Recharts array
      const sortedDates = Object.keys(dateMap).sort();
      const chartPoints = sortedDates.map(dStr => {
        // Humanized date
        const parts = dStr.split("-");
        const formattedDate = parts.length === 3 ? `${parts[2]}/${parts[1]}` : dStr;
        return {
          rawDate: dStr,
          date: formattedDate,
          "Gasto Mercado Livre (R$)": Number(dateMap[dStr].mlCost.toFixed(2)),
          "Gasto Melhor Envio (R$)": Number(dateMap[dStr].meCost.toFixed(2)),
          ordersCount: dateMap[dStr].mlCount,
          labelsCount: dateMap[dStr].meCount
        };
      });

      setChartData(chartPoints);
    } catch (err) {
      console.error("Error building comparison datasets:", err);
    } finally {
      setLoadingCompare(false);
    }
  };

  const formatCurrency = (val: number) => {
    return val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  };

  // Mock exact response structures for Debug view
  const firstFiveLabels = labels.slice(0, 5);
  const firstFiveIds = firstFiveLabels.map(l => l.id || "04c13ada-68e6-41df-a2c6-ff5f3e7560f8");

  const debug200Response = JSON.stringify({
    request: {
      url: "https://api.melhorenvio.com.br/api/v2/me/shipment/status",
      method: "POST",
      headers: {
        "Authorization": "Bearer simulated_prod_token_melhorenvio_2026_xyz",
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: {
        orders: firstFiveIds
      }
    },
    response: {
      status: 200,
      statusText: "OK",
      data: firstFiveLabels
    }
  }, null, 2);

  const debug400Response = JSON.stringify({
    request: {
      url: "https://api.melhorenvio.com.br/api/v2/me/shipment/status",
      method: "POST",
      headers: {
        "Authorization": "Bearer simulated_prod_token_melhorenvio_2026_xyz",
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: {
        orders: firstFiveIds
      }
    },
    response: {
      status: 400,
      statusText: "Bad Request",
      error: "Not Found",
      message: "One or more requested orders could not be located in Melhor Envio records."
    }
  }, null, 2);

  return (
    <div className="space-y-6 max-w-6xl mx-auto px-4 py-2 animate-fade-in text-white">
      
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/5 pb-5">
        <div>
          <h2 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
            <Truck className="h-7 w-7 text-emerald-400" />
            Integração <span className="text-emerald-400">Melhor Envio</span>
          </h2>
          <p className="text-xs text-white/50 tracking-wide mt-1 animate-pulse">
            CALCULE COTAÇÕES E COMPARE TARIFAS LOGÍSTICAS EM TEMPO REAL
          </p>
        </div>

        {connected && (
          <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 px-3 py-1.5 rounded-xl">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
            <span className="text-[9px] font-mono tracking-wider font-extrabold text-emerald-400 uppercase">
              MELHOR ENVIO ATIVO (PRODUÇÃO)
            </span>
          </div>
        )}
      </div>

      {/* Internal Notification Alerts */}
      {successMsg && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-xl text-xs text-emerald-300 font-semibold flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-xl text-xs text-red-300 font-semibold flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-red-400 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Main Grid: Columns setup */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        
        {/* Left Side: Connection & Authentication Settings */}
        <div className="lg:col-span-1 space-y-6">
          <div className="glass-card p-5 rounded-2xl border border-white/5 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-20 h-20 bg-emerald-500/5 blur-xl rounded-full"></div>
            
            <h3 className="text-xs font-black tracking-widest text-white/50 uppercase mb-3 flex items-center gap-2 border-b border-white/5 pb-2">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              STATUS DA CONEXÃO
            </h3>

            {!connected ? (
              <div className="space-y-4">
                <p className="text-[11px] text-white/60 leading-relaxed font-medium">
                  Integre seu aplicativo de envios do Melhor Envio para realizar simulações automáticas e análises comerciais.
                </p>

                <div className="space-y-1.5 p-3 bg-white/2 rounded-xl border border-white/5 text-[10px] text-white/45">
                  <span className="font-bold text-white uppercase block mb-1">Escopos Requeridos:</span>
                  <div>• ecommerce-shipping (Cotação)</div>
                  <div>• shipping-tracking (Ciclo de vida)</div>
                  <div>• users-read (Informações Básicas)</div>
                </div>

                <a
                  href={realAuthUrl || "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`w-full flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs py-3 px-4 rounded-xl transition-all shadow-lg shadow-emerald-500/15 cursor-pointer ${!realAuthUrl ? "opacity-50 pointer-events-none" : ""}`}
                >
                  <Sparkles className="h-4 w-4 animate-pulse text-slate-900" />
                  CONECTAR VIA OAUTH DE PRODUÇÃO
                </a>

                <button
                  onClick={handleConnectSimulated}
                  className="w-full flex items-center justify-center gap-2 border border-white/10 hover:bg-white/5 text-white font-bold text-[10px] py-2 px-3 rounded-xl transition-all cursor-pointer"
                >
                  <Cloud className="h-3.5 w-3.5" />
                  Conectar Conta Simulada
                </button>

                <div className="relative flex items-center justify-center my-3">
                  <div className="border-t border-white/5 w-full"></div>
                  <span className="absolute bg-[#0D0E12] px-2 text-[8px] font-bold text-white/30 uppercase tracking-widest">OU INSERIR TOKEN REAL</span>
                </div>

                <form onSubmit={handleConnectReal} className="space-y-2">
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-white/30" />
                    <input
                      type="password"
                      placeholder="Insira seu Bearer Token"
                      value={tokenInput}
                      onChange={(e) => setTokenInput(e.target.value)}
                      className="w-full pl-9 pr-3 py-2.5 border border-white/10 bg-white/5 rounded-xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-emerald-400 text-white placeholder-white/20"
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full py-2 border border-white/10 hover:bg-white/5 rounded-xl text-[10px] font-bold uppercase transition-all"
                  >
                    Conectar Token Pessoal
                  </button>
                </form>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-xl flex items-center gap-2.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 shrink-0"></div>
                  <div className="min-w-0 flex-1">
                    <span className="text-xs font-black block text-white truncate">GCP_MELHOR_ENVIO</span>
                    <span className="text-[10px] font-mono text-white/50 block truncate font-semibold">Ambiente de Produção Ativado</span>
                  </div>
                </div>

                <p className="text-[10px] text-white/40 leading-relaxed">
                  As cotações utilizam as regras da API de Produção. Você pode simular etiquetas com os status released, posted, delivered, undelivered e suspended.
                </p>

                <button
                  onClick={handleDisconnect}
                  className="w-full flex items-center justify-center gap-1.5 py-2 px-3 border border-red-500/10 hover:bg-red-500/5 text-red-400 rounded-xl text-[10px] font-extrabold uppercase transition-all cursor-pointer"
                >
                  Remover Vinculação
                </button>
              </div>
            )}
          </div>

          {/* Quick Stats Panel */}
          {connected && labels.length > 0 && (
            <div className="glass-card p-5 rounded-2xl border border-white/5 space-y-4">
              <h3 className="text-[10px] font-black tracking-widest text-white/40 uppercase">Estatísticas do Lote</h3>
              
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white/3 p-3 rounded-xl border border-white/5">
                  <span className="text-[10px] text-white/40 block font-bold leading-none mb-1">LIBERADAS</span>
                  <span className="text-lg font-black text-white font-mono">{labels.filter(l => l.status === "released").length}</span>
                </div>
                <div className="bg-white/3 p-3 rounded-xl border border-white/5">
                  <span className="text-[10px] text-white/40 block font-bold leading-none mb-1">POSTADAS</span>
                  <span className="text-lg font-black text-blue-400 font-mono">{labels.filter(l => l.status === "posted").length}</span>
                </div>
                <div className="bg-white/3 p-3 rounded-xl border border-white/5">
                  <span className="text-[10px] text-white/40 block font-bold leading-none mb-1">ENTREGUES</span>
                  <span className="text-lg font-black text-emerald-400 font-mono">{labels.filter(l => l.status === "delivered").length}</span>
                </div>
                <div className="bg-white/3 p-3 rounded-xl border border-white/5">
                  <span className="text-[10px] text-white/40 block font-bold leading-none mb-1">SUSPENSAS</span>
                  <span className="text-lg font-black text-red-400 font-mono">{labels.filter(l => l.status === "suspended").length}</span>
                </div>
              </div>

              <div className="pt-2 border-t border-white/5">
                <div className="flex justify-between items-center text-[11px] font-medium text-white/50">
                  <span>Soma Total do Lote:</span>
                  <span className="font-extrabold text-emerald-400 font-mono">{formatCurrency(labels.reduce((acc, curr) => acc + curr.price, 0))}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Side: Features Tabs Controller & Panels */}
        <div className="lg:col-span-3 space-y-6">
          
          {/* Navigation Subtabs list */}
          <div className="flex bg-white/2 p-1 rounded-2xl border border-white/5">
            <button
              onClick={() => setActiveSubTab("quote")}
              className={`flex-1 py-3 px-4 rounded-xl text-xs font-extrabold uppercase transition-all flex items-center justify-center gap-2 cursor-pointer ${
                activeSubTab === "quote" 
                  ? "bg-emerald-500 text-slate-950 font-black shadow-lg shadow-emerald-500/15" 
                  : "text-white/60 hover:text-white hover:bg-white/3"
              }`}
            >
              <Calculator className="h-4 w-4" />
              1. Cotação de Frete
            </button>

            <button
              onClick={() => {
                setActiveSubTab("comparison");
                loadComparisonData();
              }}
              className={`flex-1 py-3 px-4 rounded-xl text-xs font-extrabold uppercase transition-all flex items-center justify-center gap-2 cursor-pointer ${
                activeSubTab === "comparison" 
                  ? "bg-emerald-500 text-slate-950 font-black shadow-lg shadow-emerald-500/15" 
                  : "text-white/60 hover:text-white hover:bg-white/3"
              }`}
            >
              <TrendingUp className="h-4 w-4" />
              2. Comparação Logística
            </button>

            <button
              onClick={() => setActiveSubTab("debug")}
              className={`flex-1 py-3 px-4 rounded-xl text-xs font-extrabold uppercase transition-all flex items-center justify-center gap-2 cursor-pointer ${
                activeSubTab === "debug" 
                  ? "bg-emerald-500 text-slate-950 font-black shadow-lg shadow-emerald-500/15" 
                  : "text-white/60 hover:text-white hover:bg-white/3"
              }`}
            >
              <Code className="h-4 w-4" />
              3. Console de Debug (API)
            </button>
          </div>

          {/* Subtab Panel 1: Quote calculation */}
          {activeSubTab === "quote" && (
            <div className="glass-card rounded-2xl border border-white/5 p-6 space-y-6">
              
              <div className="border-b border-white/5 pb-4">
                <h3 className="text-base font-black text-white flex items-center gap-2">
                  <MapPin className="h-5 w-5 text-emerald-400" />
                  Simulador de Cotação de Fretes
                </h3>
                <p className="text-xs text-white/50 mt-0.5">ESTIME O CUSTO DA POSTAGEM DO PRODUTO PARA QUALQUER ESTADO DO BRASIL</p>
              </div>

              {!connected ? (
                <div className="text-center py-16 bg-black/15 rounded-2xl border border-dashed border-white/5">
                  <Truck className="h-12 w-12 text-white/10 mx-auto mb-3 animate-bounce" />
                  <h4 className="text-sm font-bold text-white mb-1">Módulo Desconectado</h4>
                  <p className="text-xs text-white/40 max-w-sm mx-auto mb-4">
                    Conecte sua conta do Melhor Envio ou ative o Simulador de Produção na barra lateral para liberar as estimativas tarifárias.
                  </p>
                  <button
                    onClick={handleConnectSimulated}
                    className="px-4 py-2 bg-emerald-500/10 hover:bg-emerald-500/15 text-emerald-300 border border-emerald-500/25 rounded-lg text-xs font-bold"
                  >
                    Ativar Simulação Rápida
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  
                  {/* Quoting inputs parameters form */}
                  <form onSubmit={handleCalculateQuote} className="md:col-span-1 space-y-4 bg-white/2 p-5 rounded-2xl border border-white/5">
                    <span className="text-[10px] font-extrabold text-white/40 tracking-wider uppercase block border-b border-white/5 pb-1.5 mb-2">Dimensões do Pacote</span>
                    
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] text-white/40 font-bold block mb-1">Origem CEP</label>
                        <input
                          type="text"
                          value={originCEP}
                          onChange={(e) => setOriginCEP(e.target.value)}
                          placeholder="Ex: 96020360"
                          className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-xs font-semibold text-white focus:ring-1 focus:ring-emerald-400 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-white/40 font-bold block mb-1">Destino CEP</label>
                        <input
                          type="text"
                          value={destCEP}
                          onChange={(e) => setDestCEP(e.target.value)}
                          placeholder="Ex: 01018020"
                          className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-xs font-semibold text-white focus:ring-1 focus:ring-emerald-400 focus:outline-none"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] text-white/40 font-bold block mb-1">Peso Estimado (kg)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={weight}
                        onChange={(e) => setWeight(Math.max(0.1, parseFloat(e.target.value) || 0))}
                        className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-xs font-semibold text-white focus:ring-1 focus:ring-emerald-400 focus:outline-none"
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-[9px] text-white/40 font-bold block mb-1">Largura (cm)</label>
                        <input
                          type="number"
                          value={width}
                          onChange={(e) => setWidth(Math.max(1, parseInt(e.target.value) || 0))}
                          className="w-full px-2 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs text-white"
                        />
                      </div>
                      <div>
                        <label className="text-[9px] text-white/40 font-bold block mb-1">Altura (cm)</label>
                        <input
                          type="number"
                          value={height}
                          onChange={(e) => setHeight(Math.max(1, parseInt(e.target.value) || 0))}
                          className="w-full px-2 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs text-white"
                        />
                      </div>
                      <div>
                        <label className="text-[9px] text-white/40 font-bold block mb-1">Comprimento</label>
                        <input
                          type="number"
                          value={length}
                          onChange={(e) => setLength(Math.max(1, parseInt(e.target.value) || 0))}
                          className="w-full px-2 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs text-white"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={quoting}
                      className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs rounded-xl shadow-md transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40"
                    >
                      {quoting ? (
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Truck className="h-4 w-4" />
                      )}
                      CALCULAR TARIFAS
                    </button>
                  </form>

                  {/* Quoting output list */}
                  <div className="md:col-span-2 space-y-3">
                    <span className="text-[10px] font-extrabold text-white/40 tracking-wider uppercase block border-b border-white/5 pb-1.5">Opções de Envio Disponíveis</span>
                    
                    {quoteResults.length === 0 ? (
                      <div className="h-48 rounded-2xl bg-white/2 border border-white/5 flex flex-col items-center justify-center text-center p-4">
                        <MapPin className="h-8 w-8 text-white/25 mb-2" />
                        <p className="text-xs text-white/45 font-semibold">Preencha o formulário e clique em Calcular Tarifas para listar os fretes de entrega.</p>
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {quoteResults.map((opt) => (
                          <div 
                            key={opt.name} 
                            className="bg-white/3 border border-white/5 hover:border-emerald-400/25 p-4 rounded-xl flex items-center justify-between gap-4 transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              {opt.company?.picture ? (
                                <img 
                                  src={opt.company.picture} 
                                  alt={opt.company.name} 
                                  className="w-10 h-10 rounded-xl bg-white/5 border border-white/5 shrink-0"
                                />
                              ) : (
                                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
                                  {opt.company?.name?.[0] || "T"}
                                </div>
                              )}
                              
                              <div>
                                <span className="text-xs font-black text-white block leading-tight">{opt.name}</span>
                                <span className="text-[9px] text-white/40 font-mono font-bold uppercase tracking-wide mt-1 block">
                                  Previsão de entrega: {opt.delivery_time} {opt.delivery_time === 1 ? "dia útil" : "dias úteis"}
                                </span>
                              </div>
                            </div>

                            <div className="text-right">
                              <div className="text-sm font-black text-[#00FF66] font-mono leading-none">
                                {formatCurrency(opt.custom_price)}
                              </div>
                              <div className="text-[9px] text-white/40 font-bold uppercase tracking-wider mt-1 block">
                                Sem desconto: <span className="line-through">{formatCurrency(opt.price)}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                </div>
              )}

            </div>
          )}

          {/* Subtab Panel 2: Comparative Chart Analyzer */}
          {activeSubTab === "comparison" && (
            <div className="glass-card rounded-2xl border border-white/5 p-6 space-y-6">
              
              <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 border-b border-white/5 pb-4">
                <div>
                  <h3 className="text-base font-black text-white flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-emerald-400" />
                    Conciliação de Tarifas: Mercado Livre vs. Melhor Envio (price)
                  </h3>
                  <p className="text-xs text-white/50 mt-0.5">COMPARAÇÃO DIRETA DE ENVIOS COM STATUS: RELEASED, POSTED, DELIVERED, UNDELIVERED, SUSPENDED</p>
                </div>

                <button
                  onClick={loadComparisonData}
                  disabled={loadingCompare}
                  className="flex items-center justify-center gap-1.5 px-3 py-1.5 border border-white/10 hover:bg-white/5 rounded-xl text-[10px] font-bold uppercase tracking-wide cursor-pointer disabled:opacity-40"
                >
                  <RefreshCw className={`h-3 w-3 ${loadingCompare ? "animate-spin" : ""}`} />
                  Recarregar Fontes
                </button>
              </div>

              {loadingCompare ? (
                <div className="h-96 flex flex-col items-center justify-center gap-2">
                  <RefreshCw className="h-8 w-8 text-emerald-400 animate-spin" />
                  <span className="text-[10px] text-white/40 uppercase font-mono tracking-widest font-semibold">Consolidando gastos logísticos...</span>
                </div>
              ) : chartData.length === 0 ? (
                <div className="h-96 flex flex-col items-center justify-center text-center p-6 bg-black/15 border border-white/5 rounded-xl">
                  <DollarSign className="h-10 w-10 text-white/20 mb-2 animate-pulse" />
                  <h4 className="text-xs font-bold text-white mb-1">Massa de Dados Nula</h4>
                  <p className="text-xs text-white/40 max-w-sm">
                    Não há dados suficientes para desenhar a linha do tempo. Certifique-se de que possui compras importadas no Mercado Livre e simulações do Melhor Envio sincronizadas no sistema.
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  
                  {/* Aggregated totals box cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="bg-[#3483FA]/5 border border-[#3483FA]/20 p-4 rounded-xl">
                      <span className="text-[9px] tracking-widest uppercase font-bold text-white/35">Total Gasto Mercado Livre</span>
                      <div className="text-xl font-mono font-black text-white mt-1.5">
                        {formatCurrency(chartData.reduce((acc, curr) => acc + curr["Gasto Mercado Livre (R$)"], 0))}
                      </div>
                      <span className="text-[9px] text-[#3483FA] font-mono uppercase font-bold block mt-1">
                        Soma de todos os SKUs faturados
                      </span>
                    </div>

                    <div className="bg-emerald-500/5 border border-emerald-500/20 p-4 rounded-xl">
                      <span className="text-[9px] tracking-widest uppercase font-bold text-white/35">Total Gasto Melhor Envio (price)</span>
                      <div className="text-xl font-mono font-black text-[#00FF66] mt-1.5">
                        {formatCurrency(chartData.reduce((acc, curr) => acc + curr["Gasto Melhor Envio (R$)"], 0))}
                      </div>
                      <span className="text-[9px] text-emerald-400 font-mono uppercase font-bold block mt-1">
                        Status válidos selecionados
                      </span>
                    </div>

                    <div className="bg-white/3 border border-white/5 p-4 rounded-xl flex flex-col justify-center">
                      <span className="text-[9px] tracking-widest uppercase font-bold text-white/35">Diferença Líquida (Margem de Frete)</span>
                      {(() => {
                        const mlTotal = chartData.reduce((acc, curr) => acc + curr["Gasto Mercado Livre (R$)"], 0);
                        const meTotal = chartData.reduce((acc, curr) => acc + curr["Gasto Melhor Envio (R$)"], 0);
                        const diff = mlTotal - meTotal;
                        const percent = meTotal > 0 ? (diff / meTotal) * 100 : 0;
                        return (
                          <div className="mt-1.5">
                            <span className={`text-xl font-mono font-black ${diff >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                              {formatCurrency(diff)}
                            </span>
                            <span className="text-[9px] text-white/40 block font-semibold mt-0.5">
                              {percent >= 0 ? "Envios Melhor Envio são mais baratos" : "Faturamento Mercado Livre foi inferior"} ({percent.toFixed(1)}%)
                            </span>
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Recharts Consolidated Shipping graph ordered by created_at */}
                  <div className="bg-black/10 border border-white/5 p-4 rounded-2xl">
                    <span className="text-[10px] font-black tracking-widest text-white/50 uppercase block mb-4">Gasto Logístico no Tempo (Agrupado por created_at)</span>
                    <div className="h-80 w-full text-xs">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData}>
                          <defs>
                            <linearGradient id="colorMl" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#3483FA" stopOpacity={0.2}/>
                              <stop offset="95%" stopColor="#3483FA" stopOpacity={0}/>
                            </linearGradient>
                            <linearGradient id="colorMe" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#00FF66" stopOpacity={0.2}/>
                              <stop offset="95%" stopColor="#00FF66" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                          <XAxis dataKey="date" stroke="rgba(255,255,255,0.4)" fontSize={10} fontWeight="bold" />
                          <YAxis stroke="rgba(255,255,255,0.4)" fontSize={10} fontWeight="bold" tickFormatter={(v) => `R$${v}`} />
                          <Tooltip 
                            contentStyle={{ backgroundColor: "rgba(13,14,18,0.95)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "12px" }}
                            labelStyle={{ color: "rgb(255,255,255)", fontWeight: "bold", fontSize: "11px" }}
                          />
                          <Legend wrapperStyle={{ fontSize: "11px", fontWeight: "bold", paddingTop: "10px" }} />
                          <Area type="monotone" dataKey="Gasto Mercado Livre (R$)" stroke="#3483FA" strokeWidth={2} fillOpacity={1} fill="url(#colorMl)" />
                          <Area type="monotone" dataKey="Gasto Melhor Envio (R$)" stroke="#00FF66" strokeWidth={2} fillOpacity={1} fill="url(#colorMe)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Median and Cost Distribution analysis */}
                  <div className="glass-card rounded-2xl border border-white/5 p-6 space-y-6">
                    <div>
                      <h3 className="text-sm font-black text-white flex items-center gap-2 uppercase tracking-wide">
                        <Sparkles className="h-4.5 w-4.5 text-emerald-400" />
                        Custos de Etiquetas: Metas de Mediana Logística
                      </h3>
                      <p className="text-[10px] text-white/50 tracking-wider font-semibold uppercase mt-0.5">
                        MÉTRICAS EXCLUSIVAS DO MELHOR ENVIO AGRUPADAS POR GEOGRAFIA (UF) OU ESTADO DE PROCESSAMENTO
                      </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 divide-y md:divide-y-0 md:divide-x divide-white/5">
                      
                      {/* Left Block: Destination State Breakdown */}
                      <div className="space-y-4 pr-0 md:pr-4">
                        <div className="flex items-center justify-between pb-2 border-b border-white/5">
                          <span className="text-[11px] font-extrabold text-[#00FF66] uppercase tracking-wider flex items-center gap-1.5 font-sans">
                            <MapPin className="h-3.5 w-3.5" />
                            1. Por Estado de Destino (UF)
                          </span>
                          <span className="text-[9px] text-white/35 font-mono uppercase font-black">
                            {medianByStateDest.length} Estados Ativos
                          </span>
                        </div>

                        {medianByStateDest.length === 0 ? (
                          <p className="text-xs text-white/40 italic py-4">Sem etiquetas cadastradas no Melhor Envio.</p>
                        ) : (
                          <div className="space-y-3.5">
                            {medianByStateDest.map((item) => {
                              const maxMedian = Math.max(...medianByStateDest.map(i => i.median)) || 1;
                              const percentage = Math.min(100, Math.max(8, (item.median / maxMedian) * 100));

                              return (
                                <div key={item.state} className="space-y-1 bg-white/2 p-2.5 rounded-xl border border-white/5">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-405 font-mono text-[10px] font-black rounded border border-emerald-500/15">
                                        {item.state}
                                      </span>
                                      <span className="text-[10px] text-white/55 font-bold">
                                        {item.count} {item.count === 1 ? "etiqueta" : "etiquetas"}
                                      </span>
                                    </div>
                                    <div className="text-right">
                                      <span className="text-[9px] text-white/35 font-mono mr-1.5">MEDIANA:</span>
                                      <span className="text-xs font-black font-mono text-[#00FF66]">
                                        {formatCurrency(item.median)}
                                      </span>
                                    </div>
                                  </div>

                                  {/* Progress bar background */}
                                  <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden relative">
                                    <div 
                                      className="h-full bg-emerald-450 rounded-full transition-all duration-500"
                                      style={{ width: `${percentage}%` }}
                                    />
                                  </div>

                                  <div className="flex justify-between text-[9px] text-white/35 font-mono font-bold uppercase mt-1">
                                    <span>Preço Médio: {formatCurrency(item.average)}</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Right Block: Label Situation/Status Breakdown */}
                      <div className="space-y-4 pt-4 md:pt-0 pl-0 md:pl-6">
                        <div className="flex items-center justify-between pb-2 border-b border-white/5">
                          <span className="text-[11px] font-extrabold text-[#3483FA] uppercase tracking-wider flex items-center gap-1.5 font-sans">
                            <Layers className="h-3.5 w-3.5" />
                            2. Por Status / Situação
                          </span>
                          <span className="text-[9px] text-white/35 font-mono uppercase font-black">
                            {medianByStatus.length} Status Sincronizados
                          </span>
                        </div>

                        {medianByStatus.length === 0 ? (
                          <p className="text-xs text-white/40 italic py-4">Sem processamento de etiquetas no Melhor Envio.</p>
                        ) : (
                          <div className="space-y-3.5">
                            {medianByStatus.map((item) => {
                              const maxMedian = Math.max(...medianByStatus.map(i => i.median)) || 1;
                              const percentage = Math.min(100, Math.max(8, (item.median / maxMedian) * 100));

                              // Status-specific configuration
                              let colorClass = "bg-emerald-500";
                              let badgeColor = "bg-emerald-500/10 text-emerald-400 border-emerald-500/15";
                              
                              if (item.status === "posted") {
                                colorClass = "bg-blue-500";
                                badgeColor = "bg-blue-500/10 text-blue-400 border-blue-500/15";
                              } else if (item.status === "released") {
                                colorClass = "bg-emerald-500";
                                badgeColor = "bg-emerald-500/10 text-emerald-450 border-emerald-500/15";
                              } else if (item.status === "delivered") {
                                colorClass = "bg-[#00FF66]";
                                badgeColor = "bg-[#00FF66]/10 text-[#00FF66] border-[#00FF66]/15";
                              } else if (item.status === "suspended") {
                                colorClass = "bg-red-500";
                                badgeColor = "bg-red-500/10 text-red-400 border-red-500/15";
                              } else if (item.status === "undelivered") {
                                colorClass = "bg-yellow-500";
                                badgeColor = "bg-yellow-500/10 text-yellow-400 border-yellow-500/15";
                              }

                              return (
                                <div key={item.status} className="space-y-1 bg-white/2 p-2.5 rounded-xl border border-white/5">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      <span className={`px-2 py-0.5 font-mono text-[9px] font-black rounded border uppercase ${badgeColor}`}>
                                        {item.status}
                                      </span>
                                      <span className="text-[10px] text-white/55 font-bold">
                                        {item.count} {item.count === 1 ? "unidade" : "unidades"}
                                      </span>
                                    </div>
                                    <div className="text-right">
                                      <span className="text-[9px] text-white/35 font-mono mr-1.5">MEDIANA:</span>
                                      <span className="text-xs font-black font-mono text-[#00FF66]">
                                        {formatCurrency(item.median)}
                                      </span>
                                    </div>
                                  </div>

                                  {/* Progress bar background */}
                                  <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden relative">
                                    <div 
                                      className={`h-full ${colorClass} rounded-full transition-all duration-500`}
                                      style={{ width: `${percentage}%` }}
                                    />
                                  </div>

                                  <div className="flex justify-between text-[9px] text-white/35 font-mono font-bold uppercase mt-1">
                                    <span>Preço Médio: {formatCurrency(item.average)}</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                    </div>
                  </div>

                  {/* Conciliation records listing */}
                  <div className="space-y-3">
                    <span className="text-[10px] font-black tracking-widest text-white/50 uppercase block border-b border-white/5 pb-1.5">Relação Individual das Etiquetas Aplicadas</span>

                    <div className="overflow-hidden border border-white/5 rounded-xl bg-white/2">
                      <table className="min-w-full divide-y divide-white/5 text-left text-xs font-medium">
                        <thead className="bg-white/5 text-[9px] text-white/40 font-bold uppercase tracking-wider">
                          <tr>
                            <th className="px-4 py-3">Código/Etiqueta</th>
                            <th className="px-4 py-3">Data Geração</th>
                            <th className="px-4 py-3">Transportadora</th>
                            <th className="px-4 py-3">Status</th>
                            <th className="px-4 py-3 text-right">Preço de Custo (price)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {labels.map((lbl) => {
                            let statusColor = "bg-white/10 text-white";
                            if (lbl.status === "released") statusColor = "bg-emerald-500/10 text-emerald-450";
                            else if (lbl.status === "posted") statusColor = "bg-blue-500/10 text-blue-400";
                            else if (lbl.status === "delivered") statusColor = "bg-[#00FF66]/10 text-[#00FF66]";
                            else if (lbl.status === "suspended") statusColor = "bg-red-500/10 text-red-400";
                            else if (lbl.status === "undelivered") statusColor = "bg-yellow-500/10 text-yellow-400";

                            return (
                              <tr key={lbl.id} className="hover:bg-white/5 transition-all">
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-2">
                                    <Package className="h-4 w-4 text-emerald-400 shrink-0" />
                                    <div>
                                      <p className="font-extrabold text-white font-mono uppercase">{lbl.protocol}</p>
                                      <p className="text-[9px] text-white/35 font-semibold font-mono tracking-tight mt-0.5">{lbl.tracking}</p>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-white/50 font-mono font-bold font-semibold">
                                  {new Date(lbl.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                                </td>
                                <td className="px-4 py-3 text-white/70 font-semibold">{lbl.service?.company?.name || "Desconhecida"}</td>
                                <td className="px-4 py-3">
                                  <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full border border-white/5 ${statusColor}`}>
                                    {lbl.status}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-right font-semibold font-mono text-white text-xs">{formatCurrency(lbl.price)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                </div>
              )}

            </div>
          )}

          {/* Subtab Panel 3: Debug payload viewer */}
          {activeSubTab === "debug" && (
            <div className="glass-card rounded-2xl border border-white/5 p-6 space-y-6">
              
              <div className="border-b border-white/5 pb-4 flex flex-col sm:flex-row justify-between sm:items-center gap-3">
                <div>
                  <h3 className="text-base font-black text-white flex items-center gap-2">
                    <Code className="h-5 w-5 text-[#00FF66]" />
                    Inspeção de Payload & Debugging (Melhor Envio APIs)
                  </h3>
                  <p className="text-xs text-white/50 mt-0.5">PREVIZE E AUDITE FORMATOS DE REQUISIÇÕES CONFORME PADRÕES DE QUALIDADE DE INTERFACES</p>
                </div>

                {/* Sub-selector for status types */}
                <div className="flex bg-white/5 p-1 border border-white/10 rounded-xl">
                  <button
                    onClick={() => setDebugResponseType("200")}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-extrabold uppercase transition-all flex items-center gap-1 cursor-pointer ${
                      debugResponseType === "200" ? "bg-[#00FF66] text-slate-950 font-black" : "text-white/60 hover:text-white"
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                    Retorno 200 (Sucesso)
                  </button>

                  <button
                    onClick={() => setDebugResponseType("400")}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-extrabold uppercase transition-all flex items-center gap-1 cursor-pointer ${
                      debugResponseType === "400" ? "bg-red-500/20 text-red-300 border border-red-550/30" : "text-white/60 hover:text-white"
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full bg-red-400"></span>
                    Retorno 400 (Erro NotFound)
                  </button>
                </div>
              </div>

              {/* Console logs view box */}
              <div className="space-y-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono tracking-widest text-white/45 font-black uppercase">
                    POST //api.melhorenvio.com.br/api/v2/me/shipment/status
                  </span>
                  <button
                    onClick={() => {
                      const payload = debugResponseType === "200" ? debug200Response : debug400Response;
                      navigator.clipboard.writeText(payload);
                      setSuccessMsg("Código copiado para a área de transferência!");
                      setTimeout(() => setSuccessMsg(null), 3000);
                    }}
                    className="flex items-center justify-center gap-1 py-1 px-2.5 bg-white/5 hover:bg-white/10 rounded-lg text-[9px] font-extrabold uppercase text-white/65 hover:text-white transition-all cursor-pointer"
                  >
                    <ClipboardCheck className="h-3 w-3" />
                    Copiar Payload
                  </button>
                </div>

                <div className="p-5 rounded-2xl bg-black/45 border border-white/5 shadow-inner overflow-x-auto font-mono text-xs leading-relaxed max-h-[500px]">
                  <pre className="text-emerald-400">
                    {debugResponseType === "200" ? debug200Response : debug400Response}
                  </pre>
                </div>

                <div className="bg-yellow-450/5 border border-yellow-450/20 p-4 rounded-xl flex items-start gap-3">
                  <Info className="h-4.5 w-4.5 text-yellow-450 shrink-0 mt-0.5" />
                  <div className="text-[11px] leading-relaxed text-white/70">
                    <span className="font-extrabold text-white block">Nota sobre o Debug Log:</span>
                    A resposta de sucesso (<span className="text-emerald-400">Status 200</span>) detalha as 5 etiquetas completas com seus respectivos status (<code className="bg-white/10 px-0.5 rounded font-mono text-white text-[10px]">released</code>, <code className="bg-white/10 px-0.5 rounded font-mono text-white text-[10px]">posted</code>, <code className="bg-white/10 px-0.5 rounded font-mono text-white text-[10px]">delivered</code>, <code className="bg-white/10 px-0.5 rounded font-mono text-white text-[10px]">undelivered</code>, <code className="bg-white/10 px-0.5 rounded font-mono text-white text-[10px]">suspended</code>) e o campo <code className="bg-white/10 px-0.5 rounded font-mono text-white text-[10px]">price</code> ativo. A resposta correspondente a erro traz o objeto de erro <code className="bg-white/10 px-0.5 rounded font-mono text-white text-[10px]">400 Not Found</code>.
                  </div>
                </div>
              </div>

            </div>
          )}

        </div>

      </div>

    </div>
  );
}

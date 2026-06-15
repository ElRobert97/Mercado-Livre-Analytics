import React, { useEffect, useState } from "react";
import { getSimulatorSkus, getStateTaxProfiles } from "../services/api";
import { StateTaxProfile } from "../types";
import { 
  Calculator, 
  HelpCircle, 
  Info, 
  TrendingUp, 
  Coins, 
  AlertCircle, 
  Sliders, 
  ChevronRight, 
  RefreshCw, 
  FileText, 
  CheckCircle,
  Truck,
  ArrowRight,
  TrendingDown,
  Award
} from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from "recharts";

interface SkuMedianData {
  sku: string;
  product_name: string;
  purchase_cost: number;
  currency: string;
  median_shipping: number;
  median_fee: number;
  historical_sales_count: number;
}

export default function PriceSimulatorView() {
  const [skus, setSkus] = useState<SkuMedianData[]>([]);
  const [taxProfiles, setTaxProfiles] = useState<StateTaxProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Selector & Simulator inputs
  const [selectedSkuCode, setSelectedSkuCode] = useState<string>("");
  const [searchSkuTerm, setSearchSkuTerm] = useState<string>("");
  const [customSkuName, setCustomSkuName] = useState<string>("Produto Customizado");
  const [purchaseCost, setPurchaseCost] = useState<number>(100);
  const [shippingCost, setShippingCost] = useState<number>(25);
  const [adType, setAdType] = useState<"classico" | "premium">("classico");
  
  // Simulation Modes: 'price' (sale price determines margin) or 'margin' (margin target determines price)
  const [simulationMode, setSimulationMode] = useState<"price" | "margin">("price");
  const [salePriceInput, setSalePriceInput] = useState<number>(199.9);
  const [targetMarginInput, setTargetMarginInput] = useState<number>(15); // in %

  // Active explanatory tabs/tooltips
  const [explainFixedFee, setExplainFixedFee] = useState(false);
  const [explainTaxes, setExplainTaxes] = useState(false);
  const [explainMarginSolver, setExplainMarginSolver] = useState(false);

  // Load backend SKUs and state tax profiles
  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [skusRes, profilesRes] = await Promise.all([
        getSimulatorSkus(),
        getStateTaxProfiles()
      ]);
      setSkus(skusRes);
      
      // Filter active profiles, sort SP first or sort alphabetically
      const activeProfiles = profilesRes.filter(p => p.active);
      setTaxProfiles(activeProfiles);

      // Default select first SKU if any
      if (skusRes.length > 0) {
        handleSelectSku(skusRes[0]);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Erro ao carregar dados do simulador");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSelectSku = (skuData: SkuMedianData) => {
    setSelectedSkuCode(skuData.sku);
    setSearchSkuTerm(skuData.sku);
    setCustomSkuName(skuData.product_name);
    setPurchaseCost(skuData.purchase_cost);
    setShippingCost(skuData.median_shipping > 0 ? skuData.median_shipping : 22.5); // Fallback to R$ 22.50 if no median
  };

  const handleCustomSkuTrigger = () => {
    setSelectedSkuCode("");
    setCustomSkuName("Produto Customizado");
    setPurchaseCost(100);
    setShippingCost(25);
  };

  // Helper formatting values
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(isNaN(val) ? 0 : val);
  };

  const formatPercentage = (val: number) => {
    return `${val.toFixed(2)}%`;
  };

  // Mercado Livre fixed fee rules
  const getMlFixedFee = (price: number): number => {
    if (price >= 79) return 0;
    if (price <= 12.49) return Number((price * 0.5).toFixed(2));
    if (price <= 29.00) return 6.25;
    if (price <= 50.00) return 6.50;
    return 6.50; // default for 50.01 to 78.99 under the R$ 79 free shipping limit rule scale
  };

  // Analytical target-margin piecewise price solver per state
  // Profit = Price * (1 - Comm_Rate - ICMS - DIFAL) - Fixed_Fee - Shipping - Purchase_Cost
  // We want Profit / Price = Target_Margin (represented as fraction, e.g. 0.15)
  // Target_Margin * Price = Price * (1 - Comm_Rate - taxTotal) - Fixed_Fee - Shipping - Purchase_Cost
  // Solve for Price:
  // Price = (C_fixed + Shipping + Purchase_Cost) / (1 - Comm_Rate - ICMS - DIFAL - Target_Margin)
  const solvePriceForTargetMargin = (
    marginPercent: number,
    purchaseCst: number,
    shippingCst: number,
    commissionRate: number,
    icmsFactor: number,
    difalFactor: number
  ): number => {
    const marginFrac = marginPercent / 100;
    
    // We solve for each pricing tier piecewise
    // Tier 1: Price >= 79, Fixed fee = 0
    let pValid = (shippingCst + purchaseCst) / (1 - commissionRate - icmsFactor - difalFactor - marginFrac);
    if (pValid >= 79) return pValid;

    // Tier 2: 29.01 <= Price < 79.00, Fixed fee = 6.50
    pValid = (6.50 + shippingCst + purchaseCst) / (1 - commissionRate - icmsFactor - difalFactor - marginFrac);
    if (pValid >= 29.01 && pValid < 79.00) return pValid;

    // Tier 3: 12.50 <= Price <= 29.00, Fixed fee = 6.25
    pValid = (6.25 + shippingCst + purchaseCst) / (1 - commissionRate - icmsFactor - difalFactor - marginFrac);
    if (pValid >= 12.50 && pValid <= 29.00) return pValid;

    // Tier 4: Price <= 12.49, Fixed fee = 50% of price (0.5 * Price)
    // Price * M = Price * (1 - Comm - Taxes - 0.5) - Shipping - Purchase
    // Price * (0.5 - Comm - Taxes - M) = Shipping + Purchase
    // Price = (Shipping + Purchase) / (0.5 - Comm - Taxes - M)
    pValid = (shippingCst + purchaseCst) / (0.5 - commissionRate - icmsFactor - difalFactor - marginFrac);
    if (pValid > 0 && pValid <= 12.49) return pValid;

    // Fallback to Tier 1 default if math hits singularities (e.g. margin is too close to fee ratios)
    const fallbackVal = (20 + purchaseCst + shippingCst) / (0.95 - marginFrac);
    return Math.max(0, isNaN(fallbackVal) || !isFinite(fallbackVal) ? purchaseCst * 1.5 : fallbackVal);
  };

  // Filtered list of SKUs based on search input
  const filteredSkus = skus.filter(s => 
    s.sku.toLowerCase().includes(searchSkuTerm.toLowerCase()) || 
    s.product_name.toLowerCase().includes(searchSkuTerm.toLowerCase())
  );

  // Main list calculator outputting simulation stats per state
  const taxCommMultiplier = adType === "classico" ? 0.12 : 0.17;

  const simulatedStates = taxProfiles.map(profile => {
    let finalSalePrice = salePriceInput;
    
    // If target margin mode is enabled, calculate the recommended sales price first
    if (simulationMode === "margin") {
      finalSalePrice = solvePriceForTargetMargin(
        targetMarginInput,
        purchaseCost,
        shippingCost,
        taxCommMultiplier,
        profile.icms_factor,
        profile.difal_factor
      );
    }

    // Safety checks
    if (finalSalePrice < 0 || isNaN(finalSalePrice)) {
      finalSalePrice = 0;
    }

    const mlCommFee = finalSalePrice * taxCommMultiplier;
    const mlFixedFee = getMlFixedFee(finalSalePrice);
    
    const icmsValue = finalSalePrice * profile.icms_factor;
    const difalValue = finalSalePrice * profile.difal_factor;
    const totalTaxes = icmsValue + difalValue;
    const totalMlFees = mlCommFee + mlFixedFee + shippingCost;
    
    const profitValue = finalSalePrice - totalMlFees - purchaseCost - totalTaxes;
    const profitMargin = finalSalePrice > 0 ? (profitValue / finalSalePrice) * 100 : 0;
    const breakevenCost = purchaseCost + totalTaxes + totalMlFees - finalSalePrice; // how far from breakeven

    return {
      state_code: profile.state_code,
      notes: profile.notes,
      icms_factor: profile.icms_factor,
      difal_factor: profile.difal_factor,
      total_factor: profile.total_factor,
      
      sale_price: finalSalePrice,
      comm_fee: mlCommFee,
      fixed_fee: mlFixedFee,
      shipping: shippingCost,
      taxes: totalTaxes,
      icms_val: icmsValue,
      difal_val: difalValue,
      
      purchase_cost: purchaseCost,
      ml_fees: totalMlFees,
      profit: profitValue,
      margin: profitMargin
    };
  });

  // Derived statistics across all Brazilian states
  const averageSalePrice = simulatedStates.length > 0 
    ? simulatedStates.reduce((sum, s) => sum + s.sale_price, 0) / simulatedStates.length 
    : 0;

  const averageProfit = simulatedStates.length > 0 
    ? simulatedStates.reduce((sum, s) => sum + s.profit, 0) / simulatedStates.length 
    : 0;

  const averageMargin = simulatedStates.length > 0 
    ? simulatedStates.reduce((sum, s) => sum + s.margin, 0) / simulatedStates.length 
    : 0;

  const profitableStatesCount = simulatedStates.filter(s => s.profit > 0).length;

  // Best & worst states for sales
  const sortedByProfit = [...simulatedStates].sort((a, b) => b.margin - a.margin);
  const bestState = sortedByProfit[0];
  const worstState = sortedByProfit[sortedByProfit.length - 1];

  // Prepare chart datasets
  const profitChartData = simulatedStates.map(s => ({
    state: s.state_code,
    "Margem %": Number(s.margin.toFixed(1)),
    "Lucro (R$)": Number(s.profit.toFixed(2)),
    "Impostos (R$)": Number(s.taxes.toFixed(2)),
    "Taxas Meli (R$)": Number(s.ml_fees.toFixed(2)),
  }));

  const stackedCostChartData = simulatedStates.map(s => ({
    state: s.state_code,
    "Custo de Compra": Number(s.purchase_cost.toFixed(2)),
    "Impostos Estatais": Number(s.taxes.toFixed(2)),
    "Taxas Meli": Number(s.ml_fees.toFixed(2)),
    "Lucro Líquido": Number(Math.max(0, s.profit).toFixed(2)),
  }));

  return (
    <div className="space-y-8 animate-fade-in" id="price-simulator-container">
      {/* Title & Introduction block */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/5 pb-6">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight text-white flex items-center gap-2">
            <Calculator className="h-6 w-6 text-yellow-400" />
            Simulador de Preços e Margens
          </h2>
          <p className="text-white/50 text-xs font-medium mt-1 uppercase tracking-widest leading-none">
            Análise detalhada por Estado das taxas fiscais do Mercado Livre (Clássico/Premium & Tópicos de Alíquota)
          </p>
        </div>

        <button 
          onClick={loadData}
          className="flex items-center gap-2 text-xs bg-white/5 hover:bg-white/10 active:scale-95 text-white/80 font-bold px-3 py-1.5 rounded-xl border border-white/10 transition-all cursor-pointer self-start md:self-auto"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Recarregar Margens
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 flex gap-3 text-red-300 text-sm">
          <AlertCircle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
          <div>
            <h4 className="font-bold">Ocorreu um erro</h4>
            <p className="text-white/70 mt-1">{error}</p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white/5 border border-white/10 rounded-3xl">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-400"></div>
          <p className="text-xs text-white/50 font-bold uppercase tracking-widest mt-4">Fazendo correspondência de dados de SKU e impostos...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* LEFT COLUMN: CONTROL & INPUT PARAMETERS (5 cols) */}
          <div className="lg:col-span-5 flex flex-col gap-6">
            
            {/* CARD 1: SKU AUTOCOMPLETE SELECTOR */}
            <div className="glass-card p-6 space-y-4">
              <h3 className="text-sm font-extrabold text-white/80 uppercase tracking-wider flex items-center gap-2">
                <Sliders className="h-4 w-4 text-yellow-400" />
                1. Selecionar SKU de Origem
              </h3>
              
              <div className="space-y-1.5">
                <label className="text-[11px] text-white/40 font-bold uppercase tracking-wide">Buscar SKU cadastrado</label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Pesquise por SKU ou nome do produto..."
                    value={searchSkuTerm}
                    onChange={(e) => setSearchSkuTerm(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-yellow-400/50 transition-colors"
                  />
                  {searchSkuTerm && (
                    <button 
                      onClick={() => { setSearchSkuTerm(""); setSelectedSkuCode(""); }}
                      className="absolute right-3.5 top-2.5 text-[10px] bg-white/10 hover:bg-white/20 px-1.5 py-0.5 rounded cursor-pointer text-white/70"
                    >
                      Limpar
                    </button>
                  )}
                </div>

                {/* SKU SEARCH AUTOCOMPLETE RESULTS */}
                {searchSkuTerm !== selectedSkuCode && filteredSkus.length > 0 && (
                  <div className="bg-slate-900/90 border border-white/10 rounded-xl max-h-48 overflow-y-auto mt-2 divide-y divide-white/5">
                    {filteredSkus.map(item => (
                      <button
                        key={item.sku}
                        onClick={() => handleSelectSku(item)}
                        className="w-full text-left p-3 hover:bg-yellow-400 hover:text-slate-950 font-medium transition-colors text-xs flex justify-between items-center cursor-pointer gap-2"
                      >
                        <div className="truncate">
                          <span className="font-mono font-bold bg-white/10 px-1.5 py-0.5 rounded mr-1.5 text-yellow-400 group-hover:text-slate-950">{item.sku}</span>
                          <span className="opacity-80 block md:inline text-[11px] font-medium">{item.product_name}</span>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="font-bold">{formatCurrency(item.purchase_cost)}</span>
                          <span className="text-[10px] opacity-60 block">{item.historical_sales_count} vds</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* ACTIVE SKU SUMMARY OR CUSTOM GENERATION */}
              {selectedSkuCode ? (
                <div className="bg-yellow-400/5 border border-yellow-400/20 rounded-2xl p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-0.5">
                      <span className="text-[10px] font-mono font-extrabold text-yellow-400 uppercase tracking-widest">SKU Vinculado</span>
                      <h4 className="text-xs font-extrabold text-white truncate max-w-xs">{selectedSkuCode}</h4>
                      <p className="text-[11px] text-white/60 line-clamp-1">{customSkuName}</p>
                    </div>
                    <button
                      onClick={handleCustomSkuTrigger}
                      className="text-[10px] font-bold text-yellow-400 hover:underline cursor-pointer uppercase tracking-wider bg-white/5 border border-white/10 px-2.5 py-1 rounded-lg transition-colors shrink-0"
                    >
                      Customizar
                    </button>
                  </div>

                  {/* SKU MEDIANS DATA METRICS */}
                  <div className="grid grid-cols-2 gap-3 pt-2 text-[11px] border-t border-white/5">
                    <div>
                      <span className="text-white/40 block">Custo de Entrada</span>
                      <span className="font-bold text-white font-mono text-xs">{formatCurrency(purchaseCost)}</span>
                    </div>
                    <div>
                      <span className="text-white/40 block">Méd. Frete Mercado Livre</span>
                      <span className="font-bold text-white font-mono text-xs flex items-center gap-1">
                        <Truck className="h-3 w-3 text-yellow-400 inline" />
                        {shippingCost > 0 ? formatCurrency(shippingCost) : "S/ Histórico"}
                      </span>
                    </div>
                  </div>
                  <p className="text-[10px] text-white/30 leading-snug">
                    * O custo de entrada e o frete estimados acima foram extraídos do banco de dados para garantir fidelidade à realidade.
                  </p>
                </div>
              ) : (
                <div className="bg-white/5 border border-white/10 rounded-2xl p-3 flex items-center justify-between text-xs">
                  <span className="text-white/50 font-medium">Testando produto customizado temporário</span>
                  <span className="text-[10px] font-bold text-yellow-400 uppercase bg-yellow-400/10 px-2 py-0.5 rounded">Livre</span>
                </div>
              )}
            </div>

            {/* CARD 2: SIMULATOR DYNAMIC INPUTS */}
            <div className="glass-card p-6 space-y-6">
              <h3 className="text-sm font-extrabold text-white/80 uppercase tracking-wider flex items-center gap-2">
                <Coins className="h-4 w-4 text-yellow-400" />
                2. Parâmetros de Precificação
              </h3>

              {/* INPUT: COGS PUSHING */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] text-white/40 font-bold uppercase tracking-wide">Custo do Produto (BRL)</label>
                  <div className="bg-white/5 border border-white/10 rounded-xl px-2.5 py-1.5 focus-within:border-yellow-400/50 transition-colors">
                    <input
                      type="number"
                      value={purchaseCost === 0 ? "" : purchaseCost}
                      onChange={(e) => setPurchaseCost(Math.max(0, parseFloat(e.target.value) || 0))}
                      className="bg-transparent text-sm font-bold text-white focus:outline-none w-full font-mono"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] text-white/40 font-bold uppercase tracking-wide">Custo Médio de Frete</label>
                  <div className="bg-white/5 border border-white/10 rounded-xl px-2.5 py-1.5 focus-within:border-yellow-400/50 transition-colors">
                    <input
                      type="number"
                      value={shippingCost === 0 ? "" : shippingCost}
                      onChange={(e) => setShippingCost(Math.max(0, parseFloat(e.target.value) || 0))}
                      className="bg-transparent text-sm font-bold text-white focus:outline-none w-full font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* LISTING TYPE AD OPTION */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-[11px] text-white/40 font-bold uppercase tracking-wide">Tipo de Anúncio Mercado Livre</label>
                  <span className="text-[10px] text-yellow-400 font-mono font-bold bg-yellow-400/10 px-1.5 py-0.5 rounded">
                    Taxa: {adType === "classico" ? "12%" : "17%"}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 bg-white/5 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setAdType("classico")}
                    className={`text-xs py-2 rounded-lg font-bold transition-all cursor-pointer ${
                      adType === "classico" 
                        ? "bg-yellow-400 text-slate-950 shadow" 
                        : "text-white/60 hover:text-white"
                    }`}
                  >
                    Clássico (12%)
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdType("premium")}
                    className={`text-xs py-2 rounded-lg font-bold transition-all cursor-pointer ${
                      adType === "premium" 
                        ? "bg-yellow-400 text-slate-950 shadow" 
                        : "text-white/60 hover:text-white"
                    }`}
                  >
                    Premium (17%)
                  </button>
                </div>
              </div>

              {/* SIMULATION MODES TABS */}
              <div className="border-t border-white/5 pt-4 space-y-4">
                <div className="flex justify-between items-center">
                  <label className="text-[11px] text-white/40 font-bold uppercase tracking-wide">Metodologia de Simulação</label>
                </div>
                
                <div className="grid grid-cols-2 gap-2 bg-white/5 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setSimulationMode("price")}
                    className={`text-xs py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                      simulationMode === "price" 
                        ? "bg-white/10 text-white" 
                        : "text-white/40 hover:text-white"
                    }`}
                  >
                    Simular por Preço
                  </button>
                  <button
                    type="button"
                    onClick={() => setSimulationMode("margin")}
                    className={`text-xs py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                      simulationMode === "margin" 
                        ? "bg-white/10 text-white" 
                        : "text-white/40 hover:text-white"
                    }`}
                  >
                    Simular por Margem Alvo
                  </button>
                </div>

                {simulationMode === "price" ? (
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <label className="text-[11px] text-yellow-400/80 font-bold uppercase tracking-wide">Custo de Venda Sugerido (R$)</label>
                    </div>
                    <div className="bg-yellow-400/10 border border-yellow-400/30 rounded-2xl px-4 py-3 focus-within:border-yellow-400 transition-all flex items-center justify-between">
                      <span className="text-xl font-mono text-white/50">R$</span>
                      <input
                        type="number"
                        step="0.01"
                        value={salePriceInput === 0 ? "" : salePriceInput}
                        onChange={(e) => setSalePriceInput(Math.max(0, parseFloat(e.target.value) || 0))}
                        className="bg-transparent text-right text-2xl font-bold text-white focus:outline-none w-full font-mono max-w-xs"
                      />
                    </div>
                    <p className="text-[10px] text-white/40">
                      * Insira o preço final cobrado do cliente para ver margem e lucro por estado.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <label className="text-[11px] text-yellow-400/80 font-bold uppercase tracking-wide">Margem Líquida Alvo (%)</label>
                      <span className="text-[10px] text-white/40 font-mono">Básico: 15%</span>
                    </div>
                    <div className="bg-yellow-400/10 border border-yellow-400/30 rounded-2xl px-4 py-3 focus-within:border-yellow-400 transition-all flex items-center justify-between">
                      <input
                        type="number"
                        step="0.5"
                        value={targetMarginInput}
                        onChange={(e) => setTargetMarginInput(parseFloat(e.target.value) || 0)}
                        className="bg-transparent text-left text-2xl font-bold text-white focus:outline-none w-full font-mono max-w-xs"
                      />
                      <span className="text-xl font-mono text-yellow-400 shrink-0 font-bold">%</span>
                    </div>
                    <p className="text-[10px] text-white/40">
                      * O simulador resolverá instantaneamente o preço de venda necessário para atingir essa exata margem líquida em cada estado, compensando variações tributárias individuais!
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* CARD 3: REFERENCE INFO & CALCULATORS COMPREHENSIVE */}
            <div className="glass-card p-6 space-y-4">
              <h3 className="text-xs font-extrabold text-white/80 uppercase tracking-widest flex items-center gap-1.5">
                <HelpCircle className="h-3.5 w-3.5 text-yellow-400" />
                Dicas de Apoio e Metodologia
              </h3>

              <div className="space-y-2 text-xs">
                {/* Fixed Fee explain */}
                <button
                  type="button"
                  onClick={() => setExplainFixedFee(!explainFixedFee)}
                  className="w-full text-left bg-white/5 hover:bg-white/10 p-3 rounded-xl border border-white/5 transition-colors cursor-pointer flex justify-between items-center font-bold text-white/80"
                >
                  <span>1. Regras de Taxa Fixa (&lt; R$ 79)</span>
                  <ChevronRight className={`h-4 w-4 transition-transform duration-200 ${explainFixedFee ? "rotate-90 text-yellow-400" : "text-white/30"}`} />
                </button>
                {explainFixedFee && (
                  <div className="bg-slate-900/50 border border-white/5 p-3.5 rounded-xl text-[11px] text-white/70 space-y-2 leading-relaxed">
                    <p>O Mercado Livre cobra uma taxa de envio adicional fixa para pedidos abaixo de R$ 79.00:</p>
                    <ul className="list-disc pl-5 space-y-1 font-mono text-white/80 text-[10px]">
                      <li>Até R$ 12.49: 50% do valor da unidade</li>
                      <li>De R$ 12.50 a R$ 29.00: R$ 6.25</li>
                      <li>De R$ 29.01 a R$ 50.00: R$ 6.50</li>
                      <li>A partir de R$ 50.01: R$ 6.50 fixo</li>
                    </ul>
                    <p className="text-[10px] text-yellow-400/80 font-semibold italic">Acima de R$ 79.00 a taxa fixa é de R$ 0.00, porém o frete grátis torna-se obrigatório (gerado conforme tabela de fretes do banco de dados).</p>
                  </div>
                )}

                {/* Taxes explain */}
                <button
                  type="button"
                  onClick={() => setExplainTaxes(!explainTaxes)}
                  className="w-full text-left bg-white/5 hover:bg-white/10 p-3 rounded-xl border border-white/5 transition-colors cursor-pointer flex justify-between items-center font-bold text-white/80"
                >
                  <span>2. Alíquota ICMS e DIFAL por Estado</span>
                  <ChevronRight className={`h-4 w-4 transition-transform duration-200 ${explainTaxes ? "rotate-90 text-yellow-400" : "text-white/30"}`} />
                </button>
                {explainTaxes && (
                  <div className="bg-slate-900/50 border border-white/5 p-3.5 rounded-xl text-[11px] text-white/70 space-y-1.5 leading-relaxed">
                    <p><strong>ICMS (Diferencial Próprio):</strong> Alíquota interna recolhida no estado de saída ou proporcional ao tipo de envio comercial.</p>
                    <p><strong>DIFAL:</strong> Diferencial de Alíquota interestadual cobrado nas transações direcionadas a consumidores finais localizados em outros estados brasileiros.</p>
                    <p className="text-[10px] text-yellow-400/80">O simulador cruza o endereço de entrega do cliente de suas vendas passadas para desenhar as margens líquidas que sobram de fato em sua conta corporativa.</p>
                  </div>
                )}
                
                {/* Margin solver explain */}
                <button
                  type="button"
                  onClick={() => setExplainMarginSolver(!explainMarginSolver)}
                  className="w-full text-left bg-white/5 hover:bg-white/10 p-3 rounded-xl border border-white/5 transition-colors cursor-pointer flex justify-between items-center font-bold text-white/80"
                >
                  <span>3. Fórmula Matemática do Preço Alvo</span>
                  <ChevronRight className={`h-4 w-4 transition-transform duration-200 ${explainMarginSolver ? "rotate-90 text-yellow-400" : "text-white/30"}`} />
                </button>
                {explainMarginSolver && (
                  <div className="bg-slate-900/50 border border-white/5 p-3.5 rounded-xl text-[11px] text-white/70 space-y-1.5 font-mono text-[10px]">
                    <div className="bg-black/30 p-2 rounded text-yellow-400 font-bold leading-normal">
                      Preço_Venda = (Custo_Fixo + Frete + Compra) / (1 - %Comissão - %ICMS - %DIFAL - %Margem_Alvo)
                    </div>
                    <p className="text-[10px] text-white/60 leading-normal font-sans pt-1">
                      O algoritmo analisa de forma reversa todas as faixas do Mercado Livre de forma que seu lucro fique blindado exatamente no percentual desejado.
                    </p>
                  </div>
                )}
              </div>
            </div>

          </div>

          {/* RIGHT COLUMN: SIMULATOR ANALYTICS & RESULTS (7 cols) */}
          <div className="lg:col-span-7 flex flex-col gap-6">

            {/* GRID OF FINANCIAL AGGREGATE CARDS */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="glass-card p-4 space-y-1">
                <span className="text-[10px] text-white/40 font-bold uppercase block tracking-wide">Med. Preço Venda</span>
                <span className="text-sm font-extrabold text-white font-mono">{formatCurrency(averageSalePrice)}</span>
              </div>
              <div className="glass-card p-4 space-y-1">
                <span className="text-[10px] text-white/40 font-bold uppercase block tracking-wide">Méd. Lucro Líquido</span>
                <span className="text-sm font-extrabold text-yellow-400 font-mono">{formatCurrency(averageProfit)}</span>
              </div>
              <div className="glass-card p-4 space-y-1">
                <span className="text-[10px] text-white/40 font-bold uppercase block tracking-wide">Méd. Margem Líquida</span>
                <span className={`text-sm font-extrabold font-mono ${averageMargin > 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {formatPercentage(averageMargin)}
                </span>
              </div>
              <div className="glass-card p-4 space-y-1">
                <span className="text-[10px] text-white/40 font-bold uppercase block tracking-wide">Estados Lucrativos</span>
                <span className="text-sm font-extrabold text-white block">
                  {profitableStatesCount} <span className="text-white/40 text-[10px] font-medium">de {simulatedStates.length}</span>
                </span>
              </div>
            </div>

            {/* STATE TAX PROFILE COMPARATIVE CHART */}
            <div className="glass-card p-6 space-y-4">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-sm font-extrabold text-white/80 uppercase tracking-wider">
                    Rentabilidade Comparativa por Região Estatística
                  </h3>
                  <span className="text-[10px] text-white/40 font-medium">Lucro Líquido Real vs Margem Interestadual do Brasil</span>
                </div>
                <span className="text-[10px] font-bold text-yellow-400 uppercase bg-yellow-400/10 px-2 py-0.5 rounded">
                  {adType === "classico" ? "Anúncio Clássico" : "Anúncio Premium"}
                </span>
              </div>

              <div className="h-68 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={profitChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                    <XAxis dataKey="state" stroke="#ffffff40" fontSize={10} fontWeight="bold" />
                    <YAxis stroke="#ffffff40" fontSize={10} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: "#0f111a", borderColor: "rgba(255,255,255,0.1)", borderRadius: "12px", color: "#fff" }}
                      formatter={(value: any, name: any) => [name === "Margem %" ? `${value}%` : formatCurrency(value), name]}
                    />
                    <Legend wrapperStyle={{ fontSize: "10px" }} />
                    <Bar dataKey="Lucro (R$)" fill="#FFE600" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Impostos (R$)" fill="#ef4444" radius={[4, 4, 0, 0]} opacity={0.7} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* PERFORMANCE ANALYSIS: HIGHLIGHTS */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* BEST STATE */}
              {bestState && (
                <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-4 flex items-start gap-4">
                  <div className="bg-emerald-500/10 p-2.5 rounded-xl text-emerald-400 shrink-0">
                    <Award className="h-5 w-5" />
                  </div>
                  <div className="space-y-1 overflow-hidden">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-emerald-400 font-extrabold uppercase tracking-widest bg-emerald-500/10 px-1.5 py-0.5 rounded">Melhor Estado</span>
                      <span className="text-xs font-bold text-white font-mono">{bestState.state_code}</span>
                    </div>
                    <h4 className="text-sm font-extrabold text-white font-mono">{formatCurrency(bestState.sale_price)} <span className="text-white/40 text-[11px] font-normal leading-none font-sans">sugerido</span></h4>
                    <p className="text-xs text-white/60 leading-normal">
                      Gera um lucro líquido de <strong>{formatCurrency(bestState.profit)}</strong> por venda com margem de <strong>{formatPercentage(bestState.margin)}</strong> devido a alíquota total reduzida de {formatPercentage(bestState.total_factor * 100)}.
                    </p>
                  </div>
                </div>
              )}

              {/* WORST STATE */}
              {worstState && (
                <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-4 flex items-start gap-4">
                  <div className="bg-red-500/10 p-2.5 rounded-xl text-red-400 shrink-0">
                    <TrendingDown className="h-5 w-5" />
                  </div>
                  <div className="space-y-1 overflow-hidden">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-red-400 font-extrabold uppercase tracking-widest bg-red-500/10 px-1.5 py-0.5 rounded">Maior Atrito</span>
                      <span className="text-xs font-bold text-white font-mono">{worstState.state_code}</span>
                    </div>
                    <h4 className="text-sm font-extrabold text-white font-mono">{formatCurrency(worstState.sale_price)} <span className="text-white/40 text-[11px] font-normal leading-none font-sans">sugerido</span></h4>
                    <p className="text-xs text-white/60 leading-normal">
                      Atinge lucro líquido residual de <strong>{formatCurrency(worstState.profit)}</strong> ({formatPercentage(worstState.margin)}) devido a alíquota tributária interestadual elevada de {formatPercentage(worstState.total_factor * 100)}.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* COMPREHENSIVE TAX TABLE PER STATE */}
            <div className="glass-card overflow-hidden">
              <div className="p-6 border-b border-white/5 flex flex-col sm:flex-row justify-between sm:items-center gap-2">
                <div>
                  <h3 className="text-sm font-extrabold text-white/80 uppercase tracking-wider flex items-center gap-2">
                    <FileText className="h-4 w-4 text-yellow-400" />
                    Memória de Cálculo Completa por Estado do Brasil
                  </h3>
                  <p className="text-xs text-white/40 mt-1 leading-normal">
                    Detalhamento analítico de custos interestaduais aplicados sobre o valor de venda.
                  </p>
                </div>
                {simulationMode === "margin" && (
                  <span className="text-[10px] text-emerald-400 font-extrabold uppercase tracking-wider bg-emerald-500/10 px-2 py-1 rounded-lg border border-emerald-500/20 shrink-0">
                    Preços Dinâmicos Ativos
                  </span>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs divide-y divide-white/5 font-medium whitespace-nowrap">
                  <thead className="bg-black/20 text-white/50 text-[10px] font-bold uppercase tracking-wider">
                    <tr>
                      <th className="px-6 py-4">UF</th>
                      <th className="px-6 py-4">Preço Simulado</th>
                      <th className="px-6 py-4 text-center">Fatores Fiscais (ICMS / DIFAL)</th>
                      <th className="px-6 py-4">Custos Meli (Com. / Fixo)</th>
                      <th className="px-6 py-4">Frete / Compra</th>
                      <th className="px-6 py-4">Taxas Estatais</th>
                      <th className="px-6 py-4 text-right">Resultado Líquido</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {simulatedStates.map(state => {
                      const isLoss = state.profit <= 0;
                      return (
                        <tr key={state.state_code} className="hover:bg-white/5 transition-colors">
                          {/* STATE UF */}
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <span className="bg-white/5 font-mono font-bold text-white px-2 py-1 rounded text-xs">
                                {state.state_code}
                              </span>
                              {state.notes && (
                                <span className="text-[10px] text-white/30 truncate max-w-28" title={state.notes}>
                                  {state.notes}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* SIMULATED SALE PRICE */}
                          <td className="px-6 py-4 font-bold text-white font-mono">
                            {formatCurrency(state.sale_price)}
                          </td>

                          {/* TAX FACTORS */}
                          <td className="px-6 py-4 text-[10px] font-mono text-white/60 text-center">
                            <span className="text-yellow-400 mr-1">{(state.icms_factor * 100).toFixed(1)}%</span>
                            <span className="text-white/30">/</span>
                            <span className="text-emerald-400 ml-1">{(state.difal_factor * 100).toFixed(1)}%</span>
                            <span className="block text-[9px] text-white/30 font-semibold uppercase mt-0.5">Total: {(state.total_factor * 100).toFixed(2)}%</span>
                          </td>

                          {/* MELI COMMISISON & FIXED FEE */}
                          <td className="px-6 py-4 space-y-0.5">
                            <span className="text-white font-mono block">{formatCurrency(state.comm_fee + state.fixed_fee)}</span>
                            <span className="text-[10px] text-white/40 block">
                              C. {formatCurrency(state.comm_fee)} + F. {formatCurrency(state.fixed_fee)}
                            </span>
                          </td>

                          {/* SHIPPING & ENTRANCE */}
                          <td className="px-6 py-4 space-y-0.5">
                            <span className="text-white font-mono block">{formatCurrency(state.shipping + state.purchase_cost)}</span>
                            <span className="text-[10px] text-white/40 block">
                              S. {formatCurrency(state.shipping)} + C. {formatCurrency(state.purchase_cost)}
                            </span>
                          </td>

                          {/* STATE TOTAL TAXES VALUE */}
                          <td className="px-6 py-4 font-mono font-bold text-red-400">
                            {formatCurrency(state.taxes)}
                          </td>

                          {/* FINAL NET PROFIT & MARGIN BADGE */}
                          <td className="px-6 py-4 text-right">
                            <div className="flex flex-col items-end gap-1.5">
                              <span className={`font-mono font-black text-sm ${isLoss ? "text-red-400" : "text-emerald-400"}`}>
                                {formatCurrency(state.profit)}
                              </span>
                              <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-lg font-mono ${
                                isLoss 
                                  ? "bg-red-500/10 text-red-400 border border-red-500/20" 
                                  : state.margin >= 20 
                                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                  : "bg-yellow-400/10 text-yellow-400 border border-yellow-400/20"
                              }`}>
                                {formatPercentage(state.margin)}
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* STACKED COST COSTBREAKDOWN VISUAL */}
            <div className="glass-card p-6 space-y-4">
              <div>
                <h3 className="text-sm font-extrabold text-white/80 uppercase tracking-wider">
                  Composição de Preço do Produto por Estado
                </h3>
                <p className="text-[10px] text-white/40 font-medium leading-normal">
                  Proporção de cada BRL faturado que é destinado à compra, impostos, taxas Meli e margem livre.
                </p>
              </div>

              <div className="h-68 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stackedCostChartData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                    <XAxis type="number" stroke="#ffffff40" fontSize={10} />
                    <YAxis dataKey="state" type="category" stroke="#ffffff40" fontSize={10} width={25} fontWeight="bold" />
                    <Tooltip 
                      contentStyle={{ backgroundColor: "#0f111a", borderColor: "rgba(255,255,255,0.1)", borderRadius: "12px", color: "#fff" }}
                      formatter={(value: any) => formatCurrency(value)}
                    />
                    <Legend wrapperStyle={{ fontSize: "10px" }} />
                    <Bar dataKey="Custo de Compra" stackId="a" fill="#1e293b" />
                    <Bar dataKey="Taxas Meli" stackId="a" fill="#ea580c" />
                    <Bar dataKey="Impostos Estatais" stackId="a" fill="#ef4444" opacity={0.8} />
                    <Bar dataKey="Lucro Líquido" stackId="a" fill="#10b981" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

          </div>

        </div>
      )}
    </div>
  );
}

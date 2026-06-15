import { Coins, HandCoins, ShieldAlert, CirclePercent, ArrowUpRight, ShoppingBag } from "lucide-react";

interface KPIsProps {
  metrics: {
    revenue_gross: number;
    revenue_net: number;
    total_cost: number;
    profit: number;
    average_margin: number;
    cost_pending_count: number;
  };
}

export default function KPIs({ metrics }: KPIsProps) {
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);
  };

  const kpis = [
    {
      id: "gross",
      title: "Faturamento Bruto",
      value: formatCurrency(metrics.revenue_gross),
      desc: "Soma direta do preço dos anúncios",
      icon: Coins,
      color: "bg-blue-500/10 border-blue-500/20 text-[#3483FA]",
      accent: "text-[#3483FA] font-black glow-blue",
    },
    {
      id: "cost",
      title: "Custo Total dos Pedidos",
      value: formatCurrency(metrics.total_cost),
      desc: "Custo de aquisição (fornecedor) do estoque vendido",
      icon: ShoppingBag,
      color: "bg-purple-500/10 border-purple-500/20 text-purple-400",
      accent: "text-purple-300 font-black glow-purple",
    },
    {
      id: "profit",
      title: "Lucro Real",
      value: formatCurrency(metrics.profit),
      desc: "Líquido final após taxas ML, frete e impostos",
      icon: ArrowUpRight,
      color: metrics.profit >= 0 ? "bg-yellow-500/10 border-yellow-500/20 text-[#FFE600]" : "bg-red-500/10 border-red-500/20 text-red-400",
      accent: metrics.profit >= 0 ? "text-[#FFE600] font-black glow-yellow" : "text-red-400 font-black",
    },
    {
      id: "margin",
      title: "Margem de Lucro",
      value: `${(metrics.average_margin * 100).toFixed(1)}%`,
      desc: "Rentabilidade percentual real sobre repasse",
      icon: CirclePercent,
      color: metrics.average_margin >= 0.20 ? "bg-emerald-500/10 border-emerald-500/20 text-[#00FF66]" : "bg-yellow-500/10 border-yellow-500/20 text-[#FFE600]",
      accent: "text-white font-black",
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {kpis.map((kpi) => {
        const Icon = kpi.icon;
        return (
          <div
            key={kpi.id}
            className="glass-card rounded-2xl p-6 transition-all duration-300 hover:scale-[1.02] hover:border-white/20 hover:shadow-xl relative overflow-hidden"
          >
            {/* Left accent color strip */}
            <div className="absolute top-0 bottom-0 left-0 w-1 bg-white/5"></div>

            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">{kpi.title}</span>
              <div className={`p-2 rounded-xl border ${kpi.color}`}>
                <Icon className="h-4 w-4" />
              </div>
            </div>

            <div className="mt-4">
              <p className={`text-xl tracking-tight leading-none ${kpi.accent}`}>
                {kpi.value}
              </p>
              <p className="text-[10px] text-white/40 mt-1.5 font-bold uppercase tracking-wider">{kpi.desc}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

import { RefreshCw, CheckCircle, AlertTriangle, User, Menu, ChevronLeft } from "lucide-react";
import { MercadoLivreAccount } from "../types";

interface HeaderProps {
  currentTab: string;
  accounts: MercadoLivreAccount[];
  syncing: boolean;
  onSync: () => void;
  syncSuccessMessage: string | null;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
}

export default function Header({ 
  currentTab, 
  accounts, 
  syncing, 
  onSync, 
  syncSuccessMessage,
  sidebarOpen,
  onToggleSidebar
}: HeaderProps) {
  const getPageTitle = () => {
    switch (currentTab) {
      case "dashboard":
        return "Painel de Resultados";
      case "orders":
        return "Gestão de Pedidos";
      case "costs":
        return "Painel de Custos";
      case "products":
        return "Gestão de Anúncios";
      case "integrations":
        return "Contas e Canais Integrados";
      default:
        return "Mercado Livre Analytics";
    }
  };

  const getPageDesc = () => {
    switch (currentTab) {
      case "dashboard":
        return "Demonstrações financeiras de faturamento, margem e performance de catálogo.";
      case "orders":
        return "Lista detalhada de compras efetuadas, comissões cobradas e apuração de lucro.";
      case "costs":
        return "Visualize custos por SKU de produtos e faça importações em lote (CSV).";
      case "products":
        return "Visualize miniaturas, preços, categorias oficiais, estoques e fichas técnicas de seus anúncios integrados.";
      case "integrations":
        return "Gerencie os tokens e credenciais das suas lojas oficiais conectadas.";
      default:
        return "Plataforma avançada de análise financeira de e-commerce.";
    }
  };

  const activeNicknames = accounts.filter(a => a.status === "active").map(a => a.nickname);

  return (
    <header className={`h-20 glass-header flex items-center justify-between px-8 fixed right-0 top-0 z-20 transition-all duration-300 ${sidebarOpen ? "left-64" : "left-0"}`}>
      {/* Left section: Toggle + Title */}
      <div className="flex items-center gap-4">
        <button
          onClick={onToggleSidebar}
          className="p-2 bg-white/5 hover:bg-white/10 active:scale-95 text-white/70 hover:text-white rounded-xl transition-all duration-200 border border-white/5 focus:outline-none flex items-center justify-center cursor-pointer shadow-sm"
          title={sidebarOpen ? "Ocultar menu lateral" : "Exibir menu lateral"}
          id="btn-sidebar-toggle"
        >
          {sidebarOpen ? (
            <ChevronLeft className="h-4.5 w-4.5" />
          ) : (
            <Menu className="h-4.5 w-4.5" />
          )}
        </button>
        <div>
          <h2 className="text-lg font-black text-white tracking-tight leading-none">{getPageTitle()}</h2>
          <span className="text-[10px] text-white/40 font-bold block mt-1.5 uppercase tracking-widest">{getPageDesc()}</span>
        </div>
      </div>

      {/* Integration controls */}
      <div className="flex items-center gap-4">
        {/* Connection indicator */}
        <div className="flex items-center gap-2">
          {activeNicknames.length > 0 ? (
            <div className="flex items-center gap-2 bg-emerald-500/10 px-3.5 py-1.5 rounded-full border border-emerald-500/20">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              <span className="text-[10px] text-emerald-300 font-bold uppercase tracking-wider">
                {activeNicknames.length} {activeNicknames.length === 1 ? "Conta Ativa" : "Contas Ativas"}:
              </span>
              <span className="text-[10px] text-emerald-100 font-extrabold max-w-[120px] truncate">
                {activeNicknames.join(", ")}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 bg-amber-400/10 px-3.5 py-1.5 rounded-full border border-amber-400/20">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400"></span>
              <span className="text-[10px] text-amber-300 font-bold uppercase tracking-wider">
                Nenhuma conta integrada
              </span>
            </div>
          )}
        </div>

        {/* Sync trigger button */}
        <button
          onClick={onSync}
          disabled={syncing || activeNicknames.length === 0}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all duration-300 border ${
            activeNicknames.length === 0
              ? "bg-white/5 border-white/5 text-white/20 cursor-not-allowed"
              : syncing
              ? "bg-yellow-500/10 border-yellow-500/20 text-yellow-300 cursor-wait animate-pulse"
              : "bg-yellow-400 border-yellow-400 text-slate-950 hover:bg-yellow-350 cursor-pointer shadow-lg shadow-yellow-400/10 hover:scale-[1.02]"
          }`}
          title={activeNicknames.length === 0 ? "Adicione uma integração para sincronizar" : "Buscar novos pedidos"}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin text-yellow-300" : ""}`} />
          {syncing ? "SINCRO_PROCESSO..." : "SINCRONIZAR PEDIDOS"}
        </button>
      </div>

      {/* Sync visual pop message helper */}
      {syncSuccessMessage && (
        <div className="absolute right-8 top-22 bg-emerald-950/90 border border-emerald-500/30 text-emerald-200 rounded-xl py-2.5 px-4 text-xs font-bold shadow-2xl animate-fade-in flex items-center gap-2 z-50 backdrop-blur-xl">
          <CheckCircle className="h-4 w-4 text-emerald-400" />
          {syncSuccessMessage}
        </div>
      )}
    </header>
  );
}

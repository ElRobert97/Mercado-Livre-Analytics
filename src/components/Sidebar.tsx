import { LayoutDashboard, ShoppingCart, Tag, Share2, LogOut, Receipt } from "lucide-react";

interface SidebarProps {
  currentTab: string;
  onTabChange: (tab: string) => void;
  userEmail: string;
  userName: string;
  onLogout: () => void;
}

export default function Sidebar({ currentTab, onTabChange, userName, userEmail, onLogout }: SidebarProps) {
  const menuItems = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "orders", label: "Pedidos", icon: ShoppingCart },
    { id: "costs", label: "Custos por SKU", icon: Tag },
    { id: "integrations", label: "Integrações ML", icon: Share2 },
  ];

  return (
    <aside className="w-64 glass-sidebar text-white flex flex-col h-screen fixed left-0 top-0 z-30">
      {/* Brand logo */}
      <div className="p-6 border-b border-white/5 flex items-center gap-3">
        <div className="bg-gradient-to-br from-yellow-400 to-amber-500 p-2 rounded-xl text-slate-950 font-bold flex items-center justify-center shadow-lg shadow-yellow-400/15">
          <Receipt className="h-4.5 w-4.5" />
        </div>
        <div>
          <h1 className="font-extrabold text-base tracking-tight text-white leading-none">Meli <span className="text-yellow-400">Analytics</span></h1>
          <span className="text-[9px] text-white/40 font-bold tracking-widest uppercase block mt-1">E-Commerce Suite</span>
        </div>
      </div>

      {/* Navigation section */}
      <nav className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-200 cursor-pointer ${
                isActive
                  ? "bg-yellow-400 text-slate-950 shadow-lg shadow-yellow-400/20 font-bold"
                  : "text-white/60 hover:bg-white/5 hover:text-white"
              }`}
            >
              <Icon className={`h-4 w-4 ${isActive ? "text-slate-950" : "text-white/50 group-hover:text-white"}`} />
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* User block & Logout */}
      <div className="p-4 border-t border-white/5 bg-black/10">
        <div className="mb-4 px-2">
          <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Usuário Logado</p>
          <p className="text-sm font-extrabold text-white truncate mt-1">{userName}</p>
          <p className="text-[11px] text-white/50 truncate font-medium">{userEmail}</p>
        </div>
        <button
          onClick={onLogout}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 border border-white/10 rounded-xl text-xs font-bold text-red-400 hover:bg-red-500/10 hover:border-red-500/20 hover:text-red-300 transition-all cursor-pointer"
        >
          <LogOut className="h-3.5 w-3.5" />
          Sair do Sistema
        </button>
      </div>
    </aside>
  );
}

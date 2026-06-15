import { useEffect, useState } from "react";
import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import DashboardView from "./components/DashboardView";
import OrdersView from "./components/OrdersView";
import CostsView from "./components/CostsView";
import IntegrationsView from "./components/IntegrationsView";
import AuthView from "./components/AuthView";
import ProductsView from "./components/ProductsView";
import PriceSimulatorView from "./components/PriceSimulatorView";
import { checkAuth, getMLAccounts, syncMLOrders, logout, getSyncJobStatus } from "./services/api";
import { MercadoLivreAccount } from "./types";
import { Info, HelpCircle } from "lucide-react";

export default function App() {
  const [user, setUser] = useState<{ id: string; name: string; email: string } | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [currentTab, setCurrentTab] = useState("dashboard");
  const [accounts, setAccounts] = useState<MercadoLivreAccount[]>([]);
  
  // Persistent sidebar open state
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => {
    const saved = localStorage.getItem("sidebar_open");
    return saved !== null ? saved === "true" : true;
  });

  const handleToggleSidebar = () => {
    setSidebarOpen(prev => {
      const next = !prev;
      localStorage.setItem("sidebar_open", String(next));
      return next;
    });
  };
  
  // Sincronização states
  const [syncing, setSyncing] = useState(false);
  const [syncSuccessMessage, setSyncSuccessMessage] = useState<string | null>(null);
  const [syncProgress, setSyncProgress] = useState<number>(0);
  const [syncStatusMessage, setSyncStatusMessage] = useState<string | null>(null);

  const fetchUserStatus = async () => {
    try {
      const res = await checkAuth();
      if (res.user) {
        setUser(res.user);
        loadAccounts();
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setCheckingAuth(false);
    }
  };

  const loadAccounts = async () => {
    try {
      const accountsList = await getMLAccounts();
      setAccounts(accountsList);
    } catch (err) {
      console.error("Falha ao carregar conexões MercadoLivre:", err);
    }
  };

  useEffect(() => {
    fetchUserStatus();
  }, []);

  const handleAuthSuccess = (loggedUser: { id: string; name: string; email: string }) => {
    setUser(loggedUser);
    loadAccounts();
  };

  const handleLogout = async () => {
    try {
      await logout();
      setUser(null);
      setAccounts([]);
      setCurrentTab("dashboard");
    } catch (err) {
      console.error("Logout error", err);
    }
  };

  const handleSyncOrders = async () => {
    setSyncing(true);
    setSyncSuccessMessage(null);
    setSyncStatusMessage("Solicitando sincronização de vendas ao servidor...");
    setSyncProgress(5);
    try {
      const res = await syncMLOrders();
      const jobId = res.jobId;
      
      const pollInterval = setInterval(async () => {
        try {
          const statusRes = await getSyncJobStatus(jobId);
          setSyncProgress(statusRes.progress);
          setSyncStatusMessage(statusRes.message);

          if (statusRes.status === "completed") {
            clearInterval(pollInterval);
            setSyncSuccessMessage(statusRes.message);
            setSyncing(false);
            loadAccounts();
            setTimeout(() => {
              setSyncSuccessMessage(null);
              setSyncStatusMessage(null);
              setSyncProgress(0);
            }, 6000);
          } else if (statusRes.status === "failed") {
            clearInterval(pollInterval);
            alert(statusRes.error || statusRes.message || "A sincronização falhou.");
            setSyncing(false);
            setSyncStatusMessage(null);
            setSyncProgress(0);
          }
        } catch (pollErr: any) {
          clearInterval(pollInterval);
          alert("Falha ao monitorar sincronização: " + pollErr.message);
          setSyncing(false);
          setSyncStatusMessage(null);
          setSyncProgress(0);
        }
      }, 1500);
    } catch (err: any) {
      alert(err.message || "Erro durante sincronização de vendas");
      setSyncing(false);
      setSyncStatusMessage(null);
      setSyncProgress(0);
    }
  };

  if (checkingAuth) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center frosted-bg">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-400"></div>
        <p className="text-xs text-white/50 font-bold uppercase tracking-widest mt-4">Iniciando Mercado Livre Analytics...</p>
      </div>
    );
  }

  // Not authenticated? Show registration and login
  if (!user) {
    return <AuthView onSuccess={handleAuthSuccess} />;
  }

  // Router dispatcher
  const renderTabContent = () => {
    switch (currentTab) {
      case "dashboard":
        return <DashboardView onNavigateToCosts={() => setCurrentTab("costs")} />;
      case "orders":
        return <OrdersView />;
      case "costs":
        return <CostsView />;
      case "products":
        return <ProductsView />;
      case "simulator":
        return <PriceSimulatorView />;
      case "integrations":
        return <IntegrationsView accounts={accounts} onRefreshList={loadAccounts} />;
      default:
        return <DashboardView onNavigateToCosts={() => setCurrentTab("costs")} />;
    }
  };

  return (
    <div className="min-h-screen frosted-bg text-white flex font-sans relative">
      
      {/* 1. Left Sidebar Navigation */}
      <Sidebar
        currentTab={currentTab}
        onTabChange={setCurrentTab}
        userName={user.name}
        userEmail={user.email}
        onLogout={handleLogout}
        sidebarOpen={sidebarOpen}
      />

      {/* 2. Right Workspace Panel */}
      <div className={`flex-1 flex flex-col min-h-screen transition-all duration-300 ${sidebarOpen ? "pl-64" : "pl-0"}`}>
        
        {/* Header navigation bar */}
        <Header
          currentTab={currentTab}
          accounts={accounts}
          syncing={syncing}
          onSync={handleSyncOrders}
          syncSuccessMessage={syncSuccessMessage}
          sidebarOpen={sidebarOpen}
          onToggleSidebar={handleToggleSidebar}
          syncProgress={syncProgress}
          syncStatusMessage={syncStatusMessage}
        />

        {/* Scrollable primary dynamic tab viewpoint container */}
        <main className="flex-1 pt-26 pb-12 px-8 overflow-y-auto">
          {renderTabContent()}
        </main>
      </div>
    </div>
  );
}

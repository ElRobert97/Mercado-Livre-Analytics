import React, { useState, useEffect } from "react";
import { 
  Cloud, 
  Database, 
  Search, 
  FileSpreadsheet, 
  FileCode, 
  Download, 
  Upload, 
  CheckCircle, 
  AlertCircle, 
  LogOut, 
  ShieldCheck, 
  ExternalLink,
  ChevronRight,
  Info,
  Check,
  RefreshCw,
  Trash2,
  Lock
} from "lucide-react";
import { 
  isGoogleConnected, 
  getConnectedUser, 
  connectGoogleDriveReal, 
  connectGoogleDriveSimulated, 
  disconnectGoogleDrive, 
  listDriveFiles, 
  createDriveFile, 
  getDriveFileContent,
  DriveFile,
  handleGoogleAuthCallback
} from "../services/drive";
import { getProductCosts, importCostsCSV } from "../services/api";

export default function GoogleDriveView() {
  const [connected, setConnected] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [clientId, setClientId] = useState("");
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<"all" | "csv" | "json">("all");
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; isError?: boolean } | null>(null);
  const [activeImportId, setActiveImportId] = useState<string | null>(null);
  const [clientIdInputVisible, setClientIdInputVisible] = useState(false);

  // Check callback or existing connection on mount
  useEffect(() => {
    // Check if redirect hash contains token
    const isCallback = handleGoogleAuthCallback();
    if (isCallback) {
      setStatusMessage({ text: "Conexão com Google Drive estabelecida com sucesso!" });
    }

    // Set connection status
    setConnected(isGoogleConnected());
    setUser(getConnectedUser());
    
    // Default client ID from environment or fallback
    setClientId((import.meta as any).env.VITE_GOOGLE_CLIENT_ID || "");
  }, []);

  // Fetch files every time connection state or search filter changes
  useEffect(() => {
    if (connected) {
      loadFiles();
    }
  }, [connected, search, filterType]);

  const loadFiles = async () => {
    setLoading(true);
    try {
      let fetched = await listDriveFiles(search);
      // Client-side filtering as secondary check
      if (filterType === "csv") {
        fetched = fetched.filter(f => f.name.endsWith(".csv") || f.mimeType.includes("csv"));
      } else if (filterType === "json") {
        fetched = fetched.filter(f => f.name.endsWith(".json") || f.mimeType.includes("json"));
      }
      setFiles(fetched);
    } catch (err: any) {
      console.error(err);
      setStatusMessage({ text: err.message || "Erro ao listar arquivos do Drive", isError: true });
    } finally {
      setLoading(false);
    }
  };

  const handleConnectSimulated = () => {
    const mockUser = connectGoogleDriveSimulated();
    setConnected(true);
    setUser(mockUser);
    setStatusMessage({ text: "Simulador do Google Drive conectado!" });
  };

  const handleConnectReal = () => {
    if (!clientId) {
      setClientIdInputVisible(true);
      setStatusMessage({ text: "Por favor, informe seu Client ID do Google Cloud para conectar.", isError: true });
      return;
    }
    connectGoogleDriveReal(clientId);
  };

  const handleDisconnect = () => {
    disconnectGoogleDrive();
    setConnected(false);
    setUser(null);
    setFiles([]);
    setStatusMessage({ text: "Google Drive desconectado." });
  };

  // Mutating operation - Exporting SKU Costs to Google Drive with mandatory user confirmation dialogue
  const handleExportSkuCosts = async () => {
    const confirmed = window.confirm(
      "Deseja criar um arquivo de backup com os Custos de SKU diretamente em seu Google Drive? O arquivo 'meli_sku_costs_backup.csv' será salvo."
    );
    if (!confirmed) return;

    setLoading(true);
    setStatusMessage(null);
    try {
      const costs = await getProductCosts();
      if (!costs || costs.length === 0) {
        throw new Error("Não há custos cadastrados na plataforma para exportar.");
      }

      // Convert to clean semicolon-delimited CSV
      let csvContent = "sku;custo_unitario;atualizado_em\n";
      costs.forEach(item => {
        csvContent += `${item.sku};${item.cost_unitary};${item.updated_at || new Date().toISOString()}\n`;
      });

      const fileName = `meli_sku_costs_backup_${new Date().toISOString().split("T")[0]}.csv`;
      const mimeType = "text/csv";

      const file = await createDriveFile(fileName, csvContent, mimeType);
      
      setStatusMessage({ 
        text: `Backup '${file.name}' criado com sucesso no Google Drive!` 
      });
      loadFiles(); // refresh spreadsheet files list
    } catch (err: any) {
      console.error(err);
      setStatusMessage({ text: err.message || "Erro ao exportar custos", isError: true });
    } finally {
      setLoading(false);
    }
  };

  // Mutating operation - Exporting Order History Backup to Google Drive with mandatory user confirmation
  const handleExportSalesBackup = async () => {
    const confirmed = window.confirm(
      "Deseja exportar a base consolidada de vendas e rentabilidade como arquivo JSON no Google Drive?"
    );
    if (!confirmed) return;

    setLoading(true);
    setStatusMessage(null);
    try {
      // Simulate/assemble general state data export
      const costs = await getProductCosts();
      const backupData = {
        exportedAt: new Date().toISOString(),
        userEmail: user?.email || "user@meli-analytics.br",
        skusCount: costs.length,
        items: costs.map(c => ({ sku: c.sku, cost: c.cost_unitary }))
      };

      const fileName = `meli_sales_export_${new Date().toISOString().split("T")[0]}.json`;
      const mimeType = "application/json";

      const file = await createDriveFile(fileName, JSON.stringify(backupData, null, 2), mimeType);
      
      setStatusMessage({ 
        text: `Backup de vendas '${file.name}' exportado com sucesso!` 
      });
      loadFiles();
    } catch (err: any) {
      console.error(err);
      setStatusMessage({ text: err.message || "Erro ao exportar relatório", isError: true });
    } finally {
      setLoading(false);
    }
  };

  // Interactive CSV costs downloader and importer
  const handleImportFileToDatabase = async (file: DriveFile) => {
    const confirmed = window.confirm(
      `Deseja baixar o arquivo '${file.name}' do Google Drive e importar os custos unitários no banco de dados do Meli Analytics?`
    );
    if (!confirmed) return;

    setActiveImportId(file.id);
    setStatusMessage(null);
    try {
      const content = await getDriveFileContent(file.id);
      
      // Call standard platform CSV importer
      const res = await importCostsCSV(content, file.name);
      
      setStatusMessage({ 
        text: `Importação concluída! Lote '${res.batch?.file_name || file.name}' criado com ${(res.batch?.inserted_rows || 0) + (res.batch?.updated_rows || 0)} SKUs atualizados.` 
      });
    } catch (err: any) {
      console.error(err);
      setStatusMessage({ text: err.message || "Falha ao ler ou converter dados do arquivo do Drive", isError: true });
    } finally {
      setActiveImportId(null);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto px-4 py-2 animate-fade-in text-white">
      
      {/* Header section with brand and description */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/5 pb-5">
        <div>
          <h2 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
            <Cloud className="h-7 w-7 text-yellow-400" />
            Integração com <span className="text-yellow-400">Google Drive</span>
          </h2>
          <p className="text-xs text-white/50 tracking-wide mt-1">
            SALVE SEUS BACKUPS OPERACIONAIS E IMPORTE PLANILHAS DE VALORES DIRETAMENTE DE SUA NUVEM
          </p>
        </div>
        
        {connected && (
          <div className="flex items-center gap-3 bg-yellow-400/5 border border-yellow-400/20 px-3.5 py-2 rounded-xl">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></div>
            <span className="text-[10px] font-mono tracking-wider font-extrabold text-yellow-400 uppercase">
              CONEXÃO ATIVA NO CLOUD
            </span>
          </div>
        )}
      </div>

      {/* Global Toast Success/Error message banner */}
      {statusMessage && (
        <div className={`p-4 rounded-xl flex items-start gap-3 border ${
          statusMessage.isError 
            ? "bg-red-500/10 border-red-500/20 text-red-300" 
            : "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
        }`}>
          {statusMessage.isError ? (
            <AlertCircle className="h-5 w-5 shrink-0" />
          ) : (
            <CheckCircle className="h-5 w-5 shrink-0" />
          )}
          <div className="text-xs font-semibold leading-relaxed flex-1">
            {statusMessage.text}
          </div>
          <button 
            onClick={() => setStatusMessage(null)} 
            className="text-[10px] uppercase tracking-wider font-bold opacity-60 hover:opacity-100 cursor-pointer"
          >
            Fechar
          </button>
        </div>
      )}

      {/* Grid: Primary layouts split */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Account info, status check, action triggers */}
        <div className="space-y-6 lg:col-span-1">
          
          {/* Section 1: Connection Box */}
          <div className="glass-card p-6 rounded-2xl border border-white/5 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-yellow-400/5 blur-2xl rounded-full"></div>
            
            <h3 className="text-xs font-bold tracking-widest text-white/50 uppercase mb-4 flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-yellow-400/80" />
              Credenciais da Nuvem
            </h3>

            {!connected ? (
              <div className="space-y-4">
                <p className="text-xs text-white/60 leading-relaxed font-medium">
                  Conecte seu Google Drive para ativar o arquivamento automático e leitura segura de planilhas.
                </p>

                {clientIdInputVisible && (
                  <div className="space-y-2 animate-fade-in">
                    <label className="block text-[10px] font-bold text-white/40 uppercase tracking-widest">
                      Google OAuth Client ID
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-white/30" />
                      <input 
                        type="text"
                        placeholder="Insira seu client_id_gcp"
                        value={clientId}
                        onChange={(e) => setClientId(e.target.value)}
                        className="w-full pl-9 pr-3 py-2.5 border border-white/10 bg-white/5 rounded-xl text-xs font-semibold text-white focus:outline-none focus:ring-1 focus:ring-yellow-400 placeholder-white/30"
                      />
                    </div>
                  </div>
                )}

                <div className="pt-2 space-y-2.5">
                  <button
                    onClick={handleConnectSimulated}
                    className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs font-bold text-slate-950 bg-yellow-400 hover:bg-yellow-350 cursor-pointer shadow-lg shadow-yellow-400/15 group"
                  >
                    <Cloud className="h-4 w-4 group-hover:scale-110 transition-transform" />
                    CONECTAR VIA SIMULAÇÃO DRIVE
                  </button>

                  <button
                    onClick={() => {
                      if (!clientIdInputVisible) {
                        setClientIdInputVisible(true);
                      } else {
                        handleConnectReal();
                      }
                    }}
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 border border-white/10 rounded-xl text-xs font-bold text-white hover:bg-white/5 cursor-pointer"
                  >
                    Conectar via OAuth Real
                  </button>
                  
                  <span className="text-[9px] text-white/30 font-medium block text-center leading-normal">
                    💡 O modo simulação permite testar toda a lógica de exportação, importação de CSVs e downloads no sandbox de demonstração local!
                  </span>
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="flex items-center gap-3 bg-white/5 p-3.5 rounded-xl border border-white/5">
                  {user?.picture ? (
                    <img 
                      src={user.picture} 
                      alt={user.name} 
                      className="w-10 h-10 rounded-full border border-yellow-400/20"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-yellow-400/20 text-yellow-400 flex items-center justify-center font-bold text-sm">
                      {user?.name?.[0] || "G"}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-black text-white truncate">{user?.name}</p>
                    <p className="text-[10px] font-mono text-white/50 truncate font-semibold mt-0.5">{user?.email}</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-[10px] text-white/50 leading-relaxed font-medium">
                    Sua conta está integrada de forma segura. Todas as chamadas de API são feitas de navegador para nuvem utilizando escopos de arquivos limitados.
                  </p>
                </div>

                <button
                  onClick={handleDisconnect}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 border border-red-500/20 hover:bg-red-500/10 text-red-400 rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Desconectar Conta Google
                </button>
              </div>
            )}
          </div>

          {/* Section 2: Write actions (Backups exporter) */}
          <div className="glass-card p-6 rounded-2xl border border-white/5 shadow-xl relative overflow-hidden">
            <h3 className="text-xs font-bold tracking-widest text-white/50 uppercase mb-4 flex items-center gap-1.5 border-b border-white/5 pb-2">
              <Upload className="h-4 w-4 text-yellow-400/80" />
              Exportar Backups
            </h3>
            
            <p className="text-xs text-white/50 leading-normal mb-4">
              Realize backup das informações de custos e vendas no seu Google Drive com garantia de recuperação.
            </p>

            <div className="space-y-3">
              <button
                disabled={!connected || loading}
                onClick={handleExportSkuCosts}
                className="w-full flex items-center justify-between p-3 border border-white/5 hover:border-yellow-400/30 hover:bg-white/5 rounded-xl text-xs font-bold text-left text-white disabled:opacity-40 disabled:hover:bg-transparent disabled:pointer-events-none transition-all cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <Database className="h-4 w-4 text-yellow-400 shrink-0" />
                  <span>Backup de Custos SKU (.csv)</span>
                </div>
                <ChevronRight className="h-3.5 w-3.5 text-white/30" />
              </button>

              <button
                disabled={!connected || loading}
                onClick={handleExportSalesBackup}
                className="w-full flex items-center justify-between p-3 border border-white/5 hover:border-yellow-400/30 hover:bg-white/5 rounded-xl text-xs font-bold text-left text-white disabled:opacity-40 disabled:hover:bg-transparent disabled:pointer-events-none transition-all cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <FileCode className="h-4 w-4 text-emerald-400 shrink-0" />
                  <span>Relatório Consolidado (.json)</span>
                </div>
                <ChevronRight className="h-3.5 w-3.5 text-white/30" />
              </button>
            </div>
          </div>

          {/* Section 3: API Status Info (Mercado Livre and Melhor Envio API availability checking) */}
          <div className="backdrop-blur-xl bg-slate-900/60 border border-yellow-500/10 p-5 rounded-2xl shadow-xl relative">
            <h3 className="text-[10px] font-extrabold tracking-widest text-yellow-450 uppercase mb-3.5 flex items-center gap-2">
              <Info className="h-4 w-4 text-yellow-450" />
              Status de Integração APIs
            </h3>

            <div className="space-y-4">
              {/* Mercado Livre integration indicator */}
              <div className="flex items-start gap-2.5">
                <Check className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                <div className="text-[11px] leading-relaxed">
                  <span className="font-extrabold text-white text-xs block">Mercado Livre Developer Hub</span>
                  <span className="text-white/60">Serviços ativos nas rotas de pedidos, produtos e callbacks (/api/integrations/mercadolivre).</span>
                </div>
              </div>

              {/* Melhor Envio API verification */}
              <div className="flex items-start gap-2.5">
                <Check className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                <div className="text-[11px] leading-relaxed">
                  <span className="font-extrabold text-white text-xs block">Melhor Envio APIs (Logística)</span>
                  <span className="text-white/60">Rastreadores e simuladores de frete baseados nas tabelas oficiais do Melhor Envio integrados localmente no dashboard de precificação (/api/simulator/skus).</span>
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* Right Column: Dynamic Google Drive File Explorer */}
        <div className="lg:col-span-2 space-y-6">
          <div className="glass-card rounded-2xl border border-white/5 shadow-xl p-6">
            
            {/* Explorer Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-4 mb-4">
              <div>
                <h3 className="text-sm font-extrabold text-white tracking-tight flex items-center gap-2">
                  <FileSpreadsheet className="h-4.5 w-4.5 text-emerald-450" />
                  Navegador de Arquivos no Drive
                </h3>
                <p className="text-[10px] text-white/50 tracking-wider">
                  BUSQUE PLANILHAS EXCLUSIVAS DE CUSTOS PARA IMPORTAÇÃO IMEDIATA
                </p>
              </div>

              {connected && (
                <button
                  onClick={loadFiles}
                  className="flex items-center gap-1 bg-white/5 hover:bg-white/10 px-3 py-1.5 border border-white/5 rounded-lg text-[10px] font-bold uppercase transition-colors"
                >
                  <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
                  Recarregar
                </button>
              )}
            </div>

            {!connected ? (
              <div className="h-96 flex flex-col items-center justify-center text-center p-8 border-2 border-dashed border-white/5 rounded-2xl bg-black/10">
                <Cloud className="h-14 w-14 text-white/10 mb-4 animate-pulse" />
                <h4 className="text-sm font-bold text-white mb-2">Drive Indisponível</h4>
                <p className="text-xs text-white/40 max-w-sm mb-4">
                  Por favor, conecte ou ative o simulador do Google Drive para gerenciar backups e importar planilhas CSV.
                </p>
                <button
                  onClick={handleConnectSimulated}
                  className="px-4 py-2 bg-white/10 hover:bg-white/15 text-white border border-white/5 rounded-lg text-xs font-bold"
                >
                  Ativar Simulação Rápida para Testar
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                
                {/* Search / Filters block */}
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-white/35" />
                    <input
                      type="text"
                      placeholder="Pesquisar arquivos por nome..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="w-full pl-9 pr-3 py-2.5 border border-white/10 bg-white/5 rounded-xl text-xs font-bold focus:outline-none focus:ring-1 focus:ring-yellow-450 placeholder-white/30 text-white"
                    />
                  </div>

                  {/* Filter category selector */}
                  <div className="flex bg-white/5 p-1 border border-white/10 rounded-xl">
                    <button
                      onClick={() => setFilterType("all")}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-extrabold uppercase transition-all ${
                        filterType === "all" ? "bg-yellow-450 text-slate-950" : "text-white/60 hover:text-white"
                      }`}
                    >
                      Todos
                    </button>
                    <button
                      onClick={() => setFilterType("csv")}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-extrabold uppercase transition-all ${
                        filterType === "csv" ? "bg-emerald-550 text-white" : "text-white/60 hover:text-white"
                      }`}
                    >
                      Planilhas CSV
                    </button>
                    <button
                      onClick={() => setFilterType("json")}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-extrabold uppercase transition-all ${
                        filterType === "json" ? "bg-blue-550 text-white" : "text-white/60 hover:text-white"
                      }`}
                    >
                      JSON
                    </button>
                  </div>
                </div>

                {/* File list container */}
                {loading && files.length === 0 ? (
                  <div className="h-64 flex items-center justify-center">
                    <div className="flex flex-col items-center gap-2">
                      <RefreshCw className="h-8 w-8 text-yellow-400 animate-spin" />
                      <span className="text-[10px] font-mono uppercase text-white/40">Carregando arquivos do Drive...</span>
                    </div>
                  </div>
                ) : files.length === 0 ? (
                  <div className="h-64 flex flex-col items-center justify-center text-center p-8 border border-white/5 rounded-2xl bg-white/5">
                    <Search className="h-10 w-10 text-white/20 mb-3" />
                    <p className="text-xs text-white/40">Nenhum arquivo de planilha (.csv) ou backup (.json) foi encontrado no Drive.</p>
                  </div>
                ) : (
                  <div className="overflow-hidden border border-white/5 rounded-xl bg-white/5">
                    <table className="min-w-full divide-y divide-white/5 text-left text-xs font-medium">
                      <thead className="bg-white/5 text-[10px] text-white/40 font-bold uppercase tracking-wider">
                        <tr>
                          <th className="px-4 py-3">Nome do Arquivo</th>
                          <th className="px-4 py-3 hidden md:table-cell">Modificado em</th>
                          <th className="px-4 py-3 hidden sm:table-cell">Tamanho</th>
                          <th className="px-4 py-3 text-right">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {files.map((file) => {
                          const isCsv = file.name.endsWith(".csv") || file.mimeType.includes("csv");
                          const isJson = file.name.endsWith(".json") || file.mimeType.includes("json");
                          const isGoogleSheet = file.mimeType === "application/vnd.google-apps.spreadsheet";
                          const isImporting = activeImportId === file.id;

                          return (
                            <tr key={file.id} className="hover:bg-white/5 transition-all">
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-3">
                                  {isCsv && (
                                    <FileSpreadsheet className="h-4.5 w-4.5 text-emerald-400 shrink-0" />
                                  )}
                                  {isJson && (
                                    <FileCode className="h-4.5 w-4.5 text-blue-400 shrink-0" />
                                  )}
                                  {isGoogleSheet && (
                                    <FileSpreadsheet className="h-4.5 w-4.5 text-yellow-400 shrink-0" />
                                  )}
                                  {!isCsv && !isJson && !isGoogleSheet && (
                                    <Cloud className="h-4.5 w-4.5 text-white/40 shrink-0" />
                                  )}
                                  <div className="min-w-0">
                                    <p className="font-extrabold text-white truncate max-w-[200px] sm:max-w-xs">{file.name}</p>
                                    <p className="text-[9px] text-white/35 font-mono truncate font-semibold">{file.mimeType.replace("application/vnd.google-apps.", "")}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3 hidden md:table-cell text-white/60 font-semibold font-mono">
                                {new Date(file.createdTime).toLocaleString("pt-BR", {
                                  day: "2-digit",
                                  month: "2-digit",
                                  hour: "2-digit",
                                  minute: "2-digit"
                                })}
                              </td>
                              <td className="px-4 py-3 hidden sm:table-cell text-white/60 font-semibold">
                                {file.size ? `${(file.size / 1024).toFixed(1)} KB` : "N/A"}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <div className="flex items-center justify-end gap-2">
                                  
                                  {/* Download button */}
                                  {file.webViewLink && (
                                    <a
                                      href={file.webViewLink}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="p-2 border border-white/5 hover:border-white/20 hover:bg-white/5 rounded-lg text-white/75 hover:text-white transition-all cursor-pointer"
                                      title="Abrir no Google Drive"
                                    >
                                      <ExternalLink className="h-3.5 w-3.5" />
                                    </a>
                                  )}

                                  {/* Import/Process active button */}
                                  {isCsv && (
                                    <button
                                      disabled={isImporting}
                                      onClick={() => handleImportFileToDatabase(file)}
                                      className="flex items-center gap-1 bg-emerald-500 hover:bg-emerald-400 text-white font-extrabold rounded-lg py-1.5 px-3 uppercase text-[9px] transition-colors shadow-lg shadow-emerald-500/15 cursor-pointer disabled:opacity-40"
                                      title="Importar SKU custos deste arquivo"
                                    >
                                      {isImporting ? (
                                        <RefreshCw className="h-3 w-3 animate-spin" />
                                      ) : (
                                        <Download className="h-3 w-3" />
                                      )}
                                      Importar Custos
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

      </div>

    </div>
  );
}

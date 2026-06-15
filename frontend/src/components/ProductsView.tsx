import React, { useState, useEffect } from "react";
import { 
  getMLProducts, 
  getMLAccounts,
  updateMLProduct
} from "../services/api";
import { MercadoLivreAccount } from "../types";
import { 
  Search, 
  Filter, 
  Package, 
  ExternalLink, 
  CheckCircle, 
  AlertCircle, 
  Layers, 
  Info, 
  Calendar, 
  Zap, 
  Truck, 
  Grid, 
  List, 
  ChevronLeft, 
  ChevronRight, 
  X, 
  Copy, 
  DollarSign, 
  Award, 
  Settings,
  Eye
} from "lucide-react";

export default function ProductsView() {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Accounts
  const [accounts, setAccounts] = useState<MercadoLivreAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string>("");

  // Filters & Pagination
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalProducts, setTotalProducts] = useState(0);
  const itemsPerPage = 20;

  // Layout switcher
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  // Detailed modal inspector
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null);
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const [copiedSku, setCopiedSku] = useState(false);

  // Edit fields State
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editPrice, setEditPrice] = useState<number>(0);
  const [editQty, setEditQty] = useState<number>(0);
  const [editStatus, setEditStatus] = useState("active");
  const [editSku, setEditSku] = useState("");
  const [editVideo, setEditVideo] = useState("");
  const [editWarranty, setEditWarranty] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (selectedProduct) {
      setEditTitle(selectedProduct.title || "");
      setEditPrice(selectedProduct.price || 0);
      setEditQty(selectedProduct.available_quantity || 0);
      setEditStatus(selectedProduct.status || "active");
      setEditSku(selectedProduct.sku === "N/A" ? "" : selectedProduct.sku || "");
      setEditVideo(selectedProduct.video_id || "");
      setEditWarranty(selectedProduct.warranty || "");
      setSaveMessage(null);
      setIsEditing(false);
    }
  }, [selectedProduct]);

  const handleSaveProduct = async () => {
    if (!selectedProduct) return;
    setSaving(true);
    setSaveMessage(null);
    try {
      const result = await updateMLProduct(selectedProduct.id, {
        accountId: selectedProduct.accountId,
        title: editTitle,
        price: Number(editPrice),
        available_quantity: Number(editQty),
        status: editStatus,
        video_id: editVideo,
        warranty: editWarranty,
        sku: editSku
      });
      
      setSaveMessage({ type: "success", text: result.message || "Anúncio atualizado com sucesso no Mercado Livre!" });
      
      setSelectedProduct(prev => {
        if (!prev) return null;
        return {
          ...prev,
          title: editTitle,
          price: Number(editPrice),
          available_quantity: Number(editQty),
          status: editStatus,
          sku: editSku,
          video_id: editVideo,
          warranty: editWarranty
        };
      });

      fetchProducts();
      setTimeout(() => {
        setIsEditing(false);
      }, 1500);
    } catch (err: any) {
      setSaveMessage({ type: "error", text: err.message || "Falha ao gravar modificações do anúncio." });
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    async function loadAccounts() {
      try {
        const mlAccs = await getMLAccounts();
        setAccounts(mlAccs);
        if (mlAccs.length > 0) {
          // Default to first account or empty (all accounts)
          setSelectedAccount("");
        }
      } catch (err: any) {
        console.error("Erro ao carregar contas integradas:", err);
      }
    }
    loadAccounts();
  }, []);

  const fetchProducts = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getMLProducts({
        accountId: selectedAccount || undefined,
        search: searchTerm || undefined,
        status: statusFilter || undefined,
        limit: itemsPerPage,
        offset: (currentPage - 1) * itemsPerPage
      });
      setProducts(res.products || []);
      setTotalProducts(res.total || 0);
    } catch (err: any) {
      setError(err.message || "Falha ao consultar anúncios. Garanta que suas credenciais e tokens estão atualizados.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, [selectedAccount, statusFilter, currentPage]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setCurrentPage(1);
    fetchProducts();
  };

  const handleCopySku = (sku: string) => {
    navigator.clipboard.writeText(sku);
    setCopiedSku(true);
    setTimeout(() => setCopiedSku(false), 2000);
  };

  const formatCurrency = (val: number, curId = "BRL") => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: curId
    }).format(val);
  };

  const getStatusBadge = (status: string) => {
    switch (status?.toLowerCase()) {
      case "active":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-green-500/10 text-green-400 border border-green-500/20">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse"></span>
            Ativo
          </span>
        );
      case "paused":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500"></span>
            Pausado
          </span>
        );
      case "closed":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-500/10 text-red-400 border border-red-500/20">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500"></span>
            Fechado
          </span>
        );
      case "under_review":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-500/10 text-blue-400 border border-blue-500/30">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-ping"></span>
            Em Revisão
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-white/10 text-white/65">
            {status}
          </span>
        );
    }
  };

  const totalPages = Math.max(1, Math.ceil(totalProducts / itemsPerPage));

  return (
    <div className="space-y-6">
      {/* 1. Header and Account Selectors */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white/2 p-6 rounded-2xl border border-white/5 shadow-md">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Package className="h-5 w-5 text-yellow-500" />
            Catálogo Integrado de Anúncios
          </h2>
          <p className="text-xs text-white/40 mt-1">
            Veja detalhes profundos, miniaturas, categorias oficiais e status reais dos seus anúncios ativos no Mercado Livre.
          </p>
        </div>

        {/* Filters Panel */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Account Filter */}
          <div className="flex flex-col">
            <label className="text-[10px] uppercase font-bold text-white/30 mb-1">Empresa / Conta</label>
            <select
              value={selectedAccount}
              onChange={(e) => {
                setSelectedAccount(e.target.value);
                setCurrentPage(1);
              }}
              className="bg-zinc-900 border border-white/10 text-white px-3 py-1.5 rounded-xl text-xs font-semibold focus:border-yellow-400 outline-none cursor-pointer"
            >
              <option value="">Todas as Contas ({accounts.length})</option>
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.nickname}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div className="flex flex-col">
            <label className="text-[10px] uppercase font-bold text-white/30 mb-1">Status de Venda</label>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="bg-zinc-900 border border-white/10 text-white px-3 py-1.5 rounded-xl text-xs font-semibold focus:border-yellow-400 outline-none cursor-pointer"
            >
              <option value="active">Apenas Ativos</option>
              <option value="paused">Apenas Pausados</option>
              <option value="closed">Fechados / Finalizados</option>
              <option value="under_review">Em Revisão</option>
              <option value="">Todos os Status</option>
            </select>
          </div>

          {/* Grid/List switch */}
          <div className="flex flex-col">
            <label className="text-[10px] uppercase font-bold text-white/30 mb-1">Visualização</label>
            <div className="flex border border-white/10 rounded-xl overflow-hidden bg-zinc-950 p-0.5">
              <button
                onClick={() => setViewMode("grid")}
                className={`p-1 px-2.5 rounded-lg text-xs font-bold transition-all ${
                  viewMode === "grid" 
                    ? "bg-yellow-400 text-zinc-950 shadow-md" 
                    : "text-white/50 hover:text-white"
                }`}
              >
                <Grid className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={`p-1 px-2.5 rounded-lg text-xs font-bold transition-all ${
                  viewMode === "list" 
                    ? "bg-yellow-400 text-zinc-950 shadow-md" 
                    : "text-white/50 hover:text-white"
                }`}
              >
                <List className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Direct Search Form */}
      <form onSubmit={handleSearchSubmit} className="flex gap-2">
        <div className="relative flex-1">
          <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none">
            <Search className="h-4 w-4 text-white/30" />
          </span>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por ID (MLB...), Título do Anúncio ou Código SKU..."
            className="w-full bg-white/[0.03] border border-white/8 rounded-xl py-2.5 pl-10 pr-4 text-xs font-medium text-white placeholder-white/20 focus:border-yellow-400/50 focus:ring-1 focus:ring-yellow-400/20 focus:outline-none transition-all"
          />
        </div>
        <button
          type="submit"
          className="bg-yellow-400 text-slate-950 hover:bg-yellow-300 px-6 py-2.5 rounded-xl font-bold text-xs shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
        >
          <Search className="h-3.5 w-3.5" />
          Refinar
        </button>
      </form>

      {/* 3. Products List View Container */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="glass-card rounded-2xl p-4 space-y-4 animate-pulse">
              <div className="w-full aspect-square bg-white/5 rounded-xl"></div>
              <div className="h-4 bg-white/10 rounded w-3/4"></div>
              <div className="h-3 bg-white/5 rounded w-1/2"></div>
              <div className="flex justify-between items-center pt-2">
                <div className="h-5 bg-white/10 rounded w-1/3"></div>
                <div className="h-5 bg-white/5 rounded w-1/4"></div>
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="glass-card rounded-2xl p-12 text-center max-w-2xl mx-auto space-y-4 border border-red-500/10">
          <AlertCircle className="h-12 w-12 text-red-400 mx-auto" />
          <h3 className="text-base font-bold text-white">Falha ao Conectar</h3>
          <p className="text-xs text-white/50 leading-relaxed">
            {error}
          </p>
          <div className="pt-2">
            <button
              onClick={() => fetchProducts()}
              className="bg-white/5 border border-white/10 hover:bg-white/10 px-5 py-2 rounded-xl text-xs font-bold text-yellow-400 transition-all cursor-pointer"
            >
              Tentar Novamente
            </button>
          </div>
        </div>
      ) : products.length === 0 ? (
        <div className="glass-card rounded-2xl p-16 text-center max-w-md mx-auto space-y-4">
          <Package className="h-12 w-12 text-white/30 mx-auto" />
          <p className="text-sm font-bold text-white">Nenhum anúncio encontrado</p>
          <p className="text-xs text-white/40">
            Nenhum produto foi localizado com os termos informados ou para os filtros selecionados.
          </p>
          <button 
            type="button" 
            onClick={() => {
              setSearchTerm("");
              setStatusFilter("");
              setSelectedAccount("");
              setCurrentPage(1);
            }} 
            className="text-xs text-yellow-400 font-bold hover:underline"
          >
            Limpar todos os filtros ↺
          </button>
        </div>
      ) : viewMode === "grid" ? (
        // Grid Visualization
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {products.map((p) => (
            <div 
              key={p.id}
              className="glass-card glass-card-hover rounded-2xl p-4 flex flex-col justify-between group overflow-hidden relative cursor-pointer"
              onClick={() => {
                setSelectedProduct(p);
                setActivePhotoIndex(0);
              }}
            >
              {/* Account tag overlay */}
              <div className="absolute top-2 left-2 z-10">
                <span className="bg-black/60 backdrop-blur-md text-[9px] font-bold text-yellow-400 px-2 py-0.5 rounded-full border border-yellow-400/20">
                  {p.accountNickname}
                </span>
              </div>

              <div>
                {/* Thumbnail Container */}
                <div className="w-full aspect-square bg-black/20 rounded-xl overflow-hidden flex items-center justify-center relative mb-3 group-hover:scale-[1.02] transition-transform duration-300">
                  <img 
                    src={p.thumbnail ? p.thumbnail.replace("-I.jpg", "-O.jpg") : "/placeholder.png"} 
                    alt={p.title}
                    referrerPolicy="no-referrer"
                    className="object-contain w-full h-full p-2"
                  />
                  {p.original_price > p.price && (
                    <span className="absolute top-2 right-2 bg-rose-600 text-[10px] font-extrabold text-white px-2 py-0.5 rounded-md">
                      -{Math.round(((p.original_price - p.price) / p.original_price) * 100)}%
                    </span>
                  )}
                </div>

                {/* SKU Code */}
                <div className="flex items-center gap-1.5 mb-1 text-[9px] text-white/30 font-bold uppercase tracking-widest font-mono">
                  <span>SKU: {p.sku || "N/A"}</span>
                </div>

                {/* Listing Title */}
                <h3 className="text-xs font-bold text-white line-clamp-2 leading-snug group-hover:text-yellow-400 transition-colors">
                  {p.title}
                </h3>

                {/* Category & Logistics tags */}
                <div className="mt-2 flex flex-wrap gap-1">
                  <span className="bg-white/5 text-[9px] font-semibold text-white/60 px-2 py-0.5 rounded-md border border-white/5 flex items-center gap-1 truncate max-w-full">
                    <Layers className="h-2.5 w-2.5 flex-shrink-0" />
                    {p.category_name}
                  </span>
                  {p.normalized_logistics && (
                    <span className="bg-yellow-500/10 text-[9px] font-semibold text-yellow-400 px-2 py-0.5 rounded-md border border-yellow-500/10 flex items-center gap-1 truncate max-w-full">
                      <Truck className="h-2.5 w-2.5 flex-shrink-0 text-yellow-400" />
                      {p.normalized_logistics}
                    </span>
                  )}
                </div>
              </div>

              {/* Price & Footnote detail */}
              <div className="border-t border-white/5 mt-3 pt-3 flex items-end justify-between">
                <div>
                  <span className="text-[9px] uppercase font-bold text-white/30 block">Valor Venda</span>
                  <div className="flex items-baseline gap-1.5 flex-wrap">
                    <span className="text-sm font-black text-white">{formatCurrency(p.price, p.currency_id)}</span>
                    {p.original_price > p.price && (
                      <span className="text-[9px] text-white/30 line-through font-medium">
                        {formatCurrency(p.original_price, p.currency_id)}
                      </span>
                    )}
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-[9px] uppercase font-bold text-white/30 block">Estoque</span>
                  <span className="text-xs font-black text-white/80">{p.available_quantity} <span className="font-medium text-[10px] text-white/40">un</span></span>
                </div>
              </div>
              
              {/* Hover inspect banner overlay */}
              <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300">
                <span className="bg-yellow-400 text-slate-950 px-4 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1 shadow-lg">
                  <Eye className="h-3.5 w-3.5" />
                  Inspecionar Anúncio
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        // List Visualization
        <div className="space-y-2">
          {products.map((p) => (
            <div 
              key={p.id}
              className="glass-card glass-card-hover rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-4 cursor-pointer"
              onClick={() => {
                setSelectedProduct(p);
                setActivePhotoIndex(0);
              }}
            >
              <div className="flex items-center gap-4 w-full md:w-3/5">
                {/* Thumbnail */}
                <div className="h-14 w-14 bg-black/20 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center border border-white/5">
                  <img 
                    src={p.thumbnail}
                    alt={p.title}
                    referrerPolicy="no-referrer"
                    className="object-contain w-full h-full p-1"
                  />
                </div>

                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="bg-black/40 text-[9px] font-bold text-yellow-400 px-2 py-0.5 rounded border border-yellow-400/10">
                      {p.accountNickname}
                    </span>
                    <span className="text-[10px] font-mono text-white/30 font-semibold">{p.id}</span>
                    <span className="text-[10px] font-mono font-bold text-white/40 uppercase bg-white/5 px-2 py-0.2 rounded">
                      SKU: {p.sku || "N/A"}
                    </span>
                  </div>

                  <h3 className="text-xs font-bold text-white leading-snug mt-1 hover:text-yellow-400 transition-colors line-clamp-1">
                    {p.title}
                  </h3>

                  <div className="flex items-center gap-3 mt-1.5 text-[10px] text-white/40 font-semibold">
                    <span className="flex items-center gap-1">
                      <Layers className="h-3 w-3 text-yellow-500/60" />
                      {p.category_name}
                    </span>
                    <span>•</span>
                    <span>Origem: {p.condition === "new" ? "Novo" : "Usado"}</span>
                  </div>
                </div>
              </div>

              {/* Status and Logistics tags */}
              <div className="flex flex-wrap items-center gap-6 justify-between md:justify-end w-full md:w-2/5">
                <div className="flex flex-col text-left md:text-right">
                  <span className="text-[9px] uppercase font-bold text-white/30">Logítica</span>
                  <span className="text-xs font-bold text-white flex items-center gap-1 mt-0.5">
                    <Truck className="h-3 w-3 text-yellow-400" />
                    {p.normalized_logistics || p.logistic_type?.toUpperCase() || p.shipping_mode?.toUpperCase() || "N/A"}
                  </span>
                </div>

                <div className="flex flex-col text-left md:text-right">
                  <span className="text-[9px] uppercase font-bold text-white/30">Preço / Estoque</span>
                  <div className="mt-0.5">
                    <span className="text-xs font-black text-white">{formatCurrency(p.price, p.currency_id)}</span>
                    <span className="text-xs text-white/40 font-semibold ml-2">({p.available_quantity} dip.)</span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {getStatusBadge(p.status)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 4. Smooth Pagination Footer */}
      <div className="flex items-center justify-between border-t border-white/5 pt-6 mt-4">
        <span className="text-xs font-semibold text-white/40">
          Mostrando <span className="text-white font-extrabold">{products.length}</span> de <span className="text-yellow-400 font-extrabold">{totalProducts}</span> anúncios
        </span>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
            disabled={currentPage === 1}
            className="p-2 border border-white/10 rounded-xl bg-zinc-950/20 hover:bg-zinc-900 text-white/60 hover:text-white disabled:opacity-20 disabled:pointer-events-none transition-all cursor-pointer"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          
          <div className="text-xs font-bold text-white px-3 flex gap-1">
            <span>Página</span>
            <span className="text-yellow-400">{currentPage}</span>
            <span>/</span>
            <span>{totalPages}</span>
          </div>

          <button
            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
            disabled={currentPage === totalPages}
            className="p-2 border border-white/10 rounded-xl bg-zinc-950/20 hover:bg-zinc-900 text-white/60 hover:text-white disabled:opacity-20 disabled:pointer-events-none transition-all cursor-pointer"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* 5. Deep Detail Inspectors Slide-Over Modal */}
      {selectedProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/70 backdrop-blur-sm animate-fade-in">
          {/* Backdrop close capture trigger */}
          <div className="absolute inset-0" onClick={() => setSelectedProduct(null)}></div>

          {/* Sliding container content sheet */}
          <div className="relative w-full max-w-2xl h-screen bg-zinc-950 border-l border-white/10 p-6 sm:p-8 overflow-y-auto flex flex-col justify-between shadow-2xl z-10 animate-slide-left">
            
            {/* Header portion */}
            <div>
              <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="bg-yellow-400 text-slate-950 font-bold text-[10px] px-2 py-0.5 rounded-full uppercase font-sans">
                      {selectedProduct.accountNickname}
                    </span>
                    <span className="text-xs font-mono text-white/40">{selectedProduct.id}</span>
                  </div>
                  <h3 className="text-base font-bold text-white mt-1 leading-snug">{selectedProduct.title}</h3>
                </div>
                <button
                  onClick={() => setSelectedProduct(null)}
                  className="p-1.5 border border-white/10 hover:border-white/20 rounded-xl bg-white/5 hover:bg-white/10 text-white/50 hover:text-white transition-all cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Tab Switcher for View vs Edit Mode */}
              <div className="flex border-b border-white/5 mb-6 text-xs gap-2">
                <button 
                  onClick={() => setIsEditing(false)}
                  className={`pb-2.5 px-4 font-extrabold border-b-2 transition-all ${!isEditing ? "border-yellow-400 text-yellow-400" : "border-transparent text-white/40 hover:text-white"}`}
                >
                  Ficha & Estatísticas
                </button>
                <button 
                  onClick={() => setIsEditing(true)}
                  className={`pb-2.5 px-4 font-extrabold border-b-2 transition-all ${isEditing ? "border-yellow-400 text-yellow-400" : "border-transparent text-white/40 hover:text-white"}`}
                >
                  Editar Anúncio (Manual/Lote)
                </button>
              </div>

              {!isEditing ? (
                /* VIEW & STATS MODE */
                <div className="space-y-6">
                  {/* Technical inspect split grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    
                    {/* Left Side: Pictures Gallery */}
                    <div className="space-y-3">
                      <div className="w-full aspect-square bg-white/5 rounded-2xl overflow-hidden flex items-center justify-center p-4 border border-white/5 relative">
                        <img
                          src={selectedProduct.pictures && selectedProduct.pictures.length > 0
                            ? selectedProduct.pictures[activePhotoIndex]
                            : selectedProduct.thumbnail?.replace("-I.jpg", "-O.jpg")
                          }
                          referrerPolicy="no-referrer"
                          alt={selectedProduct.title}
                          className="object-contain w-full h-full"
                        />
                        
                        {/* Floating quick info icon */}
                        <div className="absolute top-2 right-2 bg-black/60 text-[10px] font-bold text-white/80 border border-white/10 rounded-md px-2 py-0.5">
                          Foto {activePhotoIndex + 1} de {selectedProduct.pictures?.length || 1}
                        </div>
                      </div>

                      {/* Picture Selector row */}
                      {selectedProduct.pictures && selectedProduct.pictures.length > 1 && (
                        <div className="flex gap-2 overflow-x-auto py-1">
                          {selectedProduct.pictures.map((picUrl: string, idx: number) => (
                            <button
                              key={idx}
                              onClick={() => {
                                  setActivePhotoIndex(idx);
                              }}
                              className={`w-12 h-12 border rounded-lg bg-white/4 p-0.5 overflow-hidden flex-shrink-0 transition-transform ${
                                activePhotoIndex === idx 
                                  ? "border-yellow-400 scale-[1.05]" 
                                  : "border-white/10 opacity-60 hover:opacity-100"
                              }`}
                            >
                              <img
                                src={picUrl}
                                referrerPolicy="no-referrer"
                                alt=""
                                className="object-cover w-full h-full rounded"
                              />
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Original link shortcut */}
                      <a
                        href={selectedProduct.permalink}
                        target="_blank"
                        rel="noreferrer"
                        className="w-full text-center flex items-center justify-center gap-2 py-2.5 bg-yellow-400 hover:bg-yellow-350 text-slate-950 font-extrabold rounded-xl text-xs shadow-md transition-all mt-4"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Ir para Anúncio no Mercado Livre
                      </a>
                    </div>

                    {/* Right Side: Key Metadata parameters */}
                    <div className="space-y-4">
                      {/* Performance Indicators Grid */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-white/[0.02] border border-white/5 p-3 rounded-xl flex flex-col justify-center">
                          <span className="text-[9px] uppercase font-bold text-white/30 block">Valor Venda</span>
                          <span className="text-base font-black text-white mt-0.5">
                            {formatCurrency(selectedProduct.price, selectedProduct.currency_id)}
                          </span>
                          {selectedProduct.original_price > selectedProduct.price && (
                            <span className="text-[10px] text-white/40 line-through">
                              {formatCurrency(selectedProduct.original_price, selectedProduct.currency_id)}
                            </span>
                          )}
                        </div>

                        <div className="bg-white/[0.02] border border-white/5 p-3 rounded-xl flex flex-col justify-center">
                          <span className="text-[9px] uppercase font-bold text-white/30 block">Estoque Disponível</span>
                          <span className="text-base font-black text-white mt-0.5">
                            {selectedProduct.available_quantity} un
                          </span>
                        </div>

                        <div className="bg-white/[0.02] border border-white/5 p-3 rounded-xl flex flex-col justify-center">
                          <span className="text-[9px] uppercase font-bold text-white/30 block">Quantidade Vendida</span>
                          <span className="text-xs font-black text-white mt-0.5">
                            {selectedProduct.sold_quantity || 0} unidades
                          </span>
                        </div>

                        <div className="bg-white/[0.02] border border-white/5 p-3 rounded-xl flex flex-col justify-center">
                          <span className="text-[9px] uppercase font-bold text-white/30 block">Estado Geral</span>
                          <span className="mt-0.5">{getStatusBadge(selectedProduct.status)}</span>
                        </div>
                      </div>

                      {/* SKU copy tool */}
                      <div className="bg-white/4 border border-white/8 p-3 rounded-xl">
                        <span className="text-[9px] uppercase font-bold text-white/40 flex items-center justify-between">
                          Identificador SKU
                          <button 
                            onClick={() => handleCopySku(selectedProduct.sku)}
                            className="text-yellow-400 hover:text-yellow-300 font-bold inline-flex items-center gap-1 text-[9px] uppercase"
                          >
                            <Copy className="h-3 w-3" />
                            {copiedSku ? "Copiado!" : "Copiar"}
                          </button>
                        </span>
                        <p className="text-sm font-mono font-black text-white mt-1 break-all select-all">
                          {selectedProduct.sku || "Nenhum cadastrado"}
                        </p>
                      </div>

                      {/* Product Specification Parameters */}
                      <div className="bg-white/2 border border-white/5 rounded-xl px-4 py-3 divide-y divide-white/5 space-y-2 text-xs">
                        <div className="flex justify-between items-center py-1.55">
                          <span className="text-white/40">Categoria Oficial</span>
                          <span className="text-white font-bold">{selectedProduct.category_name}</span>
                        </div>
                        
                        <div className="flex justify-between items-center py-1.55">
                          <span className="text-white/40">Logística (Normalizada)</span>
                          <span className="text-yellow-400 font-extrabold flex items-center gap-1">
                            <Truck className="h-3.5 w-3.5" />
                            {selectedProduct.normalized_logistics || "Retirada em Mãos"}
                          </span>
                        </div>

                        <div className="flex justify-between items-center py-1.55">
                          <span className="text-white/40">Tipo de Exposição</span>
                          <span className="text-white font-bold">{selectedProduct.listing_type_id?.replace("_", " ").toUpperCase() || "N/A"}</span>
                        </div>

                        <div className="flex justify-between items-center py-1.55">
                          <span className="text-white/40">Envio Grátis</span>
                          <span className={`font-bold ${selectedProduct.shipping_free ? "text-green-400" : "text-white/50"}`}>
                            {selectedProduct.shipping_free ? "Sim, Oferecido" : "Não Contém"}
                          </span>
                        </div>

                        <div className="flex justify-between items-center py-1.55">
                          <span className="text-white/40">Garantia Informada</span>
                          <span className="text-white font-semibold text-right max-w-[160px] truncate">{selectedProduct.warranty || "Nenhuma registrada"}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Dynamic billing & analytics medians based on real last 3 months order history */}
                  <div className="bg-yellow-400/[0.02] border border-yellow-400/15 p-4 rounded-2xl space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-black uppercase text-yellow-400 tracking-wider flex items-center gap-1.5">
                        <span className="inline-block h-2 w-2 rounded-full bg-yellow-400 animate-pulse"></span>
                        Análise de Frete e Taxas (Mediana - 3 Meses)
                      </h4>
                      <span className="text-[9px] font-bold text-white/40 bg-white/5 px-2 py-0.5 rounded">Histórico Real</span>
                    </div>
                    
                    <p className="text-[10px] text-white/50 leading-relaxed">
                      Estatísticas baseadas estritamente no histórico de pedidos consolidados nos últimos 3 meses no Neon Postgres. Considera fretes pagos reais e taxas proporcionais do marketplace por unidade.
                    </p>

                    <div className="grid grid-cols-3 gap-3 pt-1">
                      <div className="bg-zinc-950/40 p-3 rounded-xl border border-white/5 text-center">
                        <span className="text-[9px] uppercase font-bold text-white/35 block">Mediana de Frete</span>
                        <span className="text-xs font-black text-white block mt-1">
                          {selectedProduct.median_shipping > 0 ? formatCurrency(selectedProduct.median_shipping) : "R$ 0,00"}
                        </span>
                        <span className="text-[8px] text-white/30 block mt-0.5">por pcte/envio</span>
                      </div>

                      <div className="bg-zinc-950/40 p-3 rounded-xl border border-white/5 text-center">
                        <span className="text-[9px] uppercase font-bold text-white/35 block">Mediana de Taxa</span>
                        <span className="text-xs font-black text-white block mt-1">
                          {selectedProduct.median_fee > 0 ? formatCurrency(selectedProduct.median_fee) : "R$ 0,00"}
                        </span>
                        <span className="text-[8px] text-white/30 block mt-0.5">comissão cobrada</span>
                      </div>

                      <div className="bg-zinc-950/40 p-3 rounded-xl border border-white/5 text-center">
                        <span className="text-[9px] uppercase font-bold text-white/35 block">Vendas no Período</span>
                        <span className="text-xs font-black text-yellow-400 block mt-1">
                          {selectedProduct.sales_count || 0}
                        </span>
                        <span className="text-[8px] text-white/30 block mt-0.5">unidades vendidas</span>
                      </div>
                    </div>
                  </div>

                  {/* Technical specifications accordion (attributes body) */}
                  {selectedProduct.attributes && selectedProduct.attributes.length > 0 && (
                    <div className="border-t border-white/10 pt-4">
                      <h4 className="text-xs uppercase font-extrabold tracking-wider text-white/50 mb-3 flex items-center gap-1.5">
                        <Settings className="h-3.5 w-3.5 text-yellow-500" />
                        Ficha Técnica (Atributos Completos)
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-black/20 p-3 rounded-xl max-h-[140px] overflow-y-auto border border-white/5 font-mono text-[10px]">
                        {selectedProduct.attributes.map((attr: any, idx: number) => (
                          <div key={idx} className="flex justify-between gap-2 border-b border-white/2 pb-1 hover:bg-white/2 px-1 rounded">
                            <span className="text-white/30 truncate max-w-[150px]">{attr.name}</span>
                            <span className="text-white font-medium text-right truncate max-w-[150px]">{attr.value_name || "N/A"}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* EDIT PRODUCT MODE */
                <div className="space-y-4">
                  <div className="bg-white/[0.01] border border-white/5 p-4 rounded-2xl space-y-4 select-text">
                    <div className="flex items-center gap-1.5 pb-2 border-b border-white/5">
                      <Settings className="h-4 w-4 text-yellow-400" />
                      <h4 className="text-xs font-black uppercase text-white tracking-wider">Editar Informações de Venda</h4>
                    </div>

                    {saveMessage && (
                      <div className={`p-3.5 rounded-xl text-xs font-bold leading-relaxed ${
                        saveMessage.type === "success" 
                          ? "bg-green-500/10 text-green-400 border border-green-500/20" 
                          : "bg-red-500/10 text-red-400 border border-red-500/20"
                      }`}>
                        {saveMessage.text}
                      </div>
                    )}

                    <div className="space-y-3.5 text-xs">
                      {/* Título do Anúncio */}
                      <div className="flex flex-col">
                        <label className="text-[10px] font-bold text-white/40 uppercase mb-1">Título Oficial do Anúncio</label>
                        <input
                          type="text"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          className="bg-zinc-900 border border-white/10 rounded-xl px-3.5 py-2 text-xs font-semibold text-white focus:border-yellow-400 outline-none w-full"
                          placeholder="Ex: Xiaomi Redmi Note 12 Original"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3.5">
                        {/* Preço */}
                        <div className="flex flex-col">
                          <label className="text-[10px] font-bold text-white/40 uppercase mb-1">Preço de Venda (R$)</label>
                          <input
                            type="number"
                            step="0.01"
                            value={editPrice}
                            onChange={(e) => setEditPrice(parseFloat(e.target.value) || 0)}
                            className="bg-zinc-900 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white focus:border-yellow-400 outline-none w-full font-mono font-bold"
                          />
                        </div>

                        {/* Estoque */}
                        <div className="flex flex-col">
                          <label className="text-[10px] font-bold text-white/40 uppercase mb-1">Quantidade em Estoque</label>
                          <input
                            type="number"
                            value={editQty}
                            onChange={(e) => setEditQty(parseInt(e.target.value) || 0)}
                            className="bg-zinc-900 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white focus:border-yellow-400 outline-none w-full font-mono font-bold"
                          />
                        </div>
                      </div>

                      {/* SKU */}
                      <div className="flex flex-col">
                        <label className="text-[10px] font-bold text-white/40 uppercase mb-1">Código de Referência SKU (seller_custom_field)</label>
                        <input
                          type="text"
                          value={editSku}
                          onChange={(e) => setEditSku(e.target.value)}
                          className="bg-zinc-900 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white focus:border-yellow-400 outline-none w-full font-mono"
                          placeholder="Código SKU de correspondência"
                        />
                        <span className="text-[9px] text-white/30 mt-1">Este SKU é crucial para vincular custos, calcular margens de lucro e cruzar relatórios automaticamente!</span>
                      </div>

                      {/* Video ID */}
                      <div className="flex flex-col">
                        <label className="text-[10px] font-bold text-white/40 uppercase mb-1">ID do Vídeo Promocional (YouTube)</label>
                        <input
                          type="text"
                          value={editVideo}
                          onChange={(e) => setEditVideo(e.target.value)}
                          className="bg-zinc-900 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white focus:border-yellow-400 outline-none w-full font-mono"
                          placeholder="Insira apenas o ID final. Ex: dQw4w9WgXcQ"
                        />
                        <span className="text-[9px] text-white/30 mt-1">Disponibiliza um vídeo na galeria de mídias de seu anúncio oficial.</span>
                      </div>

                      {/* Warranty */}
                      <div className="flex flex-col">
                        <label className="text-[10px] font-bold text-white/40 uppercase mb-1">Informações de Garantia</label>
                        <input
                          type="text"
                          value={editWarranty}
                          onChange={(e) => setEditWarranty(e.target.value)}
                          className="bg-zinc-900 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white focus:border-yellow-400 outline-none w-full"
                          placeholder="Ex: Garantia de fábrica de 90 dias"
                        />
                      </div>

                      {/* Status select */}
                      <div className="flex flex-col">
                        <label className="text-[10px] font-bold text-white/40 uppercase mb-1">Situação de Venda (Disponibilidade)</label>
                        <select
                          value={editStatus}
                          onChange={(e) => setEditStatus(e.target.value)}
                          className="bg-zinc-900 border border-white/10 p-2.5 rounded-xl text-xs text-white focus:border-yellow-400 outline-none cursor-pointer"
                        >
                          <option value="active">ATIVO - Disponível para compra imediata</option>
                          <option value="paused">PAUSADO - Pausar exibições temporariamente</option>
                        </select>
                      </div>
                    </div>

                    <div className="pt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={() => setIsEditing(false)}
                        className="flex-1 bg-white/5 border border-white/10 hover:bg-white/10 text-white px-4 py-2.5 rounded-xl font-bold text-xs transition-all"
                      >
                        Descartar
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveProduct}
                        disabled={saving}
                        className="flex-1 bg-yellow-400 hover:bg-yellow-350 disabled:opacity-50 text-slate-950 px-4 py-2.5 rounded-xl font-extrabold text-xs shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        {saving ? "Gravando no ML..." : "Gravar Alterações"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Bottom action bar */}
            <div className="mt-6 pt-4 border-t border-white/10 flex justify-end">
              <button
                onClick={() => setSelectedProduct(null)}
                className="px-6 py-2 border border-white/10 text-white/60 hover:text-white hover:bg-white/5 rounded-xl font-bold text-xs"
              >
                Fechar Ficha Técnica
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

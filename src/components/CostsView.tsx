import React, { useEffect, useState } from "react";
import { getProductCosts, createOrUpdateCost, deleteCost, importCostsCSV, getImportBatches } from "../services/api";
import { ProductCost, CostImportBatch } from "../types";
import { FileUp, Info, AlertTriangle, Plus, Trash2, Edit3, Calendar, FileSpreadsheet, List, Upload, HelpCircle, CheckCircle, XCircle } from "lucide-react";

export default function CostsView() {
  const [costs, setCosts] = useState<ProductCost[]>([]);
  const [batches, setBatches] = useState<CostImportBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search/Filter state
  const [skuSearch, setSkuSearch] = useState("");

  // CSV parsing state
  const [csvText, setCsvText] = useState("");
  const [selectedFileName, setSelectedFileName] = useState("");
  const [importStatus, setImportStatus] = useState<{ status: "none" | "success" | "error"; message?: string }>({ status: "none" });
  const [importing, setImporting] = useState(false);

  // Modal / Manual form state
  const [showFormModal, setShowFormModal] = useState(false);
  const [formSku, setFormSku] = useState("");
  const [formProductName, setFormProductName] = useState("");
  const [formCost, setFormCost] = useState("");
  const [savingForm, setSavingForm] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [costsRes, batchesRes] = await Promise.all([
        getProductCosts(),
        getImportBatches(),
      ]);
      setCosts(costsRes);
      setBatches(batchesRes);
    } catch (err: any) {
      setError(err.message || "Erro ao carregar custos de produtos");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleManualCreateOrUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingForm(true);
    setFormError(null);

    if (!formSku || !formCost || parseFloat(formCost) <= 0) {
      setFormError("SKU e custo unitário acima de zero são obrigatórios.");
      setSavingForm(false);
      return;
    }

    try {
      await createOrUpdateCost({
        sku: formSku.trim().toUpperCase(),
        product_name: formProductName.trim(),
        cost_unitary: parseFloat(formCost),
        currency: "BRL"
      });
      setShowFormModal(false);
      
      // Clear fields
      setFormSku("");
      setFormProductName("");
      setFormCost("");

      loadData();
    } catch (err: any) {
      setFormError(err.message || "Erro ao salvar custos manualmente.");
    } finally {
      setSavingForm(false);
    }
  };

  const handleEditClick = (cost: ProductCost) => {
    setFormSku(cost.sku);
    setFormProductName(cost.product_name);
    setFormCost(String(cost.cost_unitary));
    setShowFormModal(true);
  };

  const handleDeleteClick = async (id: string) => {
    if (!window.confirm("Deseja realmente remover o custo deste SKU? Isso alterará os cálculos marginais associados imediatamente.")) {
      return;
    }
    try {
      await deleteCost(id);
      loadData();
    } catch (err: any) {
      alert(err.message || "Erro ao remover registro de custo.");
    }
  };

  // CSV Drag and Drop / Paste importer logic
  const handleCSVImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!csvText.trim()) {
      setImportStatus({ status: "error", message: "Insira os dados do CSV no campo de texto para prosseguir." });
      return;
    }

    setImporting(true);
    setImportStatus({ status: "none" });

    try {
      const res = await importCostsCSV(csvText, selectedFileName || "textarea_import.csv");
      setImportStatus({ 
        status: "success", 
        message: `Planilha importada com sucesso! ${res.batch.inserted_rows} registros inseridos, ${res.batch.updated_rows} atualizados, e ${res.batch.failed_rows} inválidos.` 
      });
      setCsvText("");
      setSelectedFileName("");
      loadData();
    } catch (err: any) {
      setImportStatus({ status: "error", message: err.message || "Falha crítica de formatação no arquivo CSV." });
    } finally {
      setImporting(false);
    }
  };

  const loadExampleCSV = () => {
    const example = "sku,product_name,cost_unitary\n" +
      "MLA-SKU-1001,Controle Xbox Series S Lacrado,350.00\n" +
      "MLA-SKU-1002,Fone de Ouvido Bluetooth JBL Tune,125.00\n" +
      "MLA-SKU-1004,Smartwatch Amazfit Bip 3,150.00\n" +
      "MLA-SKU-1005,Cabo USB-C Rápido,15.50";
    setCsvText(example);
    setSelectedFileName("exemplo_custeio.csv");
    setImportStatus({ status: "none" });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setCsvText(text);
      setImportStatus({ status: "none" });
    };
    reader.readAsText(file);
  };

  const filteredCosts = costs.filter(c => 
    c.sku.toLowerCase().includes(skuSearch.toLowerCase()) || 
    c.product_name.toLowerCase().includes(skuSearch.toLowerCase())
  );

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 pb-16">
      
      {/* Col 1 & 2: Cost Sheet CSV Upload & Costs SKU table list */}
      <div className="xl:col-span-2 space-y-8">
        
        {/* CSV Upload Section with text parsing options */}
        <div className="glass-card rounded-2xl p-6 relative overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/5 pb-4 mb-4">
            <div>
              <h3 className="font-extrabold text-white tracking-tight text-base flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-emerald-400" />
                Importar Planilha de Custos SKU
              </h3>
              <p className="text-xs text-white/45 mt-1">Carregue planilha de custos (.csv) ou cole dados formatados abaixo.</p>
            </div>
            
            <button
              onClick={loadExampleCSV}
              className="text-[10px] bg-white/5 text-white/80 hover:bg-white/10 font-bold px-3 py-1.5 rounded-lg border border-white/5 tracking-wider uppercase cursor-pointer transition-colors"
            >
              Preencher exemplo .CSV
            </button>
          </div>

          {/* Validation Feedback indicator */}
          {importStatus.status !== "none" && (
            <div className={`p-4 rounded-xl text-xs flex gap-2 font-medium mb-4 ${
              importStatus.status === "success" 
                ? "bg-emerald-500/10 border border-emerald-500/20 text-[#00FF66]"
                : "bg-red-500/10 border border-red-500/20 text-red-400"
            }`}>
              {importStatus.status === "success" ? (
                <CheckCircle className="h-4.5 w-4.5 text-[#00FF66] shrink-0" />
              ) : (
                <AlertTriangle className="h-4.5 w-4.5 text-red-400 shrink-0" />
              )}
              <p>{importStatus.message}</p>
            </div>
          )}

          <form onSubmit={handleCSVImport} className="space-y-4">
            {/* File Selector */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="border border-dashed border-white/15 bg-white/2 rounded-xl p-4 flex flex-col items-center justify-center text-center hover:bg-white/5 transition-colors cursor-pointer relative">
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleFileChange}
                  className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                />
                <Upload className="h-6 w-6 text-white/30 mb-1.5" />
                <span className="text-xs font-bold text-white/80">Escolher arquivo .CSV</span>
                <span className="text-[10px] text-white/40 mt-0.5">Clique para selecionar planilhas</span>
              </div>

              <div className="bg-black/20 border border-white/5 rounded-xl p-4 flex flex-col justify-center text-xs font-semibold text-white/50">
                <span className="flex items-center gap-1.5 text-white/90 font-bold uppercase text-[9px] tracking-wider mb-2">
                  <Info className="h-3.5 w-3.5 text-white/40" /> Formato Esperado:
                </span>
                <p className="font-mono text-[10px] leading-relaxed text-white/70">
                  Primeira linha de cabeçalho: <br />
                  <strong className="text-[#00FF66]">sku</strong>, 
                  <strong className="text-white/80"> product_name</strong>, 
                  <strong className="text-[#00FF66]">cost_unitary</strong>
                </p>
                <p className="mt-2 text-[10px] text-white/30 font-medium">Use vírgula ou ponto-e-vírgula nos separadores.</p>
              </div>
            </div>

            {/* Manual paste textbox area */}
            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Conteúdo dos dados (CSV)</label>
                {selectedFileName && (
                  <span className="text-[10px] bg-white/10 text-white px-2 py-0.5 rounded font-mono font-bold border border-white/5">
                    {selectedFileName}
                  </span>
                )}
              </div>
              <textarea
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                placeholder="sku,product_name,cost_unitary&#10;SKU-SAMPLE-X,Cadeira gamer premium,245.50"
                rows={4}
                className="w-full font-mono text-[11px] p-3 border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 bg-white/5 text-white relative block leading-relaxed placeholder-white/20 animate-none"
              />
            </div>

            <button
              type="submit"
              disabled={importing || !csvText.trim()}
              className={`w-full py-3 rounded-xl font-bold text-xs shadow-sm transition-all focus:outline-none flex items-center justify-center gap-2 cursor-pointer ${
                !csvText.trim()
                  ? "bg-white/5 text-white/30 border border-white/5 cursor-not-allowed shadow-none"
                  : importing
                  ? "bg-yellow-400/10 border border-yellow-400/20 text-yellow-400 cursor-wait"
                  : "bg-[#3483FA] text-white hover:bg-[#3483FA]/80 border border-[#3483FA]/20 active:scale-95"
              }`}
            >
              <FileSpreadsheet className="h-4.5 w-4.5" />
              {importing ? "Importando e recalculando..." : "Importar Planilha em Lote"}
            </button>
          </form>
        </div>

        {/* Existing SKU Costs table list */}
        <div className="glass-card rounded-2xl border border-white/10 overflow-hidden">
          <div className="p-6 border-b border-white/5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h3 className="font-extrabold text-white tracking-tight text-base flex items-center gap-2">
                <List className="h-5 w-5 text-yellow-400" />
                Custos Unitários Cadastrados
              </h3>
              <p className="text-xs text-white/45 mt-1">Total de {filteredCosts.length} SKUs com custos mapeados.</p>
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto">
              <input
                type="text"
                value={skuSearch}
                onChange={(e) => setSkuSearch(e.target.value)}
                placeholder="Buscar por SKU ou Nome..."
                className="px-3.5 py-2.5 bg-white/5 relative block rounded-xl border border-white/10 text-white text-xs focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 transition-all font-semibold animate-none"
              />
              <button
                onClick={() => {
                  setFormSku("");
                  setFormProductName("");
                  setFormCost("");
                  setShowFormModal(true);
                }}
                className="bg-yellow-400 text-slate-950 hover:bg-yellow-350 font-bold text-xs py-2.5 px-4 rounded-xl shadow-md transition-all cursor-pointer flex items-center gap-1.5 shrink-0"
              >
                <Plus className="h-4 w-4" /> Novo SKU
              </button>
            </div>
          </div>

          {filteredCosts.length === 0 ? (
            <div className="py-20 text-center text-white/40 text-xs font-semibold">
              Nenhum custo por SKU encontrado. Use a planilha ou o formulário acima para registrar.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-white/2 border-b border-white/5 text-[9px] uppercase font-bold text-white/40 tracking-wider">
                    <th className="py-3 px-6">SKU Único</th>
                    <th className="py-3 px-6">Produto Relacionado</th>
                    <th className="py-3 px-6 text-right">Custo Unitário</th>
                    <th className="py-3 px-6">Origem</th>
                    <th className="py-3 px-6 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-xs font-semibold text-white/80">
                  {filteredCosts.map((c) => (
                    <tr key={c.id} className="hover:bg-white/5 transition-colors">
                      <td className="py-3.5 px-6 font-extrabold text-white font-mono tracking-tight">{c.sku}</td>
                      <td className="py-3.5 px-6 font-bold text-white/90 truncate max-w-[240px]" title={c.product_name}>{c.product_name}</td>
                      <td className="py-3.5 px-6 text-right font-extrabold text-[#00FF66] font-mono">
                        {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(c.cost_unitary)}
                      </td>
                      <td className="py-3.5 px-6 text-white/40 font-mono text-[10px] tracking-wide">{c.source_file_name}</td>
                      <td className="py-3.5 px-6 text-center flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => handleEditClick(c)}
                          className="p-1 px-2.5 bg-white/5 text-white/75 hover:bg-yellow-400 hover:text-slate-950 border border-white/5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center"
                          title="Editar Custo"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteClick(c.id)}
                          className="p-1 px-2.5 bg-red-500/10 border border-red-500/25 text-red-400 hover:bg-red-500/20 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center"
                          title="Excluir SKU"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Col 3: PAST BRATCHES LOG History tracking */}
      <div className="space-y-8">
        <div className="glass-card rounded-2xl p-6 relative overflow-hidden">
          <div className="border-b border-white/5 pb-4 mb-4">
            <h3 className="font-extrabold text-white tracking-tight text-base flex items-center gap-2">
              <Calendar className="h-5 w-5 text-white/40" />
              Histórico de Importações
            </h3>
            <p className="text-xs text-white/45 mt-1">Últimos lotes de planilhas integrados com as vendas.</p>
          </div>

          {batches.length === 0 ? (
            <p className="text-xs text-white/30 text-center py-10 font-bold uppercase tracking-wider">Nenhuma importação no histórico.</p>
          ) : (
            <div className="space-y-4">
              {batches.map((b) => (
                <div key={b.id} className="bg-white/2 p-4 rounded-xl border border-white/5 text-xs font-semibold text-white/80 space-y-2">
                  <div className="flex items-center justify-between border-b border-white/5 pb-1.5">
                    <span className="truncate max-w-[150px] font-bold text-white" title={b.file_name}>{b.file_name}</span>
                    <span className="text-[10px] text-white/40 font-mono">{new Date(b.created_at).toLocaleDateString("pt-BR")}</span>
                  </div>

                  <div className="grid grid-cols-3 text-center divide-x divide-white/10">
                    <div>
                      <span className="text-[9px] font-bold uppercase tracking-wider text-[#00FF66] block">Novos</span>
                      <span className="font-mono font-bold text-[#00FF66] text-xs">+{b.inserted_rows}</span>
                    </div>
                    <div>
                      <span className="text-[9px] font-bold uppercase tracking-wider text-blue-400 block">Atuais</span>
                      <span className="font-mono font-bold text-blue-400 text-xs">+{b.updated_rows}</span>
                    </div>
                    <div>
                      <span className="text-[9px] font-bold uppercase tracking-wider text-red-400 block">Falha</span>
                      <span className="font-mono font-bold text-red-400 text-xs">{b.failed_rows}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Manual SKU Cost Create/Update Form Modal */}
      {showFormModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="glass-modal rounded-2xl w-full max-w-md shadow-2xl overflow-hidden border border-white/10 text-white">
            <div className="p-6 border-b border-white/5 flex items-center justify-between bg-black/40">
              <h3 className="font-extrabold text-base tracking-tight text-white">Custear SKU de Produto</h3>
              <button 
                onClick={() => setShowFormModal(false)}
                className="text-white/40 hover:text-white transition-colors cursor-pointer"
              >
                <XCircle className="h-5 w-5" />
              </button>
            </div>

            {formError && (
              <div className="mx-6 mt-6 bg-red-500/10 border border-red-500/20 p-3 rounded text-red-400 text-xs font-semibold uppercase tracking-wider">
                {formError}
              </div>
            )}

            <form onSubmit={handleManualCreateOrUpdate} className="p-6 space-y-4 text-xs font-semibold text-white/80">
              <div>
                <label className="block text-[10px] font-bold text-white/40 uppercase tracking-widest mb-1.5">Código SKU</label>
                <input
                  type="text"
                  required
                  value={formSku}
                  onChange={(e) => setFormSku(e.target.value)}
                  placeholder="EX: MLA-SKU-1001"
                  className="appearance-none rounded-xl relative block w-full px-3.5 py-3 border border-white/10 bg-white/5 placeholder-white/30 text-white focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 font-mono font-bold uppercase transition-all animate-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-white/40 uppercase tracking-widest mb-1.5">Nome de Identificação</label>
                <input
                  type="text"
                  required
                  value={formProductName}
                  onChange={(e) => setFormProductName(e.target.value)}
                  placeholder="EX: Controle Xbox Series S Lacrado"
                  className="appearance-none rounded-xl relative block w-full px-3.5 py-3 border border-white/10 bg-white/5 placeholder-white/30 text-white focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 transition-all animate-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-white/40 uppercase tracking-widest mb-1.5">Custo Unitário (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={formCost}
                  onChange={(e) => setFormCost(e.target.value)}
                  placeholder="0.00"
                  className="appearance-none rounded-xl relative block w-full px-3.5 py-3 border border-white/10 bg-white/5 placeholder-white/30 text-white focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 transition-all font-mono font-bold animate-none"
                />
              </div>

              <div className="pt-4 border-t border-white/5 flex items-center justify-end gap-3 pb-2">
                <button
                  type="button"
                  onClick={() => setShowFormModal(false)}
                  className="px-4 py-2.5 border border-white/10 rounded-xl text-white/80 hover:bg-white/5 transition-colors font-bold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingForm}
                  className="bg-[#3483FA] text-white font-bold px-5 py-2.5 rounded-xl border border-[#3483FA]/20 hover:bg-[#3483FA]/80 hover:scale-[1.02] transition-all cursor-pointer"
                >
                  {savingForm ? "Salvando..." : "Salvar Registro"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

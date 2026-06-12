import React, { useEffect, useState } from "react";
import { getStateTaxProfiles, updateStateTaxProfile, recalculateOrderProfit } from "../services/api";
import { StateTaxProfile } from "../types";
import { Save, RefreshCw, Percent, MapPin, AlertCircle, Check, Loader2, Landmark, HelpCircle, FileText, CheckCircle2 } from "lucide-react";

interface TaxFactorsConfigProps {
  onRecalculateComplete?: () => void;
}

export default function TaxFactorsConfig({ onRecalculateComplete }: TaxFactorsConfigProps) {
  const [profiles, setProfiles] = useState<StateTaxProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // State for tracking inline edits
  const [editingStateCode, setEditingStateCode] = useState<string | null>(null);
  const [editIcmsVal, setEditIcmsVal] = useState("");
  const [editDifalVal, setEditDifalVal] = useState("");
  const [editActive, setEditActive] = useState(true);
  const [editNotes, setEditNotes] = useState("");
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveSuccessState, setSaveSuccessState] = useState<string | null>(null);

  // Recalculating state
  const [recalculating, setReccalculating] = useState(false);
  const [recalcSuccess, setRecalcSuccess] = useState<string | null>(null);

  const loadProfiles = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getStateTaxProfiles();
      setProfiles(data);
    } catch (err: any) {
      setError(err.message || "Erro ao carregar perfis de imposto.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfiles();
  }, []);

  const handleStartEdit = (item: StateTaxProfile) => {
    setEditingStateCode(item.state_code);
    setEditIcmsVal((item.icms_factor * 100).toFixed(2));
    setEditDifalVal((item.difal_factor * 100).toFixed(2));
    setEditActive(item.active);
    setEditNotes(item.notes || "");
  };

  const handleCancelEdit = () => {
    setEditingStateCode(null);
    setSaveSuccessState(null);
  };

  const handleSave = async (stateCode: string) => {
    setSaveLoading(true);
    try {
      const numericIcms = parseFloat(editIcmsVal) / 100;
      const numericDifal = parseFloat(editDifalVal) / 100;
      
      if (isNaN(numericIcms) || numericIcms < 0 || numericIcms > 1) {
        throw new Error("A alíquota de ICMS deve ser uma porcentagem válida entre 0% e 100%.");
      }
      if (isNaN(numericDifal) || numericDifal < 0 || numericDifal > 1) {
        throw new Error("A alíquota de DIFAL deve ser uma porcentagem válida entre 0% e 100%.");
      }

      const totalFactor = numericIcms + numericDifal;

      const updated: StateTaxProfile = {
        state_code: stateCode,
        icms_factor: numericIcms,
        difal_factor: numericDifal,
        total_factor: totalFactor,
        source_type: "manual_override",
        active: editActive,
        notes: editNotes || undefined
      };

      await updateStateTaxProfile(updated);
      
      // Update local state
      setProfiles(prev => prev.map(p => p.state_code === stateCode ? updated : p));
      
      setEditingStateCode(null);
      setSaveSuccessState(stateCode);
      setTimeout(() => setSaveSuccessState(null), 3000);
    } catch (err: any) {
      alert(err.message || "Erro ao salvar alíquotas tributárias.");
    } finally {
      setSaveLoading(false);
    }
  };

  const handleRecalculate = async () => {
    setReccalculating(true);
    setRecalcSuccess(null);
    try {
      const response = await recalculateOrderProfit();
      setRecalcSuccess(response.message || "Reprocessamento e simulações estaduais concluídos!");
      if (onRecalculateComplete) {
        onRecalculateComplete();
      }
      setTimeout(() => setRecalcSuccess(null), 5000);
    } catch (err: any) {
      setError(err.message || "Erro ao reprocessar dados tributários de pedidos.");
    } finally {
      setReccalculating(false);
    }
  };

  const getStateFullName = (code: string) => {
    const states: Record<string, string> = {
      AC: "Acre", AL: "Alagoas", AM: "Amazonas", AP: "Amapá",
      BA: "Bahia", CE: "Ceará", DF: "Distrito Federal", ES: "Espírito Santo",
      GO: "Goiás", MA: "Maranhão", MG: "Minas Gerais", MS: "Mato Grosso do Sul",
      MT: "Mato Grosso", PA: "Pará", PB: "Paraíba", PE: "Pernambuco",
      PI: "Piauí", PR: "Paraná", RJ: "Rio de Janeiro", RN: "Rio Grande do Norte",
      RO: "Rondônia", RR: "Roraima", RS: "Rio Grande do Sul", SC: "Santa Catarina",
      SE: "Sergipe", SP: "São Paulo", TO: "Tocantins"
    };
    return states[code.toUpperCase()] || "Outros / Indefinido";
  };

  const getSourceBadge = (type: string) => {
    switch (type) {
      case "report":
        return <span className="text-[9px] font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/15 px-2 py-0.5 rounded uppercase font-sans">Report Real</span>;
      case "median":
        return <span className="text-[9px] font-bold bg-purple-500/10 text-purple-400 border border-purple-500/15 px-2 py-0.5 rounded uppercase font-sans">Mediana Fallback</span>;
      case "manual_override":
      default:
        return <span className="text-[9px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/15 px-2 py-0.5 rounded uppercase font-sans">Ajustado</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Overview and Info card */}
      <div className="glass-card rounded-2xl p-6 relative overflow-hidden border border-white/10 bg-gradient-to-br from-[#121330] to-[#0a0b17]" id="tax-simulator-header">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2 max-w-2xl">
            <div className="flex items-center gap-2 text-yellow-400">
              <Landmark className="h-5 w-5" />
              <span className="text-xs font-black uppercase tracking-widest">Motor de Simulação Tributária Simples por Estado</span>
            </div>
            <h2 className="text-xl font-black text-white">Análise de Margens & Carga Fiscal das Vendas</h2>
            <p className="text-xs text-white/70 leading-relaxed">
              O sistema calcula o imposto estimado por pedido considerando as alíquotas de <strong>ICMS Estimado</strong> e <strong>DIFAL Estimado</strong> separadamente com base na UF de destino, permitindo comparações realistas de lucratividade real.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <div className="flex items-center gap-1 text-[10px] text-yellow-400 font-bold bg-yellow-400/5 px-2.5 py-1 rounded-md border border-yellow-400/10">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                <span>SP esvazia DIFAL (0.0% Alíquota) por padrão de origem local.</span>
              </div>
              <div className="flex items-center gap-1 text-[10px] text-purple-400 font-bold bg-purple-400/5 px-2.5 py-1 rounded-md border border-purple-400/10">
                <HelpCircle className="h-3.5 w-3.5 shrink-0" />
                <span>Estados sem dados usam a mediana de fallback: ICMS 7.21% + DIFAL 13.05% (Total 20.44%).</span>
              </div>
            </div>
          </div>

          <div className="shrink-0 space-y-2">
            <button
              onClick={handleRecalculate}
              disabled={recalculating}
              className="w-full lg:w-auto flex items-center justify-center gap-2 bg-yellow-400 hover:bg-yellow-350 disabled:bg-white/10 disabled:text-white/40 text-slate-950 font-black text-xs px-6 py-4 rounded-xl cursor-pointer transition-all shadow-lg active:scale-95 uppercase tracking-wider"
              id="btn-recalculate-margins"
            >
              {recalculating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Reprocessando impostos...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4" />
                  Reprocessar Tributação Histórica
                </>
              )}
            </button>
            {recalcSuccess && (
              <p className="text-[#00FF66] text-[10px] font-bold text-center uppercase tracking-wider bg-emerald-500/10 py-2 px-3 rounded-lg border border-emerald-500/20 flex items-center justify-center gap-1.5 animate-pulse">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                {recalcSuccess}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Main List */}
      <div className="glass-card rounded-2xl border border-white/10 overflow-hidden bg-black/40" id="tax-profile-list-container">
        <div className="p-5 border-b border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white/2">
          <div>
            <h3 className="text-white text-xs font-black uppercase tracking-wider flex items-center gap-2">
              <Percent className="h-4 w-4 text-white/50" />
              Perfis de Alíquotas e Simulação por UF
            </h3>
            <p className="text-[10px] text-white/40 mt-1">Configure ICMS e DIFAL para cada estado. Ao salvar, as alíquotas de total são recalculadas automaticamente.</p>
          </div>
          <span className="text-[10px] bg-white/5 border border-white/10 px-2.5 py-1 rounded-md text-white/60 font-mono w-fit">
            {profiles.length} UFs Cadastradas
          </span>
        </div>

        {loading ? (
          <div className="py-20 text-center">
            <Loader2 className="h-10 w-10 animate-spin text-yellow-400 mx-auto" />
            <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest mt-4">Carregando perfis e alíquotas estaduais...</p>
          </div>
        ) : error ? (
          <div className="p-10 text-center text-red-400 text-xs font-bold bg-red-500/5">
            <AlertCircle className="h-8 w-8 mx-auto mb-3" />
            {error}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-5" id="tax-profiles-list">
            {profiles.map((item) => {
              const isEditing = editingStateCode === item.state_code;
              const isSuccess = saveSuccessState === item.state_code;
              const isSP = item.state_code === "SP";

              return (
                <div
                  key={item.state_code}
                  className={`p-4 rounded-xl border transition-all flex flex-col justify-between ${
                    isEditing
                      ? "bg-yellow-400/5 border-yellow-400/30 ring-1 ring-yellow-400/20 shadow-2xl"
                      : isSuccess
                      ? "bg-emerald-500/5 border-emerald-500/35"
                      : isSP
                      ? "bg-indigo-500/5 border-indigo-500/25 hover:border-indigo-500/40 relative"
                      : "bg-[#11122a]/40 border-white/5 hover:border-white/15"
                  }`}
                  id={`tax-profile-card-${item.state_code.toLowerCase()}`}
                >
                  <div>
                    {/* Header: UF State Code and Full Name */}
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`font-mono font-black text-sm py-1 px-2.5 rounded border ${
                          isSP 
                            ? "bg-indigo-500/10 border-indigo-500/20 text-indigo-300"
                            : "text-white bg-white/5 border-white/5"
                        }`}>
                          {item.state_code}
                        </span>
                        <div>
                          <span className="text-xs font-extrabold text-white block">
                            {getStateFullName(item.state_code)}
                          </span>
                          <span className="text-[9px] text-white/40 font-mono block mt-0.5">
                            UF de Destino
                          </span>
                        </div>
                      </div>
                      
                      <div className="flex flex-col items-end gap-1.5">
                        {getSourceBadge(item.source_type)}
                        {isSP && (
                          <span className="text-[8px] bg-red-500/10 text-red-400 border border-red-500/15 px-1.5 py-0.5 rounded font-black uppercase">
                            Outlier Isento DIFAL
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Aliquots display & edit */}
                    <div className="mt-5 space-y-2.5 bg-black/20 p-3 rounded-lg border border-white/5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-white/50 font-bold">ICMS Estimado:</span>
                        {isEditing ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              max="100"
                              value={editIcmsVal}
                              onChange={(e) => setEditIcmsVal(e.target.value)}
                              className="w-16 bg-black/50 border border-white/10 text-right text-white font-mono font-bold text-xs p-1 rounded focus:outline-none focus:border-yellow-400"
                            />
                            <span className="text-white/45 text-[10px] font-mono">%</span>
                          </div>
                        ) : (
                          <span className="font-mono font-black text-white text-xs">
                            {(item.icms_factor * 100).toFixed(2)}%
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-between text-xs">
                        <span className="text-white/50 font-bold">DIFAL Estimado:</span>
                        {isEditing ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              max="100"
                              value={editDifalVal}
                              onChange={(e) => setEditDifalVal(e.target.value)}
                              disabled={isSP}
                              className="w-16 bg-black/50 border border-white/10 text-right text-white font-mono font-bold text-xs p-1 rounded focus:outline-none focus:border-yellow-400 disabled:opacity-30"
                            />
                            <span className="text-white/45 text-[10px] font-mono">%</span>
                          </div>
                        ) : (
                          <span className="font-mono font-black text-white text-xs">
                            {(item.difal_factor * 100).toFixed(2)}%
                          </span>
                        )}
                      </div>

                      <div className="h-[1px] bg-white/5 my-1" />

                      <div className="flex items-center justify-between text-xs pt-1">
                        <span className="text-yellow-400/70 font-black uppercase text-[10px] tracking-wide">Fator Carga Total:</span>
                        <span className="font-mono font-black text-yellow-400 text-sm">
                          {isEditing ? (
                            <span>
                              {(
                                (parseFloat(editIcmsVal || "0") + 
                                 parseFloat(editDifalVal || "0"))
                              ).toFixed(2)}%
                            </span>
                          ) : (
                            <span>{(item.total_factor * 100).toFixed(2)}%</span>
                          )}
                        </span>
                      </div>
                    </div>

                    {/* Notes indicator or editor */}
                    <div className="mt-3">
                      {isEditing ? (
                        <div className="space-y-1">
                          <label className="text-[9px] font-bold text-white/40 uppercase block">Notas explicativas</label>
                          <textarea
                            value={editNotes}
                            onChange={(e) => setEditNotes(e.target.value)}
                            placeholder="Adicione observações tributárias..."
                            className="w-full bg-black/35 border border-white/10 text-white text-[11px] p-2 rounded focus:outline-none focus:border-yellow-400 min-h-[50px] resize-none"
                          />
                        </div>
                      ) : (
                        item.notes && (
                          <div className="flex items-start gap-1 text-[10px] text-white/40 bg-white/2 rounded p-2 border border-white/5 font-sans mt-2.5">
                            <FileText className="h-3 w-3 mt-0.5 shrink-0 text-white/30" />
                            <span className="italic line-clamp-2">{item.notes}</span>
                          </div>
                        )
                      )}
                    </div>
                  </div>

                  {/* Actions Area */}
                  <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between">
                    <div>
                      {isEditing ? (
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={editActive}
                            onChange={(e) => setEditActive(e.target.checked)}
                            className="rounded bg-black border-white/15 text-yellow-400 focus:ring-yellow-400 h-3.5 w-3.5 cursor-pointer animate-none"
                          />
                          <span className="text-[10px] font-black text-white/50 uppercase tracking-widest">Ativo</span>
                        </label>
                      ) : (
                        <span className={`text-[8.5px] px-2 py-0.5 rounded-full font-black uppercase tracking-wider border ${
                          item.active 
                            ? "bg-emerald-500/10 border-emerald-500/20 text-[#00FF66]" 
                            : "bg-white/5 border-white/10 text-white/35"
                        }`}>
                          {item.active ? "Ativo" : "Inativo"}
                        </span>
                      )}
                    </div>

                    <div className="flex gap-1.5">
                      {isEditing ? (
                        <>
                          <button
                            onClick={() => handleSave(item.state_code)}
                            disabled={saveLoading}
                            className="p-1 px-3 bg-yellow-400 hover:bg-yellow-350 disabled:bg-white/15 text-slate-950 rounded-md text-[10px] font-black uppercase tracking-wider cursor-pointer shadow-md transition-all active:scale-95"
                          >
                            Salvar
                          </button>
                          <button
                            onClick={handleCancelEdit}
                            className="p-1 px-3 bg-white/5 hover:bg-white/10 text-white/60 rounded-md text-[10px] font-bold cursor-pointer transition-all"
                          >
                            Cancelar
                          </button>
                        </>
                      ) : isSuccess ? (
                        <span className="text-[#00FF66] flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wider animate-pulse bg-emerald-500/10 py-1 px-2.5 rounded-lg border border-emerald-500/20">
                          <Check className="h-3 w-3 text-emerald-400" />
                          Salvo!
                        </span>
                      ) : (
                        <button
                          onClick={() => handleStartEdit(item)}
                          className={`font-bold text-[9px] uppercase tracking-wider py-1 px-3.5 rounded-lg cursor-pointer transition-colors border ${
                            isSP 
                              ? "bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border-indigo-500/20"
                              : "bg-white/5 hover:bg-white/15 text-white/80 border-white/5"
                          }`}
                        >
                          Ajustar Alíquotas
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

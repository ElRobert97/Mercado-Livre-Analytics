import React, { useState, useEffect } from "react";
import { connectMockAccount, deleteMLAccount } from "../services/api";
import { MercadoLivreAccount } from "../types";
import { Share2, Trash2, Key, RefreshCw, AlertTriangle, ShieldCheck, CheckCircle, Info, ExternalLink, Link2 } from "lucide-react";

interface IntegrationsViewProps {
  accounts: MercadoLivreAccount[];
  onRefreshList: () => void;
}

export default function IntegrationsView({ accounts, onRefreshList }: IntegrationsViewProps) {
  const [nickname, setNickname] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [realAuthUrl, setRealAuthUrl] = useState<string>("");

  useEffect(() => {
    fetch("/api/integrations/mercadolivre/connect")
      .then(res => res.json())
      .then(data => {
        if (data && data.auth_url) {
          setRealAuthUrl(data.auth_url);
        }
      })
      .catch(err => console.error("Error loaded OAuth connect URL:", err));
  }, []);

  const handleSimulateConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nickname.trim()) {
      setError("Nick do vendedor é obrigatório.");
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      await connectMockAccount(nickname);
      setSuccess(`Parabéns! Loja Oficial e integradora '${nickname}' conectada e sincronizada!`);
      setNickname("");
      onRefreshList();
    } catch (err: any) {
      setError(err.message || "Não foi possível estocar token para esta conta.");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Aviso crítico: Excluir esta integração removerá permanentemente os tokens de acesso e todos os pedidos sincronizados dela!")) {
      return;
    }
    try {
      await deleteMLAccount(id);
      onRefreshList();
    } catch (err: any) {
      alert("Falha ao remover integração.");
    }
  };

  const formatDate = (isoStr: string) => {
    return new Date(isoStr).toLocaleDateString("pt-BR", { 
      day: "2-digit", 
      month: "2-digit", 
      year: "numeric"
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 pb-16">
      
      {/* Col 1 & 2: Active integrations and guide list */}
      <div className="lg:col-span-2 space-y-8">
        
        {/* Connection flow visualization / Interactive linkage */}
        <div className="glass-card rounded-2xl p-6 relative overflow-hidden">
          <div className="border-b border-white/5 pb-4 mb-4">
            <h3 className="font-extrabold text-white tracking-tight text-base flex items-center gap-2">
              <Share2 className="h-5 w-5 text-yellow-400" />
              Conectar Conta Mercado Livre
            </h3>
            <p className="text-xs text-white/45 mt-1">Conecte sua conta de vendedor utilizando o protocolo oficial de autorização OAuth 2.0.</p>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-xl text-xs text-red-400 font-semibold mb-4 flex gap-2">
              <AlertTriangle className="h-4.5 w-4.5 text-red-400 shrink-0" />
              <p>{error}</p>
            </div>
          )}

          {success && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-xl text-xs text-[#00FF66] font-semibold mb-4 flex gap-2">
              <CheckCircle className="h-4.5 w-4.5 text-[#00FF66] shrink-0" />
              <p>{success}</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Real OAuth Block */}
            <div className="bg-white/2 p-5 rounded-2xl border border-white/5 flex flex-col justify-between">
              <div>
                <span className="text-[#3483FA] font-black text-xs uppercase tracking-widest block mb-2">Canal de Produção Real</span>
                <p className="text-[11px] text-white/60 leading-relaxed font-semibold">
                  Clique para iniciar a autenticação oficial OAuth 2.0 segura direto nos servidores oficiais do Mercado Livre Brasil.
                </p>
                <div className="mt-3 bg-black/20 p-2.5 rounded-lg text-[10px] text-white/40 leading-normal font-mono border border-white/5">
                  ✓ Transações reais faturadas<br/>
                  ✓ Token criptografado no Postgres<br/>
                  ✓ Sem duplicidades de fretes
                </div>
              </div>
              <div className="mt-3">
                <a
                  href={realAuthUrl || "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`w-full inline-flex cursor-pointer items-center justify-center gap-2 bg-[#3483FA] hover:bg-blue-500 text-white font-black text-xs py-3 px-4 rounded-xl transition-all shadow-md active:scale-95 border border-blue-500/20 ${!realAuthUrl ? "opacity-50 pointer-events-none" : ""}`}
                >
                  <Link2 className="h-4.5 w-4.5" />
                  Conectar via OAuth Real
                </a>
              </div>
            </div>

            {/* Exclusive Real Data Notice Block */}
            <div className="bg-[#FFCC00]/5 p-5 rounded-2xl border border-[#FFCC00]/10 flex flex-col justify-between">
              <div>
                <span className="text-yellow-400 font-black text-xs uppercase tracking-widest block mb-1.5 flex items-center gap-1">
                  <ShieldCheck className="h-4 w-4 text-yellow-400" />
                  Foco em Dados Reais
                </span>
                <p className="text-[11px] text-white/70 leading-relaxed font-medium">
                  Com o objetivo de manter a precisão total de suas faturadas e conciliações do Mercado Livre, todas as simulações e dados de teste foram removidos do seu workspace.
                </p>
                <div className="mt-3 p-3 bg-white/3 rounded-xl border border-white/5 text-[10px] text-white/50 space-y-1.5">
                  <div className="flex gap-2">
                    <span className="text-yellow-400 font-bold">•</span>
                    <span>Mostrando apenas transações importadas da API oficial.</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-yellow-400 font-bold">•</span>
                    <span>Análises livres de poluição ou ruído de simulações.</span>
                  </div>
                </div>
              </div>
              <div className="mt-4 text-[10px] text-white/40 font-mono text-center">
                ✓ Ambiente 100% de Produção Ativo
              </div>
            </div>

          </div>
        </div>

        {/* Installed Accounts Grid List */}
        <div className="glass-card rounded-2xl border border-white/10 overflow-hidden">
          <div className="p-6 border-b border-white/5">
            <h3 className="font-extrabold text-white tracking-tight text-base">Contas de Vendedor Conectadas</h3>
            <p className="text-xs text-white/45 mt-1">Lojas integradas autorizadas para sincronização financeira automática.</p>
          </div>

          {accounts.length === 0 ? (
            <div className="py-20 text-center text-white/40 text-xs font-semibold space-y-2 uppercase tracking-wide">
              <Share2 className="h-10 w-10 text-white/20 mx-auto mb-2 animate-pulse" />
              Nenhuma integração ativa encontrada. Vincule um canal acima!
            </div>
          ) : (
            <div className="divide-y divide-white/5 font-semibold text-xs text-white/80">
              {accounts.map((acc) => (
                <div key={acc.id} className="p-6 flex items-center justify-between hover:bg-white/5 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="bg-yellow-400/10 text-yellow-400 border border-yellow-400/20 p-3 rounded-2xl flex items-center justify-center">
                      <ShieldCheck className="h-6 w-6 text-yellow-400" />
                    </div>

                    <div>
                      <p className="font-black text-white text-sm tracking-tight">{acc.nickname}</p>
                      <div className="flex items-center gap-2 mt-1 text-white/40 text-[10px] uppercase font-bold">
                        <span>User ID: {acc.ml_user_id}</span>
                        <span>•</span>
                        <span>Vinculado em: {formatDate(acc.created_at)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-[10px] bg-emerald-500/15 text-[#00FF66] font-black px-2.5 py-1 rounded-full uppercase tracking-wider border border-emerald-500/20">Ativo</span>
                    <button
                      onClick={() => handleDelete(acc.id)}
                      className="p-2 border border-white/5 bg-white/5 hover:bg-red-500/15 hover:border-red-500/30 text-red-400 rounded-xl transition-all cursor-pointer"
                      title="Remover Integração"
                    >
                      <Trash2 className="h-4.5 w-4.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Col 3: Technical guides details */}
      <div className="space-y-8">
        <div className="glass-card rounded-2xl p-6 relative overflow-hidden text-xs font-semibold text-white/80 space-y-4">
          <div className="border-b border-white/5 pb-4 mb-2">
            <h4 className="font-extrabold text-white tracking-tight text-sm flex items-center gap-1.5">
              <Key className="h-5 w-5 text-white/40" /> Manual OAuth 2.0 Meli
            </h4>
            <p className="text-[11px] text-white/45 mt-1">Conforme especificado na documentação técnica do Mercado Livre.</p>
          </div>

          <div className="space-y-3 leading-relaxed">
            <div>
              <span className="text-yellow-400 font-bold block mb-1">Passo 1: Authorization Code</span>
              <p className="text-[11px] text-white/60 font-medium leading-relaxed">O lojista é redirecionado à URL do Mercado Livre passando <code className="bg-white/10 px-1 py-0.5 rounded font-mono text-white">response_type=code</code> e <code className="bg-white/10 px-1 py-0.5 rounded font-mono text-white">client_id</code>.</p>
            </div>

            <div>
              <span className="text-yellow-400 font-bold block mb-1">Passo 2: Code exchange</span>
              <p className="text-[11px] text-white/60 font-medium leading-relaxed">Após aprovação, o Meli redireciona de volta com o parâmetro <code className="bg-white/10 px-1 py-0.5 rounded font-mono text-white">?code=TG-...</code>.</p>
            </div>

            <div>
              <span className="text-yellow-400 font-bold block mb-1">Passo 3: Token Exchange</span>
              <p className="text-[11px] text-white/60 font-medium leading-relaxed">O backend realiza um POST em <code className="bg-white/10 px-1.5 py-0.5 rounded font-mono text-white text-[10px]">/oauth/token</code> passando seu <code className="bg-white/10 px-1 py-0.5 rounded font-mono text-white">client_secret</code> para resgatar o <code className="bg-white/10 px-1 py-0.5 rounded font-mono text-white">access_token</code> e <code className="bg-white/10 px-1 py-0.5 rounded font-mono text-white">refresh_token</code>.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

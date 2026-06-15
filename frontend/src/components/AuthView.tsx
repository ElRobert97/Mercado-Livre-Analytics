import React, { useState } from "react";
import { login, register } from "../services/api";
import { LogIn, UserPlus, Info, ShoppingBag } from "lucide-react";

interface AuthViewProps {
  onSuccess: (user: { id: string; name: string; email: string }) => void;
}

export default function AuthView({ onSuccess }: AuthViewProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isLogin) {
        const res = await login(email, password);
        onSuccess(res.user);
      } else {
        const res = await register(name, email, password);
        onSuccess(res.user);
      }
    } catch (err: any) {
      setError(err.message || "Erro no processamento da credencial");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center frosted-bg py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 glass-card p-10 rounded-3xl shadow-2xl relative overflow-hidden">
        {/* Decorative background glow inside card */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 blur-2xl rounded-full"></div>
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-yellow-400/5 blur-2xl rounded-full"></div>

        <div className="text-center relative z-10">
          <div className="mx-auto h-14 w-14 bg-gradient-to-br from-yellow-400 to-amber-500 text-slate-950 rounded-2xl flex items-center justify-center shadow-lg shadow-yellow-400/20">
            <ShoppingBag className="h-8 w-8" />
          </div>
          <h2 className="mt-6 text-3xl font-black text-white tracking-tight">
            Meli <span className="text-yellow-400">Analytics</span>
          </h2>
          <p className="mt-2 text-xs text-white/50 tracking-wide font-medium">
            {isLogin ? "FAÇA LOGIN NO PAINEL FINANCEIRO" : "CRIE SEU PERFIL OPERACIONAL DE ANÁLISE"}
          </p>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-xl relative z-10">
            <div className="flex items-start">
              <Info className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
              <div className="ml-3">
                <p className="text-xs text-red-300 font-semibold">{error}</p>
              </div>
            </div>
          </div>
        )}

        <form className="mt-8 space-y-6 relative z-10" onSubmit={handleSubmit}>
          <div className="space-y-4">
            {!isLogin && (
              <div>
                <label className="block text-[11px] font-bold text-white/60 uppercase tracking-widest mb-1.5">Nome Completo</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="appearance-none rounded-xl relative block w-full px-3.5 py-3 border border-white/10 bg-white/5 placeholder-white/30 text-white font-semibold text-xs focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 transition-all"
                  placeholder="Seu nome"
                />
              </div>
            )}
            <div>
              <label className="block text-[11px] font-bold text-white/60 uppercase tracking-widest mb-1.5">Endereço de E-mail</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="appearance-none rounded-xl relative block w-full px-3.5 py-3 border border-white/10 bg-white/5 placeholder-white/30 text-white font-semibold text-xs focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 transition-all"
                placeholder="exemplo@email.com"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-white/60 uppercase tracking-widest mb-1.5">Senha de Acesso</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="appearance-none rounded-xl relative block w-full px-3.5 py-3 border border-white/10 bg-white/5 placeholder-white/30 text-white font-semibold text-xs focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 transition-all"
                placeholder="Sua senha secreta"
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative w-full flex justify-center py-3.5 px-4 border border-transparent text-xs font-bold rounded-xl text-slate-950 bg-yellow-400 hover:bg-yellow-350 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500 transition-all cursor-pointer shadow-lg shadow-yellow-400/10 hover:scale-[1.02]"
            >
              <span className="absolute left-0 inset-y-0 flex items-center pl-3">
                {isLogin ? (
                  <LogIn className="h-4.5 w-4.5 text-slate-900 group-hover:text-slate-950" />
                ) : (
                  <UserPlus className="h-4.5 w-4.5 text-slate-900 group-hover:text-slate-950" />
                )}
              </span>
              {loading ? "Processando..." : isLogin ? "ENTRAR NA CONTA" : "CADASTRAR PERFIL"}
            </button>
          </div>
        </form>

        <div className="text-center mt-4 relative z-10">
          <button
            onClick={() => {
              setIsLogin(!isLogin);
              setError(null);
            }}
            className="text-xs font-bold text-yellow-500 hover:text-yellow-400 cursor-pointer transition-colors"
          >
            {isLogin
              ? "Não tem conta? Faça seu cadastro"
              : "Já possui uma conta? Realize o login"}
          </button>
        </div>

        <div className="mt-8 border-t border-white/5 pt-6 text-center relative z-10">
          <p className="text-[10px] text-white/40 flex items-center justify-center gap-1.5 tracking-wider uppercase">
            <Info className="h-4 w-4 text-white/30" />
            Esta versão armazena dados de forma segura no DB local.
          </p>
        </div>
      </div>
    </div>
  );
}

import React, { useState } from 'react';
import { Camera, MapPin, ShieldCheck, Sparkles, Lock, Coins } from 'lucide-react';
import { BAIRROS_BOA_VISTA, CITY_NAME, MAX_RADIUS_KM, MIN_RADIUS_KM } from '../shared/boaVista';
import type { ChatIntent, PublicUser } from '../shared/catalog';
import { apiFetch, setMemoryToken } from '../services/api';
import { readFileAsDataUrl, renderFilteredPhoto } from '../utils/imageFilter';

interface AuthScreenProps {
  onAuthenticated: (user: PublicUser, token: string) => void;
}

const PRESET_AVATARS = [
  '/src/assets/images/avatar_user_one_1795377678646.jpg',
  '/src/assets/images/avatar_user_two_1795377679503.jpg',
];

export const AuthScreen: React.FC<AuthScreenProps> = ({ onAuthenticated }) => {
  const [mode, setMode] = useState<'login' | 'register'>('register');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [intent, setIntent] = useState<ChatIntent>('ambos');
  const [neighborhood, setNeighborhood] = useState('Centro');
  const [radiusKm, setRadiusKm] = useState(8);
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState(PRESET_AVATARS[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const raw = await readFileAsDataUrl(file);
      const resized = await renderFilteredPhoto(raw, 'none', 480);
      setAvatarUrl(resized);
    } catch {
      setError('Não foi possível carregar a foto de perfil.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === 'register') {
        const res = await apiFetch<{ user: PublicUser; token: string }>('/api/auth/register', {
          method: 'POST',
          body: JSON.stringify({
            email,
            password,
            name,
            intent,
            neighborhood,
            radiusKm,
            bio,
            avatarUrl,
          }),
        });
        setMemoryToken(res.token);
        onAuthenticated(res.user, res.token);
      } else {
        const res = await apiFetch<{ user: PublicUser; token: string }>('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        });
        setMemoryToken(res.token);
        onAuthenticated(res.user, res.token);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao autenticar.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      <header className="w-full border-b border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 h-16 flex items-center justify-between gap-8">
          <span className="font-display text-xl font-bold tracking-tight whitespace-nowrap shrink-0">
            Conexão BV
          </span>
          <span className="hidden sm:inline text-sm text-slate-500 dark:text-slate-400 whitespace-nowrap">
            Boa Vista, Roraima · Amizade e Namoro
          </span>
          <button
            type="button"
            onClick={() => {
              setMode(mode === 'register' ? 'login' : 'register');
              setError(null);
            }}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-teal-700 text-white hover:bg-teal-800 transition-colors whitespace-nowrap shrink-0"
          >
            {mode === 'register' ? 'Já tenho conta' : 'Criar conta'}
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-8 py-6 lg:py-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        {/* Left Editorial Hero */}
        <section className="lg:col-span-6 flex flex-col justify-between rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <div className="relative h-64 sm:h-80 lg:h-96 w-full bg-slate-200 dark:bg-slate-800">
            <img
              src="/src/assets/images/boa_vista_banner_1795377679463.jpg"
              alt="Orla Taumanan em Boa Vista, Roraima ao pôr do sol"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/40 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-6 sm:p-8 text-white">
              <p className="text-xs font-medium text-teal-300 mb-2">
                Exclusivo para moradores de Boa Vista, RR
              </p>
              <h1 className="font-display text-2xl sm:text-4xl font-bold leading-tight text-balance">
                Conversas reais, grupos privados e encontros na nossa cidade.
              </h1>
            </div>
          </div>

          <div className="p-6 sm:p-8 grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                <Coins className="w-4 h-4 text-amber-600 shrink-0" />
                <span>500 ChatCoins no cadastro</span>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                Envie mensagens em chats privados por 5 moedas ou presenteie amigos com flores e emojis.
              </p>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                <MapPin className="w-4 h-4 text-teal-700 dark:text-teal-400 shrink-0" />
                <span>Raio limitado a Boa Vista</span>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                Escolha seu bairro e alcance de 1 km a 15 km para conhecer pessoas perto de você.
              </p>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                <Lock className="w-4 h-4 text-teal-700 dark:text-teal-400 shrink-0" />
                <span>Privacidade e modo offline</span>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                Mensagens temporárias criptografadas com AES-GCM e histórico disponível mesmo sem internet.
              </p>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                <ShieldCheck className="w-4 h-4 text-teal-700 dark:text-teal-400 shrink-0" />
                <span>Perfis verificados com foto real</span>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                Fotos de perfil sincronizadas na nuvem, galeria com filtros e enquetes rápidas para encontros.
              </p>
            </div>
          </div>
        </section>

        {/* Right Auth Form */}
        <section className="lg:col-span-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-8 flex flex-col justify-center">
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl mb-6">
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setError(null);
              }}
              className={`flex-1 py-2.5 px-4 text-sm font-semibold rounded-lg transition-colors whitespace-nowrap ${
                mode === 'register'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Cadastrar em Boa Vista
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError(null);
              }}
              className={`flex-1 py-2.5 px-4 text-sm font-semibold rounded-lg transition-colors whitespace-nowrap ${
                mode === 'login'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Entrar
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3.5 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 text-sm text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <>
                <div className="flex items-center gap-4 pb-2">
                  <div className="relative w-16 h-16 rounded-2xl overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shrink-0">
                    <img
                      src={avatarUrl}
                      alt="Prévia da foto de perfil"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      Foto de perfil sincronizada na nuvem
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                        <Camera className="w-3.5 h-3.5" />
                        <span>Enviar foto</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleAvatarUpload}
                          className="sr-only"
                        />
                      </label>
                      {PRESET_AVATARS.map((preset, idx) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setAvatarUrl(preset)}
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                            avatarUrl === preset
                              ? 'border-teal-600 bg-teal-50 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300'
                              : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          Retrato {idx + 1}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Seu nome
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex: Mariana Silva"
                    className="w-full h-11 px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
                  />
                </div>
              </>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  E-mail
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="voce@exemplo.com"
                  className="w-full h-11 px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Senha
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  className="w-full h-11 px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>
            </div>

            {mode === 'register' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Objetivo no chat
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      { id: 'amizade', label: 'Amizade' },
                      { id: 'namoro', label: 'Namoro' },
                      { id: 'ambos', label: 'Ambos' },
                    ] as const).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setIntent(opt.id)}
                        className={`h-11 rounded-xl text-sm font-semibold border transition-colors ${
                          intent === opt.id
                            ? 'border-teal-700 bg-teal-700 text-white'
                            : 'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Cidade (fixa)
                    </label>
                    <input
                      type="text"
                      disabled
                      value={CITY_NAME}
                      className="w-full h-11 px-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800/60 text-sm text-slate-600 dark:text-slate-400 cursor-not-allowed"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Bairro em Boa Vista
                    </label>
                    <select
                      value={neighborhood}
                      onChange={(e) => setNeighborhood(e.target.value)}
                      className="w-full h-11 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
                    >
                      {BAIRROS_BOA_VISTA.map((b) => (
                        <option key={b.name} value={b.name}>
                          {b.name} ({b.zone})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <label className="font-medium text-slate-700 dark:text-slate-300">
                      Raio de alcance em Boa Vista
                    </label>
                    <span className="font-mono font-semibold text-teal-700 dark:text-teal-400 tabular-nums">
                      {radiusKm} km (máx. {MAX_RADIUS_KM} km)
                    </span>
                  </div>
                  <input
                    type="range"
                    min={MIN_RADIUS_KM}
                    max={MAX_RADIUS_KM}
                    value={radiusKm}
                    onChange={(e) => setRadiusKm(Number(e.target.value))}
                    className="w-full accent-teal-700"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Sobre você (opcional)
                  </label>
                  <input
                    type="text"
                    maxLength={180}
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="Ex: Curto esportes no Parque Anauá e música ao vivo."
                    className="w-full h-11 px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
                  />
                </div>
              </>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full h-12 rounded-xl bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              {loading ? (
                <span>Conectando...</span>
              ) : mode === 'register' ? (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Criar conta e ganhar 500 ChatCoins</span>
                </>
              ) : (
                <span>Entrar no Conexão BV</span>
              )}
            </button>
          </form>

          <p className="mt-5 text-xs text-slate-500 dark:text-slate-400 text-center">
            Dúvidas ou suporte? Escreva para{' '}
            <a href="mailto:carlikjr42@gmail.com" className="text-teal-700 dark:text-teal-400 underline">
              carlikjr42@gmail.com
            </a>
          </p>
        </section>
      </main>
    </div>
  );
};

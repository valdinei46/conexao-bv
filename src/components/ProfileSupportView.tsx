import React, { useRef, useState } from 'react';
import {
  Camera,
  CheckCircle2,
  Clock,
  Copy,
  LifeBuoy,
  Mail,
  MapPin,
  Moon,
  ShieldAlert,
  ShieldCheck,
  Sun,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { BAIRROS_BOA_VISTA, MAX_RADIUS_KM, MIN_RADIUS_KM } from '../shared/boaVista';
import {
  SUPPORT_EMAIL,
  type ChatIntent,
  type PublicUser,
  type SupportTicket,
} from '../shared/catalog';
import { apiFetch } from '../services/api';
import { readFileAsDataUrl, renderFilteredPhoto } from '../utils/imageFilter';

interface ProfileSupportViewProps {
  user: PublicUser;
  tickets: SupportTicket[];
  isDark: boolean;
  onToggleDark: () => void;
  manualOffline: boolean;
  onToggleOffline: () => void;
  isOffline: boolean;
  onUserUpdated: (user: PublicUser) => void;
  onTicketCreated: () => Promise<void>;
}

export const ProfileSupportView: React.FC<ProfileSupportViewProps> = ({
  user,
  tickets,
  isDark,
  onToggleDark,
  manualOffline,
  onToggleOffline,
  isOffline,
  onUserUpdated,
  onTicketCreated,
}) => {
  const [name, setName] = useState(user.name);
  const [bio, setBio] = useState(user.bio);
  const [intent, setIntent] = useState<ChatIntent>(user.intent);
  const [neighborhood, setNeighborhood] = useState(user.neighborhood);
  const [radiusKm, setRadiusKm] = useState(user.radiusKm);
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<string | null>(null);

  // Real photo verification
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [streamRef, setStreamRef] = useState<MediaStream | null>(null);
  const [verifMsg, setVerifMsg] = useState<string | null>(null);
  const [verifBusy, setVerifBusy] = useState(false);

  // Support ticket
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState('Conta e Verificação');
  const [message, setMessage] = useState('');
  const [sendingTicket, setSendingTicket] = useState(false);
  const [ticketFeedback, setTicketFeedback] = useState<string | null>(null);
  const [copiedEmail, setCopiedEmail] = useState(false);

  // Admin claim
  const [adminPasscode, setAdminPasscode] = useState('');
  const [claimMsg, setClaimMsg] = useState<string | null>(null);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const raw = await readFileAsDataUrl(file);
    const resized = await renderFilteredPhoto(raw, 'none', 480);
    setAvatarUrl(resized);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    setProfileMsg(null);
    try {
      const res = await apiFetch<{ user: PublicUser }>('/api/me/profile', {
        method: 'PATCH',
        body: JSON.stringify({ name, bio, intent, neighborhood, radiusKm, avatarUrl }),
      });
      onUserUpdated(res.user);
      setProfileMsg('Perfil e foto sincronizados na nuvem com todos os usuários de Boa Vista.');
    } catch (err) {
      setProfileMsg(err instanceof Error ? err.message : 'Erro ao atualizar perfil.');
    } finally {
      setSavingProfile(false);
    }
  };

  const startWebcam = async () => {
    setVerifMsg(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      setStreamRef(stream);
      setCameraActive(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      }, 60);
    } catch {
      setVerifMsg('Câmera indisponível neste dispositivo. Envie uma selfie real pelo botão abaixo.');
    }
  };

  const stopWebcam = () => {
    if (streamRef) {
      streamRef.getTracks().forEach((t) => t.stop());
      setStreamRef(null);
    }
    setCameraActive(false);
  };

  const captureAndSubmitVerification = async () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 480;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    stopWebcam();
    await submitVerificationPhoto(dataUrl);
  };

  const handleVerificationUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const raw = await readFileAsDataUrl(file);
    const resized = await renderFilteredPhoto(raw, 'none', 640);
    await submitVerificationPhoto(resized);
  };

  const submitVerificationPhoto = async (photoData: string) => {
    setVerifBusy(true);
    setVerifMsg(null);
    try {
      const res = await apiFetch<{ user: PublicUser }>('/api/me/verify-photo', {
        method: 'POST',
        body: JSON.stringify({ photoData }),
      });
      onUserUpdated(res.user);
      setVerifMsg('Selfie enviada para revisão no Painel Admin!');
    } catch (err) {
      setVerifMsg(err instanceof Error ? err.message : 'Erro ao enviar verificação.');
    } finally {
      setVerifBusy(false);
    }
  };

  const handleSendTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    setSendingTicket(true);
    setTicketFeedback(null);
    try {
      await apiFetch('/api/support', {
        method: 'POST',
        body: JSON.stringify({ subject, category, message }),
      });
      setSubject('');
      setMessage('');
      setTicketFeedback('Chamado enviado! Nossa equipe responderá em breve.');
      await onTicketCreated();
    } catch (err) {
      setTicketFeedback(err instanceof Error ? err.message : 'Erro ao enviar chamado.');
    } finally {
      setSendingTicket(false);
    }
  };

  const handleClaimAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setClaimMsg(null);
    try {
      const res = await apiFetch<{ user: PublicUser }>('/api/auth/claim-admin', {
        method: 'POST',
        body: JSON.stringify({ passcode: adminPasscode }),
      });
      onUserUpdated(res.user);
      setAdminPasscode('');
      setClaimMsg('Acesso administrativo ativado!');
    } catch (err) {
      setClaimMsg(err instanceof Error ? err.message : 'Não foi possível ativar.');
    }
  };

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">
            Perfil, Privacidade e Suporte
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Sincronize sua foto na nuvem, verifique sua identidade com foto real e gerencie o modo offline.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onToggleDark}
            className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-medium inline-flex items-center gap-2"
          >
            {isDark ? <Sun className="w-4 h-4 text-amber-500" /> : <Moon className="w-4 h-4" />}
            <span>{isDark ? 'Tema Claro' : 'Tema Escuro'}</span>
          </button>

          <button
            type="button"
            onClick={onToggleOffline}
            className={`min-h-[44px] px-4 py-2 rounded-xl border text-sm font-medium inline-flex items-center gap-2 ${
              manualOffline
                ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200'
                : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'
            }`}
          >
            {manualOffline ? <WifiOff className="w-4 h-4" /> : <Wifi className="w-4 h-4 text-teal-600" />}
            <span>{manualOffline ? 'Modo Offline Ativo' : 'Simular Modo Offline'}</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left: Cloud Profile + Real Photo Verification */}
        <div className="lg:col-span-6 space-y-6">
          <form
            onSubmit={handleSaveProfile}
            className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4"
          >
            <h2 className="font-display text-lg font-semibold">Perfil em Boa Vista, RR</h2>

            <div className="flex items-center gap-4">
              <img
                src={avatarUrl}
                alt={user.name}
                referrerPolicy="no-referrer"
                className="w-16 h-16 rounded-2xl object-cover border border-slate-200 dark:border-slate-700 shrink-0"
              />
              <div className="space-y-1.5">
                <label className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800">
                  <Camera className="w-4 h-4" />
                  <span>Atualizar foto na nuvem</span>
                  <input type="file" accept="image/*" onChange={handleAvatarUpload} className="sr-only" />
                </label>
                <p className="text-xs text-slate-500">
                  Atualizada instantaneamente para todos os usuários conectados.
                </p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Nome exibido
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full h-11 px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Objetivo
                </label>
                <select
                  value={intent}
                  onChange={(e) => setIntent(e.target.value as ChatIntent)}
                  className="w-full h-11 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                >
                  <option value="amizade">Amizade</option>
                  <option value="namoro">Namoro</option>
                  <option value="ambos">Amizade e Namoro</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Bairro (Boa Vista, RR)
                </label>
                <select
                  value={neighborhood}
                  onChange={(e) => setNeighborhood(e.target.value)}
                  className="w-full h-11 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                >
                  {BAIRROS_BOA_VISTA.map((b) => (
                    <option key={b.name} value={b.name}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-medium text-slate-600 dark:text-slate-400 flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" />
                  Raio de alcance dentro de Boa Vista
                </span>
                <span className="font-mono font-semibold tabular-nums">{radiusKm} km</span>
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
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Bio
              </label>
              <textarea
                rows={2}
                maxLength={240}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                className="w-full p-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
              />
            </div>

            {profileMsg && <p className="text-xs font-medium text-teal-700 dark:text-teal-400">{profileMsg}</p>}

            <button
              type="submit"
              disabled={isOffline || savingProfile}
              className="w-full min-h-[44px] rounded-xl bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white text-sm font-semibold cursor-pointer"
            >
              {savingProfile ? 'Sincronizando...' : 'Salvar e sincronizar perfil'}
            </button>
          </form>

          {/* Real-Photo Verification Card */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-lg font-semibold flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-teal-700 dark:text-teal-400" />
                <span>Verificação com Foto Real</span>
              </h2>
              <span className="text-xs font-semibold flex items-center gap-1">
                {user.verificationStatus === 'verified' && (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-teal-600" />
                    <span className="text-teal-700 dark:text-teal-400">Verificado</span>
                  </>
                )}
                {user.verificationStatus === 'pending' && (
                  <>
                    <Clock className="w-4 h-4 text-amber-600" />
                    <span className="text-amber-700 dark:text-amber-400">Em análise</span>
                  </>
                )}
                {user.verificationStatus === 'unverified' && (
                  <span className="text-slate-500">Não verificado</span>
                )}
                {user.verificationStatus === 'rejected' && (
                  <span className="text-red-600">Recusado — tente novamente</span>
                )}
              </span>
            </div>

            <p className="text-sm text-slate-600 dark:text-slate-400">
              Tire uma selfie ao vivo ou envie uma foto nítida do rosto para receber o selo de conta real verificada.
            </p>

            {cameraActive && (
              <div className="space-y-3">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full rounded-xl bg-slate-950 aspect-video object-cover"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={captureAndSubmitVerification}
                    className="flex-1 min-h-[44px] rounded-xl bg-teal-700 text-white text-sm font-semibold"
                  >
                    Capturar e enviar verificação
                  </button>
                  <button
                    type="button"
                    onClick={stopWebcam}
                    className="px-4 min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 text-sm"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            {!cameraActive && user.verificationStatus !== 'verified' && (
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={isOffline || verifBusy}
                  onClick={startWebcam}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-sm font-semibold inline-flex items-center gap-2"
                >
                  <Camera className="w-4 h-4" />
                  <span>Abrir câmera ao vivo</span>
                </button>
                <label className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-sm font-semibold inline-flex items-center gap-2 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800">
                  <span>Enviar selfie do arquivo</span>
                  <input
                    type="file"
                    accept="image/*"
                    disabled={isOffline || verifBusy}
                    onChange={handleVerificationUpload}
                    className="sr-only"
                  />
                </label>
              </div>
            )}

            {verifMsg && <p className="text-xs font-medium text-teal-700 dark:text-teal-400">{verifMsg}</p>}
          </div>
        </div>

        {/* Right: Dedicated Support & Admin Bootstrap */}
        <div className="lg:col-span-6 space-y-6">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-display text-lg font-semibold flex items-center gap-2">
                  <LifeBuoy className="w-5 h-5 text-teal-700 dark:text-teal-400" />
                  <span>Suporte Dedicado Conexão BV</span>
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                  Atendimento rápido para dúvidas, verificação ou segurança.
                </p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 text-sm">
                <Mail className="w-4 h-4 text-teal-700 dark:text-teal-400 shrink-0" />
                <span className="font-mono text-xs sm:text-sm font-semibold">{SUPPORT_EMAIL}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(SUPPORT_EMAIL);
                    setCopiedEmail(true);
                    setTimeout(() => setCopiedEmail(false), 2000);
                  }}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold inline-flex items-center gap-1"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>{copiedEmail ? 'Copiado' : 'Copiar e-mail'}</span>
                </button>
                <a
                  href={`mailto:${SUPPORT_EMAIL}?subject=Suporte%20Conex%C3%A3o%20BV`}
                  className="px-3 py-1.5 rounded-lg bg-teal-700 text-white text-xs font-semibold"
                >
                  Enviar e-mail
                </a>
              </div>
            </div>

            <form onSubmit={handleSendTicket} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Assunto
                  </label>
                  <input
                    type="text"
                    required
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Ex: Dúvida sobre ChatCoins"
                    className="w-full h-11 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Categoria
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full h-11 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                  >
                    <option>Conta e Verificação</option>
                    <option>ChatCoins e Loja</option>
                    <option>Segurança e Denúncia</option>
                    <option>Sugestão para Boa Vista</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Mensagem
                </label>
                <textarea
                  rows={3}
                  required
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Descreva como podemos ajudar..."
                  className="w-full p-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                />
              </div>

              {ticketFeedback && (
                <p className="text-xs font-medium text-teal-700 dark:text-teal-400">{ticketFeedback}</p>
              )}

              <button
                type="submit"
                disabled={isOffline || sendingTicket}
                className="w-full min-h-[44px] rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-sm font-semibold disabled:opacity-50"
              >
                {sendingTicket ? 'Enviando...' : 'Abrir chamado de suporte'}
              </button>
            </form>

            {tickets.length > 0 && (
              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
                <div className="text-xs font-semibold text-slate-500">Seus chamados recentes</div>
                {tickets.map((t) => (
                  <div
                    key={t.id}
                    className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 space-y-1 text-sm"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">{t.subject}</span>
                      <span className="text-xs font-medium text-teal-700 dark:text-teal-400">
                        {t.status === 'answered' ? 'Respondido' : 'Aberto'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400">{t.message}</p>
                    {t.adminReply && (
                      <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-800 dark:text-slate-200">
                        <span className="font-semibold">Resposta do Suporte:</span> {t.adminReply}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {user.role !== 'admin' && (
            <form
              onSubmit={handleClaimAdmin}
              className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-3"
            >
              <div className="flex items-center gap-2 font-display font-semibold text-base">
                <ShieldAlert className="w-5 h-5 text-slate-500" />
                <span>Acesso ao Painel Administrativo</span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Administradores autorizados (ou o primeiro responsável pela plataforma) podem ativar o painel de moderação e métricas.
              </p>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={adminPasscode}
                  onChange={(e) => setAdminPasscode(e.target.value)}
                  placeholder="Senha ou código administrativo"
                  className="flex-1 h-11 px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                />
                <button
                  type="submit"
                  disabled={isOffline}
                  className="px-4 min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 text-sm font-semibold hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Ativar
                </button>
              </div>
              {claimMsg && <p className="text-xs text-teal-700 dark:text-teal-400">{claimMsg}</p>}
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

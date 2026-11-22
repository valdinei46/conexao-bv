import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  BadgeCheck,
  BarChart3,
  Camera,
  Check,
  Copy,
  Flag,
  Gift,
  KeyRound,
  Lock,
  MapPin,
  MessageSquarePlus,
  Plus,
  Search,
  Send,
  Timer,
  Users,
} from 'lucide-react';
import {
  BAIRROS_BOA_VISTA,
  MAX_RADIUS_KM,
  MIN_RADIUS_KM,
  PONTOS_ENCONTRO_BV,
} from '../shared/boaVista';
import {
  PRIVATE_MESSAGE_COST,
  VIRTUAL_GIFTS,
  type ChatIntent,
  type ChatMessage,
  type ChatRoom,
  type MeetupPoll,
  type PublicUser,
  type SmartFolder,
} from '../shared/catalog';
import { decryptMessageText, encryptMessageText } from '../utils/cryptoE2E';
import { PhotoFilterModal } from './PhotoFilterModal';

export interface DirectoryUser extends PublicUser {
  distanceKm?: number;
}

interface ChatWorkspaceProps {
  currentUser: PublicUser;
  rooms: ChatRoom[];
  activeRoomId: string | null;
  onSelectRoom: (roomId: string | null) => void;
  messages: ChatMessage[];
  polls: MeetupPoll[];
  directoryUsers: DirectoryUser[];
  inventory: Record<string, number>;
  isOffline: boolean;
  onSendMessage: (payload: {
    roomId: string;
    content: string;
    msgType: 'text' | 'photo' | 'gift';
    photoData?: string | null;
    photoFilter?: string | null;
    smartFolder?: SmartFolder | null;
    giftId?: string | null;
    isEncrypted?: boolean;
    expiresInSeconds?: number | null;
  }) => Promise<void>;
  onStartPrivateChat: (targetUserId: string) => Promise<void>;
  onCreateGroup: (payload: {
    name: string;
    type: 'private_group' | 'city_group';
    intent: ChatIntent;
    neighborhood: string;
  }) => Promise<void>;
  onJoinGroupByCode: (inviteCode: string) => Promise<void>;
  onCreatePoll: (payload: {
    roomId: string;
    question: string;
    locationBv: string;
    eventTime: string;
    options: string[];
  }) => Promise<void>;
  onVotePoll: (pollId: string, optionIndex: number) => Promise<void>;
  onReportUser: (payload: {
    reportedUserId: string;
    roomId: string;
    reason: string;
    details: string;
  }) => Promise<void>;
}

const DEFAULT_E2E_KEY = 'conexaobv-padrao';

export const ChatWorkspace: React.FC<ChatWorkspaceProps> = ({
  currentUser,
  rooms,
  activeRoomId,
  onSelectRoom,
  messages,
  polls,
  directoryUsers,
  inventory,
  isOffline,
  onSendMessage,
  onStartPrivateChat,
  onCreateGroup,
  onJoinGroupByCode,
  onCreatePoll,
  onVotePoll,
  onReportUser,
}) => {
  const [sidebarTab, setSidebarTab] = useState<'rooms' | 'people'>('rooms');
  const [searchQuery, setSearchQuery] = useState('');
  const [intentFilter, setIntentFilter] = useState<'todos' | 'amizade' | 'namoro'>('todos');
  const [radiusFilter, setRadiusFilter] = useState<number>(currentUser.radiusKm);

  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [composerError, setComposerError] = useState<string | null>(null);

  // Encrypted ephemeral settings
  const [encryptEnabled, setEncryptEnabled] = useState(false);
  const [ttlSeconds, setTtlSeconds] = useState<number>(300);
  const [e2ePassphrase, setE2ePassphrase] = useState(DEFAULT_E2E_KEY);
  const [decryptedMap, setDecryptedMap] = useState<Record<string, string>>({});
  const [nowTick, setNowTick] = useState(Date.now());

  // Modals / Popovers
  const [photoModalOpen, setPhotoModalOpen] = useState(false);
  const [giftDrawerOpen, setGiftDrawerOpen] = useState(false);
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [joinCodeModalOpen, setJoinCodeModalOpen] = useState(false);
  const [pollModalOpen, setPollModalOpen] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [copiedInvite, setCopiedInvite] = useState(false);

  // Create group state
  const [grpName, setGrpName] = useState('');
  const [grpType, setGrpType] = useState<'private_group' | 'city_group'>('private_group');
  const [grpIntent, setGrpIntent] = useState<ChatIntent>('amizade');
  const [grpBairro, setGrpBairro] = useState(currentUser.neighborhood);
  const [inviteCodeInput, setInviteCodeInput] = useState('');

  // Create poll state
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollLocation, setPollLocation] = useState(PONTOS_ENCONTRO_BV[0]);
  const [pollTime, setPollTime] = useState('Sábado, 18h00');
  const [pollOpt1, setPollOpt1] = useState('Sim, confirmo presença');
  const [pollOpt2, setPollOpt2] = useState('Prefiro mais tarde');
  const [pollOpt3, setPollOpt3] = useState('');

  // Report state
  const [reportReason, setReportReason] = useState('Comportamento inadequado');
  const [reportDetails, setReportDetails] = useState('');
  const [reportSuccess, setReportSuccess] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const activeRoom = useMemo(
    () => rooms.find((r) => r.id === activeRoomId) ?? null,
    [rooms, activeRoomId]
  );

  // Live timer tick for ephemeral message countdowns
  useEffect(() => {
    const hasEphemeral = messages.some((m) => Boolean(m.expiresAt));
    if (!hasEphemeral) return;
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [messages]);

  // Decrypt encrypted messages client-side
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const updates: Record<string, string> = {};
      for (const m of messages) {
        if (m.isEncrypted) {
          const plain = await decryptMessageText(m.content, e2ePassphrase || DEFAULT_E2E_KEY);
          if (plain !== null) {
            updates[m.id] = plain;
          }
        }
      }
      if (!cancelled) {
        setDecryptedMap(updates);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [messages, e2ePassphrase]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, activeRoomId]);

  const filteredRooms = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return rooms.filter((r) => {
      if (!q) return true;
      return r.name.toLowerCase().includes(q) || r.neighborhood.toLowerCase().includes(q);
    });
  }, [rooms, searchQuery]);

  const filteredNeighbors = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return directoryUsers.filter((u) => {
      if (u.id === currentUser.id) return false;
      if (intentFilter !== 'todos' && u.intent !== 'ambos' && u.intent !== intentFilter) return false;
      if (u.distanceKm !== undefined && u.distanceKm > radiusFilter) return false;
      if (q && !u.name.toLowerCase().includes(q) && !u.neighborhood.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [directoryUsers, currentUser.id, intentFilter, radiusFilter, searchQuery]);

  const handleSendText = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeRoom || !text.trim()) return;
    setSending(true);
    setComposerError(null);
    try {
      const finalContent = encryptEnabled
        ? await encryptMessageText(text.trim(), e2ePassphrase || DEFAULT_E2E_KEY)
        : text.trim();

      await onSendMessage({
        roomId: activeRoom.id,
        content: finalContent,
        msgType: 'text',
        isEncrypted: encryptEnabled,
        expiresInSeconds: encryptEnabled ? ttlSeconds : null,
      });
      setText('');
    } catch (err) {
      setComposerError(err instanceof Error ? err.message : 'Erro ao enviar mensagem.');
    } finally {
      setSending(false);
    }
  };

  const handleSendPhoto = async (payload: {
    imageData: string;
    filterName: string;
    smartFolder: SmartFolder;
    caption: string;
  }) => {
    if (!activeRoom) return;
    setComposerError(null);
    await onSendMessage({
      roomId: activeRoom.id,
      content: payload.caption || 'Foto compartilhada',
      msgType: 'photo',
      photoData: payload.imageData,
      photoFilter: payload.filterName,
      smartFolder: payload.smartFolder,
      isEncrypted: false,
      expiresInSeconds: encryptEnabled ? ttlSeconds : null,
    });
  };

  const handleSendGift = async (giftId: string, giftName: string, icon: string) => {
    if (!activeRoom) return;
    setGiftDrawerOpen(false);
    setComposerError(null);
    try {
      await onSendMessage({
        roomId: activeRoom.id,
        content: `Enviou um presente: ${icon} ${giftName}`,
        msgType: 'gift',
        giftId,
      });
    } catch (err) {
      setComposerError(err instanceof Error ? err.message : 'Erro ao enviar presente.');
    }
  };

  const handleCreateGroupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await onCreateGroup({
        name: grpName,
        type: grpType,
        intent: grpIntent,
        neighborhood: grpBairro,
      });
      setGrpName('');
      setGroupModalOpen(false);
    } catch (err) {
      setComposerError(err instanceof Error ? err.message : 'Erro ao criar grupo.');
    }
  };

  const handleJoinCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await onJoinGroupByCode(inviteCodeInput);
      setInviteCodeInput('');
      setJoinCodeModalOpen(false);
    } catch (err) {
      setComposerError(err instanceof Error ? err.message : 'Código inválido.');
    }
  };

  const handleCreatePollSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeRoom) return;
    const opts = [pollOpt1, pollOpt2, pollOpt3].map((s) => s.trim()).filter(Boolean);
    await onCreatePoll({
      roomId: activeRoom.id,
      question: pollQuestion,
      locationBv: pollLocation,
      eventTime: pollTime,
      options: opts,
    });
    setPollQuestion('');
    setPollOpt3('');
    setPollModalOpen(false);
  };

  const handleReportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeRoom?.otherUser) return;
    await onReportUser({
      reportedUserId: activeRoom.otherUser.id,
      roomId: activeRoom.id,
      reason: reportReason,
      details: reportDetails,
    });
    setReportDetails('');
    setReportSuccess(true);
    setTimeout(() => {
      setReportSuccess(false);
      setReportModalOpen(false);
    }, 1500);
  };

  const visibleMessages = messages.filter((m) => !m.expiresAt || m.expiresAt > nowTick);

  return (
    <div className="h-full flex overflow-hidden bg-slate-50 dark:bg-slate-950">
      {/* Left Directory Column (hidden on mobile when a room is active) */}
      <aside
        className={`${
          activeRoom ? 'hidden lg:flex' : 'flex'
        } w-full lg:w-[350px] shrink-0 flex-col border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900`}
      >
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
            <button
              type="button"
              onClick={() => setSidebarTab('rooms')}
              className={`flex-1 min-h-[38px] text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                sidebarTab === 'rooms'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Grupos e Chats ({rooms.length})
            </button>
            <button
              type="button"
              onClick={() => setSidebarTab('people')}
              className={`flex-1 min-h-[38px] text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                sidebarTab === 'people'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Boa Vista ({filteredNeighbors.length})
            </button>
          </div>

          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                sidebarTab === 'rooms' ? 'Buscar grupos ou conversas...' : 'Buscar nome ou bairro BV...'
              }
              className="w-full h-10 pl-9 pr-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
            />
          </div>

          {sidebarTab === 'rooms' ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={isOffline}
                onClick={() => setGroupModalOpen(true)}
                className="flex-1 min-h-[40px] px-3 rounded-xl bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>Novo grupo</span>
              </button>
              <button
                type="button"
                disabled={isOffline}
                onClick={() => setJoinCodeModalOpen(true)}
                className="min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
              >
                Código convite
              </button>
            </div>
          ) : (
            <div className="space-y-2.5 pt-1">
              <div className="flex items-center gap-1.5">
                {(['todos', 'amizade', 'namoro'] as const).map((it) => (
                  <button
                    key={it}
                    type="button"
                    onClick={() => setIntentFilter(it)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-medium capitalize border transition-colors ${
                      intentFilter === it
                        ? 'border-teal-700 bg-teal-50 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300'
                        : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {it}
                  </button>
                ))}
              </div>
              <div>
                <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                  <span>Raio em Boa Vista ({currentUser.neighborhood})</span>
                  <span className="font-mono font-semibold tabular-nums">{radiusFilter} km</span>
                </div>
                <input
                  type="range"
                  min={MIN_RADIUS_KM}
                  max={MAX_RADIUS_KM}
                  value={radiusFilter}
                  onChange={(e) => setRadiusFilter(Number(e.target.value))}
                  className="w-full accent-teal-700"
                />
              </div>
            </div>
          )}
        </div>

        {/* List Content */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/80">
          {sidebarTab === 'rooms' ? (
            filteredRooms.length === 0 ? (
              <div className="p-6 text-center text-sm text-slate-500">Nenhuma conversa encontrada.</div>
            ) : (
              filteredRooms.map((room) => {
                const selected = room.id === activeRoomId;
                return (
                  <button
                    key={room.id}
                    type="button"
                    onClick={() => onSelectRoom(room.id)}
                    className={`w-full text-left px-4 py-3.5 flex items-start gap-3 transition-colors min-h-[64px] ${
                      selected
                        ? 'bg-teal-50/70 dark:bg-teal-950/30'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    {room.otherUser ? (
                      <img
                        src={room.otherUser.avatarUrl}
                        alt={room.name}
                        referrerPolicy="no-referrer"
                        className="w-11 h-11 rounded-2xl object-cover shrink-0 border border-slate-200 dark:border-slate-700"
                      />
                    ) : (
                      <div className="w-11 h-11 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 text-teal-700 dark:text-teal-400">
                        {room.type === 'private_group' ? (
                          <Lock className="w-5 h-5" />
                        ) : (
                          <Users className="w-5 h-5" />
                        )}
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-sm truncate flex items-center gap-1">
                          {room.name}
                          {room.otherUser?.verificationStatus === 'verified' && (
                            <BadgeCheck className="w-4 h-4 text-teal-600 shrink-0" />
                          )}
                        </span>
                        <span className="text-[11px] font-mono text-slate-400 shrink-0 tabular-nums">
                          {room.lastMessageAt
                            ? new Date(room.lastMessageAt).toLocaleTimeString('pt-BR', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : ''}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                        {room.type === 'private_chat'
                          ? `Chat privado (${PRIVATE_MESSAGE_COST} moedas) · ${room.neighborhood}`
                          : room.type === 'private_group'
                            ? `Grupo privado · ${room.neighborhood}`
                            : `Boa Vista · ${room.intent}`}
                      </div>
                      {room.lastMessage && (
                        <p className="text-xs text-slate-600 dark:text-slate-300 truncate mt-1">
                          {room.lastMessage}
                        </p>
                      )}
                    </div>
                  </button>
                );
              })
            )
          ) : filteredNeighbors.length === 0 ? (
            <div className="p-6 text-center text-sm text-slate-500">
              Ninguém encontrado neste raio em Boa Vista. Aumente o alcance até 15 km!
            </div>
          ) : (
            filteredNeighbors.map((neighbor) => (
              <div key={neighbor.id} className="p-4 flex items-start gap-3">
                <img
                  src={neighbor.avatarUrl}
                  alt={neighbor.name}
                  referrerPolicy="no-referrer"
                  className="w-12 h-12 rounded-2xl object-cover shrink-0 border border-slate-200 dark:border-slate-700"
                />
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-sm truncate">{neighbor.name}</span>
                    {neighbor.verificationStatus === 'verified' && (
                      <BadgeCheck className="w-4 h-4 text-teal-600 shrink-0" />
                    )}
                    <span className="text-[11px] text-slate-500 ml-auto shrink-0">
                      {neighbor.online ? 'Online' : 'Offline'}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      {neighbor.neighborhood} · {neighbor.distanceKm ?? 0.6} km · {neighbor.intent}
                    </span>
                  </div>
                  {neighbor.bio && (
                    <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2">{neighbor.bio}</p>
                  )}
                  <button
                    type="button"
                    disabled={isOffline}
                    onClick={() => onStartPrivateChat(neighbor.id)}
                    className="mt-1.5 px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <MessageSquarePlus className="w-3.5 h-3.5" />
                    <span>Conversar ({PRIVATE_MESSAGE_COST} moedas/msg)</span>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </aside>

      {/* Main Active Chat Viewport */}
      <section className={`${activeRoom ? 'flex' : 'hidden lg:flex'} flex-1 flex-col min-w-0`}>
        {!activeRoom ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-3">
            <img
              src="/src/assets/images/meetup_sunset_park_1795377679211.jpg"
              alt="Amigos caminhando ao pôr do sol em Boa Vista"
              referrerPolicy="no-referrer"
              className="w-64 h-44 object-cover rounded-2xl border border-slate-200 dark:border-slate-800 mb-2"
            />
            <h2 className="font-display text-xl font-bold">Escolha uma conversa em Boa Vista</h2>
            <p className="text-sm text-slate-500 max-w-md">
              Entre em um grupo de amizade ou namoro, crie enquetes para encontros na Orla ou envie mensagens criptografadas.
            </p>
          </div>
        ) : (
          <>
            {/* Active Room Header */}
            <header className="px-4 sm:px-6 py-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  type="button"
                  onClick={() => onSelectRoom(null)}
                  className="lg:hidden min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800"
                  aria-label="Voltar para conversas"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <div className="min-w-0">
                  <div className="font-display font-semibold text-base truncate flex items-center gap-1.5">
                    <span className="truncate">{activeRoom.name}</span>
                    {activeRoom.otherUser?.verificationStatus === 'verified' && (
                      <BadgeCheck className="w-4 h-4 text-teal-600 shrink-0" />
                    )}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    {activeRoom.neighborhood}, Boa Vista ·{' '}
                    {activeRoom.type === 'private_chat'
                      ? `Chat privado (${PRIVATE_MESSAGE_COST} ChatCoins/msg)`
                      : `${activeRoom.memberCount} participantes`}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {activeRoom.inviteCode && (
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(activeRoom.inviteCode || '');
                      setCopiedInvite(true);
                      setTimeout(() => setCopiedInvite(false), 1800);
                    }}
                    className="hidden sm:inline-flex min-h-[38px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-mono font-semibold items-center gap-1.5 hover:bg-slate-50 dark:hover:bg-slate-800"
                    title="Copiar código de convite"
                  >
                    {copiedInvite ? <Check className="w-3.5 h-3.5 text-teal-600" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{activeRoom.inviteCode}</span>
                  </button>
                )}

                <button
                  type="button"
                  disabled={isOffline}
                  onClick={() => setPollModalOpen(true)}
                  className="min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
                >
                  <BarChart3 className="w-4 h-4 text-teal-700 dark:text-teal-400" />
                  <span className="hidden sm:inline">Enquete</span>
                </button>

                <button
                  type="button"
                  onClick={() => setEncryptEnabled((v) => !v)}
                  className={`min-h-[40px] px-3 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${
                    encryptEnabled
                      ? 'border-teal-700 bg-teal-700 text-white'
                      : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <Lock className="w-4 h-4" />
                  <span className="hidden sm:inline">Temporária E2E</span>
                </button>

                {activeRoom.otherUser && (
                  <button
                    type="button"
                    onClick={() => setReportModalOpen(true)}
                    className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-red-600"
                    title="Denunciar usuário"
                  >
                    <Flag className="w-4 h-4" />
                  </button>
                )}
              </div>
            </header>

            {/* Offline Notice */}
            {isOffline && (
              <div className="px-4 py-2 bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-900 text-xs text-amber-900 dark:text-amber-200 flex items-center justify-between">
                <span>Modo Offline ativo: visualizando histórico salvo localmente.</span>
              </div>
            )}

            {/* Quick Meetup Polls Strip */}
            {polls.length > 0 && (
              <div className="px-4 sm:px-6 py-3 bg-slate-100/70 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800 space-y-2 max-h-52 overflow-y-auto shrink-0">
                {polls.map((poll) => {
                  const totalVotes = poll.options.reduce((acc, o) => acc + o.votes, 0);
                  return (
                    <div
                      key={poll.id}
                      className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 space-y-2"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-sm font-semibold">{poll.question}</div>
                        <div className="text-xs text-slate-500">
                          {poll.locationBv} · {poll.eventTime}
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        {poll.options.map((opt, idx) => {
                          const pct = totalVotes > 0 ? Math.round((opt.votes / totalVotes) * 100) : 0;
                          const voted = poll.userVoteIndex === idx;
                          return (
                            <button
                              key={idx}
                              type="button"
                              disabled={isOffline}
                              onClick={() => onVotePoll(poll.id, idx)}
                              className={`relative overflow-hidden text-left px-3 py-2 rounded-lg border text-xs transition-colors ${
                                voted
                                  ? 'border-teal-700 bg-teal-50/70 dark:bg-teal-950/40 font-semibold'
                                  : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2 relative z-10">
                                <span className="truncate">{opt.text}</span>
                                <span className="font-mono tabular-nums shrink-0">
                                  {opt.votes} ({pct}%)
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Message Feed */}
            <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4">
              {visibleMessages.length === 0 ? (
                <div className="py-12 text-center text-sm text-slate-500">
                  Nenhuma mensagem ainda. Diga olá para Boa Vista!
                </div>
              ) : (
                visibleMessages.map((msg) => {
                  const mine = msg.senderId === currentUser.id;
                  const remainingSec = msg.expiresAt
                    ? Math.max(0, Math.ceil((msg.expiresAt - nowTick) / 1000))
                    : null;
                  const displayText = msg.isEncrypted
                    ? decryptedMap[msg.id] ?? 'Mensagem criptografada (insira a chave compartilhada para ler)'
                    : msg.content;
                  const giftInfo = msg.giftId ? VIRTUAL_GIFTS.find((g) => g.id === msg.giftId) : null;

                  return (
                    <div key={msg.id} className={`flex items-end gap-2.5 ${mine ? 'justify-end' : 'justify-start'}`}>
                      {!mine && (
                        <img
                          src={msg.senderAvatar}
                          alt={msg.senderName}
                          referrerPolicy="no-referrer"
                          className="w-8 h-8 rounded-full object-cover shrink-0 mb-1"
                        />
                      )}

                      <div
                        className={`max-w-[82%] sm:max-w-[68%] rounded-2xl px-4 py-2.5 space-y-1.5 ${
                          mine
                            ? 'bg-teal-700 text-white'
                            : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100'
                        }`}
                      >
                        {!mine && (
                          <div className="text-xs font-semibold flex items-center gap-1 opacity-85">
                            <span>{msg.senderName}</span>
                            {msg.senderVerified && <BadgeCheck className="w-3.5 h-3.5 text-teal-500" />}
                          </div>
                        )}

                        {msg.msgType === 'photo' && msg.photoData && (
                          <div className="space-y-1.5">
                            <img
                              src={msg.photoData}
                              alt={msg.content}
                              referrerPolicy="no-referrer"
                              className="rounded-xl max-h-72 w-auto object-cover"
                            />
                            <div className={`text-[11px] ${mine ? 'text-teal-100' : 'text-slate-500'}`}>
                              {msg.smartFolder || 'Galeria'} · Filtro {msg.photoFilter || 'Original'}
                            </div>
                          </div>
                        )}

                        {msg.msgType === 'gift' && giftInfo && (
                          <div
                            className={`p-3 rounded-xl flex items-center gap-3 ${
                              mine ? 'bg-teal-800/70' : 'bg-amber-50 dark:bg-amber-950/40'
                            }`}
                          >
                            <span className="text-3xl leading-none">{giftInfo.icon}</span>
                            <div className="text-xs">
                              <div className="font-semibold">{giftInfo.name}</div>
                              <div className={mine ? 'text-teal-100' : 'text-slate-500'}>
                                Presente virtual ({giftInfo.cost} ChatCoins)
                              </div>
                            </div>
                          </div>
                        )}

                        {displayText && <p className="text-sm leading-relaxed break-words">{displayText}</p>}

                        <div
                          className={`flex items-center justify-end gap-2 text-[11px] font-mono tabular-nums ${
                            mine ? 'text-teal-100/80' : 'text-slate-400'
                          }`}
                        >
                          {msg.isEncrypted && (
                            <span className="inline-flex items-center gap-1">
                              <Lock className="w-3 h-3" />
                              E2E
                            </span>
                          )}
                          {remainingSec !== null && (
                            <span className="inline-flex items-center gap-1">
                              <Timer className="w-3 h-3" />
                              {remainingSec}s
                            </span>
                          )}
                          <span>
                            {new Date(msg.createdAt).toLocaleTimeString('pt-BR', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Ephemeral Encryption Settings Strip */}
            {encryptEnabled && (
              <div className="px-4 sm:px-6 py-2.5 bg-teal-50 dark:bg-teal-950/40 border-t border-teal-200 dark:border-teal-900 flex flex-wrap items-center gap-3 text-xs">
                <span className="font-semibold text-teal-900 dark:text-teal-200 inline-flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5" />
                  Modo Temporário Criptografado
                </span>
                <select
                  value={ttlSeconds}
                  onChange={(e) => setTtlSeconds(Number(e.target.value))}
                  className="h-8 px-2 rounded-lg border border-teal-300 dark:border-teal-800 bg-white dark:bg-slate-900 text-xs"
                >
                  <option value={30}>Expira em 30s</option>
                  <option value={300}>Expira em 5 min</option>
                  <option value={3600}>Expira em 1 hora</option>
                  <option value={86400}>Expira em 24 horas</option>
                </select>
                <div className="flex items-center gap-1.5 flex-1 min-w-[180px]">
                  <KeyRound className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400 shrink-0" />
                  <input
                    type="text"
                    value={e2ePassphrase}
                    onChange={(e) => setE2ePassphrase(e.target.value)}
                    placeholder="Chave E2E compartilhada"
                    className="w-full max-w-xs h-8 px-2.5 rounded-lg border border-teal-300 dark:border-teal-800 bg-white dark:bg-slate-900 text-xs"
                  />
                </div>
              </div>
            )}

            {/* Gift Quick Drawer */}
            {giftDrawerOpen && (
              <div className="px-4 sm:px-6 py-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800">
                <div className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2">
                  Enviar flor virtual ou emoji especial (usa seu inventário ou saldo de ChatCoins)
                </div>
                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  {VIRTUAL_GIFTS.map((gift) => {
                    const owned = inventory[gift.id] || 0;
                    return (
                      <button
                        key={gift.id}
                        type="button"
                        disabled={isOffline}
                        onClick={() => handleSendGift(gift.id, gift.name, gift.icon)}
                        className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-teal-600 bg-slate-50 dark:bg-slate-950 flex items-center gap-2 shrink-0 text-xs"
                      >
                        <span className="text-lg">{gift.icon}</span>
                        <div className="text-left">
                          <div className="font-semibold">{gift.name}</div>
                          <div className="font-mono text-[11px] text-amber-600 dark:text-amber-400">
                            {owned > 0 ? `Inventário (${owned})` : `${gift.cost} moedas`}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Composer Error */}
            {composerError && (
              <div className="px-4 py-2 bg-red-50 dark:bg-red-950/40 border-t border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300">
                {composerError}
              </div>
            )}

            {/* Message Input Bar */}
            <form
              onSubmit={handleSendText}
              className="p-3 sm:px-6 sm:py-3.5 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center gap-2 shrink-0"
            >
              <button
                type="button"
                disabled={isOffline}
                onClick={() => setPhotoModalOpen(true)}
                className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 shrink-0"
                title="Enviar foto com filtro"
              >
                <Camera className="w-5 h-5" />
              </button>

              <button
                type="button"
                disabled={isOffline}
                onClick={() => setGiftDrawerOpen((v) => !v)}
                className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 shrink-0"
                title="Enviar flor ou emoji virtual"
              >
                <Gift className="w-5 h-5 text-amber-600" />
              </button>

              <input
                type="text"
                disabled={isOffline || sending}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={
                  isOffline
                    ? 'Modo Offline ativo — somente leitura'
                    : activeRoom.type === 'private_chat'
                      ? `Escreva sua mensagem (${PRIVATE_MESSAGE_COST} ChatCoins)...`
                      : 'Escreva sua mensagem para o grupo...'
                }
                className="flex-1 h-11 px-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600 disabled:opacity-60"
              />

              <button
                type="submit"
                disabled={isOffline || sending || !text.trim()}
                className="min-w-[44px] min-h-[44px] px-4 rounded-xl bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white text-sm font-semibold inline-flex items-center justify-center gap-1.5 shrink-0"
              >
                <Send className="w-4 h-4" />
                <span className="hidden sm:inline">Enviar</span>
              </button>
            </form>
          </>
        )}
      </section>

      {/* Modals */}
      <PhotoFilterModal
        isOpen={photoModalOpen}
        onClose={() => setPhotoModalOpen(false)}
        onConfirm={handleSendPhoto}
        submitLabel="Enviar foto no chat"
      />

      {groupModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateGroupSubmit}
            className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4"
          >
            <h3 className="font-display text-lg font-bold">Criar Grupo em Boa Vista</h3>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Nome do grupo</label>
              <input
                type="text"
                required
                value={grpName}
                onChange={(e) => setGrpName(e.target.value)}
                placeholder="Ex: Trilha e Tereré no Parque Anauá"
                className="w-full h-11 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Privacidade</label>
                <select
                  value={grpType}
                  onChange={(e) => setGrpType(e.target.value as 'private_group' | 'city_group')}
                  className="w-full h-11 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                >
                  <option value="private_group">Grupo Privado (com código)</option>
                  <option value="city_group">Grupo Aberto (Boa Vista)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Objetivo</label>
                <select
                  value={grpIntent}
                  onChange={(e) => setGrpIntent(e.target.value as ChatIntent)}
                  className="w-full h-11 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                >
                  <option value="amizade">Amizade</option>
                  <option value="namoro">Namoro</option>
                  <option value="ambos">Ambos</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Bairro referência</label>
              <select
                value={grpBairro}
                onChange={(e) => setGrpBairro(e.target.value)}
                className="w-full h-11 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
              >
                {BAIRROS_BOA_VISTA.map((b) => (
                  <option key={b.name} value={b.name}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setGroupModalOpen(false)}
                className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-5 py-2.5 rounded-xl bg-teal-700 text-white text-sm font-semibold"
              >
                Criar grupo
              </button>
            </div>
          </form>
        </div>
      )}

      {joinCodeModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleJoinCodeSubmit}
            className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4"
          >
            <h3 className="font-display text-lg font-bold">Entrar em Grupo Privado</h3>
            <p className="text-xs text-slate-500">
              Informe o código de convite (exemplo inicial: <span className="font-mono font-semibold">CAFE-2026</span>).
            </p>
            <input
              type="text"
              required
              value={inviteCodeInput}
              onChange={(e) => setInviteCodeInput(e.target.value)}
              placeholder="Ex: CAFE-2026"
              className="w-full h-11 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono uppercase"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setJoinCodeModalOpen(false)}
                className="px-4 py-2 rounded-xl text-sm"
              >
                Cancelar
              </button>
              <button type="submit" className="px-5 py-2.5 rounded-xl bg-teal-700 text-white text-sm font-semibold">
                Entrar
              </button>
            </div>
          </form>
        </div>
      )}

      {pollModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleCreatePollSubmit}
            className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4"
          >
            <h3 className="font-display text-lg font-bold">Nova Enquete de Encontro</h3>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Pergunta rápida</label>
              <input
                type="text"
                required
                value={pollQuestion}
                onChange={(e) => setPollQuestion(e.target.value)}
                placeholder="Ex: Qual horário fica melhor para o encontro?"
                className="w-full h-11 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Local em Boa Vista</label>
                <select
                  value={pollLocation}
                  onChange={(e) => setPollLocation(e.target.value)}
                  className="w-full h-11 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                >
                  {PONTOS_ENCONTRO_BV.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Data e hora</label>
                <input
                  type="text"
                  required
                  value={pollTime}
                  onChange={(e) => setPollTime(e.target.value)}
                  className="w-full h-11 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="block text-xs font-medium text-slate-500">Opções de voto</label>
              <input
                type="text"
                required
                value={pollOpt1}
                onChange={(e) => setPollOpt1(e.target.value)}
                className="w-full h-10 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
              />
              <input
                type="text"
                required
                value={pollOpt2}
                onChange={(e) => setPollOpt2(e.target.value)}
                className="w-full h-10 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
              />
              <input
                type="text"
                value={pollOpt3}
                onChange={(e) => setPollOpt3(e.target.value)}
                placeholder="Opção 3 (opcional)"
                className="w-full h-10 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setPollModalOpen(false)} className="px-4 py-2 text-sm">
                Cancelar
              </button>
              <button type="submit" className="px-5 py-2.5 rounded-xl bg-teal-700 text-white text-sm font-semibold">
                Publicar enquete
              </button>
            </div>
          </form>
        </div>
      )}

      {reportModalOpen && activeRoom?.otherUser && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleReportSubmit}
            className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4"
          >
            <h3 className="font-display text-lg font-bold">Denunciar {activeRoom.otherUser.name}</h3>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Motivo</label>
              <select
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value)}
                className="w-full h-11 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
              >
                <option>Comportamento inadequado</option>
                <option>Perfil falso ou foto suspeita</option>
                <option>Spam ou golpe</option>
                <option>Assédio</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Detalhes</label>
              <textarea
                rows={3}
                value={reportDetails}
                onChange={(e) => setReportDetails(e.target.value)}
                placeholder="Explique o ocorrido para a moderação..."
                className="w-full p-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
              />
            </div>
            {reportSuccess && (
              <p className="text-xs font-semibold text-teal-700 dark:text-teal-400">
                Denúncia enviada ao Painel Admin.
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setReportModalOpen(false)} className="px-4 py-2 text-sm">
                Cancelar
              </button>
              <button type="submit" className="px-5 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold">
                Enviar denúncia
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

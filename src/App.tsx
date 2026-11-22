import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Bell,
  Coins,
  Images,
  LifeBuoy,
  LogOut,
  MessageCircle,
  Shield,
  WifiOff,
  X,
} from 'lucide-react';
import { AuthScreen } from './components/AuthScreen';
import { ChatWorkspace, type DirectoryUser } from './components/ChatWorkspace';
import { SmartGalleryView } from './components/SmartGalleryView';
import { ChatCoinStoreView } from './components/ChatCoinStoreView';
import { ProfileSupportView } from './components/ProfileSupportView';
import { AdminPanelView } from './components/AdminPanelView';
import { apiFetch, setMemoryToken } from './services/api';
import type {
  AdminMetrics,
  AppNotification,
  ChatIntent,
  ChatMessage,
  ChatRoom,
  CoinTransaction,
  GalleryPhoto,
  MeetupPoll,
  PublicUser,
  SmartFolder,
  SupportTicket,
  UserReport,
} from './shared/catalog';
import { loadOfflineSnapshot, saveOfflineSnapshot } from './utils/offlineCache';

type AppTab = 'chat' | 'gallery' | 'store' | 'profile' | 'admin';

export default function App() {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<AppTab>('chat');

  // Theme & Offline states
  const [isDark, setIsDark] = useState(false);
  const [browserOffline, setBrowserOffline] = useState(!navigator.onLine);
  const [manualOffline, setManualOffline] = useState(false);
  const isOffline = browserOffline || manualOffline;

  // Domain Data
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [messagesByRoom, setMessagesByRoom] = useState<Record<string, ChatMessage[]>>({});
  const [pollsByRoom, setPollsByRoom] = useState<Record<string, MeetupPoll[]>>({});
  const [directoryUsers, setDirectoryUsers] = useState<DirectoryUser[]>([]);
  const [onlineUserIds, setOnlineUserIds] = useState<string[]>([]);
  const [galleryPhotos, setGalleryPhotos] = useState<GalleryPhoto[]>([]);
  const [transactions, setTransactions] = useState<CoinTransaction[]>([]);
  const [inventory, setInventory] = useState<Record<string, number>>({});
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);

  // Admin state
  const [adminData, setAdminData] = useState<{
    metrics: AdminMetrics;
    users: PublicUser[];
    reports: UserReport[];
    tickets: SupportTicket[];
  } | null>(null);

  // Notification & Account Drawer + Live Toast
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [toastNotif, setToastNotif] = useState<AppNotification | null>(null);

  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark]);

  useEffect(() => {
    const onOnline = () => setBrowserOffline(false);
    const onOffline = () => setBrowserOffline(true);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  const refreshCoreData = useCallback(async () => {
    if (!token || isOffline) return;
    try {
      const [meRes, roomsRes, usersRes, galleryRes, notifsRes, supportRes] = await Promise.all([
        apiFetch<{ user: PublicUser; wallet: { chatcoins: number; transactions: CoinTransaction[]; inventory: Record<string, number> } }>('/api/me'),
        apiFetch<{ rooms: ChatRoom[] }>('/api/rooms'),
        apiFetch<{ users: DirectoryUser[] }>('/api/users?allCity=true'),
        apiFetch<{ photos: GalleryPhoto[] }>('/api/gallery'),
        apiFetch<{ notifications: AppNotification[] }>('/api/notifications'),
        apiFetch<{ tickets: SupportTicket[] }>('/api/support'),
      ]);

      setUser(meRes.user);
      setTransactions(meRes.wallet.transactions);
      setInventory(meRes.wallet.inventory);
      setRooms(roomsRes.rooms);
      setDirectoryUsers(usersRes.users);
      setGalleryPhotos(galleryRes.photos);
      setNotifications(notifsRes.notifications);
      setTickets(supportRes.tickets);

      saveOfflineSnapshot(meRes.user.id, {
        rooms: roomsRes.rooms,
        gallery: galleryRes.photos,
      });

      if (roomsRes.rooms.length > 0) {
        setActiveRoomId((prev) => prev || roomsRes.rooms[0].id);
      }

      if (meRes.user.role === 'admin') {
        const adm = await apiFetch<{
          metrics: AdminMetrics;
          users: PublicUser[];
          reports: UserReport[];
          tickets: SupportTicket[];
        }>('/api/admin/overview');
        setAdminData(adm);
      }
    } catch {
      // Fallback to offline cache if network fails
      if (user) {
        const snap = loadOfflineSnapshot(user.id);
        if (snap) {
          setRooms(snap.rooms);
          setMessagesByRoom(snap.messagesByRoom);
          setPollsByRoom(snap.pollsByRoom);
          setGalleryPhotos(snap.gallery);
        }
      }
    }
  }, [token, isOffline, user?.id]);

  // Load messages & polls when activeRoomId changes
  useEffect(() => {
    if (!token || !activeRoomId) return;
    if (isOffline) {
      if (user) {
        const snap = loadOfflineSnapshot(user.id);
        if (snap) {
          setMessagesByRoom((prev) => ({ ...prev, ...snap.messagesByRoom }));
          setPollsByRoom((prev) => ({ ...prev, ...snap.pollsByRoom }));
        }
      }
      return;
    }

    apiFetch<{ messages: ChatMessage[]; polls: MeetupPoll[] }>(`/api/rooms/${activeRoomId}/messages`)
      .then((res) => {
        setMessagesByRoom((prev) => ({ ...prev, [activeRoomId]: res.messages }));
        setPollsByRoom((prev) => ({ ...prev, [activeRoomId]: res.polls }));
        if (user) {
          saveOfflineSnapshot(user.id, {
            messagesByRoom: { [activeRoomId]: res.messages },
            pollsByRoom: { [activeRoomId]: res.polls },
          });
        }
      })
      .catch(() => {});
  }, [token, activeRoomId, isOffline, user?.id]);

  // Initial load after auth
  useEffect(() => {
    if (token) {
      refreshCoreData();
    }
  }, [token]);

  // WebSocket real-time synchronization
  useEffect(() => {
    if (!token || !user || isOffline) {
      wsRef.current?.close();
      wsRef.current = null;
      return;
    }

    let reconnectTimer: number | undefined;
    let closedByUser = false;

    const connect = () => {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${proto}//${window.location.host}/ws?token=${encodeURIComponent(token)}`);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'presence:update') {
            const ids = data.onlineUserIds as string[];
            setOnlineUserIds(ids);
            const onlineSet = new Set(ids);
            setDirectoryUsers((prev) => prev.map((u) => ({ ...u, online: onlineSet.has(u.id) })));
          } else if (data.type === 'user:synced') {
            const synced = data.user as PublicUser;
            setDirectoryUsers((prev) => {
              const exists = prev.some((u) => u.id === synced.id);
              if (!exists) return [synced, ...prev];
              return prev.map((u) => (u.id === synced.id ? { ...u, ...synced } : u));
            });
            setUser((prev) => (prev && prev.id === synced.id ? { ...prev, ...synced } : prev));
          } else if (data.type === 'room:synced') {
            const room = data.room as ChatRoom;
            setRooms((prev) => (prev.some((r) => r.id === room.id) ? prev : [room, ...prev]));
          } else if (data.type === 'message:new') {
            const msg = data.message as ChatMessage;
            setMessagesByRoom((prev) => {
              const existing = prev[msg.roomId] || [];
              if (existing.some((m) => m.id === msg.id)) return prev;
              const updated = [...existing, msg];
              if (user) {
                saveOfflineSnapshot(user.id, { messagesByRoom: { [msg.roomId]: updated } });
              }
              return { ...prev, [msg.roomId]: updated };
            });
            setRooms((prev) =>
              prev.map((r) =>
                r.id === msg.roomId
                  ? {
                      ...r,
                      lastMessage: msg.isEncrypted ? 'Mensagem criptografada temporária' : msg.content,
                      lastMessageAt: msg.createdAt,
                    }
                  : r
              )
            );
          } else if (data.type === 'message:expired') {
            setMessagesByRoom((prev) => {
              const list = prev[data.roomId];
              if (!list) return prev;
              return { ...prev, [data.roomId]: list.filter((m) => m.id !== data.messageId) };
            });
          } else if (data.type === 'poll:updated') {
            const poll = data.poll as MeetupPoll;
            setPollsByRoom((prev) => {
              const list = prev[poll.roomId] || [];
              const exists = list.some((p) => p.id === poll.id);
              const next = exists ? list.map((p) => (p.id === poll.id ? poll : p)) : [poll, ...list];
              return { ...prev, [poll.roomId]: next };
            });
          } else if (data.type === 'gallery:new') {
            const photo = data.photo as GalleryPhoto;
            setGalleryPhotos((prev) => (prev.some((p) => p.id === photo.id) ? prev : [photo, ...prev]));
          } else if (data.type === 'notification:new') {
            const notif = data.notification as AppNotification;
            setNotifications((prev) => [notif, ...prev]);
            setToastNotif(notif);
            setTimeout(() => {
              setToastNotif((cur) => (cur?.id === notif.id ? null : cur));
            }, 4500);
          } else if (data.type === 'user:banned') {
            handleLogout();
          }
        } catch {
          // Ignore malformed WS frames
        }
      };

      ws.onclose = () => {
        if (!closedByUser && !isOffline) {
          reconnectTimer = window.setTimeout(connect, 2500);
        }
      };
    };

    connect();
    return () => {
      closedByUser = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      wsRef.current?.close();
    };
  }, [token, user?.id, isOffline]);

  const handleAuthenticated = (authedUser: PublicUser, sessionToken: string) => {
    setMemoryToken(sessionToken);
    setUser(authedUser);
    setToken(sessionToken);
  };

  const handleLogout = async () => {
    try {
      if (token && !isOffline) {
        await apiFetch('/api/auth/logout', { method: 'POST' });
      }
    } catch {
      // Ignore network errors on logout
    }
    wsRef.current?.close();
    setMemoryToken(null);
    setToken(null);
    setUser(null);
    setRooms([]);
    setActiveRoomId(null);
    setDrawerOpen(false);
  };

  if (!user || !token) {
    return <AuthScreen onAuthenticated={handleAuthenticated} />;
  }

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const navItems: { id: AppTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'chat', label: 'Conversas', icon: MessageCircle },
    { id: 'gallery', label: 'Galeria', icon: Images },
    { id: 'store', label: 'ChatCoins', icon: Coins },
    { id: 'profile', label: 'Suporte', icon: LifeBuoy },
    ...(user.role === 'admin' ? [{ id: 'admin' as const, label: 'Admin', icon: Shield }] : []),
  ];

  return (
    <div className="h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 overflow-hidden">
      {/* 3-Zone Top Bar Contract */}
      <header className="h-14 lg:h-16 shrink-0 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md z-30">
        <div className="h-full max-w-[1600px] mx-auto px-4 sm:px-6 flex items-center justify-between gap-8">
          {/* Zone 1: Single text element wordmark */}
          <button
            type="button"
            onClick={() => setActiveTab('chat')}
            className="font-display text-lg sm:text-xl font-bold tracking-tight whitespace-nowrap shrink-0 text-left cursor-pointer"
          >
            Conexão BV
          </button>

          {/* Zone 2: Desktop concise single-line nav links */}
          <nav className="hidden lg:flex items-center gap-7 text-sm font-medium">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setActiveTab(item.id);
                  if (item.id === 'admin') refreshCoreData();
                }}
                className={`whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors cursor-pointer ${
                  activeTab === item.id
                    ? 'border-teal-700 text-slate-900 dark:text-white font-semibold'
                    : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>

          {/* Zone 3: 1 primary action / account & alerts trigger */}
          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="min-h-[40px] pl-2.5 pr-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer"
            >
              <img
                src={user.avatarUrl}
                alt={user.name}
                referrerPolicy="no-referrer"
                className="w-7 h-7 rounded-lg object-cover shrink-0"
              />
              <span className="font-mono text-xs font-semibold text-amber-700 dark:text-amber-400 tabular-nums">
                {user.chatcoins}
              </span>
              <span className="relative inline-flex items-center">
                <Bell className="w-4 h-4 text-slate-600 dark:text-slate-300" />
                {unreadCount > 0 && (
                  <span className="ml-1 font-mono text-[11px] font-bold text-teal-700 dark:text-teal-400 tabular-nums">
                    {unreadCount}
                  </span>
                )}
              </span>
              {isOffline && <WifiOff className="w-3.5 h-3.5 text-amber-600 shrink-0" />}
            </button>
          </div>
        </div>
      </header>

      {/* Main Viewport */}
      <main className="flex-1 min-h-0 overflow-hidden pb-16 lg:pb-0">
        {activeTab === 'chat' && (
          <ChatWorkspace
            currentUser={user}
            rooms={rooms}
            activeRoomId={activeRoomId}
            onSelectRoom={setActiveRoomId}
            messages={activeRoomId ? messagesByRoom[activeRoomId] || [] : []}
            polls={activeRoomId ? pollsByRoom[activeRoomId] || [] : []}
            directoryUsers={directoryUsers}
            inventory={inventory}
            isOffline={isOffline}
            onSendMessage={async (payload) => {
              const res = await apiFetch<{
                message: ChatMessage;
                wallet: { chatcoins: number; transactions: CoinTransaction[]; inventory: Record<string, number> };
              }>(`/api/rooms/${payload.roomId}/messages`, {
                method: 'POST',
                body: JSON.stringify(payload),
              });
              setMessagesByRoom((prev) => {
                const list = prev[payload.roomId] || [];
                if (list.some((m) => m.id === res.message.id)) return prev;
                return { ...prev, [payload.roomId]: [...list, res.message] };
              });
              setUser((prev) => (prev ? { ...prev, chatcoins: res.wallet.chatcoins } : prev));
              setTransactions(res.wallet.transactions);
              setInventory(res.wallet.inventory);
            }}
            onStartPrivateChat={async (targetUserId) => {
              const res = await apiFetch<{ room: ChatRoom }>('/api/rooms', {
                method: 'POST',
                body: JSON.stringify({ mode: 'private_chat', targetUserId }),
              });
              setRooms((prev) => (prev.some((r) => r.id === res.room.id) ? prev : [res.room, ...prev]));
              setActiveRoomId(res.room.id);
            }}
            onCreateGroup={async (payload) => {
              const res = await apiFetch<{ room: ChatRoom }>('/api/rooms', {
                method: 'POST',
                body: JSON.stringify(payload),
              });
              setRooms((prev) => [res.room, ...prev]);
              setActiveRoomId(res.room.id);
            }}
            onJoinGroupByCode={async (inviteCode) => {
              const res = await apiFetch<{ room: ChatRoom }>('/api/rooms/join', {
                method: 'POST',
                body: JSON.stringify({ inviteCode }),
              });
              setRooms((prev) => (prev.some((r) => r.id === res.room.id) ? prev : [res.room, ...prev]));
              setActiveRoomId(res.room.id);
            }}
            onCreatePoll={async (payload) => {
              const res = await apiFetch<{ poll: MeetupPoll }>(`/api/rooms/${payload.roomId}/polls`, {
                method: 'POST',
                body: JSON.stringify(payload),
              });
              setPollsByRoom((prev) => {
                const list = prev[payload.roomId] || [];
                if (list.some((p) => p.id === res.poll.id)) return prev;
                return { ...prev, [payload.roomId]: [res.poll, ...list] };
              });
            }}
            onVotePoll={async (pollId, optionIndex) => {
              const res = await apiFetch<{ poll: MeetupPoll }>(`/api/polls/${pollId}/vote`, {
                method: 'POST',
                body: JSON.stringify({ optionIndex }),
              });
              setPollsByRoom((prev) => {
                const list = prev[res.poll.roomId] || [];
                return {
                  ...prev,
                  [res.poll.roomId]: list.map((p) => (p.id === res.poll.id ? res.poll : p)),
                };
              });
            }}
            onReportUser={async (payload) => {
              await apiFetch('/api/reports', {
                method: 'POST',
                body: JSON.stringify(payload),
              });
            }}
          />
        )}

        {activeTab === 'gallery' && (
          <SmartGalleryView
            photos={galleryPhotos}
            isOffline={isOffline}
            onUploadPhoto={async (payload) => {
              const res = await apiFetch<{ photo: GalleryPhoto }>('/api/gallery', {
                method: 'POST',
                body: JSON.stringify(payload),
              });
              setGalleryPhotos((prev) => (prev.some((p) => p.id === res.photo.id) ? prev : [res.photo, ...prev]));
            }}
          />
        )}

        {activeTab === 'store' && (
          <ChatCoinStoreView
            chatcoins={user.chatcoins}
            inventory={inventory}
            transactions={transactions}
            isOffline={isOffline}
            onBuyPackage={async (packageId) => {
              const wallet = await apiFetch<{
                chatcoins: number;
                transactions: CoinTransaction[];
                inventory: Record<string, number>;
              }>('/api/store/buy-package', {
                method: 'POST',
                body: JSON.stringify({ packageId }),
              });
              setUser((prev) => (prev ? { ...prev, chatcoins: wallet.chatcoins } : prev));
              setTransactions(wallet.transactions);
              setInventory(wallet.inventory);
            }}
            onBuyItem={async (itemId) => {
              const wallet = await apiFetch<{
                chatcoins: number;
                transactions: CoinTransaction[];
                inventory: Record<string, number>;
              }>('/api/store/buy-item', {
                method: 'POST',
                body: JSON.stringify({ itemId }),
              });
              setUser((prev) => (prev ? { ...prev, chatcoins: wallet.chatcoins } : prev));
              setTransactions(wallet.transactions);
              setInventory(wallet.inventory);
            }}
          />
        )}

        {activeTab === 'profile' && (
          <ProfileSupportView
            user={user}
            tickets={tickets}
            isDark={isDark}
            onToggleDark={() => setIsDark((d) => !d)}
            manualOffline={manualOffline}
            onToggleOffline={() => setManualOffline((o) => !o)}
            isOffline={isOffline}
            onUserUpdated={(updated) => {
              setUser(updated);
              if (updated.role === 'admin') {
                refreshCoreData();
              }
            }}
            onTicketCreated={refreshCoreData}
          />
        )}

        {activeTab === 'admin' && user.role === 'admin' && adminData && (
          <AdminPanelView
            metrics={adminData.metrics}
            users={adminData.users}
            reports={adminData.reports}
            tickets={adminData.tickets}
            onlineCount={onlineUserIds.length}
            onBanUser={async (userId, reason) => {
              const adm = await apiFetch<typeof adminData>(`/api/admin/users/${userId}/ban`, {
                method: 'POST',
                body: JSON.stringify({ reason }),
              });
              setAdminData(adm);
            }}
            onUnbanUser={async (userId) => {
              const adm = await apiFetch<typeof adminData>(`/api/admin/users/${userId}/unban`, {
                method: 'POST',
              });
              setAdminData(adm);
            }}
            onVerifyDecision={async (userId, decision) => {
              const adm = await apiFetch<typeof adminData>(`/api/admin/verifications/${userId}`, {
                method: 'POST',
                body: JSON.stringify({ decision }),
              });
              setAdminData(adm);
            }}
            onReportDecision={async (reportId, status) => {
              const adm = await apiFetch<typeof adminData>(`/api/admin/reports/${reportId}`, {
                method: 'POST',
                body: JSON.stringify({ status }),
              });
              setAdminData(adm);
            }}
            onReplyTicket={async (ticketId, reply) => {
              const adm = await apiFetch<typeof adminData>(`/api/admin/support/${ticketId}/reply`, {
                method: 'POST',
                body: JSON.stringify({ reply }),
              });
              setAdminData(adm);
            }}
          />
        )}
      </main>

      {/* Mobile Bottom Tab Bar (Thumb-Ergonomic Navigation) */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 h-16 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800">
        <div
          className="h-full grid items-center"
          style={{ gridTemplateColumns: `repeat(${navItems.length}, minmax(0, 1fr))` }}
        >
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setActiveTab(item.id);
                  if (item.id === 'admin') refreshCoreData();
                }}
                className={`h-full min-h-[44px] flex flex-col items-center justify-center gap-0.5 transition-colors ${
                  active ? 'text-teal-700 dark:text-teal-400 font-semibold' : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[10px] tracking-tight truncate max-w-[70px]">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Real-time Toast Notification */}
      {toastNotif && (
        <div className="fixed bottom-20 lg:bottom-6 right-4 z-50 max-w-sm rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-lg p-4 flex items-start gap-3">
          <Bell className="w-5 h-5 text-teal-700 dark:text-teal-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold truncate">{toastNotif.title}</div>
            <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2 mt-0.5">{toastNotif.body}</p>
          </div>
          <button
            type="button"
            onClick={() => setToastNotif(null)}
            className="text-slate-400 hover:text-slate-700 p-1"
            aria-label="Fechar notificação"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Notifications & Account Drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-sm flex justify-end" onClick={() => setDrawerOpen(false)}>
          <div
            className="w-full max-w-md bg-white dark:bg-slate-900 h-full border-l border-slate-200 dark:border-slate-800 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <img
                  src={user.avatarUrl}
                  alt={user.name}
                  referrerPolicy="no-referrer"
                  className="w-10 h-10 rounded-xl object-cover shrink-0"
                />
                <div className="min-w-0">
                  <div className="font-semibold text-sm truncate">{user.name}</div>
                  <div className="text-xs text-slate-500 truncate">
                    {user.neighborhood}, Boa Vista · {user.chatcoins} ChatCoins
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">
                Notificações em tempo real ({unreadCount} não lidas)
              </span>
              {unreadCount > 0 && !isOffline && (
                <button
                  type="button"
                  onClick={async () => {
                    await apiFetch('/api/notifications/read-all', { method: 'POST' });
                    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
                  }}
                  className="text-xs font-semibold text-teal-700 dark:text-teal-400"
                >
                  Marcar todas como lidas
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
              {notifications.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-500">Nenhuma notificação ainda.</div>
              ) : (
                notifications.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => {
                      if (n.roomId) {
                        setActiveRoomId(n.roomId);
                        setActiveTab('chat');
                      }
                      setDrawerOpen(false);
                    }}
                    className={`w-full text-left px-5 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 space-y-1 ${
                      n.isRead ? 'opacity-70' : 'bg-teal-50/40 dark:bg-teal-950/20'
                    }`}
                  >
                    <div className="text-sm font-semibold">{n.title}</div>
                    <p className="text-xs text-slate-600 dark:text-slate-400">{n.body}</p>
                    <div className="text-[11px] font-mono text-slate-400 tabular-nums">
                      {new Date(n.createdAt).toLocaleString('pt-BR')}
                    </div>
                  </button>
                ))
              )}
            </div>

            <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('profile');
                  setDrawerOpen(false);
                }}
                className="flex-1 min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 text-sm font-semibold"
              >
                Configurar perfil e suporte
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="min-h-[44px] px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold inline-flex items-center gap-1.5"
              >
                <LogOut className="w-4 h-4" />
                <span>Sair</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

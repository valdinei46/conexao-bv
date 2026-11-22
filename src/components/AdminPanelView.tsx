import React, { useState } from 'react';
import {
  Ban,
  CheckCircle2,
  LifeBuoy,
  ShieldAlert,
  ShieldCheck,
  Users,
  XCircle,
} from 'lucide-react';
import type { AdminMetrics, PublicUser, SupportTicket, UserReport } from '../shared/catalog';

interface AdminPanelViewProps {
  metrics: AdminMetrics;
  users: PublicUser[];
  reports: UserReport[];
  tickets: SupportTicket[];
  onlineCount: number;
  onBanUser: (userId: string, reason: string) => Promise<void>;
  onUnbanUser: (userId: string) => Promise<void>;
  onVerifyDecision: (userId: string, decision: 'verified' | 'rejected') => Promise<void>;
  onReportDecision: (reportId: string, status: 'resolved' | 'dismissed') => Promise<void>;
  onReplyTicket: (ticketId: string, reply: string) => Promise<void>;
}

export const AdminPanelView: React.FC<AdminPanelViewProps> = ({
  metrics,
  users,
  reports,
  tickets,
  onlineCount,
  onBanUser,
  onUnbanUser,
  onVerifyDecision,
  onReportDecision,
  onReplyTicket,
}) => {
  const [tab, setTab] = useState<'reports' | 'verifications' | 'users' | 'support'>('reports');
  const [replyMap, setReplyMap] = useState<Record<string, string>>({});
  const [banReasonMap, setBanReasonMap] = useState<Record<string, string>>({});

  const pendingVerifications = users.filter((u) => u.verificationStatus === 'pending');

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="border-b border-slate-200 dark:border-slate-800 pb-5">
        <h1 className="font-display text-2xl font-bold tracking-tight">
          Painel Administrativo Conexão BV
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          Métricas da plataforma em Boa Vista, moderação de denúncias, verificação por foto real e chamados de suporte.
        </p>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="text-xs text-slate-500">Usuários cadastrados</div>
          <div className="font-mono text-2xl font-bold mt-1 tabular-nums">{metrics.totalUsers}</div>
          <div className="text-xs text-teal-700 dark:text-teal-400 mt-1 tabular-nums">
            {onlineCount} online agora · {metrics.verifiedUsers} verificados
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="text-xs text-slate-500">Mensagens e enquetes</div>
          <div className="font-mono text-2xl font-bold mt-1 tabular-nums">{metrics.totalMessages}</div>
          <div className="text-xs text-slate-500 mt-1 tabular-nums">
            {metrics.totalRooms} salas · {metrics.totalPolls} enquetes
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="text-xs text-slate-500">ChatCoins em circulação</div>
          <div className="font-mono text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1 tabular-nums">
            {metrics.totalCoinsCirculating}
          </div>
          <div className="text-xs text-slate-500 mt-1 tabular-nums">
            {metrics.totalPhotos} fotos na galeria
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="text-xs text-slate-500">Fila de moderação</div>
          <div className="font-mono text-2xl font-bold text-red-600 dark:text-red-400 mt-1 tabular-nums">
            {metrics.openReports}
          </div>
          <div className="text-xs text-slate-500 mt-1 tabular-nums">
            {metrics.pendingVerifications} verificações · {metrics.openTickets} chamados
          </div>
        </div>
      </div>

      {/* Sub-Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {[
          { id: 'reports', label: `Denúncias (${metrics.openReports})`, icon: ShieldAlert },
          { id: 'verifications', label: `Verificações (${pendingVerifications.length})`, icon: ShieldCheck },
          { id: 'users', label: `Usuários (${users.length})`, icon: Users },
          { id: 'support', label: `Suporte (${metrics.openTickets})`, icon: LifeBuoy },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id as typeof tab)}
              className={`min-h-[42px] px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap shrink-0 flex items-center gap-2 transition-colors ${
                tab === item.id
                  ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                  : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      {tab === 'reports' && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800">
          {reports.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">Nenhuma denúncia registrada.</div>
          ) : (
            reports.map((rep) => (
              <div key={rep.id} className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="text-sm font-semibold">
                    {rep.reportedUserName}{' '}
                    <span className="font-normal text-slate-500">({rep.reportedUserEmail})</span>
                  </div>
                  <div className="text-xs text-slate-500">
                    Motivo: <span className="font-medium text-slate-800 dark:text-slate-200">{rep.reason}</span> ·
                    Denunciado por {rep.reporterName} · Status: {rep.status}
                  </div>
                  {rep.details && <p className="text-xs text-slate-600 dark:text-slate-400">{rep.details}</p>}
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {rep.status === 'open' && (
                    <>
                      <button
                        type="button"
                        onClick={async () => {
                          await onBanUser(rep.reportedUserId, rep.reason);
                          await onReportDecision(rep.id, 'resolved');
                        }}
                        className="px-3.5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold"
                      >
                        Banir usuário
                      </button>
                      <button
                        type="button"
                        onClick={() => onReportDecision(rep.id, 'dismissed')}
                        className="px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold"
                      >
                        Arquivar
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'verifications' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {pendingVerifications.length === 0 ? (
            <div className="md:col-span-2 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center text-sm text-slate-500">
              Nenhuma foto aguardando verificação no momento.
            </div>
          ) : (
            pendingVerifications.map((u) => (
              <div
                key={u.id}
                className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4"
              >
                <div className="flex items-center gap-3">
                  <img
                    src={u.avatarUrl}
                    alt={u.name}
                    referrerPolicy="no-referrer"
                    className="w-11 h-11 rounded-xl object-cover"
                  />
                  <div>
                    <div className="font-semibold text-sm">{u.name}</div>
                    <div className="text-xs text-slate-500">
                      {u.email} · {u.neighborhood}
                    </div>
                  </div>
                </div>
                {u.verificationPhoto && (
                  <img
                    src={u.verificationPhoto}
                    alt={`Foto real de ${u.name}`}
                    className="w-full h-56 object-cover rounded-xl bg-slate-100 dark:bg-slate-800"
                  />
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => onVerifyDecision(u.id, 'verified')}
                    className="flex-1 min-h-[42px] rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Aprovar selo</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onVerifyDecision(u.id, 'rejected')}
                    className="flex-1 min-h-[42px] rounded-xl border border-red-300 dark:border-red-800 text-red-600 text-xs font-semibold inline-flex items-center justify-center gap-1.5"
                  >
                    <XCircle className="w-4 h-4" />
                    <span>Recusar</span>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'users' && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500">
              <tr>
                <th className="py-3 px-4">Usuário</th>
                <th className="py-3 px-4">Bairro</th>
                <th className="py-3 px-4 text-right">ChatCoins</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2.5">
                      <img
                        src={u.avatarUrl}
                        alt={u.name}
                        referrerPolicy="no-referrer"
                        className="w-8 h-8 rounded-full object-cover shrink-0"
                      />
                      <div>
                        <div className="font-medium">{u.name}</div>
                        <div className="text-xs text-slate-500">{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-400">
                    {u.neighborhood} · {u.radiusKm} km
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums">{u.chatcoins}</td>
                  <td className="py-3 px-4 text-xs">
                    {u.isBanned ? (
                      <span className="text-red-600 font-semibold">Banido</span>
                    ) : u.online ? (
                      <span className="text-teal-700 dark:text-teal-400 font-semibold">Online</span>
                    ) : (
                      <span className="text-slate-500">Offline</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right">
                    {u.role === 'admin' ? (
                      <span className="text-xs text-slate-400">Admin</span>
                    ) : u.isBanned ? (
                      <button
                        type="button"
                        onClick={() => onUnbanUser(u.id)}
                        className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold"
                      >
                        Reativar
                      </button>
                    ) : (
                      <div className="inline-flex items-center gap-1.5">
                        <input
                          type="text"
                          placeholder="Motivo..."
                          value={banReasonMap[u.id] || ''}
                          onChange={(e) => setBanReasonMap((prev) => ({ ...prev, [u.id]: e.target.value }))}
                          className="w-28 h-8 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-xs"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            onBanUser(u.id, banReasonMap[u.id] || 'Violação das diretrizes da comunidade.')
                          }
                          className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold inline-flex items-center gap-1"
                        >
                          <Ban className="w-3.5 h-3.5" />
                          <span>Banir</span>
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'support' && (
        <div className="space-y-4">
          {tickets.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center text-sm text-slate-500">
              Nenhum chamado de suporte aberto.
            </div>
          ) : (
            tickets.map((t) => (
              <div
                key={t.id}
                className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="font-semibold text-sm">{t.subject}</div>
                    <div className="text-xs text-slate-500">
                      {t.userName} ({t.userEmail}) · {t.category}
                    </div>
                  </div>
                  <span className="text-xs font-semibold text-teal-700 dark:text-teal-400">
                    {t.status === 'answered' ? 'Respondido' : 'Aberto'}
                  </span>
                </div>
                <p className="text-sm text-slate-700 dark:text-slate-300">{t.message}</p>
                {t.adminReply ? (
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 text-xs">
                    <span className="font-semibold">Sua resposta:</span> {t.adminReply}
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={replyMap[t.id] || ''}
                      onChange={(e) => setReplyMap((prev) => ({ ...prev, [t.id]: e.target.value }))}
                      placeholder="Escreva a resposta do suporte..."
                      className="flex-1 h-10 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => onReplyTicket(t.id, replyMap[t.id] || '')}
                      className="px-4 h-10 rounded-xl bg-teal-700 text-white text-xs font-semibold"
                    >
                      Responder
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

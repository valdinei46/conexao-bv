import React, { useState } from 'react';
import { Coins, Flower2, ShoppingBag, ReceiptText } from 'lucide-react';
import {
  COIN_PACKAGES,
  PRIVATE_MESSAGE_COST,
  VIRTUAL_GIFTS,
  type CoinTransaction,
} from '../shared/catalog';

interface ChatCoinStoreViewProps {
  chatcoins: number;
  inventory: Record<string, number>;
  transactions: CoinTransaction[];
  isOffline: boolean;
  onBuyPackage: (packageId: string) => Promise<void>;
  onBuyItem: (itemId: string) => Promise<void>;
}

export const ChatCoinStoreView: React.FC<ChatCoinStoreViewProps> = ({
  chatcoins,
  inventory,
  transactions,
  isOffline,
  onBuyPackage,
  onBuyItem,
}) => {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const handleBuyPackage = async (pkgId: string, name: string) => {
    setBusyId(pkgId);
    setFeedback(null);
    try {
      await onBuyPackage(pkgId);
      setFeedback({ type: 'ok', text: `${name} adicionado à sua carteira!` });
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Erro na compra.' });
    } finally {
      setBusyId(null);
    }
  };

  const handleBuyItem = async (itemId: string, name: string) => {
    setBusyId(itemId);
    setFeedback(null);
    try {
      await onBuyItem(itemId);
      setFeedback({
        type: 'ok',
        text: `${name} adicionado ao seu inventário. Envie em qualquer conversa!`,
      });
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Saldo insuficiente.' });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">
            Loja ChatCoins e Presentes Virtuais
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Chats privados consomem {PRIVATE_MESSAGE_COST} ChatCoins por mensagem. Flores e emojis podem ser enviados nos chats.
          </p>
        </div>

        <div className="rounded-2xl border border-amber-300/70 dark:border-amber-800/70 bg-amber-50/70 dark:bg-amber-950/30 px-5 py-3.5 flex items-center gap-3 shrink-0">
          <Coins className="w-6 h-6 text-amber-600 dark:text-amber-400 shrink-0" />
          <div>
            <div className="text-xs text-slate-600 dark:text-slate-400">Seu saldo atual</div>
            <div className="font-mono text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
              {chatcoins} ChatCoins
            </div>
          </div>
        </div>
      </div>

      {feedback && (
        <div
          className={`p-4 rounded-xl border text-sm font-medium ${
            feedback.type === 'ok'
              ? 'border-teal-200 dark:border-teal-800 bg-teal-50 dark:bg-teal-950/40 text-teal-900 dark:text-teal-200'
              : 'border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300'
          }`}
        >
          {feedback.text}
        </div>
      )}

      {/* Coin Packages */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <ShoppingBag className="w-5 h-5 text-teal-700 dark:text-teal-400" />
          <h2 className="font-display text-lg font-semibold">Pacotes de Pontos ChatCoin</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {COIN_PACKAGES.map((pkg) => (
            <div
              key={pkg.id}
              className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex flex-col justify-between gap-4"
            >
              <div>
                <div className="text-xs font-medium text-teal-700 dark:text-teal-400">
                  {pkg.bonusLabel}
                </div>
                <h3 className="font-display text-lg font-bold mt-1">{pkg.name}</h3>
                <div className="font-mono text-3xl font-bold text-amber-600 dark:text-amber-400 mt-3 tabular-nums">
                  +{pkg.coins}
                </div>
                <div className="text-xs text-slate-500 mt-0.5">ChatCoins instantâneos</div>
              </div>

              <button
                type="button"
                disabled={isOffline || busyId === pkg.id}
                onClick={() => handleBuyPackage(pkg.id, pkg.name)}
                className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white text-sm font-semibold transition-colors cursor-pointer"
              >
                {busyId === pkg.id ? 'Creditando...' : `Adquirir · ${pkg.priceLabel}`}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Virtual Flowers & Emojis */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Flower2 className="w-5 h-5 text-teal-700 dark:text-teal-400" />
          <h2 className="font-display text-lg font-semibold">Flores Virtuais e Emojis Especiais</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {VIRTUAL_GIFTS.map((item) => {
            const owned = inventory[item.id] || 0;
            return (
              <div
                key={item.id}
                className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex flex-col justify-between gap-4"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-3xl leading-none" role="img" aria-label={item.name}>
                      {item.icon}
                    </span>
                    <span className="font-mono text-xs font-semibold text-amber-700 dark:text-amber-400 tabular-nums">
                      {item.cost} moedas
                    </span>
                  </div>
                  <h3 className="font-semibold text-base mt-3">{item.name}</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                    {item.description}
                  </p>
                  {owned > 0 && (
                    <div className="mt-2 text-xs font-medium text-teal-700 dark:text-teal-400 tabular-nums">
                      No inventário: {owned} un.
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  disabled={isOffline || busyId === item.id || chatcoins < item.cost}
                  onClick={() => handleBuyItem(item.id, item.name)}
                  className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-900 hover:text-white dark:hover:bg-white dark:hover:text-slate-900 disabled:opacity-45 text-xs font-semibold transition-colors cursor-pointer"
                >
                  {busyId === item.id ? 'Comprando...' : 'Comprar para presentear'}
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* Transaction Ledger */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <ReceiptText className="w-5 h-5 text-slate-500" />
          <h2 className="font-display text-lg font-semibold">Extrato Recente</h2>
        </div>
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          {transactions.length === 0 ? (
            <div className="p-6 text-sm text-slate-500">Nenhuma movimentação registrada ainda.</div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {transactions.map((tx) => (
                <div key={tx.id} className="px-5 py-3 flex items-center justify-between gap-4 text-sm">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{tx.reason}</div>
                    <div className="text-xs text-slate-500 font-mono tabular-nums">
                      {new Date(tx.createdAt).toLocaleString('pt-BR')}
                    </div>
                  </div>
                  <div
                    className={`font-mono font-semibold tabular-nums shrink-0 ${
                      tx.amount >= 0 ? 'text-teal-700 dark:text-teal-400' : 'text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {tx.amount >= 0 ? `+${tx.amount}` : tx.amount}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

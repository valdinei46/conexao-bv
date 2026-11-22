import React, { useEffect, useState } from 'react';
import { ImagePlus, X, SlidersHorizontal, FolderHeart } from 'lucide-react';
import { PHOTO_FILTERS, SMART_FOLDERS, type SmartFolder } from '../shared/catalog';
import { readFileAsDataUrl, renderFilteredPhoto } from '../utils/imageFilter';

interface PhotoFilterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (payload: {
    imageData: string;
    filterName: string;
    smartFolder: SmartFolder;
    caption: string;
  }) => Promise<void>;
  submitLabel?: string;
}

export const PhotoFilterModal: React.FC<PhotoFilterModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  submitLabel = 'Enviar foto com filtro',
}) => {
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [selectedFilterId, setSelectedFilterId] = useState<string>('ouro-lavrado');
  const [smartFolder, setSmartFolder] = useState<SmartFolder>('Encontros & Rolês');
  const [caption, setCaption] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setSourceUrl(null);
      setCaption('');
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const activeFilter = PHOTO_FILTERS.find((f) => f.id === selectedFilterId) ?? PHOTO_FILTERS[0];

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setSourceUrl(dataUrl);
      setError(null);
    } catch {
      setError('Não foi possível abrir a imagem selecionada.');
    }
  };

  const handleSubmit = async () => {
    if (!sourceUrl) {
      setError('Selecione uma foto primeiro.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const processed = await renderFilteredPhoto(sourceUrl, selectedFilterId, 960);
      await onConfirm({
        imageData: processed,
        filterName: activeFilter.label,
        smartFolder,
        caption,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao processar foto.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2 font-display font-semibold text-lg">
            <SlidersHorizontal className="w-5 h-5 text-teal-700 dark:text-teal-400" />
            <span>Estúdio de Filtros Conexão BV</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-5">
          {error && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-sm text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          {!sourceUrl ? (
            <label className="flex flex-col items-center justify-center h-64 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/50 cursor-pointer hover:border-teal-600 transition-colors p-6 text-center">
              <ImagePlus className="w-10 h-10 text-teal-700 dark:text-teal-400 mb-3" />
              <span className="text-sm font-semibold">Escolher foto do dispositivo</span>
              <span className="text-xs text-slate-500 mt-1">
                Aplique filtros personalizados e organize nas pastas inteligentes
              </span>
              <input type="file" accept="image/*" onChange={handleFileChange} className="sr-only" />
            </label>
          ) : (
            <div className="space-y-4">
              <div className="relative rounded-2xl overflow-hidden bg-slate-950 aspect-[4/3] max-h-72 mx-auto flex items-center justify-center">
                <img
                  src={sourceUrl}
                  alt="Prévia com filtro"
                  style={{ filter: activeFilter.cssFilter }}
                  className="w-full h-full object-contain transition-[filter] duration-200"
                />
              </div>

              <div>
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">
                  Filtros personalizados ({activeFilter.description})
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {PHOTO_FILTERS.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setSelectedFilterId(f.id)}
                      className={`px-3 py-2.5 rounded-xl text-xs font-semibold border text-left transition-colors ${
                        selectedFilterId === f.id
                          ? 'border-teal-700 bg-teal-50 dark:bg-teal-950/50 text-teal-900 dark:text-teal-200'
                          : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                    <FolderHeart className="w-3.5 h-3.5" />
                    <span>Pasta inteligente</span>
                  </label>
                  <select
                    value={smartFolder}
                    onChange={(e) => setSmartFolder(e.target.value as SmartFolder)}
                    className="w-full h-11 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                  >
                    {SMART_FOLDERS.map((folder) => (
                      <option key={folder} value={folder}>
                        {folder}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                    Legenda
                  </label>
                  <input
                    type="text"
                    maxLength={140}
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    placeholder="Ex: Fim de tarde na Orla..."
                    className="w-full h-11 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
          {sourceUrl ? (
            <label className="px-3 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900 cursor-pointer">
              Trocar foto
              <input type="file" accept="image/*" onChange={handleFileChange} className="sr-only" />
            </label>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={!sourceUrl || submitting}
              onClick={handleSubmit}
              className="px-5 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white text-sm font-semibold"
            >
              {submitting ? 'Processando...' : submitLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

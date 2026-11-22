import React, { useState } from 'react';
import { FolderOpen, ImagePlus, MapPin, X } from 'lucide-react';
import { SMART_FOLDERS, type GalleryPhoto, type SmartFolder } from '../shared/catalog';
import { PhotoFilterModal } from './PhotoFilterModal';

interface SmartGalleryViewProps {
  photos: GalleryPhoto[];
  isOffline: boolean;
  onUploadPhoto: (payload: {
    imageData: string;
    filterName: string;
    smartFolder: SmartFolder;
    caption: string;
  }) => Promise<void>;
}

export const SmartGalleryView: React.FC<SmartGalleryViewProps> = ({
  photos,
  isOffline,
  onUploadPhoto,
}) => {
  const [activeFolder, setActiveFolder] = useState<string>('Todas');
  const [modalOpen, setModalOpen] = useState(false);
  const [lightboxPhoto, setLightboxPhoto] = useState<GalleryPhoto | null>(null);

  const folders = ['Todas', ...SMART_FOLDERS];
  const filtered = activeFolder === 'Todas' ? photos : photos.filter((p) => p.smartFolder === activeFolder);

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">
            Galeria com Pastas Inteligentes
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Fotos organizadas automaticamente por contexto, bairro de Boa Vista e filtro aplicado.
          </p>
        </div>

        <button
          type="button"
          disabled={isOffline}
          onClick={() => setModalOpen(true)}
          className="min-h-[44px] px-5 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0"
        >
          <ImagePlus className="w-4 h-4" />
          <span>Publicar foto com filtro</span>
        </button>
      </div>

      {/* Interactive Folder Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {folders.map((folder) => {
          const count = folder === 'Todas' ? photos.length : photos.filter((p) => p.smartFolder === folder).length;
          return (
            <button
              key={folder}
              type="button"
              onClick={() => setActiveFolder(folder)}
              className={`min-h-[40px] px-4 py-2 rounded-xl text-sm font-medium transition-colors whitespace-nowrap shrink-0 flex items-center gap-2 ${
                activeFolder === folder
                  ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                  : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <FolderOpen className="w-4 h-4 shrink-0" />
              <span>{folder}</span>
              <span className="font-mono text-xs opacity-75 tabular-nums">{count}</span>
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-10 text-center space-y-3">
          <p className="text-base font-semibold">Nenhuma foto nesta pasta ainda</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Compartilhe fotos nos chats ou publique diretamente usando o estúdio de filtros.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((photo) => (
            <article
              key={photo.id}
              onClick={() => setLightboxPhoto(photo)}
              className="group cursor-pointer rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-teal-600/50 transition-colors"
            >
              <div className="aspect-[4/3] w-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <img
                  src={photo.imageData}
                  alt={photo.caption || 'Foto da galeria Conexão BV'}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-200"
                />
              </div>
              <div className="p-4 space-y-2">
                <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 flex-wrap">
                  <span className="font-medium text-teal-700 dark:text-teal-400">{photo.smartFolder}</span>
                  <span aria-hidden="true">·</span>
                  <span>Filtro {photo.filterName}</span>
                </div>
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100 line-clamp-2">
                  {photo.caption || 'Momento compartilhado'}
                </p>
                <div className="pt-1 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <div className="flex items-center gap-2 min-w-0">
                    <img
                      src={photo.ownerAvatar}
                      alt={photo.ownerName}
                      referrerPolicy="no-referrer"
                      className="w-6 h-6 rounded-full object-cover shrink-0"
                    />
                    <span className="truncate font-medium text-slate-700 dark:text-slate-300">
                      {photo.ownerName}
                    </span>
                  </div>
                  <span className="inline-flex items-center gap-1 shrink-0">
                    <MapPin className="w-3.5 h-3.5" />
                    {photo.neighborhood}
                  </span>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <PhotoFilterModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onConfirm={onUploadPhoto}
        submitLabel="Salvar na Galeria"
      />

      {lightboxPhoto && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setLightboxPhoto(null)}
        >
          <div
            className="max-w-3xl w-full rounded-2xl overflow-hidden bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="text-sm font-semibold">
                {lightboxPhoto.ownerName} · {lightboxPhoto.neighborhood}, Boa Vista
              </div>
              <button
                type="button"
                onClick={() => setLightboxPhoto(null)}
                className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="bg-slate-950 max-h-[70vh] flex items-center justify-center">
              <img
                src={lightboxPhoto.imageData}
                alt={lightboxPhoto.caption}
                referrerPolicy="no-referrer"
                className="max-h-[70vh] w-auto object-contain"
              />
            </div>
            <div className="p-4 flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>{lightboxPhoto.caption}</span>
              <span className="text-xs text-slate-500">
                {lightboxPhoto.smartFolder} · Filtro {lightboxPhoto.filterName}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

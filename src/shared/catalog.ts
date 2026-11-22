export type ChatIntent = 'amizade' | 'namoro' | 'ambos';
export type VerificationStatus = 'unverified' | 'pending' | 'verified' | 'rejected';
export type RoomType = 'private_chat' | 'private_group' | 'city_group';
export type SmartFolder = 'Encontros & Rolês' | 'Paisagens de Boa Vista' | 'Retratos' | 'Momentos Privados';

export interface PhotoFilterOption {
  id: string;
  label: string;
  cssFilter: string;
  description: string;
}

export const PHOTO_FILTERS: PhotoFilterOption[] = [
  { id: 'none', label: 'Original', cssFilter: 'none', description: 'Sem alteração de cor' },
  { id: 'ouro-lavrado', label: 'Ouro Lavrado', cssFilter: 'sepia(0.28) saturate(1.35) contrast(1.06) brightness(1.04)', description: 'Luz dourada de fim de tarde' },
  { id: 'brisa-rio-branco', label: 'Brisa Rio Branco', cssFilter: 'saturate(1.15) hue-rotate(-8deg) contrast(1.08)', description: 'Tons frescos e cristalinos' },
  { id: 'pb-editorial', label: 'P&B Editorial', cssFilter: 'grayscale(1) contrast(1.22) brightness(1.02)', description: 'Preto e branco documentário' },
  { id: 'por-do-sol-orla', label: 'Pôr do Sol Orla', cssFilter: 'sepia(0.18) saturate(1.55) contrast(1.08)', description: 'Contraste quente tropical' },
  { id: 'cinema-bv', label: 'Cinema Tropical', cssFilter: 'contrast(1.16) saturate(0.92) brightness(0.97)', description: 'Textura fílmica suave' },
];

export const SMART_FOLDERS: SmartFolder[] = [
  'Encontros & Rolês',
  'Paisagens de Boa Vista',
  'Retratos',
  'Momentos Privados',
];

export interface CoinPackage {
  id: string;
  name: string;
  coins: number;
  priceLabel: string;
  bonusLabel: string;
}

export const COIN_PACKAGES: CoinPackage[] = [
  {
    id: 'pkg_lavrado',
    name: 'Pacote Lavrado',
    coins: 250,
    priceLabel: 'R$ 9,90',
    bonusLabel: '50 mensagens privadas',
  },
  {
    id: 'pkg_orla',
    name: 'Pacote Orla Taumanan',
    coins: 750,
    priceLabel: 'R$ 24,90',
    bonusLabel: 'Mais popular em Boa Vista',
  },
  {
    id: 'pkg_roraima',
    name: 'Pacote Monte Roraima',
    coins: 2000,
    priceLabel: 'R$ 54,90',
    bonusLabel: 'Inclui +200 moedas extras',
  },
];

export interface VirtualGiftItem {
  id: string;
  name: string;
  category: 'flor' | 'emoji';
  icon: string;
  cost: number;
  description: string;
}

export const VIRTUAL_GIFTS: VirtualGiftItem[] = [
  {
    id: 'flower_rose',
    name: 'Rosa Vermelha',
    category: 'flor',
    icon: '🌹',
    cost: 30,
    description: 'Clássica para demonstrar carinho no namoro.',
  },
  {
    id: 'flower_buriti',
    name: 'Flor de Buriti',
    category: 'flor',
    icon: '🌺',
    cost: 45,
    description: 'Símbolo caloroso do cerrado roraimense.',
  },
  {
    id: 'flower_orchid',
    name: 'Orquídea Amazônica',
    category: 'flor',
    icon: '🪷',
    cost: 60,
    description: 'Presente raro para conexões especiais.',
  },
  {
    id: 'flower_bouquet',
    name: 'Buquê do Lavrado',
    category: 'flor',
    icon: '💐',
    cost: 120,
    description: 'Arranjo completo para grandes momentos.',
  },
  {
    id: 'emoji_coffee',
    name: 'Café na Orla',
    category: 'emoji',
    icon: '☕',
    cost: 15,
    description: 'Convite leve para conversar sem pressa.',
  },
  {
    id: 'emoji_heart',
    name: 'Coração Brilhante',
    category: 'emoji',
    icon: '💖',
    cost: 25,
    description: 'Destaca sua mensagem no chat privado.',
  },
  {
    id: 'emoji_cheers',
    name: 'Brinde de Amigos',
    category: 'emoji',
    icon: '🥂',
    cost: 35,
    description: 'Celebra encontros confirmados na enquete.',
  },
];

export const PRIVATE_MESSAGE_COST = 5;
export const SIGNUP_BONUS_COINS = 500;
export const SUPPORT_EMAIL = 'carlikjr42@gmail.com';

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  bio: string;
  intent: ChatIntent;
  city: string;
  neighborhood: string;
  radiusKm: number;
  avatarUrl: string;
  chatcoins: number;
  role: 'user' | 'admin';
  verificationStatus: VerificationStatus;
  verificationPhoto?: string | null;
  isBanned: boolean;
  banReason?: string | null;
  online?: boolean;
  lastSeen: number;
  createdAt: number;
}

export interface ChatRoom {
  id: string;
  name: string;
  type: RoomType;
  intent: ChatIntent;
  neighborhood: string;
  creatorId: string;
  inviteCode?: string | null;
  memberCount: number;
  lastMessage?: string | null;
  lastMessageAt?: number | null;
  otherUser?: PublicUser | null;
}

export interface ChatMessage {
  id: string;
  roomId: string;
  senderId: string;
  senderName: string;
  senderAvatar: string;
  senderVerified?: boolean;
  content: string;
  msgType: 'text' | 'photo' | 'gift' | 'poll';
  photoData?: string | null;
  photoFilter?: string | null;
  smartFolder?: SmartFolder | null;
  giftId?: string | null;
  giftCost?: number;
  isEncrypted: boolean;
  expiresAt?: number | null;
  createdAt: number;
  pendingOffline?: boolean;
}

export interface MeetupPoll {
  id: string;
  roomId: string;
  creatorId: string;
  creatorName: string;
  question: string;
  locationBv: string;
  eventTime: string;
  options: { text: string; votes: number; voters: string[] }[];
  userVoteIndex: number | null;
  createdAt: number;
}

export interface GalleryPhoto {
  id: string;
  ownerId: string;
  ownerName: string;
  ownerAvatar: string;
  roomId?: string | null;
  imageData: string;
  filterName: string;
  smartFolder: SmartFolder;
  caption: string;
  neighborhood: string;
  createdAt: number;
}

export interface CoinTransaction {
  id: string;
  amount: number;
  reason: string;
  createdAt: number;
}

export interface AppNotification {
  id: string;
  type: 'message' | 'poll' | 'gift' | 'verification' | 'system';
  title: string;
  body: string;
  roomId?: string | null;
  isRead: boolean;
  createdAt: number;
}

export interface SupportTicket {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  subject: string;
  category: string;
  message: string;
  status: 'open' | 'answered';
  adminReply?: string | null;
  createdAt: number;
}

export interface UserReport {
  id: string;
  reporterId: string;
  reporterName: string;
  reportedUserId: string;
  reportedUserName: string;
  reportedUserEmail: string;
  roomId?: string | null;
  reason: string;
  details: string;
  status: 'open' | 'resolved' | 'dismissed';
  createdAt: number;
}

export interface AdminMetrics {
  totalUsers: number;
  verifiedUsers: number;
  bannedUsers: number;
  totalRooms: number;
  totalMessages: number;
  totalPolls: number;
  totalPhotos: number;
  totalCoinsCirculating: number;
  openReports: number;
  pendingVerifications: number;
  openTickets: number;
}

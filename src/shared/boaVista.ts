export const CITY_NAME = 'Boa Vista, RR';
export const MAX_RADIUS_KM = 15;
export const MIN_RADIUS_KM = 1;

export interface BairroBV {
  name: string;
  zone: 'Centro' | 'Norte' | 'Leste' | 'Oeste' | 'Sul';
  lat: number;
  lng: number;
}

export const BAIRROS_BOA_VISTA: BairroBV[] = [
  { name: 'Centro', zone: 'Centro', lat: 2.8235, lng: -60.6758 },
  { name: 'Mecejana', zone: 'Centro', lat: 2.8289, lng: -60.6844 },
  { name: 'São Francisco', zone: 'Centro', lat: 2.8315, lng: -60.6728 },
  { name: 'São Vicente', zone: 'Centro', lat: 2.8152, lng: -60.6821 },
  { name: 'Aparecida', zone: 'Centro', lat: 2.8342, lng: -60.6795 },
  { name: 'Canarinho', zone: 'Leste', lat: 2.8378, lng: -60.6625 },
  { name: 'Caçari', zone: 'Leste', lat: 2.8436, lng: -60.6489 },
  { name: 'Paraviana', zone: 'Leste', lat: 2.8311, lng: -60.6542 },
  { name: 'Bairro dos Estados', zone: 'Norte', lat: 2.8452, lng: -60.6708 },
  { name: '31 de Março', zone: 'Centro', lat: 2.8264, lng: -60.6915 },
  { name: 'Liberdade', zone: 'Oeste', lat: 2.8186, lng: -60.6982 },
  { name: 'Pricumã', zone: 'Sul', lat: 2.8058, lng: -60.6865 },
  { name: 'Buritis', zone: 'Oeste', lat: 2.8245, lng: -60.7068 },
  { name: 'Caimbé', zone: 'Oeste', lat: 2.8338, lng: -60.7089 },
  { name: 'Asa Branca', zone: 'Oeste', lat: 2.8396, lng: -60.7135 },
  { name: 'Jardim Floresta', zone: 'Norte', lat: 2.8514, lng: -60.6968 },
  { name: 'Caranã', zone: 'Norte', lat: 2.8559, lng: -60.7138 },
  { name: 'Cauamé', zone: 'Norte', lat: 2.8612, lng: -60.7052 },
  { name: 'Aeroporto', zone: 'Norte', lat: 2.8414, lng: -60.6895 },
  { name: 'Santa Luzia', zone: 'Oeste', lat: 2.8179, lng: -60.7285 },
  { name: 'Pintolândia', zone: 'Oeste', lat: 2.8105, lng: -60.7372 },
  { name: 'Jóquei Clube', zone: 'Oeste', lat: 2.8156, lng: -60.7192 },
  { name: 'Raiar do Sol', zone: 'Sul', lat: 2.7875, lng: -60.7185 },
  { name: 'Cidade Satélite', zone: 'Oeste', lat: 2.8351, lng: -60.7478 },
  { name: 'Senador Hélio Campos', zone: 'Oeste', lat: 2.8024, lng: -60.7432 },
];

export const BAIRRO_NAMES = BAIRROS_BOA_VISTA.map((b) => b.name);

export function isValidBairroBV(name: string): boolean {
  return BAIRRO_NAMES.includes(name);
}

export function getDistanceKmBetweenBairros(a: string, b: string): number {
  const bairroA = BAIRROS_BOA_VISTA.find((item) => item.name === a) ?? BAIRROS_BOA_VISTA[0];
  const bairroB = BAIRROS_BOA_VISTA.find((item) => item.name === b) ?? BAIRROS_BOA_VISTA[0];
  if (bairroA.name === bairroB.name) return 0.6;
  const R = 6371;
  const dLat = ((bairroB.lat - bairroA.lat) * Math.PI) / 180;
  const dLng = ((bairroB.lng - bairroA.lng) * Math.PI) / 180;
  const lat1 = (bairroA.lat * Math.PI) / 180;
  const lat2 = (bairroB.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const dist = 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return Math.round(dist * 10) / 10;
}

export const PONTOS_ENCONTRO_BV = [
  'Orla Taumanan — Centro',
  'Parque Anauá — Bairro dos Estados',
  'Praça das Águas — Centro',
  'Parque do Rio Branco — Centro',
  'Pátio Roraima Shopping — Cauamé',
  'Roraima Garden Shopping — Caçari',
  'Complexo Ayrton Senna — Centro',
];

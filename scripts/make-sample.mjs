// 개발용 샘플 데이터 생성 (실제 공고 아님). API 키 등록 전 화면 확인용.
import { writeFile, mkdir } from 'node:fs/promises';
const S = (name, o) => ({ source: 'applyhome', name: `[샘플] ${name}`, geoPrecision: 'address', ...o });
const m = (type, area, general, special, priceMax, sb) => ({ type, area, general, special, priceMax, specialBreakdown: sb });
const notices = [
  S('서초 리버파크', { id: 's1', category: 'APT', subType: '민영', address: '서울특별시 서초구 반포동', region: '서울', lat: 37.5049, lng: 126.9966, totalUnits: 320,
    flags: { speculative: true, adjusted: true, priceCap: true },
    dates: { announce: '2026-11-02', specialStart: '2026-11-16', specialEnd: '2026-11-16', rank1Start: '2026-11-17', rank1End: '2026-11-18', rank2Start: '2026-11-19', rank2End: '2026-11-19', receiptStart: '2026-11-16', receiptEnd: '2026-11-19', winner: '2026-11-25', contractStart: '2026-12-07', contractEnd: '2026-12-09' },
    models: [m('059.9800A', 59.98, 40, 60, 145000, { newlywed: 20, firstLife: 15, multiChild: 10, oldParents: 3, newborn: 8, institution: 4 }), m('084.9500B', 84.95, 90, 70, 198000, { newlywed: 25, firstLife: 15, multiChild: 15, oldParents: 5, newborn: 10 })] }),
  S('수원 광교 그린시티', { id: 's2', category: 'APT', subType: '민영', address: '경기도 수원시 영통구 이의동', region: '경기', lat: 37.2856, lng: 127.0513, totalUnits: 540,
    dates: { announce: '2026-11-05', specialStart: '2026-11-18', specialEnd: '2026-11-18', rank1Start: '2026-11-19', rank1End: '2026-11-20', receiptStart: '2026-11-18', receiptEnd: '2026-11-21', winner: '2026-11-27', contractStart: '2026-12-09', contractEnd: '2026-12-11' },
    models: [m('074.8900A', 74.89, 120, 110, 72000, { newlywed: 40, firstLife: 30, multiChild: 20, newborn: 15 })] }),
  S('인천 검단 뉴홈', { id: 's3', category: 'APT', subType: '국민', address: '인천광역시 서구 원당동', region: '인천', lat: 37.5933, lng: 126.6714, totalUnits: 800, flags: { publicHouseZone: true },
    dates: { announce: '2026-11-06', specialStart: '2026-11-24', specialEnd: '2026-11-26', rank1Start: '2026-11-27', rank1End: '2026-11-27', receiptStart: '2026-11-24', receiptEnd: '2026-11-28', winner: '2026-12-10', contractStart: '2026-12-22', contractEnd: '2026-12-24' },
    models: [m('051.9000', 51.9, 100, 300, 31000, { newlywed: 80, firstLife: 80, youth: 60, newborn: 60, multiChild: 20 })] }),
  S('부산 해운대 오션뷰', { id: 's4', category: 'OFFICETEL', subType: '오피스텔', address: '부산광역시 해운대구 우동', region: '부산', lat: 35.1631, lng: 129.1636, totalUnits: 280,
    dates: { announce: '2026-11-03', receiptStart: '2026-11-12', receiptEnd: '2026-11-13', winner: '2026-11-17', contractStart: '2026-11-19', contractEnd: '2026-11-20' },
    models: [m('A', 29.5, 180, 0, 32000), m('B', 44.8, 100, 0, 48000)] }),
  S('대전 도안 무순위', { id: 's5', category: 'REMNDR', subType: '무순위', address: '대전광역시 유성구 학하동', region: '대전', lat: 36.3418, lng: 127.3001, totalUnits: 12,
    dates: { announce: '2026-11-07', receiptStart: '2026-11-14', receiptEnd: '2026-11-14', winner: '2026-11-18', contractStart: '2026-11-21', contractEnd: '2026-11-21' },
    models: [m('084.0000', 84, 12, 0, 56000)] }),
  S('고양 창릉 민간임대', { id: 's6', category: 'PBL_PVT_RENT', subType: '공공지원민간임대', address: '경기도 고양시 덕양구 용두동', region: '경기', lat: 37.6345, lng: 126.8763, totalUnits: 420,
    dates: { announce: '2026-10-28', receiptStart: '2026-11-20', receiptEnd: '2026-11-22', winner: '2026-12-05', contractStart: '2026-12-15', contractEnd: '2026-12-17' },
    models: [m('59A', 59, 300, 120, 0, { youth: 60, newlywed: 50, oldParents: 10 })] }),
  { id: 's7', source: 'lh', category: 'LH', subType: '행복주택', name: '[샘플] 세종 행복주택 입주자 모집', region: '세종', lat: 36.4875, lng: 127.2817, geoPrecision: 'region', status: '공고중',
    dates: { announce: '2026-11-04', receiptEnd: '2026-11-30' } },
  { id: 's8', source: 'lh', category: 'LH', subType: '국민임대', name: '[샘플] 광주 국민임대 예비입주자 모집', region: '광주', lat: 35.1595, lng: 126.8526, geoPrecision: 'region', status: '공고중',
    dates: { announce: '2026-10-30', receiptEnd: '2026-11-20' } },
];
await mkdir('public/data', { recursive: true });
await writeFile('public/data/notices.json', JSON.stringify({ generatedAt: new Date().toISOString(), sample: true, sources: ['샘플 데이터(실제 공고 아님)'], notices }, null, 1));
console.log('sample written', notices.length);

import type { ReceiptStatus } from '../lib/filters.ts';

// 색 토큰 (F5): 색 하나에 의미 하나. 지도 마커·범례·캘린더 막대가 모두 이 값을 쓴다.
// 상태 색은 접수 상태만 뜻한다. 판정(충족·추가확인·불충족)은 색이 아니라 ✓ △ ✗ 배지로 표현한다.
export const STATUS_COLOR: Record<ReceiptStatus, string> = {
  upcoming: '#2563eb', // 접수예정: 파랑
  open: '#059669', // 접수중: 초록
  waiting: '#7c3aed', // 발표·계약 대기: 보라
  closed: '#64748b', // 지난 공고: 회색
  unknown: '#0891b2', // 일정확인: 청록
};
export const STATUS_SHORT: Record<ReceiptStatus, string> = {
  upcoming: '접수예정',
  open: '접수중',
  waiting: '계약 대기',
  closed: '지난 공고',
  unknown: '일정확인',
};

// 데이터 정합성 점검: 공고마다 빠지거나 앞뒤가 맞지 않는 항목을 표시한다.
// 화면(공고 상세)에 "공고 원문 확인 필요"로 안내하고, 관리자페이지에서 모아 본다.

export function checkQuality(n) {
  const d = n.dates ?? {};
  const issues = [];
  if (!n.address) issues.push('주소 미제공');
  else if (n.geoPrecision && n.geoPrecision !== 'address') issues.push('지도 위치 근사');
  const recStart = [d.specialStart, d.rank1Start, d.receiptStart].filter(Boolean).sort()[0];
  const recEnd = [d.receiptEnd, d.rank2End, d.rank1End, d.specialEnd].filter(Boolean).sort().pop();
  if (!recStart && !recEnd) issues.push('접수 일정 미제공');
  else if (!recEnd) issues.push('접수 마감일 미제공');
  if (n.source !== 'lh' && !d.winner) issues.push('발표일 미제공');
  if (n.source !== 'lh' && !d.contractStart && !d.contractEnd) issues.push('계약일 미제공');
  const order = [
    [d.announce, recStart, '공고일이 접수 시작보다 늦음'],
    [recStart, recEnd, '접수 마감이 시작보다 빠름'],
    [recEnd, d.winner, '발표일이 접수 마감보다 빠름'],
    [d.winner, d.contractStart, '계약일이 발표일보다 빠름'],
    [d.contractStart, d.contractEnd, '계약 종료가 시작보다 빠름'],
  ];
  for (const [a, b, msg] of order) if (a && b && b < a) issues.push(msg);
  if (n.source === 'applyhome' && n.category !== 'OPT' && !(n.models ?? []).length) issues.push('주택형 정보 없음');
  return issues;
}

export function annotateQuality(notices) {
  const counts = {};
  for (const n of notices) {
    const q = checkQuality(n);
    if (q.length) n.issues = q;
    else delete n.issues;
    for (const x of q) counts[x] = (counts[x] ?? 0) + 1;
  }
  return counts;
}

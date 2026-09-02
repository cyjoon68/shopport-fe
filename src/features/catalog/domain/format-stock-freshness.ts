import type { StockAvailability } from '@/shared/storage/types';

const millisecondsPerDay = 24 * 60 * 60 * 1_000;

export const formatStockFreshness = (
  availability: StockAvailability | undefined,
  observedAt: string,
  referenceTime: Date,
): string => {
  if (availability !== 'IN_STOCK' && availability !== 'OUT_OF_STOCK')
    return '재고 확인 시간 알 수 없음';
  const observedAtMilliseconds = Date.parse(observedAt);
  if (Number.isNaN(observedAtMilliseconds)) return '재고 확인 시간 알 수 없음';
  const elapsedDays = Math.floor(
    Math.max(0, referenceTime.getTime() - observedAtMilliseconds) / millisecondsPerDay,
  );
  if (elapsedDays >= 7) return `재고 정보 오래됨 · ${elapsedDays}일 전 확인`;
  return elapsedDays > 0 ? `${elapsedDays}일 전 확인` : '오늘 확인';
};

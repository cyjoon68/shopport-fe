const moneyFormatters = new Map<string, Intl.NumberFormat>();

const moneyFormatter = (currency: string): Intl.NumberFormat => {
  const cached = moneyFormatters.get(currency);
  if (cached) return cached;
  const formatter = new Intl.NumberFormat('ko-KR', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  });
  moneyFormatters.set(currency, formatter);
  return formatter;
};

export const formatMoney = (amountMinor: string, currency: string): string => {
  try {
    return moneyFormatter(currency).format(BigInt(amountMinor));
  } catch {
    return `${amountMinor} ${currency}`;
  }
};

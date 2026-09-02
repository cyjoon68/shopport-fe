import { formatMoney } from '../format-money';

describe('formatMoney', () => {
  it('formats KRW from amountMinor without a hardcoded display price', () => {
    expect(formatMoney('21900', 'KRW')).toContain('21,900');
  });
});

import { platformIconSources } from '../platform-icon.android';

describe('android platform icons', () => {
  it('provides native sources for menu actions', () => {
    expect(platformIconSources.copy).toEqual(expect.any(Number));
    expect(platformIconSources.edit).toEqual(expect.any(Number));
    expect(platformIconSources.delete).toEqual(expect.any(Number));
    expect(platformIconSources['pin-off']).toEqual(expect.any(Number));
  });
});

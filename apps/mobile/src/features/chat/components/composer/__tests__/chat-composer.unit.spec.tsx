jest.mock('@/providers/network-provider', () => ({
  useOnline: () => true,
}));

jest.mock('@/shared/storage', () => ({
  deleteDraft: jest.fn(() => Promise.resolve()),
  readDraft: jest.fn(),
  saveDraft: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../../attachments', () => ({
  removeUploadedAsset: jest.fn(() => Promise.resolve()),
  selectAndUploadAsset: jest.fn(),
}));

jest.mock('../../../api/fetchers', () => ({
  pollAssetUntilSettled: jest.fn(),
  readAssetStatus: jest.fn(),
  removeUploadedAsset: jest.fn(() => Promise.resolve()),
}));

jest.mock('expo-haptics', () => ({
  ImpactFeedbackStyle: { Light: 'light' },
  impactAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('expo-image', () => ({
  Image: () => null,
}));

import '../testing/attachment-cases';
import '../testing/draft-cases';

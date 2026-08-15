jest.mock('@/providers/network-provider', () => ({
  useOnline: () => true,
}));

jest.mock('@/shared/storage/database', () => ({
  deleteDraft: jest.fn(() => Promise.resolve()),
  readDraft: jest.fn(),
  saveDraft: jest.fn(() => Promise.resolve()),
}));

jest.mock('./asset-upload', () => ({
  removeUploadedAsset: jest.fn(() => Promise.resolve()),
  selectAndUploadAsset: jest.fn(),
}));

jest.mock('./asset-status', () => ({
  pollAssetUntilSettled: jest.fn(),
  readAssetStatus: jest.fn(),
}));

jest.mock('expo-haptics', () => ({
  ImpactFeedbackStyle: { Light: 'light' },
  impactAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('expo-image', () => ({
  Image: () => null,
}));

import './chat-composer-attachment-cases';
import './chat-composer-draft-cases';

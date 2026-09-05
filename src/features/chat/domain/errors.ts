import type { ChatErrorPresentation } from '../types';

export const chatErrorPresentation = (error: unknown): ChatErrorPresentation => {
  if (error instanceof Error && error.message === 'Run replay expired') {
    return {
      message: '이 응답은 보존 기간이 지나 이어올 수 없습니다. 다시 검색해 주세요.',
      route: null,
    };
  }
  if (error instanceof Error && error.message.includes('status: 429')) {
    return {
      message: '요청이 너무 빠릅니다. 잠시 후 다시 보내 주세요.',
      route: null,
    };
  }
  return {
    message: '응답을 이어오지 못했습니다. 연결을 확인하고 다시 보내 주세요.',
    route: null,
  };
};

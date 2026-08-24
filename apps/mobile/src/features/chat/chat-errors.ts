type ChatErrorPresentation = Readonly<{
  message: string;
  route: null;
}>;

export const chatErrorPresentation = (error: unknown): ChatErrorPresentation => {
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

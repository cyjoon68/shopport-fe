import type { Href } from 'expo-router';

export const conversationHref = (id: string): Href => ({
  pathname: '/',
  params: { id },
});

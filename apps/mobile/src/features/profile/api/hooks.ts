import { useMutation, useQuery } from '@apollo/client/react';
import { useEffect, useRef } from 'react';

import { useSession } from '@/features/auth';
import {
  DeleteViewerAccountDocument,
  UpdateViewerDocument,
  ViewerDocument,
} from '@/graphql/generated/graphql';
import { useOnline } from '@/providers/network-provider';

export const useProfile = (): {
  deleteAccount: () => Promise<string | null>;
  displayName: string | null;
  updateDisplayName: (displayName: string) => Promise<string | null>;
  updating: boolean;
} => {
  const { status } = useSession();
  const online = useOnline();
  const remoteEnabled = status === 'authenticated' && online;
  const remoteEnabledRef = useRef(remoteEnabled);
  remoteEnabledRef.current = remoteEnabled;
  const activeRef = useRef(true);
  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
    };
  }, []);
  const { data } = useQuery(ViewerDocument, {
    fetchPolicy: remoteEnabled ? 'cache-and-network' : 'cache-only',
    skip: false,
  });
  const [updateViewer, { loading: updating }] = useMutation(UpdateViewerDocument);
  const [deleteViewer] = useMutation(DeleteViewerAccountDocument);
  const canMutate = (): boolean => activeRef.current && remoteEnabledRef.current;
  const updateDisplayName = async (displayName: string): Promise<string | null> => {
    if (!canMutate()) return '연결을 확인하고 다시 시도해 주세요.';
    try {
      const result = await updateViewer({ variables: { input: { displayName } } });
      if (!canMutate()) return '연결을 확인하고 다시 시도해 주세요.';
      const payload = result.data?.updateViewer;
      if (!payload?.viewer)
        return payload?.userErrors[0]?.message ?? '다시 시도해 주세요.';
      return null;
    } catch {
      return '연결을 확인하고 다시 시도해 주세요.';
    }
  };
  const deleteAccount = async (): Promise<string | null> => {
    if (!canMutate()) return '연결을 확인하고 다시 시도해 주세요.';
    try {
      const result = await deleteViewer();
      if (!canMutate()) return '연결을 확인하고 다시 시도해 주세요.';
      const payload = result.data?.deleteViewerAccount;
      if (!payload?.success)
        return payload?.userErrors[0]?.message ?? '다시 시도해 주세요.';
      return null;
    } catch {
      return '연결을 확인하고 다시 시도해 주세요.';
    }
  };
  return {
    deleteAccount,
    displayName: data?.viewer.displayName ?? null,
    updateDisplayName,
    updating,
  };
};

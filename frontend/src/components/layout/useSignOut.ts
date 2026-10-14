'use client';

import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useLogout } from '@/hooks/useAuth';
import { errorMessage } from '@/lib/api';

/** Ends the session and returns to the login page. */
export function useSignOut() {
  const router = useRouter();
  const logout = useLogout();
  const signOut = () =>
    logout.mutate(undefined, {
      onSuccess: () => router.replace('/'),
      onError: (err) => toast.error(errorMessage(err)),
    });
  return { signOut, isPending: logout.isPending };
}

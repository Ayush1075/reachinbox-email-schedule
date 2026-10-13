'use client';

import { GoogleOAuthProvider } from '@react-oauth/google';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Toaster } from 'react-hot-toast';
import { ApiError } from '@/lib/api';

let browserQueryClient: QueryClient | undefined;

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 2_000,
        // Don't hammer the API on auth errors; do retry transient failures once.
        retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 1,
        refetchOnWindowFocus: true,
      },
    },
  });
}

function getQueryClient() {
  // Isolated per server render; one shared client in the browser.
  if (typeof window === 'undefined') return makeQueryClient();
  browserQueryClient ??= makeQueryClient();
  return browserQueryClient;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <GoogleOAuthProvider clientId={process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? ''}>
      <QueryClientProvider client={getQueryClient()}>
        {children}
        <Toaster
          position="bottom-right"
          toastOptions={{
            duration: 4000,
            style: {
              fontSize: '14px',
              borderRadius: '8px',
              border: '1px solid var(--border)',
              boxShadow: '0 1px 2px 0 rgb(28 25 23 / 0.04)',
              color: 'var(--text-primary)',
            },
          }}
        />
      </QueryClientProvider>
    </GoogleOAuthProvider>
  );
}

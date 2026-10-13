'use client';

import { createContext, type ReactNode, useContext, useMemo, useState } from 'react';
import { ComposeModal } from './ComposeModal';

const ComposeContext = createContext<{ openCompose: () => void } | null>(null);

/** One compose dialog for the whole dashboard; any page, empty state or command can open it. */
export function ComposeProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const value = useMemo(() => ({ openCompose: () => setOpen(true) }), []);
  return (
    <ComposeContext.Provider value={value}>
      {children}
      {open && <ComposeModal open onClose={() => setOpen(false)} />}
    </ComposeContext.Provider>
  );
}

export function useCompose() {
  const ctx = useContext(ComposeContext);
  if (!ctx) throw new Error('useCompose must be used inside ComposeProvider');
  return ctx;
}

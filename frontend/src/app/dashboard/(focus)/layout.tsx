import { ClientOnly } from '@/components/common/ClientOnly';

export default function FocusLayout({ children }: { children: React.ReactNode }) {
  return (
    <main id="main" tabIndex={-1} className="min-h-svh bg-background outline-none">
      <ClientOnly>{children}</ClientOnly>
    </main>
  );
}

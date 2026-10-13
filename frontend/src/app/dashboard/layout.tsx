import { AuthGate } from '@/components/layout/AuthGate';

export default function DashboardLayout({ children }: LayoutProps<'/dashboard'>) {
  return <AuthGate>{children}</AuthGate>;
}

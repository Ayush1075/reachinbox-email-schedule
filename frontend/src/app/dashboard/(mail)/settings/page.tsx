import { WorkspacePage } from '@/components/layout/WorkspacePage';
import { AccountSection, AppearanceSection, DefaultsSection, SlackSection } from '@/components/settings/SettingsSections';

export default function SettingsPage() {
  return (
    <WorkspacePage title="Settings" description="Notifications, server defaults and your account.">
      <SlackSection />
      <DefaultsSection />
      <AppearanceSection />
      <AccountSection />
    </WorkspacePage>
  );
}

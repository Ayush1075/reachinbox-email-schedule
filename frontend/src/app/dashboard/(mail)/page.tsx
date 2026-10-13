import { redirect } from 'next/navigation';

/** The design's homepage is the Scheduled mailbox. */
export default function DashboardIndex() {
  redirect('/dashboard/scheduled');
}

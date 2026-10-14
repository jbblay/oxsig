import { Suspense } from 'react';
import AdminConsole from '@/components/admin/AdminConsole';

export default function AdminPage() {
  return (
    <Suspense fallback={null}>
      <AdminConsole />
    </Suspense>
  );
}

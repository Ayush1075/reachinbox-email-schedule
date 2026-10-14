'use client';

import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Attachment } from '@/types/api';

/** Uploads a file ahead of the campaign; the returned id is sent with it. */
export function useUploadAttachment() {
  return useMutation({
    mutationFn: (file: File) => api<Attachment>('/api/attachments', { method: 'POST', file }),
  });
}

/** Removes an upload that hasn't been used by a campaign yet. */
export function useRemoveAttachment() {
  return useMutation({
    mutationFn: (id: string) => api<{ deleted: boolean }>(`/api/attachments/${id}`, { method: 'DELETE' }),
  });
}

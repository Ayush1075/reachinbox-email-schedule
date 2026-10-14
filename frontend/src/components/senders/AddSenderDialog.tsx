'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useCreateSender, useVerifySmtp } from '@/hooks/useSenders';
import { errorMessage } from '@/lib/api';
import type { SmtpCheck } from '@/types/api';

const schema = z.object({
  label: z.string().trim().min(1, 'Give the sender a name').max(80),
  fromAddress: z.string().trim().email('Enter a valid email address'),
  smtpHost: z.string().trim().min(1, 'SMTP host is required'),
  smtpPort: z.coerce.number().int('Whole number').min(1, 'Port 1-65535').max(65535, 'Port 1-65535'),
  smtpSecure: z.boolean(),
  smtpUser: z.string().trim().min(1, 'SMTP username is required'),
  smtpPass: z.string().min(1, 'SMTP password is required'),
  hourlyLimit: z.string().refine((v) => v === '' || (Number.isInteger(Number(v)) && Number(v) > 0), 'A whole number above 0'),
});
type Values = z.input<typeof schema>;

const DEFAULTS: Values = {
  label: '',
  fromAddress: '',
  smtpHost: 'smtp.ethereal.email',
  smtpPort: 587,
  smtpSecure: false,
  smtpUser: '',
  smtpPass: '',
  hourlyLimit: '',
};

function Row({ id, label, error, children }: { id: string; label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      {children}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

const fieldClass = 'h-9 border-transparent bg-field shadow-none dark:bg-field';

/** Adds an SMTP sender. "Test connection" opens a real SMTP session first, so bad credentials are caught before saving. */
export function AddSenderDialog({ trigger }: { trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [check, setCheck] = useState<SmtpCheck | null>(null);
  const create = useCreateSender();
  const verify = useVerifySmtp();
  const form = useForm<Values, unknown, z.output<typeof schema>>({ resolver: zodResolver(schema), defaultValues: DEFAULTS });
  const { errors } = form.formState;

  const invalid = (name: keyof Values) => ({
    'aria-invalid': errors[name] ? true : undefined,
    'aria-describedby': errors[name] ? `sender-${name}-error` : undefined,
  });

  const testConnection = async () => {
    const ok = await form.trigger(['smtpHost', 'smtpPort', 'smtpUser', 'smtpPass']);
    if (!ok) return;
    const v = form.getValues();
    setCheck(null);
    verify.mutate(
      { smtpHost: v.smtpHost.trim(), smtpPort: Number(v.smtpPort), smtpSecure: v.smtpSecure, smtpUser: v.smtpUser.trim(), smtpPass: v.smtpPass },
      { onSuccess: setCheck, onError: (err) => setCheck({ ok: false, latencyMs: 0, error: errorMessage(err) }) },
    );
  };

  const onSubmit = form.handleSubmit((v) =>
    create.mutate(
      { ...v, hourlyLimit: v.hourlyLimit === '' ? null : Number(v.hourlyLimit) },
      {
        onSuccess: (s) => {
          toast.success(`Added ${s.label}`, { description: s.fromAddress });
          form.reset(DEFAULTS);
          setCheck(null);
          setOpen(false);
        },
        onError: (err) => toast.error('Could not add sender', { description: errorMessage(err) }),
      },
    ),
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90svh] gap-0 overflow-y-auto sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Add sender</DialogTitle>
          <DialogDescription>Emails go out through this SMTP account. Passwords are encrypted before they are stored.</DialogDescription>
        </DialogHeader>

        <form onSubmit={(e) => void onSubmit(e)} noValidate className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Row id="sender-label" label="Name" error={errors.label?.message}>
              <Input id="sender-label" placeholder="Outreach 1" autoComplete="off" className={fieldClass} {...invalid('label')} {...form.register('label')} />
            </Row>
            <Row id="sender-fromAddress" label="From address" error={errors.fromAddress?.message}>
              <Input id="sender-fromAddress" type="email" placeholder="name@domain.com" autoComplete="off" className={fieldClass} {...invalid('fromAddress')} {...form.register('fromAddress')} />
            </Row>
          </div>
          <div className="grid gap-4 sm:grid-cols-[1fr_110px]">
            <Row id="sender-smtpHost" label="SMTP host" error={errors.smtpHost?.message}>
              <Input id="sender-smtpHost" autoComplete="off" className={fieldClass} {...invalid('smtpHost')} {...form.register('smtpHost')} />
            </Row>
            <Row id="sender-smtpPort" label="Port" error={errors.smtpPort?.message}>
              <Input id="sender-smtpPort" type="number" inputMode="numeric" className={`${fieldClass} font-mono`} {...invalid('smtpPort')} {...form.register('smtpPort')} />
            </Row>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Row id="sender-smtpUser" label="SMTP username" error={errors.smtpUser?.message}>
              <Input id="sender-smtpUser" autoComplete="off" className={fieldClass} {...invalid('smtpUser')} {...form.register('smtpUser')} />
            </Row>
            <Row id="sender-smtpPass" label="SMTP password" error={errors.smtpPass?.message}>
              <Input id="sender-smtpPass" type="password" autoComplete="new-password" className={fieldClass} {...invalid('smtpPass')} {...form.register('smtpPass')} />
            </Row>
          </div>
          <div className="grid items-end gap-4 sm:grid-cols-2">
            <Row id="sender-hourlyLimit" label="Hourly limit (optional)" error={errors.hourlyLimit?.message}>
              <Input id="sender-hourlyLimit" type="number" inputMode="numeric" min={1} placeholder="Server default" className={`${fieldClass} font-mono`} {...invalid('hourlyLimit')} {...form.register('hourlyLimit')} />
            </Row>
            <div className="flex h-9 items-center gap-2.5">
              <Controller
                control={form.control}
                name="smtpSecure"
                render={({ field }) => <Switch id="sender-smtpSecure" checked={field.value} onCheckedChange={field.onChange} />}
              />
              <Label htmlFor="sender-smtpSecure" className="text-sm font-normal">
                Use TLS (port 465)
              </Label>
            </div>
          </div>

          <div aria-live="polite" className="min-h-5 text-sm">
            {check?.ok === true && (
              <p className="flex items-center gap-1.5 text-primary">
                <CheckCircle2 className="size-4" aria-hidden />
                Connected in {check.latencyMs} ms
              </p>
            )}
            {check?.ok === false && (
              <p className="flex items-start gap-1.5 text-destructive">
                <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                {check.error}
              </p>
            )}
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            <Button type="button" variant="outline" onClick={() => void testConnection()} disabled={verify.isPending} className="rounded-full">
              {verify.isPending && <Loader2 className="animate-spin" aria-hidden />}
              Test connection
            </Button>
            <Button type="submit" disabled={create.isPending} className="rounded-full px-5">
              {create.isPending && <Loader2 className="animate-spin" aria-hidden />}
              Add sender
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

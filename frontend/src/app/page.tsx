'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useGoogleLogin } from '@react-oauth/google';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { GoogleIcon } from '@/components/auth/GoogleIcon';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useMe, useSignIn } from '@/hooks/useAuth';
import { errorMessage } from '@/lib/api';

const schema = z.object({
  email: z.string().trim().email('Enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
});
type FormValues = z.infer<typeof schema>;

const fieldClass =
  'h-14 rounded-[10px] border-transparent bg-field px-5 text-[15px] shadow-none placeholder:text-muted-foreground focus-visible:border-ring md:text-[15px] dark:bg-field';

export default function LoginPage() {
  const router = useRouter();
  const me = useMe();
  const signIn = useSignIn();
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { email: '', password: '' } });
  const googleConfigured = Boolean(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID);

  useEffect(() => {
    if (me.data) router.replace('/dashboard');
  }, [me.data, router]);

  const onSignedIn = () => router.replace('/dashboard');
  const onFailed = (err: unknown) => toast.error('Sign-in failed', { description: errorMessage(err) });

  const google = useGoogleLogin({
    flow: 'implicit',
    scope: 'openid email profile',
    onSuccess: ({ access_token }) => signIn.mutate({ accessToken: access_token }, { onSuccess: onSignedIn, onError: onFailed }),
    onError: () => toast.error('Google sign-in was cancelled or failed'),
    onNonOAuthError: ({ type }) => type !== 'popup_closed' && toast.error('Could not open the Google sign-in window'),
  });

  const onSubmit = form.handleSubmit((values) => signIn.mutate(values, { onSuccess: onSignedIn, onError: onFailed }));
  const { errors } = form.formState;
  const pending = signIn.isPending;

  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-[496px] rounded-xl border bg-card px-6 pt-14 pb-[52px] sm:px-[58px]">
        <h1 className="text-center text-[38px] leading-tight font-bold tracking-tight">Login</h1>

        <Button
          type="button"
          variant="secondary"
          disabled={!googleConfigured || pending}
          onClick={() => google()}
          className="mt-8 h-[46px] w-full gap-3 rounded-[10px] bg-primary-soft text-[15px] font-normal text-foreground hover:bg-primary-soft/70"
        >
          <GoogleIcon className="size-[18px]" />
          Login with Google
        </Button>
        {!googleConfigured && (
          <p className="mt-2 text-center text-xs text-muted-foreground">Set NEXT_PUBLIC_GOOGLE_CLIENT_ID to enable Google sign-in.</p>
        )}

        <div className="mt-[22px] flex items-center gap-4" aria-hidden>
          <span className="h-px flex-1 bg-border" />
          <span className="text-[13px] text-muted-foreground">or sign up through email</span>
          <span className="h-px flex-1 bg-border" />
        </div>

        <form onSubmit={onSubmit} noValidate className="mt-[26px]">
          <div className="space-y-3">
            <div>
              <Label htmlFor="email" className="sr-only">
                Email ID
              </Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="Email ID"
                aria-invalid={errors.email ? true : undefined}
                aria-describedby={errors.email ? 'email-error' : undefined}
                className={fieldClass}
                {...form.register('email')}
              />
              {errors.email && (
                <p id="email-error" className="mt-1.5 text-[13px] text-destructive">
                  {errors.email.message}
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="password" className="sr-only">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="Password"
                aria-invalid={errors.password ? true : undefined}
                aria-describedby={errors.password ? 'password-error' : undefined}
                className={fieldClass}
                {...form.register('password')}
              />
              {errors.password && (
                <p id="password-error" className="mt-1.5 text-[13px] text-destructive">
                  {errors.password.message}
                </p>
              )}
            </div>
          </div>
          <Button type="submit" disabled={pending} className="mt-6 h-12 w-full rounded-[10px] text-[15px] font-normal hover:bg-primary/90">
            {pending && <Loader2 className="animate-spin" aria-hidden />}
            Login
          </Button>
        </form>
      </div>
    </main>
  );
}

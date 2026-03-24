'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { useAuthStore } from '../../../lib/store/auth.store';

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
  totpCode: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

export default function LoginPage() {
  const router = useRouter();
  const { login, loginWithTOTP } = useAuthStore();
  const [requiresTOTP, setRequiresTOTP] = useState(false);
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    try {
      if (requiresTOTP) {
        await loginWithTOTP(data.email, data.password, data.totpCode ?? '');
        router.push('/dashboard');
      } else {
        const result = await login(data.email, data.password);
        if (result.requiresTOTP) {
          setRequiresTOTP(true);
          toast.info('Enter your 6-digit authenticator code');
        } else {
          router.push('/dashboard');
        }
      }
    } catch {
      toast.error('Invalid credentials. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-aop-dark flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">⚜️</div>
          <h1 className="text-2xl font-bold text-aop-dark">Aurum Operations Platform</h1>
          <p className="text-gray-500 text-sm mt-1">Sign in to your account</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email address</label>
            <input
              {...register('email')}
              type="email"
              placeholder="you@aurum.finance"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold focus:border-transparent"
            />
            {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              {...register('password')}
              type="password"
              placeholder="••••••••"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold focus:border-transparent"
            />
            {errors.password && (
              <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>
            )}
          </div>

          {requiresTOTP && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Authenticator Code
              </label>
              <input
                {...register('totpCode')}
                type="text"
                placeholder="000000"
                maxLength={6}
                className="w-full border border-gold rounded-lg px-3 py-2 text-sm text-center tracking-widest font-mono text-lg focus:outline-none focus:ring-2 focus:ring-gold"
                autoFocus
              />
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gold hover:bg-gold-dark disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg transition-colors text-sm mt-2"
          >
            {loading ? 'Signing in...' : requiresTOTP ? 'Verify Code' : 'Sign In'}
          </button>

          {!requiresTOTP && (
            <div className="text-center pt-2">
              <Link
                href="/forgot-password"
                className="text-sm text-gray-400 hover:text-gold transition-colors"
              >
                Forgot your password?
              </Link>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}

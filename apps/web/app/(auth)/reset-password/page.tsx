'use client';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { resetPassword } from '../../../lib/api/auth';

const schema = z
  .object({
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });
type FormData = z.infer<typeof schema>;

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  if (!token) {
    return (
      <div className="min-h-screen bg-aop-dark flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8 text-center">
          <div className="text-5xl mb-3">⚠️</div>
          <h1 className="text-xl font-bold text-aop-dark mb-2">Invalid Reset Link</h1>
          <p className="text-gray-500 text-sm mb-6">
            This password reset link is invalid or has expired.
          </p>
          <button
            onClick={() => router.push('/forgot-password')}
            className="w-full bg-gold text-white py-2.5 rounded-lg text-sm font-medium hover:bg-gold-dark transition-colors"
          >
            Request New Link
          </button>
        </div>
      </div>
    );
  }

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    try {
      await resetPassword(token, data.password);
      toast.success('Password reset successfully. Please sign in.');
      router.push('/login');
    } catch {
      toast.error('Reset link has expired or is invalid. Please request a new one.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-aop-dark flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🔒</div>
          <h1 className="text-2xl font-bold text-aop-dark">Set New Password</h1>
          <p className="text-gray-500 text-sm mt-1">Choose a strong password for your account</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
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

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
            <input
              {...register('confirmPassword')}
              type="password"
              placeholder="••••••••"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold focus:border-transparent"
            />
            {errors.confirmPassword && (
              <p className="text-red-500 text-xs mt-1">{errors.confirmPassword.message}</p>
            )}
          </div>

          <div className="text-xs text-gray-400 bg-gray-50 rounded-lg p-3">
            Password must be at least 8 characters long.
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gold hover:bg-gold-dark disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg transition-colors text-sm"
          >
            {loading ? 'Resetting...' : 'Reset Password'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}

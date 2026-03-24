import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Access Denied' };

export default function ForbiddenPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        <div className="text-8xl mb-4">🚫</div>
        <h1 className="text-3xl font-bold text-aop-dark mb-2">Access Denied</h1>
        <p className="text-gray-500 mb-8">
          You don&apos;t have permission to view this page. Contact your administrator if you
          believe this is an error.
        </p>
        <div className="flex gap-3 justify-center">
          <Link
            href="/dashboard"
            className="bg-gold text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-gold-dark transition-colors"
          >
            Go to Dashboard
          </Link>
          <Link
            href="/login"
            className="border border-gray-300 text-gray-700 px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}

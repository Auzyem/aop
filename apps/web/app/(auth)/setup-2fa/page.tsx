'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useAuthStore } from '../../../lib/store/auth.store';
import { setupTotp, verifyTotp } from '../../../lib/api/auth';

export default function Setup2FAPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();
  const [step, setStep] = useState<'qr' | 'verify'>('qr');
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [loading, setLoading] = useState(false);

  // Redirect if not authenticated
  if (!isAuthenticated) {
    router.replace('/login');
    return null;
  }

  const handleGenerateQR = async () => {
    setLoading(true);
    try {
      const data = await setupTotp();
      setQrCode(data.qrCodeUrl);
      setSecret(data.secret);
      setStep('verify');
    } catch {
      toast.error('Failed to generate QR code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (totpCode.length !== 6) {
      toast.error('Enter the 6-digit code from your authenticator app');
      return;
    }
    setLoading(true);
    try {
      await verifyTotp(totpCode);
      toast.success('Two-factor authentication enabled successfully');
      router.push('/dashboard');
    } catch {
      toast.error('Invalid code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-aop-dark flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🔐</div>
          <h1 className="text-2xl font-bold text-aop-dark">Set Up Two-Factor Auth</h1>
          <p className="text-gray-500 text-sm mt-1">
            Protect your account with an authenticator app
          </p>
        </div>

        {step === 'qr' && (
          <div className="space-y-4">
            <div className="bg-gold-light border border-gold/30 rounded-xl p-4 text-sm text-gold-dark">
              <p className="font-medium mb-1">Before you begin:</p>
              <ul className="list-disc list-inside space-y-1 text-xs">
                <li>Install Google Authenticator, Authy, or similar app</li>
                <li>Scan the QR code with your authenticator app</li>
                <li>Enter the 6-digit code to confirm setup</li>
              </ul>
            </div>
            <button
              onClick={handleGenerateQR}
              disabled={loading}
              className="w-full bg-gold hover:bg-gold-dark disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg transition-colors text-sm"
            >
              {loading ? 'Generating...' : 'Generate QR Code'}
            </button>
          </div>
        )}

        {step === 'verify' && (
          <div className="space-y-5">
            {qrCode && (
              <div className="flex flex-col items-center gap-3">
                <img
                  src={qrCode}
                  alt="TOTP QR Code"
                  className="w-48 h-48 border border-gray-200 rounded-lg"
                />
                {secret && (
                  <div className="text-center">
                    <p className="text-xs text-gray-500 mb-1">Manual entry key:</p>
                    <code className="font-mono text-xs bg-gray-100 px-3 py-1 rounded text-aop-dark">
                      {secret}
                    </code>
                  </div>
                )}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Verification Code
              </label>
              <input
                type="text"
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                maxLength={6}
                autoFocus
                className="w-full border border-gold rounded-lg px-3 py-2 text-center tracking-widest font-mono text-lg focus:outline-none focus:ring-2 focus:ring-gold"
              />
            </div>

            <button
              onClick={handleVerify}
              disabled={loading || totpCode.length !== 6}
              className="w-full bg-gold hover:bg-gold-dark disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg transition-colors text-sm"
            >
              {loading ? 'Verifying...' : 'Enable 2FA'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

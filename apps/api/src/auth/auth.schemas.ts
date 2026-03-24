import { z } from 'zod';

/** Strong password policy — min 12 chars, upper + number + special */
export const StrongPasswordSchema = z
  .string()
  .min(12, 'Password must be at least 12 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');

export const LoginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const TotpVerifySchema = z.object({
  tempToken: z.string().min(1, 'Temporary token is required'),
  code: z
    .string()
    .length(6, 'TOTP code must be 6 digits')
    .regex(/^\d+$/, 'TOTP code must be numeric'),
});

export const TotpSetupSchema = z.object({});

export const RefreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

export const LogoutSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

export const ResetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  password: StrongPasswordSchema,
});

export type LoginInput = z.infer<typeof LoginSchema>;
export type TotpVerifyInput = z.infer<typeof TotpVerifySchema>;
export type RefreshInput = z.infer<typeof RefreshSchema>;
export type LogoutInput = z.infer<typeof LogoutSchema>;
export type ResetPasswordInput = z.infer<typeof ResetPasswordSchema>;

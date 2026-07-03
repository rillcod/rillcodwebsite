import crypto from 'crypto';

// One-time code helpers for the parent claim-and-verify flow. Codes are 6 digits,
// stored only as a salted hash, and valid for 10 minutes with a 5-attempt cap.

export const OTP_TTL_MINUTES = 10;
export const OTP_MAX_ATTEMPTS = 5;

export function generateOtp(): string {
  // 6 digits, zero-padded (000000–999999).
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

export function hashOtp(code: string): string {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || 'rillcod-otp-salt';
  return crypto.createHmac('sha256', secret).update(code.trim()).digest('hex');
}

export function otpExpiry(): string {
  return new Date(Date.now() + OTP_TTL_MINUTES * 60_000).toISOString();
}

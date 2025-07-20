import bcrypt from "bcrypt";

/**
 * Generate a random 6 digit OTP
 * @returns {string} OTP
 */
export const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * Calculate OTP expiry (3 minutes from now)
 * @returns {Date} OTP expiry date
 */
export const calculateOTPExpiry = () => {
  const expiryTime = new Date();
  expiryTime.setMinutes(expiryTime.getMinutes() + 3); // OTP valid for 3 minutes
  return expiryTime;
};

/**
 * Validate otp expired or not
 * @returns {boolean} true if expired else false
 */
export function isOTPExpired(expiresIn: Date) {
  return new Date() > new Date(expiresIn);
}

/**
 * Match OTP with user OTP
 * @returns {boolean} true if matched else false
 */
export async function matchOTP(user_otp: string, otp: number) {
  return await bcrypt.compare(otp.toString(), user_otp);
}

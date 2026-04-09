import { redirect } from 'next/navigation';

/**
 * Legacy route — the old ziekten-plagen overview has been replaced by the
 * Teeltkennis Atlas on /kennisbank. Existing links redirect there.
 */
export default function LegacyZiektenPlagenPage() {
  redirect('/kennisbank');
}

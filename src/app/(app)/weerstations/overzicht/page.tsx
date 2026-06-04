import { redirect } from 'next/navigation';

/**
 * The overview moved to be the default /weerstations landing. Keep this old
 * route as a redirect so existing bookmarks / cached links still work.
 */
export default function WeerstationsOverzichtRedirect() {
  redirect('/weerstations');
}

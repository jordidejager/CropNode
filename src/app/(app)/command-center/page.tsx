import { redirect } from 'next/navigation'

export default function CommandCenterPage() {
  // Redirect naar smart-input als default landing
  redirect('/command-center/smart-input-v2')
}

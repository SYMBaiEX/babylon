import { redirect } from 'next/navigation'

export default function HomePage() {
  // Redirect to feed page
  redirect('/feed')
}

'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export type AuthResult = {
  error?: string
  success?: boolean
}

export async function login(formData: FormData): Promise<AuthResult> {
  let email = (formData.get('username') || formData.get('email')) as string
  const password = formData.get('password') as string

  if (!email || !password) {
    return { error: 'Vul alle velden in' }
  }

  // Als geen @ in de input, voeg @agrisprayer.local toe (voor admin login)
  if (!email.includes('@')) {
    email = `${email.toLowerCase()}@agrisprayer.local`
  }

  try {
    const supabase = await createClient()

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      console.error('[Auth] Login error:', error.message)
      return { error: getErrorMessage(error.message) }
    }
  } catch (err) {
    console.error('[Auth] Login exception:', err)
    return { error: 'Verbindingsfout. Probeer het opnieuw.' }
  }

  revalidatePath('/', 'layout')
  redirect('/command-center')
}

export async function register(formData: FormData): Promise<AuthResult> {
  let email = (formData.get('username') || formData.get('email')) as string
  const password = formData.get('password') as string

  if (!email || !password) {
    return { error: 'Vul alle velden in' }
  }

  if (password.length < 6) {
    return { error: 'Wachtwoord moet minimaal 6 tekens bevatten' }
  }

  // Als geen @ in de input, voeg @agrisprayer.local toe
  if (!email.includes('@')) {
    email = `${email.toLowerCase()}@agrisprayer.local`
  }

  try {
    const supabase = await createClient()

    const { error } = await supabase.auth.signUp({
      email,
      password,
    })

    if (error) {
      console.error('[Auth] Register error:', error.message)
      return { error: getErrorMessage(error.message) }
    }
  } catch (err) {
    console.error('[Auth] Register exception:', err)
    return { error: 'Verbindingsfout. Probeer het opnieuw.' }
  }

  revalidatePath('/', 'layout')
  redirect('/command-center')
}

export async function logout(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/login')
}

function getErrorMessage(message: string): string {
  const errorMessages: Record<string, string> = {
    'Invalid login credentials': 'Ongeldige inloggegevens',
    'Email not confirmed': 'E-mailadres is nog niet bevestigd',
    'User already registered': 'Dit e-mailadres is al geregistreerd',
    'Password should be at least 6 characters': 'Wachtwoord moet minimaal 6 tekens bevatten',
    'Unable to validate email address: invalid format': 'Ongeldig e-mailadres formaat',
    'Signup requires a valid password': 'Voer een geldig wachtwoord in',
    'Auth session missing!': 'Sessie verlopen, log opnieuw in',
  }

  return errorMessages[message] || `Er is een fout opgetreden: ${message}`
}

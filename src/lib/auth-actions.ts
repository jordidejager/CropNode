'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export type AuthResult = {
  error?: string
  success?: boolean
}

export async function login(formData: FormData): Promise<AuthResult> {
  const supabase = await createClient()

  const email = formData.get('email') as string
  const password = formData.get('password') as string

  if (!email || !password) {
    return { error: 'Vul alle velden in' }
  }

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    return { error: getErrorMessage(error.message) }
  }

  revalidatePath('/', 'layout')
  redirect('/command-center')
}

export async function register(formData: FormData): Promise<AuthResult> {
  const supabase = await createClient()

  const email = formData.get('email') as string
  const password = formData.get('password') as string

  if (!email || !password) {
    return { error: 'Vul alle velden in' }
  }

  if (password.length < 6) {
    return { error: 'Wachtwoord moet minimaal 6 tekens bevatten' }
  }

  const { error } = await supabase.auth.signUp({
    email,
    password,
  })

  if (error) {
    return { error: getErrorMessage(error.message) }
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

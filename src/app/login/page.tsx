'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, Sprout } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    let username = formData.get('username') as string
    const password = formData.get('password') as string
    const name = formData.get('name') as string
    const companyName = formData.get('company_name') as string

    if (!username || !password) {
      setError('Vul alle velden in')
      setLoading(false)
      return
    }

    // Bij registratie zijn naam en bedrijfsnaam verplicht
    if (mode === 'register' && (!name || !companyName)) {
      setError('Vul alle velden in (inclusief naam en bedrijfsnaam)')
      setLoading(false)
      return
    }

    // Als geen @ in de input, voeg @agrisprayer.local toe (voor admin login)
    const email = username.includes('@')
      ? username
      : `${username.toLowerCase()}@agrisprayer.local`

    try {
      const supabase = createClient()

      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })

        if (error) {
          setError(getErrorMessage(error.message))
          setLoading(false)
          return
        }
      } else {
        if (password.length < 6) {
          setError('Wachtwoord moet minimaal 6 tekens bevatten')
          setLoading(false)
          return
        }

        const { data, error } = await supabase.auth.signUp({
          email,
          password,
        })

        if (error) {
          setError(getErrorMessage(error.message))
          setLoading(false)
          return
        }

        // Na succesvolle registratie, maak profiel aan
        if (data.user) {
          const { error: profileError } = await supabase
            .from('profiles')
            .insert({
              user_id: data.user.id,
              name: name.trim(),
              company_name: companyName.trim(),
            })

          if (profileError) {
            console.error('[Auth] Profile creation error:', profileError)
            // We gaan toch door, profiel kan later worden aangemaakt
          }
        }
      }

      // Success - redirect
      router.push('/command-center')
      router.refresh()
    } catch (err) {
      console.error('[Auth] Exception:', err)
      setError('Verbindingsfout. Probeer het opnieuw.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#020617] p-4">
      <Card className="w-full max-w-md bg-slate-900/50 border-white/10 backdrop-blur-md">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center">
            <Sprout className="w-8 h-8 text-emerald-400" />
          </div>
          <div>
            <CardTitle className="text-2xl font-bold text-slate-100">
              {mode === 'login' ? 'Welkom terug' : 'Account aanmaken'}
            </CardTitle>
            <CardDescription className="text-slate-400 mt-2">
              {mode === 'login'
                ? 'Log in op je AgriSprayer Pro account'
                : 'Maak een nieuw account aan'}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="username" className="text-slate-300">
                Gebruikersnaam of e-mail
              </Label>
              <Input
                id="username"
                name="username"
                type="text"
                autoComplete="username"
                placeholder="admin of naam@bedrijf.nl"
                required
                disabled={loading}
                className="bg-slate-800/50 border-white/10 text-slate-100 placeholder:text-slate-500 focus:border-emerald-500/50 focus:ring-emerald-500/20"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-slate-300">
                Wachtwoord
              </Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                required
                disabled={loading}
                minLength={6}
                className="bg-slate-800/50 border-white/10 text-slate-100 placeholder:text-slate-500 focus:border-emerald-500/50 focus:ring-emerald-500/20"
              />
            </div>

            {mode === 'register' && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-slate-300">
                    Naam
                  </Label>
                  <Input
                    id="name"
                    name="name"
                    type="text"
                    autoComplete="name"
                    placeholder="Jan Jansen"
                    required
                    disabled={loading}
                    className="bg-slate-800/50 border-white/10 text-slate-100 placeholder:text-slate-500 focus:border-emerald-500/50 focus:ring-emerald-500/20"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="company_name" className="text-slate-300">
                    Bedrijfsnaam
                  </Label>
                  <Input
                    id="company_name"
                    name="company_name"
                    type="text"
                    autoComplete="organization"
                    placeholder="Akkerbouwbedrijf Jansen"
                    required
                    disabled={loading}
                    className="bg-slate-800/50 border-white/10 text-slate-100 placeholder:text-slate-500 focus:border-emerald-500/50 focus:ring-emerald-500/20"
                  />
                </div>
              </>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Even geduld...
                </>
              ) : mode === 'login' ? (
                'Inloggen'
              ) : (
                'Registreren'
              )}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => {
                setMode(mode === 'login' ? 'register' : 'login')
                setError(null)
              }}
              className="text-sm text-slate-400 hover:text-emerald-400 transition-colors"
            >
              {mode === 'login'
                ? 'Nog geen account? Registreer hier'
                : 'Al een account? Log hier in'}
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
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

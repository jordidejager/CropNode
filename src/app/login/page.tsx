'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Loader2, Clock } from 'lucide-react'
import { Logo } from '@/components/ui/logo'

export default function LoginPage() {
  const router = useRouter()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [cultivationType, setCultivationType] = useState<string>('')
  const [showWaitlist, setShowWaitlist] = useState(false)

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

    // Bij registratie zijn naam, bedrijfsnaam en teelttype verplicht
    if (mode === 'register' && (!name || !companyName || !cultivationType)) {
      setError('Vul alle velden in (inclusief naam, bedrijfsnaam en teelttype)')
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

        // Stuur profiel data mee als user metadata - trigger maakt profile aan
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              name: name.trim(),
              company_name: companyName.trim(),
              cultivation_type: cultivationType,
            }
          }
        })

        if (error) {
          setError(getErrorMessage(error.message))
          setLoading(false)
          return
        }

        // Fallback: maak profiel aan als trigger niet heeft gewerkt
        if (data.user) {
          try {
            const { data: existingProfile } = await supabase
              .from('profiles')
              .select('id')
              .eq('user_id', data.user.id)
              .maybeSingle()

            if (!existingProfile) {
              await supabase.from('profiles').insert({
                user_id: data.user.id,
                name: name.trim(),
                company_name: companyName.trim(),
              })
            }
          } catch (profileErr) {
            // Niet fataal - profiel kan later alsnog aangemaakt worden
            console.warn('[Auth] Profile creation fallback failed:', profileErr)
          }
        }

        // Bij akkerbouw of anders: toon wachtlijst melding
        if (data.user && (cultivationType === 'arable' || cultivationType === 'other')) {
          setLoading(false)
          setShowWaitlist(true)
          return
        }
      }

      // Success - redirect (alleen voor fruitteelt)
      router.push('/dashboard')
      router.refresh()
    } catch (err) {
      console.error('[Auth] Exception:', err)
      setError('Verbindingsfout. Probeer het opnieuw.')
      setLoading(false)
    }
  }

  // Wachtlijst melding voor akkerbouw/anders
  if (showWaitlist) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#020617] p-4">
        <Card className="w-full max-w-md bg-slate-900/50 border-white/10 backdrop-blur-md">
          <CardHeader className="text-center space-y-4">
            <div className="mx-auto w-16 h-16 rounded-2xl bg-amber-600/20 border border-amber-500/30 flex items-center justify-center">
              <Clock className="w-8 h-8 text-amber-400" />
            </div>
            <div>
              <CardTitle className="text-2xl font-bold text-slate-100">
                Bedankt voor je interesse!
              </CardTitle>
              <CardDescription className="text-slate-400 mt-4 text-base leading-relaxed">
                De akkerbouw-versie is nog in ontwikkeling. We laten je weten zodra het beschikbaar is.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-slate-500 text-sm mb-6">
              Je account is aangemaakt en staat op de wachtlijst.
            </p>
            <Button
              onClick={() => {
                setShowWaitlist(false)
                setMode('login')
                setCultivationType('')
              }}
              variant="outline"
              className="border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-slate-100"
            >
              Terug naar inloggen
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#020617] p-4">
      <Card className="w-full max-w-md bg-slate-900/50 border-white/10 backdrop-blur-md">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto flex justify-center">
            <Logo variant="stacked" theme="dark" width={140} height={70} />
          </div>
          <div>
            <CardTitle className="text-2xl font-bold text-slate-100">
              {mode === 'login' ? 'Welkom terug' : 'Account aanmaken'}
            </CardTitle>
            <CardDescription className="text-slate-400 mt-2">
              {mode === 'login'
                ? 'Log in op je CropNode account'
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
                    placeholder="Fruitbedrijf Jansen"
                    required
                    disabled={loading}
                    className="bg-slate-800/50 border-white/10 text-slate-100 placeholder:text-slate-500 focus:border-emerald-500/50 focus:ring-emerald-500/20"
                  />
                </div>

                <div className="space-y-3">
                  <Label className="text-slate-300">Type teelt</Label>
                  <RadioGroup
                    value={cultivationType}
                    onValueChange={setCultivationType}
                    disabled={loading}
                    className="space-y-2"
                  >
                    <label className="flex items-center space-x-3 p-3 rounded-lg bg-slate-800/50 border border-white/10 cursor-pointer hover:border-emerald-500/30 transition-colors has-[:checked]:border-emerald-500/50 has-[:checked]:bg-emerald-500/10">
                      <RadioGroupItem
                        value="fruit"
                        id="fruit"
                        className="border-slate-500 text-emerald-500 focus:ring-emerald-500/20"
                      />
                      <span className="text-slate-200">Fruitteelt</span>
                    </label>
                    <label className="flex items-center space-x-3 p-3 rounded-lg bg-slate-800/50 border border-white/10 cursor-pointer hover:border-emerald-500/30 transition-colors has-[:checked]:border-emerald-500/50 has-[:checked]:bg-emerald-500/10">
                      <RadioGroupItem
                        value="arable"
                        id="arable"
                        className="border-slate-500 text-emerald-500 focus:ring-emerald-500/20"
                      />
                      <span className="text-slate-200">Akkerbouw</span>
                    </label>
                    <label className="flex items-center space-x-3 p-3 rounded-lg bg-slate-800/50 border border-white/10 cursor-pointer hover:border-emerald-500/30 transition-colors has-[:checked]:border-emerald-500/50 has-[:checked]:bg-emerald-500/10">
                      <RadioGroupItem
                        value="other"
                        id="other"
                        className="border-slate-500 text-emerald-500 focus:ring-emerald-500/20"
                      />
                      <span className="text-slate-200">Anders</span>
                    </label>
                  </RadioGroup>
                </div>
              </>
            )}

            {mode === 'login' && (
              <div className="text-right">
                <Link
                  href="/forgot-password"
                  className="text-sm text-slate-400 hover:text-emerald-400 transition-colors"
                >
                  Wachtwoord vergeten?
                </Link>
              </div>
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
                setCultivationType('')
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

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Loader2, Clock, ArrowRight, Shield, Zap, Cloud } from 'lucide-react'
import { motion } from 'framer-motion'
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

    if (mode === 'register' && (!name || !companyName || !cultivationType)) {
      setError('Vul alle velden in (inclusief naam, bedrijfsnaam en teelttype)')
      setLoading(false)
      return
    }

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
            console.warn('[Auth] Profile creation fallback failed:', profileErr)
          }
        }

        if (data.user && (cultivationType === 'arable' || cultivationType === 'other')) {
          setLoading(false)
          setShowWaitlist(true)
          return
        }
      }

      router.push('/dashboard')
      router.refresh()
    } catch (err) {
      console.error('[Auth] Exception:', err)
      setError('Verbindingsfout. Probeer het opnieuw.')
      setLoading(false)
    }
  }

  // Wachtlijst melding
  if (showWaitlist) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#020617] p-4">
        {/* Background effects */}
        <div className="fixed inset-0 pointer-events-none">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-amber-500/[0.04] rounded-full blur-[120px]" />
        </div>

        <div className="relative w-full max-w-md">
          <div className="rounded-2xl p-px bg-gradient-to-b from-amber-500/20 to-transparent">
            <div className="rounded-2xl bg-[#0a0f1a]/95 backdrop-blur-xl p-8">
              <div className="text-center space-y-4">
                <div className="mx-auto w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                  <Clock className="w-8 h-8 text-amber-400" />
                </div>
                <h1 className="text-2xl font-bold text-white">Bedankt voor je interesse!</h1>
                <p className="text-slate-400 leading-relaxed">
                  De akkerbouw-versie is nog in ontwikkeling. We laten je weten zodra het beschikbaar is.
                </p>
                <p className="text-slate-500 text-sm">Je account is aangemaakt en staat op de wachtlijst.</p>
                <Button
                  onClick={() => { setShowWaitlist(false); setMode('login'); setCultivationType(''); }}
                  variant="outline"
                  className="border-white/10 text-slate-300 hover:bg-white/5 hover:text-white mt-2"
                >
                  Terug naar inloggen
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex bg-[#020617] relative overflow-hidden">
      {/* Animated background effects */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        {/* Primary aurora orb — slow drift top-left → center */}
        <motion.div
          className="absolute w-[700px] h-[500px] rounded-full blur-[150px]"
          style={{ background: 'radial-gradient(circle, rgba(16,185,129,0.08) 0%, rgba(6,182,212,0.04) 50%, transparent 70%)' }}
          animate={{
            x: ['-10%', '15%', '-5%', '10%', '-10%'],
            y: ['-15%', '5%', '-10%', '15%', '-15%'],
            scale: [1, 1.2, 0.9, 1.1, 1],
          }}
          transition={{ duration: 20, repeat: Infinity, ease: 'easeInOut' }}
        />
        {/* Secondary aurora orb — drift bottom-right */}
        <motion.div
          className="absolute right-0 bottom-0 w-[600px] h-[450px] rounded-full blur-[130px]"
          style={{ background: 'radial-gradient(circle, rgba(52,211,153,0.06) 0%, rgba(16,185,129,0.03) 50%, transparent 70%)' }}
          animate={{
            x: ['10%', '-15%', '5%', '-10%', '10%'],
            y: ['10%', '-10%', '15%', '-5%', '10%'],
            scale: [1.1, 0.9, 1.15, 0.95, 1.1],
          }}
          transition={{ duration: 25, repeat: Infinity, ease: 'easeInOut' }}
        />
        {/* Accent orb — teal, smaller, faster */}
        <motion.div
          className="absolute left-1/3 top-1/2 w-[350px] h-[350px] rounded-full blur-[120px]"
          style={{ background: 'radial-gradient(circle, rgba(45,212,191,0.05) 0%, transparent 60%)' }}
          animate={{
            x: ['-20%', '30%', '-10%', '25%', '-20%'],
            y: ['10%', '-25%', '20%', '-15%', '10%'],
            opacity: [0.4, 0.8, 0.5, 0.9, 0.4],
          }}
          transition={{ duration: 15, repeat: Infinity, ease: 'easeInOut' }}
        />
        {/* Dot grid */}
        <div
          className="absolute inset-0 opacity-[0.025]"
          style={{
            backgroundImage: 'radial-gradient(rgba(255,255,255,0.35) 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }}
        />
        {/* Noise */}
        <div className="absolute inset-0 opacity-[0.015] mix-blend-overlay" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\' opacity=\'1\'/%3E%3C/svg%3E")' }} />
      </div>

      {/* Left panel — branding (hidden on mobile) */}
      <div className="hidden lg:flex lg:w-1/2 relative items-center justify-center p-12">
        <div className="max-w-md space-y-8">
          {/* Logo */}
          <Link href="/" className="inline-block">
            <Logo variant="horizontal" theme="dark" width={180} height={40} />
          </Link>

          <div className="space-y-3">
            <h1 className="text-4xl xl:text-5xl font-bold text-white tracking-tight leading-[1.1]">
              Agriculture
              <br />
              Intelligence
              <br />
              <span className="bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
                Platform
              </span>
            </h1>
            <p className="text-slate-400 text-lg leading-relaxed max-w-sm">
              Van WhatsApp-registraties tot AI-ziektedrukmodellen. Het complete platform voor de moderne fruitteelt.
            </p>
          </div>

          {/* Feature highlights */}
          <div className="space-y-4 pt-4">
            {[
              { icon: Zap, text: 'AI-registratie in minder dan 3 seconden', color: 'text-emerald-400' },
              { icon: Shield, text: '2.900+ CTGB-gevalideerde producten', color: 'text-emerald-400' },
              { icon: Cloud, text: '5-model ensemble weersverwachting', color: 'text-emerald-400' },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-3 group">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/15 flex items-center justify-center flex-shrink-0 group-hover:bg-emerald-500/15 transition-colors">
                  <item.icon className={`w-4 h-4 ${item.color}`} />
                </div>
                <span className="text-sm text-slate-300">{item.text}</span>
              </div>
            ))}
          </div>

          {/* Bottom tagline */}
          <div className="pt-8 border-t border-white/[0.06]">
            <p className="text-xs text-slate-600">
              Gebouwd voor de Nederlandse fruitteelt · 11 geïntegreerde modules
            </p>
          </div>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden mb-8 text-center">
            <Link href="/" className="inline-block">
              <Logo variant="stacked" theme="dark" width={120} height={60} />
            </Link>
          </div>

          {/* Card */}
          <div className="rounded-2xl p-px overflow-hidden" style={{ background: 'linear-gradient(to bottom, rgba(16,185,129,0.15), transparent 50%)' }}>
            <div className="rounded-2xl bg-[#0a0f1a]/95 backdrop-blur-xl p-6 sm:p-8">
              {/* Header */}
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-white">
                  {mode === 'login' ? 'Welkom terug' : 'Account aanmaken'}
                </h2>
                <p className="text-slate-400 mt-1 text-sm">
                  {mode === 'login'
                    ? 'Log in op je CropNode account'
                    : 'Maak een nieuw account aan om te beginnen'}
                </p>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                    {error}
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="username" className="text-slate-300 text-sm">
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
                    className="h-11 bg-white/[0.04] border-white/[0.08] text-slate-100 placeholder:text-slate-600 rounded-xl focus:border-emerald-500/40 focus:ring-1 focus:ring-emerald-500/20 transition-all"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="password" className="text-slate-300 text-sm">
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
                    className="h-11 bg-white/[0.04] border-white/[0.08] text-slate-100 placeholder:text-slate-600 rounded-xl focus:border-emerald-500/40 focus:ring-1 focus:ring-emerald-500/20 transition-all"
                  />
                </div>

                {mode === 'register' && (
                  <>
                    <div className="space-y-1.5">
                      <Label htmlFor="name" className="text-slate-300 text-sm">Naam</Label>
                      <Input
                        id="name" name="name" type="text" autoComplete="name"
                        placeholder="Jan Jansen" required disabled={loading}
                        className="h-11 bg-white/[0.04] border-white/[0.08] text-slate-100 placeholder:text-slate-600 rounded-xl focus:border-emerald-500/40 focus:ring-1 focus:ring-emerald-500/20 transition-all"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="company_name" className="text-slate-300 text-sm">Bedrijfsnaam</Label>
                      <Input
                        id="company_name" name="company_name" type="text" autoComplete="organization"
                        placeholder="Fruitbedrijf Jansen" required disabled={loading}
                        className="h-11 bg-white/[0.04] border-white/[0.08] text-slate-100 placeholder:text-slate-600 rounded-xl focus:border-emerald-500/40 focus:ring-1 focus:ring-emerald-500/20 transition-all"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-slate-300 text-sm">Type teelt</Label>
                      <RadioGroup value={cultivationType} onValueChange={setCultivationType} disabled={loading} className="space-y-2">
                        {[
                          { value: 'fruit', label: 'Fruitteelt' },
                          { value: 'arable', label: 'Akkerbouw' },
                          { value: 'other', label: 'Anders' },
                        ].map((opt) => (
                          <label key={opt.value} className="flex items-center space-x-3 px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.06] cursor-pointer hover:border-emerald-500/20 transition-all has-[:checked]:border-emerald-500/40 has-[:checked]:bg-emerald-500/[0.06]">
                            <RadioGroupItem
                              value={opt.value}
                              id={opt.value}
                              className="border-slate-600 text-emerald-500 focus:ring-emerald-500/20"
                            />
                            <span className="text-slate-200 text-sm">{opt.label}</span>
                          </label>
                        ))}
                      </RadioGroup>
                    </div>
                  </>
                )}

                {mode === 'login' && (
                  <div className="text-right">
                    <Link href="/forgot-password" className="text-sm text-slate-500 hover:text-emerald-400 transition-colors">
                      Wachtwoord vergeten?
                    </Link>
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full h-11 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl shadow-lg shadow-emerald-900/30 hover:shadow-emerald-800/40 transition-all duration-300 group text-sm font-medium"
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Even geduld...
                    </>
                  ) : (
                    <>
                      {mode === 'login' ? 'Inloggen' : 'Registreren'}
                      <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                    </>
                  )}
                </Button>
              </form>

              {/* Divider */}
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-white/[0.06]" />
                </div>
              </div>

              {/* Toggle mode */}
              <div className="text-center">
                <button
                  type="button"
                  onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null); setCultivationType(''); }}
                  className="text-sm text-slate-500 hover:text-emerald-400 transition-colors"
                >
                  {mode === 'login'
                    ? 'Nog geen account? Registreer hier'
                    : 'Al een account? Log hier in'}
                </button>
              </div>
            </div>
          </div>

          {/* Bottom text */}
          <p className="text-center text-xs text-slate-600 mt-6">
            Door in te loggen ga je akkoord met onze{' '}
            <Link href="/voorwaarden" className="text-slate-500 hover:text-emerald-400 underline underline-offset-2 transition-colors">
              voorwaarden
            </Link>
          </p>
        </div>
      </div>
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

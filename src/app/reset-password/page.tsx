'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, KeyRound, CheckCircle2, AlertCircle } from 'lucide-react'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [validSession, setValidSession] = useState<boolean | null>(null)

  // Check if user arrived via valid reset link
  useEffect(() => {
    async function checkSession() {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()

      // User should have a session from the reset link
      setValidSession(!!session)
    }
    checkSession()
  }, [])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    const password = formData.get('password') as string
    const confirmPassword = formData.get('confirmPassword') as string

    if (!password || !confirmPassword) {
      setError('Vul beide velden in')
      setLoading(false)
      return
    }

    if (password.length < 6) {
      setError('Wachtwoord moet minimaal 6 tekens bevatten')
      setLoading(false)
      return
    }

    if (password !== confirmPassword) {
      setError('Wachtwoorden komen niet overeen')
      setLoading(false)
      return
    }

    try {
      const supabase = createClient()

      const { error } = await supabase.auth.updateUser({
        password: password
      })

      if (error) {
        setError(getErrorMessage(error.message))
        setLoading(false)
        return
      }

      setSuccess(true)

      // Redirect to app after 2 seconds
      setTimeout(() => {
        router.push('/command-center')
      }, 2000)
    } catch (err) {
      console.error('[ResetPassword] Exception:', err)
      setError('Verbindingsfout. Probeer het opnieuw.')
    } finally {
      setLoading(false)
    }
  }

  // Loading state while checking session
  if (validSession === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#020617] p-4">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
      </div>
    )
  }

  // Invalid or expired link
  if (validSession === false) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#020617] p-4">
        <Card className="w-full max-w-md bg-slate-900/50 border-white/10 backdrop-blur-md">
          <CardHeader className="text-center space-y-4">
            <div className="mx-auto w-16 h-16 rounded-2xl bg-red-600/20 border border-red-500/30 flex items-center justify-center">
              <AlertCircle className="w-8 h-8 text-red-400" />
            </div>
            <div>
              <CardTitle className="text-2xl font-bold text-slate-100">
                Link verlopen
              </CardTitle>
              <CardDescription className="text-slate-400 mt-2">
                Deze reset link is verlopen of ongeldig.
                Vraag een nieuwe link aan.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <Link href="/forgot-password">
              <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white">
                Nieuwe link aanvragen
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Success state
  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#020617] p-4">
        <Card className="w-full max-w-md bg-slate-900/50 border-white/10 backdrop-blur-md">
          <CardHeader className="text-center space-y-4">
            <div className="mx-auto w-16 h-16 rounded-2xl bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-emerald-400" />
            </div>
            <div>
              <CardTitle className="text-2xl font-bold text-slate-100">
                Wachtwoord gewijzigd!
              </CardTitle>
              <CardDescription className="text-slate-400 mt-2">
                Je wordt doorgestuurd naar de app...
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#020617] p-4">
      <Card className="w-full max-w-md bg-slate-900/50 border-white/10 backdrop-blur-md">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center">
            <KeyRound className="w-8 h-8 text-emerald-400" />
          </div>
          <div>
            <CardTitle className="text-2xl font-bold text-slate-100">
              Nieuw wachtwoord
            </CardTitle>
            <CardDescription className="text-slate-400 mt-2">
              Kies een nieuw wachtwoord voor je account
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
              <Label htmlFor="password" className="text-slate-300">
                Nieuw wachtwoord
              </Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                placeholder="••••••••"
                required
                disabled={loading}
                minLength={6}
                className="bg-slate-800/50 border-white/10 text-slate-100 placeholder:text-slate-500 focus:border-emerald-500/50 focus:ring-emerald-500/20"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="text-slate-300">
                Bevestig wachtwoord
              </Label>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                placeholder="••••••••"
                required
                disabled={loading}
                minLength={6}
                className="bg-slate-800/50 border-white/10 text-slate-100 placeholder:text-slate-500 focus:border-emerald-500/50 focus:ring-emerald-500/20"
              />
            </div>

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
              ) : (
                'Wachtwoord opslaan'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

function getErrorMessage(message: string): string {
  const errorMessages: Record<string, string> = {
    'New password should be different from the old password': 'Kies een ander wachtwoord dan je vorige',
    'Password should be at least 6 characters': 'Wachtwoord moet minimaal 6 tekens bevatten',
    'Auth session missing!': 'Sessie verlopen. Vraag een nieuwe reset link aan.',
  }

  return errorMessages[message] || `Er is een fout opgetreden: ${message}`
}

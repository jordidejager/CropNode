'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, Mail, ArrowLeft, CheckCircle2 } from 'lucide-react'

export default function ForgotPasswordPage() {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [emailSent, setEmailSent] = useState(false)
  const [email, setEmail] = useState('')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    let emailInput = formData.get('email') as string

    if (!emailInput) {
      setError('Vul je e-mailadres in')
      setLoading(false)
      return
    }

    // Als geen @ in de input, voeg @agrisprayer.local toe
    const emailAddress = emailInput.includes('@')
      ? emailInput
      : `${emailInput.toLowerCase()}@agrisprayer.local`

    try {
      const supabase = createClient()

      const { error } = await supabase.auth.resetPasswordForEmail(emailAddress, {
        redirectTo: `${window.location.origin}/reset-password`,
      })

      if (error) {
        setError(getErrorMessage(error.message))
        setLoading(false)
        return
      }

      setEmail(emailAddress)
      setEmailSent(true)
    } catch (err) {
      console.error('[ForgotPassword] Exception:', err)
      setError('Verbindingsfout. Probeer het opnieuw.')
    } finally {
      setLoading(false)
    }
  }

  // Success state
  if (emailSent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#020617] p-4">
        <Card className="w-full max-w-md bg-slate-900/50 border-white/10 backdrop-blur-md">
          <CardHeader className="text-center space-y-4">
            <div className="mx-auto w-16 h-16 rounded-2xl bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-emerald-400" />
            </div>
            <div>
              <CardTitle className="text-2xl font-bold text-slate-100">
                Check je inbox
              </CardTitle>
              <CardDescription className="text-slate-400 mt-2">
                We hebben een reset link gestuurd naar:
              </CardDescription>
              <p className="text-emerald-400 font-medium mt-2">{email}</p>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-slate-500 text-sm text-center">
              Klik op de link in de email om je wachtwoord te resetten.
              De link is 24 uur geldig.
            </p>
            <div className="pt-4">
              <Link href="/login">
                <Button
                  variant="outline"
                  className="w-full border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-slate-100"
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Terug naar inloggen
                </Button>
              </Link>
            </div>
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
            <Mail className="w-8 h-8 text-emerald-400" />
          </div>
          <div>
            <CardTitle className="text-2xl font-bold text-slate-100">
              Wachtwoord vergeten?
            </CardTitle>
            <CardDescription className="text-slate-400 mt-2">
              Vul je e-mailadres in en we sturen je een reset link
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
              <Label htmlFor="email" className="text-slate-300">
                E-mailadres of gebruikersnaam
              </Label>
              <Input
                id="email"
                name="email"
                type="text"
                autoComplete="email"
                placeholder="naam@bedrijf.nl of admin"
                required
                disabled={loading}
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
                'Verstuur reset link'
              )}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <Link
              href="/login"
              className="text-sm text-slate-400 hover:text-emerald-400 transition-colors inline-flex items-center"
            >
              <ArrowLeft className="mr-1 h-4 w-4" />
              Terug naar inloggen
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function getErrorMessage(message: string): string {
  const errorMessages: Record<string, string> = {
    'User not found': 'Geen account gevonden met dit e-mailadres',
    'Email rate limit exceeded': 'Te veel verzoeken. Probeer het later opnieuw.',
    'Unable to validate email address: invalid format': 'Ongeldig e-mailadres formaat',
  }

  return errorMessages[message] || `Er is een fout opgetreden: ${message}`
}

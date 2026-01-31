'use client'

import { useState } from 'react'
import { useFormStatus } from 'react-dom'
import { login, register, type AuthResult } from '@/lib/auth-actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, Sprout } from 'lucide-react'

function SubmitButton({ mode }: { mode: 'login' | 'register' }) {
  const { pending } = useFormStatus()

  return (
    <Button
      type="submit"
      disabled={pending}
      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
    >
      {pending ? (
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
  )
}

export default function LoginPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(formData: FormData) {
    setError(null)

    const action = mode === 'login' ? login : register
    const result: AuthResult = await action(formData)

    if (result?.error) {
      setError(result.error)
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
          <form action={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email" className="text-slate-300">
                E-mailadres
              </Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="naam@bedrijf.nl"
                required
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
                placeholder="••••••••"
                required
                minLength={6}
                className="bg-slate-800/50 border-white/10 text-slate-100 placeholder:text-slate-500 focus:border-emerald-500/50 focus:ring-emerald-500/20"
              />
            </div>

            <SubmitButton mode={mode} />
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

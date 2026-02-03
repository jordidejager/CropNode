'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import {
  Loader2,
  User,
  Building2,
  Mail,
  Leaf,
  Save,
  CheckCircle2,
  AlertCircle,
  KeyRound
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

interface Profile {
  id: string
  user_id: string
  name: string
  company_name: string
  cultivation_type: string
  created_at: string
}

export default function ProfilePage() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [email, setEmail] = useState<string>('')

  // Form state
  const [name, setName] = useState('')
  const [companyName, setCompanyName] = useState('')

  // Password change state
  const [showPasswordChange, setShowPasswordChange] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)

  useEffect(() => {
    loadProfile()
  }, [])

  async function loadProfile() {
    try {
      const supabase = createClient()

      // Get current user
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      setEmail(user.email || '')

      // Get profile from database
      const { data: profileData, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user.id)
        .single()

      if (error && error.code !== 'PGRST116') {
        console.error('Error loading profile:', error)
      }

      if (profileData) {
        setProfile(profileData)
        setName(profileData.name)
        setCompanyName(profileData.company_name)
      } else {
        // Fallback to user metadata if no profile exists
        const metadata = user.user_metadata
        setName(metadata?.name || '')
        setCompanyName(metadata?.company_name || '')
      }
    } catch (err) {
      console.error('Error:', err)
    } finally {
      setLoading(false)
    }
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      if (profile) {
        // Update existing profile
        const { error } = await supabase
          .from('profiles')
          .update({
            name: name.trim(),
            company_name: companyName.trim(),
          })
          .eq('user_id', user.id)

        if (error) throw error
      } else {
        // Create new profile
        const { error } = await supabase
          .from('profiles')
          .insert({
            user_id: user.id,
            name: name.trim(),
            company_name: companyName.trim(),
            cultivation_type: 'fruit',
          })

        if (error) throw error
      }

      // Also update user metadata
      await supabase.auth.updateUser({
        data: {
          name: name.trim(),
          company_name: companyName.trim(),
        }
      })

      toast({
        title: 'Profiel opgeslagen',
        description: 'Je wijzigingen zijn opgeslagen.',
      })

      loadProfile()
    } catch (err: any) {
      console.error('Error saving profile:', err)
      toast({
        title: 'Fout bij opslaan',
        description: err.message || 'Er is iets misgegaan.',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()

    if (newPassword.length < 6) {
      toast({
        title: 'Wachtwoord te kort',
        description: 'Wachtwoord moet minimaal 6 tekens bevatten.',
        variant: 'destructive',
      })
      return
    }

    if (newPassword !== confirmPassword) {
      toast({
        title: 'Wachtwoorden komen niet overeen',
        description: 'Controleer je invoer.',
        variant: 'destructive',
      })
      return
    }

    setChangingPassword(true)

    try {
      const supabase = createClient()

      const { error } = await supabase.auth.updateUser({
        password: newPassword
      })

      if (error) throw error

      toast({
        title: 'Wachtwoord gewijzigd',
        description: 'Je nieuwe wachtwoord is opgeslagen.',
      })

      // Reset form
      setShowPasswordChange(false)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err: any) {
      console.error('Error changing password:', err)
      toast({
        title: 'Fout bij wijzigen',
        description: err.message || 'Er is iets misgegaan.',
        variant: 'destructive',
      })
    } finally {
      setChangingPassword(false)
    }
  }

  const cultivationTypeLabel = {
    fruit: 'Fruitteelt',
    arable: 'Akkerbouw',
    other: 'Anders',
  }[profile?.cultivation_type || 'fruit'] || 'Onbekend'

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
      </div>
    )
  }

  return (
    <div className="container max-w-2xl py-8 px-4">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-100">Mijn Profiel</h1>
        <p className="text-slate-400 mt-1">Beheer je accountgegevens</p>
      </div>

      <div className="space-y-6">
        {/* Profile Info Card */}
        <Card className="bg-slate-900/50 border-white/10">
          <CardHeader>
            <CardTitle className="text-slate-100 flex items-center gap-2">
              <User className="h-5 w-5 text-emerald-500" />
              Profielgegevens
            </CardTitle>
            <CardDescription className="text-slate-400">
              Je persoonlijke en bedrijfsgegevens
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-slate-300 flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  E-mailadres
                </Label>
                <Input
                  id="email"
                  type="text"
                  value={email}
                  disabled
                  className="bg-slate-800/30 border-white/5 text-slate-400"
                />
                <p className="text-xs text-slate-500">E-mailadres kan niet worden gewijzigd</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="name" className="text-slate-300 flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Naam
                </Label>
                <Input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Je naam"
                  required
                  className="bg-slate-800/50 border-white/10 text-slate-100 placeholder:text-slate-500 focus:border-emerald-500/50"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="company" className="text-slate-300 flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  Bedrijfsnaam
                </Label>
                <Input
                  id="company"
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Je bedrijfsnaam"
                  required
                  className="bg-slate-800/50 border-white/10 text-slate-100 placeholder:text-slate-500 focus:border-emerald-500/50"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-slate-300 flex items-center gap-2">
                  <Leaf className="h-4 w-4" />
                  Type teelt
                </Label>
                <div className="px-3 py-2 rounded-md bg-slate-800/30 border border-white/5 text-slate-400">
                  {cultivationTypeLabel}
                </div>
                <p className="text-xs text-slate-500">Teelttype kan niet worden gewijzigd</p>
              </div>

              <Button
                type="submit"
                disabled={saving}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Opslaan...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Wijzigingen opslaan
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Password Change Card */}
        <Card className="bg-slate-900/50 border-white/10">
          <CardHeader>
            <CardTitle className="text-slate-100 flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-emerald-500" />
              Wachtwoord
            </CardTitle>
            <CardDescription className="text-slate-400">
              Wijzig je wachtwoord
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!showPasswordChange ? (
              <Button
                onClick={() => setShowPasswordChange(true)}
                variant="outline"
                className="w-full border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-slate-100"
              >
                <KeyRound className="mr-2 h-4 w-4" />
                Wachtwoord wijzigen
              </Button>
            ) : (
              <form onSubmit={handleChangePassword} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="newPassword" className="text-slate-300">
                    Nieuw wachtwoord
                  </Label>
                  <Input
                    id="newPassword"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    minLength={6}
                    className="bg-slate-800/50 border-white/10 text-slate-100 placeholder:text-slate-500 focus:border-emerald-500/50"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword" className="text-slate-300">
                    Bevestig wachtwoord
                  </Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    minLength={6}
                    className="bg-slate-800/50 border-white/10 text-slate-100 placeholder:text-slate-500 focus:border-emerald-500/50"
                  />
                </div>

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setShowPasswordChange(false)
                      setNewPassword('')
                      setConfirmPassword('')
                    }}
                    className="flex-1 border-slate-700 text-slate-300 hover:bg-slate-800"
                  >
                    Annuleren
                  </Button>
                  <Button
                    type="submit"
                    disabled={changingPassword}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    {changingPassword ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Wijzigen...
                      </>
                    ) : (
                      'Wachtwoord wijzigen'
                    )}
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>

        {/* Account Info */}
        <Card className="bg-slate-900/50 border-white/10">
          <CardHeader>
            <CardTitle className="text-slate-100 text-sm">Account informatie</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-slate-400">
            <p>Account aangemaakt: {profile?.created_at ? new Date(profile.created_at).toLocaleDateString('nl-NL') : 'Onbekend'}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

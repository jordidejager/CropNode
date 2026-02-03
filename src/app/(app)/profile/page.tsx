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
  KeyRound,
  Trash2,
  AlertTriangle
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

  // Email change state
  const [showEmailChange, setShowEmailChange] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [changingEmail, setChangingEmail] = useState(false)
  const [emailChangeRequested, setEmailChangeRequested] = useState(false)

  // Account deletion state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)

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

  async function handleChangeEmail(e: React.FormEvent) {
    e.preventDefault()

    if (!newEmail || !newEmail.includes('@')) {
      toast({
        title: 'Ongeldig e-mailadres',
        description: 'Voer een geldig e-mailadres in.',
        variant: 'destructive',
      })
      return
    }

    if (newEmail === email) {
      toast({
        title: 'Zelfde e-mailadres',
        description: 'Voer een ander e-mailadres in dan je huidige.',
        variant: 'destructive',
      })
      return
    }

    setChangingEmail(true)

    try {
      const supabase = createClient()

      const { error } = await supabase.auth.updateUser({
        email: newEmail
      })

      if (error) throw error

      setEmailChangeRequested(true)
      toast({
        title: 'Bevestigingsmail verzonden',
        description: 'Check je inbox om de wijziging te bevestigen.',
      })
    } catch (err: any) {
      console.error('Error changing email:', err)
      toast({
        title: 'Fout bij wijzigen',
        description: err.message || 'Er is iets misgegaan.',
        variant: 'destructive',
      })
    } finally {
      setChangingEmail(false)
    }
  }

  async function handleDeleteAccount() {
    if (deleteConfirmText !== 'VERWIJDER') {
      toast({
        title: 'Bevestiging onjuist',
        description: 'Type VERWIJDER om je account te verwijderen.',
        variant: 'destructive',
      })
      return
    }

    setDeleting(true)

    try {
      const response = await fetch('/api/auth/delete-account', {
        method: 'DELETE',
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Kon account niet verwijderen')
      }

      // Sign out and redirect
      const supabase = createClient()
      await supabase.auth.signOut()
      window.location.href = '/login'
    } catch (err: any) {
      console.error('Error deleting account:', err)
      toast({
        title: 'Fout bij verwijderen',
        description: err.message || 'Er is iets misgegaan.',
        variant: 'destructive',
      })
      setDeleting(false)
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

        {/* Email Change Card */}
        <Card className="bg-slate-900/50 border-white/10">
          <CardHeader>
            <CardTitle className="text-slate-100 flex items-center gap-2">
              <Mail className="h-5 w-5 text-emerald-500" />
              E-mailadres
            </CardTitle>
            <CardDescription className="text-slate-400">
              Wijzig je e-mailadres
            </CardDescription>
          </CardHeader>
          <CardContent>
            {emailChangeRequested ? (
              <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-emerald-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-emerald-400 font-medium">Bevestigingsmail verzonden</p>
                    <p className="text-slate-400 text-sm mt-1">
                      We hebben een bevestigingslink gestuurd naar <span className="text-emerald-400">{newEmail}</span>.
                      Klik op de link om je nieuwe e-mailadres te activeren.
                    </p>
                    <Button
                      onClick={() => {
                        setEmailChangeRequested(false)
                        setShowEmailChange(false)
                        setNewEmail('')
                      }}
                      variant="outline"
                      size="sm"
                      className="mt-3 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                    >
                      Sluiten
                    </Button>
                  </div>
                </div>
              </div>
            ) : !showEmailChange ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-slate-400">
                  <span className="text-sm">Huidig e-mailadres:</span>
                  <span className="text-slate-200 font-medium">{email}</span>
                </div>
                <Button
                  onClick={() => setShowEmailChange(true)}
                  variant="outline"
                  className="w-full border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-slate-100"
                >
                  <Mail className="mr-2 h-4 w-4" />
                  E-mailadres wijzigen
                </Button>
              </div>
            ) : (
              <form onSubmit={handleChangeEmail} className="space-y-4">
                <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
                    <p className="text-amber-400 text-sm">
                      Na het wijzigen ontvang je een bevestigingslink op je nieuwe e-mailadres.
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="currentEmail" className="text-slate-300">
                    Huidig e-mailadres
                  </Label>
                  <Input
                    id="currentEmail"
                    type="email"
                    value={email}
                    disabled
                    className="bg-slate-800/30 border-white/5 text-slate-400"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="newEmail" className="text-slate-300">
                    Nieuw e-mailadres
                  </Label>
                  <Input
                    id="newEmail"
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="nieuw@email.nl"
                    required
                    className="bg-slate-800/50 border-white/10 text-slate-100 placeholder:text-slate-500 focus:border-emerald-500/50"
                  />
                </div>

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setShowEmailChange(false)
                      setNewEmail('')
                    }}
                    className="flex-1 border-slate-700 text-slate-300 hover:bg-slate-800"
                  >
                    Annuleren
                  </Button>
                  <Button
                    type="submit"
                    disabled={changingEmail}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    {changingEmail ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Verzenden...
                      </>
                    ) : (
                      'Bevestigingsmail verzenden'
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

        {/* Danger Zone - Account Deletion */}
        <Card className="bg-slate-900/50 border-red-500/30">
          <CardHeader>
            <CardTitle className="text-red-400 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Gevarenzone
            </CardTitle>
            <CardDescription className="text-slate-400">
              Onomkeerbare acties
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!showDeleteConfirm ? (
              <div className="space-y-3">
                <p className="text-slate-400 text-sm">
                  Als je je account verwijdert, worden al je gegevens permanent gewist.
                  Dit kan niet ongedaan worden gemaakt.
                </p>
                <Button
                  onClick={() => setShowDeleteConfirm(true)}
                  variant="outline"
                  className="w-full border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Account verwijderen
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-red-400 font-medium">Let op!</p>
                      <p className="text-slate-400 text-sm mt-1">
                        Dit verwijdert permanent al je percelen, spuitschriften, urenregistraties en andere gegevens.
                        Deze actie kan niet ongedaan worden gemaakt.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="deleteConfirm" className="text-slate-300">
                    Type <span className="font-bold text-red-400">VERWIJDER</span> om te bevestigen
                  </Label>
                  <Input
                    id="deleteConfirm"
                    type="text"
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    placeholder="VERWIJDER"
                    className="bg-slate-800/50 border-red-500/30 text-slate-100 placeholder:text-slate-500 focus:border-red-500/50"
                  />
                </div>

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setShowDeleteConfirm(false)
                      setDeleteConfirmText('')
                    }}
                    className="flex-1 border-slate-700 text-slate-300 hover:bg-slate-800"
                  >
                    Annuleren
                  </Button>
                  <Button
                    onClick={handleDeleteAccount}
                    disabled={deleting || deleteConfirmText !== 'VERWIJDER'}
                    className="flex-1 bg-red-600 hover:bg-red-700 text-white disabled:opacity-50"
                  >
                    {deleting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Verwijderen...
                      </>
                    ) : (
                      <>
                        <Trash2 className="mr-2 h-4 w-4" />
                        Account permanent verwijderen
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

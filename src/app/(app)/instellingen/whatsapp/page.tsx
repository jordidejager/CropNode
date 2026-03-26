'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import {
  Loader2,
  MessageCircle,
  Plus,
  Trash2,
  Phone,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

interface LinkedNumber {
  id: string
  phone_number: string
  phone_label: string
  is_active: boolean
  created_at: string
}

export default function WhatsAppSettingsPage() {
  const { toast } = useToast()
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [numbers, setNumbers] = useState<LinkedNumber[]>([])
  const [userId, setUserId] = useState<string | null>(null)

  // Add number form
  const [newPhone, setNewPhone] = useState('')
  const [newLabel, setNewLabel] = useState('')
  const [adding, setAdding] = useState(false)

  // Load linked numbers
  const loadNumbers = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)

      const { data, error } = await supabase
        .from('whatsapp_linked_numbers' as any)
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })

      if (error) throw error
      setNumbers((data as any[] || []) as LinkedNumber[])
    } catch (error) {
      console.error('Failed to load numbers:', error)
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    loadNumbers()
  }, [loadNumbers])

  // Normalize phone number for storage
  function normalizePhone(input: string): string {
    let cleaned = input.replace(/[\s\-().]/g, '')
    if (cleaned.startsWith('06')) {
      cleaned = '+31' + cleaned.slice(1)
    } else if (cleaned.startsWith('0031')) {
      cleaned = '+31' + cleaned.slice(4)
    } else if (cleaned.startsWith('31') && !cleaned.startsWith('+')) {
      cleaned = '+' + cleaned
    } else if (!cleaned.startsWith('+')) {
      cleaned = '+' + cleaned
    }
    return cleaned
  }

  // Add a new number
  async function handleAddNumber(e: React.FormEvent) {
    e.preventDefault()
    if (!userId || !newPhone.trim()) return

    setAdding(true)
    try {
      const normalized = normalizePhone(newPhone)

      // Validate format
      if (!/^\+\d{10,15}$/.test(normalized)) {
        toast({
          title: 'Ongeldig telefoonnummer',
          description: 'Gebruik het formaat +31612345678 of 0612345678',
          variant: 'destructive',
        })
        return
      }

      // Check max 5 numbers
      if (numbers.length >= 5) {
        toast({
          title: 'Maximum bereikt',
          description: 'Je kunt maximaal 5 telefoonnummers koppelen.',
          variant: 'destructive',
        })
        return
      }

      const { error } = await supabase
        .from('whatsapp_linked_numbers' as any)
        .insert({
          user_id: userId,
          phone_number: normalized,
          phone_label: newLabel.trim() || 'Hoofdnummer',
          is_active: true,
        } as any)

      if (error) {
        if (error.code === '23505') {
          toast({
            title: 'Nummer al gekoppeld',
            description: 'Dit telefoonnummer is al gekoppeld aan een account.',
            variant: 'destructive',
          })
        } else {
          throw error
        }
        return
      }

      toast({
        title: 'Nummer gekoppeld',
        description: `${normalized} is toegevoegd.`,
      })

      setNewPhone('')
      setNewLabel('')
      await loadNumbers()
    } catch (error: any) {
      toast({
        title: 'Fout',
        description: error.message || 'Kon nummer niet toevoegen.',
        variant: 'destructive',
      })
    } finally {
      setAdding(false)
    }
  }

  // Toggle active/inactive
  async function handleToggleActive(id: string, currentActive: boolean) {
    try {
      const { error } = await supabase
        .from('whatsapp_linked_numbers' as any)
        .update({ is_active: !currentActive, updated_at: new Date().toISOString() } as any)
        .eq('id', id)

      if (error) throw error
      await loadNumbers()
    } catch (error: any) {
      toast({
        title: 'Fout',
        description: error.message || 'Kon status niet wijzigen.',
        variant: 'destructive',
      })
    }
  }

  // Remove number
  async function handleRemove(id: string) {
    try {
      const { error } = await supabase
        .from('whatsapp_linked_numbers' as any)
        .delete()
        .eq('id', id)

      if (error) throw error

      toast({
        title: 'Nummer verwijderd',
        description: 'Het telefoonnummer is ontkoppeld.',
      })

      await loadNumbers()
    } catch (error: any) {
      toast({
        title: 'Fout',
        description: error.message || 'Kon nummer niet verwijderen.',
        variant: 'destructive',
      })
    }
  }

  // Format phone number for display
  function formatPhone(e164: string): string {
    if (e164.startsWith('+316') && e164.length === 12) {
      return `+31 6 ${e164.slice(4, 8)} ${e164.slice(8)}`
    }
    return e164
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">WhatsApp</h1>
        <p className="text-slate-400 mt-1">
          Koppel je telefoonnummer om bespuitingen via WhatsApp te registreren.
        </p>
      </div>

      {/* Explanation */}
      <Card className="bg-slate-900/50 border-white/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-slate-100">
            <MessageCircle className="w-5 h-5 text-emerald-500" />
            Hoe werkt het?
          </CardTitle>
        </CardHeader>
        <CardContent className="text-slate-300 space-y-3">
          <p>
            Stuur een WhatsApp bericht naar het CropNode botnummer met je bespuiting of bemesting,
            en het wordt automatisch verwerkt en opgeslagen in je Spuitschrift.
          </p>
          <div className="bg-slate-800/50 rounded-lg p-3 text-sm">
            <p className="text-slate-400 text-xs mb-1">Voorbeeld bericht:</p>
            <p className="text-slate-200 italic">&quot;Alle appels gespoten met Captan 2L/ha&quot;</p>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <span className="text-slate-400">
              Je moet je telefoonnummer hieronder koppelen voordat je berichten kunt sturen.
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Linked Numbers */}
      <Card className="bg-slate-900/50 border-white/10">
        <CardHeader>
          <CardTitle className="text-slate-100">Gekoppelde nummers</CardTitle>
          <CardDescription className="text-slate-400">
            Maximaal 5 telefoonnummers per account. Medewerkers kunnen hun eigen nummer koppelen.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {numbers.length === 0 ? (
            <p className="text-slate-500 text-sm py-4 text-center">
              Nog geen nummers gekoppeld. Voeg hieronder je eerste nummer toe.
            </p>
          ) : (
            <div className="space-y-3">
              {numbers.map((num) => (
                <div
                  key={num.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50 border border-white/5"
                >
                  <div className="flex items-center gap-3">
                    <Phone className="w-4 h-4 text-slate-400" />
                    <div>
                      <p className="text-sm font-medium text-slate-200">
                        {formatPhone(num.phone_number)}
                      </p>
                      <p className="text-xs text-slate-500">{num.phone_label}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">
                        {num.is_active ? 'Actief' : 'Inactief'}
                      </span>
                      <Switch
                        checked={num.is_active}
                        onCheckedChange={() => handleToggleActive(num.id, num.is_active)}
                        className="data-[state=checked]:bg-emerald-600"
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemove(num.id)}
                      className="text-slate-500 hover:text-red-400 hover:bg-red-400/10"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add number form */}
          {numbers.length < 5 && (
            <>
              <div className="border-t border-white/5 pt-4 mt-4" />
              <form onSubmit={handleAddNumber} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="phone" className="text-slate-300 text-sm">
                      Telefoonnummer
                    </Label>
                    <Input
                      id="phone"
                      type="tel"
                      value={newPhone}
                      onChange={(e) => setNewPhone(e.target.value)}
                      placeholder="06 1234 5678"
                      required
                      className="bg-slate-800/50 border-white/10 text-slate-100 placeholder:text-slate-500 focus:border-emerald-500/50"
                    />
                  </div>
                  <div>
                    <Label htmlFor="label" className="text-slate-300 text-sm">
                      Label (optioneel)
                    </Label>
                    <Input
                      id="label"
                      type="text"
                      value={newLabel}
                      onChange={(e) => setNewLabel(e.target.value)}
                      placeholder="bijv. Jordi mobiel"
                      className="bg-slate-800/50 border-white/10 text-slate-100 placeholder:text-slate-500 focus:border-emerald-500/50"
                    />
                  </div>
                </div>
                <Button
                  type="submit"
                  disabled={adding || !newPhone.trim()}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {adding ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Plus className="w-4 h-4 mr-2" />
                  )}
                  Nummer koppelen
                </Button>
              </form>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import toast from 'react-hot-toast'

export interface EditableDocument {
  id: string
  supplier_name?: string | null
  supplier_vat_number?: string | null
  invoice_number?: string | null
  issue_date?: string | null
  total_without_vat?: number | null
  total_vat?: number | null
  invoice_total?: number | null
  currency?: string | null
}

interface Props {
  document: EditableDocument | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

// Keep money inputs as strings during editing so the user can type freely
// (e.g. mid-input "5," should not be coerced to 5). We parse on submit.
type Draft = {
  supplier_name: string
  supplier_vat_number: string
  invoice_number: string
  issue_date: string
  total_without_vat: string
  total_vat: string
  invoice_total: string
  currency: string
}

function docToDraft(doc: EditableDocument): Draft {
  return {
    supplier_name: doc.supplier_name ?? '',
    supplier_vat_number: doc.supplier_vat_number ?? '',
    invoice_number: doc.invoice_number ?? '',
    issue_date: doc.issue_date ?? '',
    total_without_vat: doc.total_without_vat != null ? String(doc.total_without_vat) : '',
    total_vat: doc.total_vat != null ? String(doc.total_vat) : '',
    invoice_total: doc.invoice_total != null ? String(doc.invoice_total) : '',
    currency: doc.currency ?? '',
  }
}

export function DocumentEditDialog({ document, open, onOpenChange }: Props) {
  const router = useRouter()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)

  // Rehydrate the draft whenever the dialog opens for a given document. Keyed
  // on id so reopening the same doc resets any uncommitted edits.
  useEffect(() => {
    if (open && document) {
      setDraft(docToDraft(document))
    }
  }, [open, document?.id])

  if (!document || !draft) return null

  const update = (key: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setDraft({ ...draft, [key]: e.target.value })
  }

  const handleSave = async () => {
    try {
      setSaving(true)
      const response = await fetch('/api/documents/edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId: document.id,
          fields: {
            supplier_name: draft.supplier_name,
            supplier_vat_number: draft.supplier_vat_number,
            invoice_number: draft.invoice_number,
            issue_date: draft.issue_date,
            total_without_vat: draft.total_without_vat,
            total_vat: draft.total_vat,
            invoice_total: draft.invoice_total,
            currency: draft.currency,
          },
        }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'Falha ao guardar')

      toast.success('Documento atualizado')
      onOpenChange(false)
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Falha ao guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar dados extraídos</DialogTitle>
          <DialogDescription>
            Corrija os campos que a extração automática não detetou corretamente.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="supplier_name">Fornecedor</Label>
            <Input
              id="supplier_name"
              value={draft.supplier_name}
              onChange={update('supplier_name')}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="supplier_vat_number">NIF</Label>
              <Input
                id="supplier_vat_number"
                value={draft.supplier_vat_number}
                onChange={update('supplier_vat_number')}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="invoice_number">Nº Documento</Label>
              <Input
                id="invoice_number"
                value={draft.invoice_number}
                onChange={update('invoice_number')}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="issue_date">Data de emissão</Label>
            <Input
              id="issue_date"
              type="date"
              value={draft.issue_date}
              onChange={update('issue_date')}
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="total_without_vat">Sem IVA</Label>
              <Input
                id="total_without_vat"
                inputMode="decimal"
                value={draft.total_without_vat}
                onChange={update('total_without_vat')}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="total_vat">IVA</Label>
              <Input
                id="total_vat"
                inputMode="decimal"
                value={draft.total_vat}
                onChange={update('total_vat')}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="invoice_total">Total</Label>
              <Input
                id="invoice_total"
                inputMode="decimal"
                value={draft.invoice_total}
                onChange={update('invoice_total')}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="currency">Moeda</Label>
            <Input
              id="currency"
              value={draft.currency}
              onChange={update('currency')}
              placeholder="EUR"
              maxLength={8}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'A guardar...' : 'Guardar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

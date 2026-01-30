'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FolderOpen, Plus, Check, AlertCircle } from 'lucide-react'

interface DriveFolder {
  id: string
  name: string
  path: string
}

export default function SetupPage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [folders, setFolders] = useState<DriveFolder[]>([])
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null)
  const [newFolderName, setNewFolderName] = useState('Invoice Collector')
  const [showCreateNew, setShowCreateNew] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadFolders()
  }, [])

  const loadFolders = async () => {
    try {
      setIsLoading(true)
      setError(null)
      const response = await fetch('/api/drive/folders')

      if (!response.ok) {
        throw new Error('Falha ao carregar pastas')
      }

      const data = await response.json()
      setFolders(data.folders || [])
    } catch (err) {
      setError('Falha ao carregar pastas do Drive. Por favor tente novamente.')
      console.error('Error loading folders:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) {
      setError('Por favor introduza um nome para a pasta')
      return
    }

    try {
      setIsLoading(true)
      setError(null)

      const response = await fetch('/api/drive/folders/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newFolderName }),
      })

      if (!response.ok) {
        throw new Error('Falha ao criar pasta')
      }

      const data = await response.json()
      await saveSelection(data.folder.id, data.folder.name, data.folder.path)
    } catch (err) {
      setError('Falha ao criar pasta. Por favor tente novamente.')
      console.error('Error creating folder:', err)
      setIsLoading(false)
    }
  }

  const handleSelectFolder = async () => {
    if (!selectedFolder) {
      setError('Por favor seleccione uma pasta')
      return
    }

    const folder = folders.find(f => f.id === selectedFolder)
    if (!folder) return

    await saveSelection(folder.id, folder.name, folder.path)
  }

  const saveSelection = async (folderId: string, folderName: string, folderPath: string) => {
    try {
      setIsLoading(true)
      setError(null)

      const response = await fetch('/api/drive/folders/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          folderId,
          folderName,
          folderPath,
        }),
      })

      if (!response.ok) {
        throw new Error('Falha ao guardar selecção')
      }

      router.push('/dashboard')
    } catch (err) {
      setError('Falha ao guardar selecção. Por favor tente novamente.')
      console.error('Error saving selection:', err)
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <FolderOpen className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Configurar Google Drive
          </h1>
          <p className="mt-2 text-muted-foreground">
            Escolha onde guardar as suas faturas no Google Drive
          </p>
        </div>

        {error && (
          <div className="mb-6 flex items-center gap-2 rounded-lg bg-destructive/10 p-4 text-destructive">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        <div className="space-y-6">
          {/* Create New Folder Option */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Criar Nova Pasta</CardTitle>
                  <CardDescription>
                    Vamos criar uma nova pasta no seu Google Drive com a estrutura necessária
                  </CardDescription>
                </div>
                <Button
                  onClick={() => setShowCreateNew(!showCreateNew)}
                  variant="outline"
                  size="sm"
                >
                  {showCreateNew ? 'Cancelar' : 'Criar Nova'}
                </Button>
              </div>
            </CardHeader>

            {showCreateNew && (
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="folderName">Nome da Pasta</Label>
                  <Input
                    type="text"
                    id="folderName"
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    placeholder="Invoice Collector"
                    className="mt-1"
                  />
                </div>
                <Button
                  onClick={handleCreateFolder}
                  disabled={isLoading}
                  className="w-full"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  {isLoading ? 'A criar...' : 'Criar Pasta e Continuar'}
                </Button>
              </CardContent>
            )}
          </Card>

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="bg-background px-2 text-muted-foreground">ou</span>
            </div>
          </div>

          {/* Select Existing Folder Option */}
          <Card>
            <CardHeader>
              <CardTitle>Seleccionar Pasta Existente</CardTitle>
              <CardDescription>
                Escolha uma pasta existente do seu Google Drive
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {isLoading && folders.length === 0 ? (
                <div className="text-center py-8">
                  <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-primary border-r-transparent"></div>
                  <p className="mt-2 text-sm text-muted-foreground">A carregar pastas...</p>
                </div>
              ) : folders.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Nenhuma pasta encontrada. Crie uma nova pasta acima.
                </p>
              ) : (
                <>
                  <div className="max-h-64 space-y-2 overflow-y-auto">
                    {folders.map((folder) => (
                      <label
                        key={folder.id}
                        className={`flex cursor-pointer items-center rounded-lg border p-4 transition-colors ${
                          selectedFolder === folder.id
                            ? 'border-primary bg-primary/5'
                            : 'border-border hover:bg-muted/50'
                        }`}
                      >
                        <input
                          type="radio"
                          name="folder"
                          value={folder.id}
                          checked={selectedFolder === folder.id}
                          onChange={(e) => setSelectedFolder(e.target.value)}
                          className="sr-only"
                        />
                        <div className={`flex h-5 w-5 items-center justify-center rounded-full border ${
                          selectedFolder === folder.id
                            ? 'border-primary bg-primary'
                            : 'border-muted-foreground'
                        }`}>
                          {selectedFolder === folder.id && (
                            <Check className="h-3 w-3 text-primary-foreground" />
                          )}
                        </div>
                        <div className="ml-3">
                          <p className="font-medium text-foreground">{folder.name}</p>
                          {folder.path && (
                            <p className="text-sm text-muted-foreground">{folder.path}</p>
                          )}
                        </div>
                      </label>
                    ))}
                  </div>
                  <Button
                    onClick={handleSelectFolder}
                    disabled={!selectedFolder || isLoading}
                    className="w-full"
                  >
                    {isLoading ? 'A guardar...' : 'Continuar com a Pasta Seleccionada'}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="mt-8 rounded-lg border border-info/30 bg-info/5 p-4">
          <p className="text-sm text-foreground">
            <strong>O que acontece a seguir:</strong> Vamos criar uma subpasta &quot;Pendentes&quot; onde as novas faturas serão guardadas.
            Quando aprovar uma fatura, ela será movida para pastas &quot;Aprovados/MM-AAAA&quot; organizadas por mês.
          </p>
        </div>
      </div>
    </div>
  )
}

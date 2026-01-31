'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FolderOpen, Plus, Check, Loader2, Folder } from 'lucide-react'

interface DriveFolder {
    id: string
    name: string
    path: string
}

interface DriveFolderSelectorProps {
    currentFolderId?: string | null
    currentFolderName?: string | null
    onSelect: (folderId: string, folderName: string, folderPath: string) => void
}

export function DriveFolderSelector({ currentFolderId, currentFolderName, onSelect }: DriveFolderSelectorProps) {
    const [folders, setFolders] = useState<DriveFolder[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [selectedFolderId, setSelectedFolderId] = useState<string | null>(currentFolderId || null)
    const [showCreateNew, setShowCreateNew] = useState(false)
    const [newFolderName, setNewFolderName] = useState('Invoice Collector')
    const [isCreating, setIsCreating] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        loadFolders()
    }, [])

    useEffect(() => {
        if (currentFolderId) {
            setSelectedFolderId(currentFolderId)
        }
    }, [currentFolderId])

    const loadFolders = async () => {
        try {
            setIsLoading(true)
            const response = await fetch('/api/drive/folders')
            if (!response.ok) throw new Error('Falha ao carregar pastas')
            const data = await response.json()
            setFolders(data.folders || [])
        } catch (err) {
            console.error('Error loading folders:', err)
            setError('Não foi possível carregar as pastas do Drive')
        } finally {
            setIsLoading(false)
        }
    }

    const handleCreateFolder = async () => {
        if (!newFolderName.trim()) return

        try {
            setIsCreating(true)
            setError(null)
            const response = await fetch('/api/drive/folders/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newFolderName }),
            })

            if (!response.ok) throw new Error('Falha ao criar pasta')

            const data = await response.json()
            const newFolder = data.folder

            // Update local state
            setFolders(prev => [newFolder, ...prev])
            setSelectedFolderId(newFolder.id)
            setShowCreateNew(false)

            // Notify parent
            onSelect(newFolder.id, newFolder.name, newFolder.path)
        } catch (err) {
            console.error('Error creating folder:', err)
            setError('Falha ao criar pasta')
        } finally {
            setIsCreating(false)
        }
    }

    const handleFolderClick = (folder: DriveFolder) => {
        setSelectedFolderId(folder.id)
        onSelect(folder.id, folder.name, folder.path)
    }

    return (
        <div className="space-y-4">
            {/* Current Selection Display */}
            {currentFolderId && currentFolderName && !showCreateNew && (
                <div className="flex items-center gap-3 p-3 bg-muted rounded-lg border border-border">
                    <Folder className="h-5 w-5 text-primary" />
                    <div>
                        <p className="text-sm font-medium">Pasta Atual: {currentFolderName}</p>
                        <p className="text-xs text-muted-foreground">ID: {currentFolderId}</p>
                    </div>
                </div>
            )}

            {/* Error Message */}
            {error && (
                <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
                    {error}
                </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-2">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowCreateNew(!showCreateNew)}
                >
                    {showCreateNew ? 'Cancelar' : 'Criar Nova Pasta'}
                </Button>
            </div>

            {/* Create New Folder Form */}
            {showCreateNew && (
                <div className="p-4 border rounded-lg space-y-3 bg-card">
                    <Label htmlFor="newFolderName">Nome da Nova Pasta</Label>
                    <div className="flex gap-2">
                        <Input
                            id="newFolderName"
                            value={newFolderName}
                            onChange={(e) => setNewFolderName(e.target.value)}
                            placeholder="Ex: Minhas Faturas"
                        />
                        <Button onClick={handleCreateFolder} disabled={isCreating}>
                            {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                        </Button>
                    </div>
                </div>
            )}

            {/* Folder List */}
            <div className="border rounded-lg overflow-hidden max-h-[200px] overflow-y-auto">
                {isLoading ? (
                    <div className="p-8 flex justify-center">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                ) : folders.length === 0 ? (
                    <div className="p-4 text-center text-sm text-muted-foreground">
                        Nenhuma pasta encontrada.
                    </div>
                ) : (
                    <div className="divide-y">
                        {folders.map((folder) => (
                            <div
                                key={folder.id}
                                onClick={() => handleFolderClick(folder)}
                                className={`flex items-center justify-between p-3 cursor-pointer hover:bg-muted/50 transition-colors ${selectedFolderId === folder.id ? 'bg-primary/5' : ''
                                    }`}
                            >
                                <div className="flex items-center gap-3">
                                    <FolderOpen className={`h-4 w-4 ${selectedFolderId === folder.id ? 'text-primary' : 'text-muted-foreground'}`} />
                                    <span className="text-sm">{folder.name}</span>
                                </div>
                                {selectedFolderId === folder.id && (
                                    <Check className="h-4 w-4 text-primary" />
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}

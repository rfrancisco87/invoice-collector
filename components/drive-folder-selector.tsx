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

    // Navigation state: stack of {id, name}
    const [navigationPath, setNavigationPath] = useState<{ id: string, name: string }[]>([{ id: 'root', name: 'My Drive' }])
    const currentViewId = navigationPath[navigationPath.length - 1].id

    const [showCreateNew, setShowCreateNew] = useState(false)
    const [newFolderName, setNewFolderName] = useState('Invoice Collector')
    const [isCreating, setIsCreating] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (currentFolderId) {
            setSelectedFolderId(currentFolderId)
            restoreNavigationPath(currentFolderId)
        } else {
            loadFolders(currentViewId)
        }
    }, [])

    useEffect(() => {
        if (currentFolderId && currentFolderId !== selectedFolderId) {
            setSelectedFolderId(currentFolderId)
        }
    }, [currentFolderId])

    useEffect(() => {
        // Only load if we haven't just restored a path (which would trigger this anyway via currentViewId change)
        // But since we want to be reactive to navigation, we just load.
        // We need to avoid double loading on mount if resolving path.
        // Simplified: render loop will handle it, but let's be careful.
        loadFolders(currentViewId)
    }, [currentViewId])

    const restoreNavigationPath = async (folderId: string) => {
        try {
            setIsLoading(true)
            const response = await fetch(`/api/drive/folders?resolvePath=true&folderId=${folderId}`)
            if (!response.ok) throw new Error('Failed to resolve path')

            const data = await response.json()
            const hierarchy = data.hierarchy as DriveFolder[]

            if (hierarchy && hierarchy.length > 0) {
                // If the selected folder is effectively root (path length 1 and is root in restricted list), handles gracefully
                // We want to view the PARENT of the selected folder so we can see the selection

                // If hierarchy is just [SelectedFolder], and if it's not root, we might want to verify parent? 
                // But getFolderHierarchy usually goes up to root.
                // Assuming hierarchy is [Root, ..., Parent, SelectedFolder]

                let newPath: { id: string, name: string }[]

                if (hierarchy.length > 1) {
                    // Navigate to parent
                    const parentPath = hierarchy.slice(0, -1)
                    newPath = parentPath.map(f => ({ id: f.id, name: f.name === 'My Drive' ? 'My Drive' : f.name }))

                    // Ensure root is properly named if API returns generic name
                    if (newPath[0].name !== 'My Drive') newPath[0].name = 'My Drive' // Cosmetic fix if needed
                } else {
                    // Selected folder is at root level or is root
                    newPath = [{ id: 'root', name: 'My Drive' }]
                }

                setNavigationPath(newPath)
                // Note: setting navigationPath changes currentViewId, which triggers useEffect -> loadFolders
            }
        } catch (err) {
            console.error('Error resolving path:', err)
            // Fallback to root
            loadFolders('root')
        } finally {
            setIsLoading(false)
        }
    }

    const loadFolders = async (parentId: string) => {
        try {
            setIsLoading(true)
            const param = parentId === 'root' ? '' : `?parentId=${parentId}`
            const response = await fetch(`/api/drive/folders${param}`)
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
                body: JSON.stringify({
                    name: newFolderName,
                    parentId: currentViewId === 'root' ? undefined : currentViewId
                }),
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

    // Single click selects the folder
    const handleSelectFolder = (folder: DriveFolder) => {
        setSelectedFolderId(folder.id)
        onSelect(folder.id, folder.name, folder.path)
    }

    // Double click (or button) navigates into folder
    const handleNavigateInto = (folder: DriveFolder) => {
        setNavigationPath(prev => [...prev, { id: folder.id, name: folder.name }])
        setError(null)
    }

    const handleNavigateUp = () => {
        if (navigationPath.length > 1) {
            setNavigationPath(prev => prev.slice(0, -1))
        }
    }

    const handleBreadcrumbClick = (index: number) => {
        setNavigationPath(prev => prev.slice(0, index + 1))
    }

    return (
        <div className="space-y-4">
            {/* Current Selection Display */}
            {currentFolderId && currentFolderName && !showCreateNew && (
                <div className="flex items-center gap-3 p-3 bg-muted rounded-lg border border-border">
                    <Folder className="h-5 w-5 text-primary" />
                    <div>
                        <p className="text-sm font-medium">Pasta Selecionada: {currentFolderName}</p>
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

            {/* Navigation Header */}
            <div className="flex items-center justify-between">
                <div className="flex gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowCreateNew(!showCreateNew)}
                    >
                        {showCreateNew ? 'Cancelar' : 'Criar Nova Pasta'}
                    </Button>

                    {/* "Select Current Directory" Button - allows selecting the folder we are currently IN */}
                    {currentViewId !== 'root' && (
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                                const current = navigationPath[navigationPath.length - 1]
                                onSelect(current.id, current.name, current.name)
                                setSelectedFolderId(current.id)
                            }}
                        >
                            Selecionar Pasta Atual ({navigationPath[navigationPath.length - 1].name})
                        </Button>
                    )}
                </div>
            </div>

            {/* Breadcrumbs */}
            <div className="flex items-center gap-1 text-sm text-muted-foreground pb-2 overflow-x-auto whitespace-nowrap">
                {navigationPath.map((item, index) => (
                    <div key={item.id} className="flex items-center">
                        {index > 0 && <span className="mx-1">/</span>}
                        <button
                            onClick={() => handleBreadcrumbClick(index)}
                            className={`hover:text-foreground hover:underline ${index === navigationPath.length - 1 ? 'font-medium text-foreground' : ''}`}
                        >
                            {item.name}
                        </button>
                    </div>
                ))}
            </div>

            {/* Create New Folder Form */}
            {showCreateNew && (
                <div className="p-4 border rounded-lg space-y-3 bg-card">
                    <Label htmlFor="newFolderName">Nome da Nova Pasta (em {navigationPath[navigationPath.length - 1].name})</Label>
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
            <div className="border rounded-lg overflow-hidden max-h-[300px] overflow-y-auto">
                {isLoading ? (
                    <div className="p-8 flex justify-center">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                ) : folders.length === 0 ? (
                    <div className="p-4 text-center text-sm text-muted-foreground">
                        Esta pasta está vazia.
                    </div>
                ) : (
                    <div className="divide-y">
                        {navigationPath.length > 1 && (
                            <div
                                onClick={handleNavigateUp}
                                className="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/50 transition-colors text-muted-foreground"
                            >
                                <div className="w-4 flex justify-center">..</div>
                                <span className="text-sm italic">Voltar</span>
                            </div>
                        )}
                        {folders.map((folder) => (
                            <div
                                key={folder.id}
                                className={`flex items-center justify-between p-3 transition-colors ${selectedFolderId === folder.id ? 'bg-primary/5' : 'hover:bg-muted/50'}`}
                            >
                                {/* Left side: Icon + Name (Click to select) */}
                                <div
                                    className="flex items-center gap-3 flex-1 cursor-pointer"
                                    onClick={() => handleSelectFolder(folder)}
                                >
                                    <FolderOpen className={`h-4 w-4 flex-shrink-0 ${selectedFolderId === folder.id ? 'text-primary' : 'text-muted-foreground'}`} />
                                    <span className="text-sm truncate">{folder.name}</span>
                                </div>

                                {/* Right side: Check if selected, Navigate Button */}
                                <div className="flex items-center gap-2">
                                    {selectedFolderId === folder.id && (
                                        <Check className="h-4 w-4 text-primary mr-2" />
                                    )}
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 px-2 text-xs"
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            handleNavigateInto(folder)
                                        }}
                                    >
                                        Abrir
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}

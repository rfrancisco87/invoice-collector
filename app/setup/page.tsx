'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

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
        throw new Error('Failed to load folders')
      }

      const data = await response.json()
      setFolders(data.folders || [])
    } catch (err) {
      setError('Failed to load Drive folders. Please try again.')
      console.error('Error loading folders:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) {
      setError('Please enter a folder name')
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
        throw new Error('Failed to create folder')
      }

      const data = await response.json()
      await saveSelection(data.folder.id, data.folder.name, data.folder.path)
    } catch (err) {
      setError('Failed to create folder. Please try again.')
      console.error('Error creating folder:', err)
      setIsLoading(false)
    }
  }

  const handleSelectFolder = async () => {
    if (!selectedFolder) {
      setError('Please select a folder')
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
        throw new Error('Failed to save folder selection')
      }

      router.push('/dashboard')
    } catch (err) {
      setError('Failed to save selection. Please try again.')
      console.error('Error saving selection:', err)
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">
            Setup Google Drive
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            Choose where to store your invoices in Google Drive
          </p>
        </div>

        {error && (
          <div className="mb-6 rounded-lg bg-red-50 p-4">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        <div className="space-y-6">
          {/* Create New Folder Option */}
          <div className="rounded-lg bg-white p-6 shadow">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  Create New Folder
                </h2>
                <p className="mt-1 text-sm text-gray-600">
                  We'll create a new folder in your Google Drive with the necessary structure
                </p>
              </div>
              <Button
                onClick={() => setShowCreateNew(!showCreateNew)}
                variant="outline"
                size="sm"
              >
                {showCreateNew ? 'Cancel' : 'Create New'}
              </Button>
            </div>

            {showCreateNew && (
              <div className="mt-4 space-y-4">
                <div>
                  <label htmlFor="folderName" className="block text-sm font-medium text-gray-700">
                    Folder Name
                  </label>
                  <input
                    type="text"
                    id="folderName"
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                    placeholder="Invoice Collector"
                  />
                </div>
                <Button
                  onClick={handleCreateFolder}
                  disabled={isLoading}
                  className="w-full"
                >
                  {isLoading ? 'Creating...' : 'Create Folder and Continue'}
                </Button>
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="bg-gray-50 px-2 text-gray-500">or</span>
            </div>
          </div>

          {/* Select Existing Folder Option */}
          <div className="rounded-lg bg-white p-6 shadow">
            <h2 className="text-lg font-semibold text-gray-900">
              Select Existing Folder
            </h2>
            <p className="mt-1 text-sm text-gray-600">
              Choose an existing folder from your Google Drive
            </p>

            <div className="mt-4 space-y-4">
              {isLoading && folders.length === 0 ? (
                <div className="text-center py-8">
                  <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent"></div>
                  <p className="mt-2 text-sm text-gray-600">Loading folders...</p>
                </div>
              ) : folders.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">
                  No folders found. Create a new folder above.
                </p>
              ) : (
                <>
                  <div className="max-h-64 space-y-2 overflow-y-auto">
                    {folders.map((folder) => (
                      <label
                        key={folder.id}
                        className={`flex cursor-pointer items-center rounded-lg border p-4 transition-colors ${
                          selectedFolder === folder.id
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200 hover:bg-gray-50'
                        }`}
                      >
                        <input
                          type="radio"
                          name="folder"
                          value={folder.id}
                          checked={selectedFolder === folder.id}
                          onChange={(e) => setSelectedFolder(e.target.value)}
                          className="h-4 w-4 text-blue-600"
                        />
                        <div className="ml-3">
                          <p className="font-medium text-gray-900">{folder.name}</p>
                          {folder.path && (
                            <p className="text-sm text-gray-500">{folder.path}</p>
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
                    {isLoading ? 'Saving...' : 'Continue with Selected Folder'}
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="mt-8 rounded-lg border border-blue-200 bg-blue-50 p-4">
          <p className="text-sm text-blue-900">
            <strong>What happens next:</strong> We'll create a "Pending Approval" subfolder where new invoices will be saved.
            When you approve an invoice, it will be moved to "Approved/MM-YYYY" folders organized by month.
          </p>
        </div>
      </div>
    </div>
  )
}

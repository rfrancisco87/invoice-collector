import { google } from 'googleapis'

export interface DriveFolder {
  id: string
  name: string
  path: string
}

export async function getDriveClient(accessToken: string) {
  const auth = new google.auth.OAuth2()
  auth.setCredentials({ access_token: accessToken })

  return google.drive({ version: 'v3', auth })
}

export async function listDriveFolders(accessToken: string, parentId: string = 'root'): Promise<DriveFolder[]> {
  const drive = await getDriveClient(accessToken)

  const response = await drive.files.list({
    q: `mimeType='application/vnd.google-apps.folder' and trashed=false and '${parentId}' in parents`,
    fields: 'files(id, name, parents)',
    pageSize: 1000,
    orderBy: 'name',
  })

  const folders = response.data.files || []

  // Convert to our folder format with filtering
  return folders
    .filter(folder => {
      const name = folder.name || ''

      // Strict exclusions - filter out system and temp folders
      if (name.startsWith('.')) return false
      if (name.includes('$')) return false
      if (name.includes('#')) return false
      if (name.includes('.tmp')) return false
      if (name === 'node_modules') return false
      if (name === '__MACOSX') return false
      if (name === 'System Volume Information') return false
      if (name === 'vendor') return false

      return true
    })
    .map(folder => ({
      id: folder.id!,
      name: folder.name!,
      path: folder.name!, // Simplified - we can enhance this later with full paths
    }))
}

export async function createDriveFolder(
  accessToken: string,
  folderName: string,
  parentId?: string
): Promise<DriveFolder> {
  const drive = await getDriveClient(accessToken)

  const fileMetadata: any = {
    name: folderName,
    mimeType: 'application/vnd.google-apps.folder',
  }

  if (parentId) {
    fileMetadata.parents = [parentId]
  }

  const response = await drive.files.create({
    requestBody: fileMetadata,
    fields: 'id, name',
  })

  return {
    id: response.data.id!,
    name: response.data.name!,
    path: response.data.name!,
  }
}

export async function ensureFolderExists(
  accessToken: string,
  folderName: string,
  parentId: string
): Promise<DriveFolder> {
  const drive = await getDriveClient(accessToken)

  // Check if folder exists
  const listResponse = await drive.files.list({
    q: `mimeType='application/vnd.google-apps.folder' and trashed=false and '${parentId}' in parents and name='${folderName}'`,
    fields: 'files(id, name, parents)',
  })

  if (listResponse.data.files && listResponse.data.files.length > 0) {
    const folder = listResponse.data.files[0]
    return {
      id: folder.id!,
      name: folder.name!,
      path: folder.name!,
    }
  }

  // If not, create it
  return createDriveFolder(accessToken, folderName, parentId)
}

export async function createFolderStructure(
  accessToken: string,
  baseFolderId: string,
  createInbox: boolean = false
): Promise<{ pendingId: string, approvedId: string, inboxId?: string }> {

  // Ensure "Pending Approval" folder
  const pendingFolder = await ensureFolderExists(
    accessToken,
    'Pending Approval',
    baseFolderId
  )

  // Ensure "Approved" folder
  const approvedFolder = await ensureFolderExists(
    accessToken,
    'Approved',
    baseFolderId
  )

  let inboxId: string | undefined

  if (createInbox) {
    const inboxFolder = await ensureFolderExists(
      accessToken,
      'Inbox',
      baseFolderId
    )
    inboxId = inboxFolder.id
  }

  return {
    pendingId: pendingFolder.id,
    approvedId: approvedFolder.id,
    inboxId
  }
}

export async function getFolderHierarchy(accessToken: string, folderId: string): Promise<DriveFolder[]> {
  const drive = await getDriveClient(accessToken)
  const hierarchy: DriveFolder[] = []
  let currentId = folderId

  while (currentId) {
    try {
      const response = await drive.files.get({
        fileId: currentId,
        fields: 'id, name, parents',
      })

      const file = response.data

      // Add to beginning of array since we're traversing up
      hierarchy.unshift({
        id: file.id!,
        name: file.name!,
        path: file.name!,
      })

      // Move up to parent
      if (file.parents && file.parents.length > 0) {
        currentId = file.parents[0]
      } else {
        // Reached root or orphan
        break
      }
    } catch (error) {
      console.error(`Error fetching folder ${currentId}:`, error)
      break
    }
  }

  return hierarchy
}

export async function deleteDriveFolder(
  accessToken: string,
  folderId: string
): Promise<void> {
  const drive = await getDriveClient(accessToken)

  await drive.files.delete({
    fileId: folderId,
  })
}

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

export async function listDriveFolders(accessToken: string): Promise<DriveFolder[]> {
  const drive = await getDriveClient(accessToken)

  const response = await drive.files.list({
    q: "mimeType='application/vnd.google-apps.folder' and trashed=false",
    fields: 'files(id, name, parents)',
    pageSize: 100,
    orderBy: 'name',
  })

  const folders = response.data.files || []

  // Convert to our folder format
  return folders.map(folder => ({
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

export async function createFolderStructure(
  accessToken: string,
  baseFolderId: string
): Promise<{ pendingId: string }> {
  // Create "Pending Approval" subfolder
  const pendingFolder = await createDriveFolder(
    accessToken,
    'Pending Approval',
    baseFolderId
  )

  // Create "Approved" subfolder (we'll create monthly subfolders as needed)
  await createDriveFolder(accessToken, 'Approved', baseFolderId)

  return {
    pendingId: pendingFolder.id,
  }
}

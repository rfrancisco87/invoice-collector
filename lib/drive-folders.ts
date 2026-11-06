import type { drive_v3 } from 'googleapis'

const FOLDER_MIME = 'application/vnd.google-apps.folder'

/** Find a folder by name under parentId, creating it if missing. */
export async function findOrCreateChildFolder(
  drive: drive_v3.Drive,
  name: string,
  parentId: string,
): Promise<string> {
  const existing = await drive.files.list({
    q: `name='${name}' and '${parentId}' in parents and trashed=false`,
    fields: 'files(id)',
  })
  const id = existing.data.files?.[0]?.id
  if (id) return id

  const created = await drive.files.create({
    requestBody: { name, mimeType: FOLDER_MIME, parents: [parentId] },
    fields: 'id',
  })
  return created.data.id!
}

/**
 * Resolve the Approved/MM-YYYY folder for a document received on receivedDate.
 * If the user picked an existing approved folder, MM-YYYY goes inside it;
 * otherwise an "Approved" folder under their main Drive folder is used.
 */
export async function resolveApprovedMonthFolder(
  drive: drive_v3.Drive,
  settings: {
    drive_folder_id: string
    approved_folder_mode?: string | null
    approved_folder_id?: string | null
    approved_folder_name?: string | null
  },
  receivedDate: string,
): Promise<{ folderId: string; path: string }> {
  const date = new Date(receivedDate)
  const monthYear = `${String(date.getMonth() + 1).padStart(2, '0')}-${date.getFullYear()}`

  let parentId: string
  let parentName: string
  if (settings.approved_folder_mode === 'existing' && settings.approved_folder_id) {
    parentId = settings.approved_folder_id
    parentName = settings.approved_folder_name || 'Approved'
  } else {
    parentId = await findOrCreateChildFolder(drive, 'Approved', settings.drive_folder_id)
    parentName = 'Approved'
  }

  const folderId = await findOrCreateChildFolder(drive, monthYear, parentId)
  return { folderId, path: `${parentName}/${monthYear}` }
}

/** Move a file into targetFolderId, detaching it from all its current parents. */
export async function moveFileToFolder(
  drive: drive_v3.Drive,
  fileId: string,
  targetFolderId: string,
  requestBody?: drive_v3.Schema$File,
) {
  const meta = await drive.files.get({ fileId, fields: 'parents' })
  const currentParents = (meta.data.parents || []).filter(p => p !== targetFolderId).join(',')
  await drive.files.update({
    fileId,
    addParents: targetFolderId,
    removeParents: currentParents || undefined,
    requestBody,
    fields: 'id, parents, name',
  })
}

import { google } from 'googleapis'
import crypto from 'crypto'

export interface InboxDocument {
    driveFileId: string
    filename: string
    mimeType: string
    data: Buffer
    modifiedDate: Date
    createdDate: Date
    fileHash: string
}

export interface ScanInboxDebugInfo {
    folderId: string
    filesFound: number
    pdfFilesFound: number
    lastSyncDate: string | null
    filesAfterFilter: number
}

/**
 * Scan a Google Drive inbox folder for PDF files
 * @param accessToken - Google OAuth access token
 * @param folderId - Drive folder ID to scan
 * @param lastSyncDate - Optional date to filter files modified after this date
 * @returns Array of inbox documents and debug info
 */
export async function scanInboxFolder(
    accessToken: string,
    folderId: string,
    lastSyncDate?: Date
): Promise<{ documents: InboxDocument[]; debug: ScanInboxDebugInfo }> {
    const auth = new google.auth.OAuth2()
    auth.setCredentials({ access_token: accessToken })
    const drive = google.drive({ version: 'v3', auth })

    const documents: InboxDocument[] = []

    // Build query to find PDF files in the folder
    let query = `'${folderId}' in parents and mimeType='application/pdf' and trashed=false`

    // We do NOT filter by modifiedTime because files moved to the Inbox
    // might have old modification dates. We rely on DB duplicate checks (file_hash)
    // to avoid reprocessing.
    // if (lastSyncDate) {
    //    query += ` and modifiedTime > '${lastSyncDate.toISOString()}'`
    // }

    const debugInfo: ScanInboxDebugInfo = {
        folderId,
        filesFound: 0,
        pdfFilesFound: 0,
        lastSyncDate: lastSyncDate?.toISOString() || null,
        filesAfterFilter: 0,
    }

    try {
        // List files with pagination support
        let pageToken: string | undefined = undefined

        do {
            const response = await drive.files.list({
                q: query,
                fields: 'nextPageToken, files(id, name, mimeType, modifiedTime, createdTime)',
                pageSize: 100,
                pageToken,
                orderBy: 'modifiedTime desc',
            })

            const files = response.data.files || []
            debugInfo.filesFound += files.length
            debugInfo.pdfFilesFound += files.length

            for (const file of files) {
                if (!file.id || !file.name) continue

                try {
                    // Download file content
                    const fileResponse = await drive.files.get(
                        {
                            fileId: file.id,
                            alt: 'media',
                        },
                        { responseType: 'arraybuffer' }
                    )

                    const data = Buffer.from(fileResponse.data as ArrayBuffer)
                    const fileHash = crypto.createHash('sha256').update(data).digest('hex')

                    documents.push({
                        driveFileId: file.id,
                        filename: file.name,
                        mimeType: file.mimeType || 'application/pdf',
                        data,
                        modifiedDate: file.modifiedTime ? new Date(file.modifiedTime) : new Date(),
                        createdDate: file.createdTime ? new Date(file.createdTime) : new Date(),
                        fileHash,
                    })

                    debugInfo.filesAfterFilter++
                } catch (error) {
                    console.error(`Error downloading file ${file.id} (${file.name}):`, error)
                    // Continue with other files
                }
            }

            pageToken = response.data.nextPageToken || undefined
        } while (pageToken)

        console.log(`[InboxScanner] Scanned folder ${folderId}: found ${documents.length} PDF files`)

        return { documents, debug: debugInfo }
    } catch (error) {
        console.error('[InboxScanner] Error scanning inbox folder:', error)
        throw new Error(`Failed to scan inbox folder: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
}

/**
 * Delete a file from Google Drive
 * @param accessToken - Google OAuth access token
 * @param fileId - Drive file ID to delete
 */
export async function deleteInboxFile(
    accessToken: string,
    fileId: string
): Promise<void> {
    const auth = new google.auth.OAuth2()
    auth.setCredentials({ access_token: accessToken })
    const drive = google.drive({ version: 'v3', auth })

    try {
        await drive.files.delete({ fileId })
        console.log(`[InboxScanner] Deleted file ${fileId} from inbox`)
    } catch (error) {
        console.error(`[InboxScanner] Error deleting file ${fileId}:`, error)
        throw new Error(`Failed to delete inbox file: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
}

import JSZip from 'jszip';
import type { ProjectFile } from './types';
import { notify } from './notifications';

/**
 * Packages all workspace folders and files into a downloadable ZIP archive.
 */
export async function exportWorkspaceAsZip(
  projectName: string,
  files: ProjectFile[],
  getFileContent: (fileId: string) => Promise<string>
): Promise<void> {
  notify.exportStarted();

  let objectUrl: string | null = null;
  let link: HTMLAnchorElement | null = null;

  try {
    const zip = new JSZip();
    const safeProjectName = projectName.trim() || 'workspace';
    const rootFolder = zip.folder(safeProjectName) ?? zip;

    for (const file of files) {
      const normalizedPath = file.path.replace(/^\/+/, '');
      if (!normalizedPath) continue;

      if (file.isFolder) {
        rootFolder.folder(normalizedPath);
      } else {
        const content = await getFileContent(file._id);
        rootFolder.file(normalizedPath, content);
      }
    }

    const blob = await zip.generateAsync({ type: 'blob' });
    objectUrl = URL.createObjectURL(blob);
    const zipFileName = `${safeProjectName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'obsidian'}-workspace.zip`;

    link = document.createElement('a');
    link.href = objectUrl;
    link.download = zipFileName;
    document.body.appendChild(link);
    link.click();

    notify.exportCompleted(zipFileName);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unable to generate ZIP archive';
    notify.error('Export Failed', message);
  } finally {
    if (link && link.parentNode) {
      link.parentNode.removeChild(link);
    }
    if (objectUrl) {
      // Some browsers resolve the download asynchronously; revoking in this tick can
      // cancel it before it starts.
      const urlToRevoke = objectUrl;
      setTimeout(() => URL.revokeObjectURL(urlToRevoke), 1000);
    }
  }
}

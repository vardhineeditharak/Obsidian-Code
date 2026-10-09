import JSZip from 'jszip';
import { ProjectFile } from './types';
import { notify } from './notifications';

export async function exportWorkspaceAsZip(
  projectName: string,
  files: ProjectFile[],
  getFileContent: (fileId: string) => Promise<string>
): Promise<void> {
  notify.exportStarted();
  try {
    const zip = new JSZip();
    const folder = zip.folder(projectName) || zip;

    // Build directory tree and write contents
    for (const file of files) {
      if (file.isFolder) {
        folder.folder(file.path);
      } else {
        const content = await getFileContent(file._id);
        folder.file(file.path, content);
      }
    }

    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const zipFileName = `${projectName.toLowerCase().replace(/[^a-z0-9]/g, '-')}-workspace.zip`;
    link.href = url;
    link.download = zipFileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    notify.exportCompleted(zipFileName);
  } catch (err: unknown) {
    notify.error('Export Failed', (err as Error).message || 'Unable to generate ZIP archive');
  }
}

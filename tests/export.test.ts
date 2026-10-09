import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';

describe('Workspace ZIP Archive Packaging', () => {
  it('packages files and directory hierarchy into a valid zip archive', async () => {
    const zip = new JSZip();
    const folder = zip.folder('my-project');

    folder?.file('index.html', '<!DOCTYPE html><html><body><h1>Test</h1></body></html>');
    folder?.file('src/app.js', 'console.log("hello");');
    folder?.file('README.md', '# My Project');

    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
    expect(zipBuffer.length).toBeGreaterThan(0);

    // Verify unzipping
    const loadedZip = await JSZip.loadAsync(zipBuffer);
    expect(loadedZip.file('my-project/index.html')).toBeDefined();
    expect(loadedZip.file('my-project/src/app.js')).toBeDefined();
    expect(loadedZip.file('my-project/README.md')).toBeDefined();

    const readHtml = await loadedZip.file('my-project/index.html')?.async('string');
    expect(readHtml).toContain('<h1>Test</h1>');
  });
});

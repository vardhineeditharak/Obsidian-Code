const EXTENSION_LANGUAGE_MAP: Record<string, string> = {
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  py: 'python',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  hpp: 'cpp',
  java: 'java',
  go: 'go',
  rb: 'ruby',
  php: 'php',
  sh: 'bash',
  bash: 'bash',
  html: 'html',
  htm: 'html',
  css: 'css',
  scss: 'css',
  json: 'json',
  md: 'markdown',
  markdown: 'markdown',
  sql: 'sql',
};

/**
 * Maps a filename extension to its Monaco and runtime language identifier.
 */
export function detectLanguage(fileName: string): string {
  const lastDot = fileName.lastIndexOf('.');
  if (lastDot <= 0 || lastDot === fileName.length - 1) {
    return 'plaintext';
  }
  const ext = fileName.slice(lastDot + 1).toLowerCase();
  return EXTENSION_LANGUAGE_MAP[ext] ?? 'plaintext';
}

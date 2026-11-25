import { loader } from '@monaco-editor/react';

/**
 * Configure @monaco-editor/react loader with pinned Monaco 0.57.0 matching package.json.
 */
loader.config({
  paths: {
    vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.57.0/min/vs',
  },
});

export default loader;

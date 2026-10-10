import { loader } from '@monaco-editor/react';

/**
 * Configure @monaco-editor/react loader.
 * Explicitly pins Monaco version to 0.57.0 to match package.json (v0.57.0),
 * resolving the default 0.55.1 CDN version skew and network measurement drift.
 */
loader.config({
  paths: {
    vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.57.0/min/vs',
  },
});

export default loader;

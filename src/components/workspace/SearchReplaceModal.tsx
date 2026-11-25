import React, { useState, useMemo, useEffect, useRef } from 'react';
import { X, Search, Replace, ChevronRight, ChevronDown, FileCode, AlertCircle } from 'lucide-react';
import { ProjectFile } from '../../lib/types';
import { notify } from '../../lib/notifications';

interface SearchResult {
  fileId: string;
  fileName: string;
  line: number;
  column: number;
  lineText: string;
  matchText: string;
}

export interface SearchReplaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  files: ProjectFile[];
  getFileContent: (fileId: string) => Promise<string>;
  onSelectResult: (fileId: string, line: number, column: number, matchLength?: number) => void;
  onBatchReplace: (replacements: { fileId: string; newContent: string }[]) => Promise<void>;
  onBeforeSearch?: () => Promise<ProjectFile[] | void>;
}

const MAX_SEARCH_RESULTS = 2000;

function buildSearchRegex(
  query: string,
  options: { caseSensitive: boolean; wholeWord: boolean; useRegex: boolean }
): RegExp {
  let pattern = options.useRegex
    ? query
    : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (options.wholeWord) {
    pattern = `\\b${pattern}\\b`;
  }
  const flags = options.caseSensitive ? 'g' : 'gi';
  return new RegExp(pattern, flags);
}

export const SearchReplaceModal: React.FC<SearchReplaceModalProps> = ({
  isOpen,
  onClose,
  files,
  getFileContent,
  onSelectResult,
  onBatchReplace,
  onBeforeSearch,
}) => {
  const [query, setQuery] = useState('');
  const [replacement, setReplacement] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [isCapped, setIsCapped] = useState(false);
  const [collapsedFiles, setCollapsedFiles] = useState<Record<string, boolean>>({});
  const [resultSignature, setResultSignature] = useState('');

  const inputRef = useRef<HTMLInputElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Keep all React hooks strictly above the early return below
  useEffect(() => {
    if (!isOpen) return;
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    const timer = setTimeout(() => inputRef.current?.focus(), 50);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', handleKeyDown);
      if (previouslyFocusedRef.current && typeof previouslyFocusedRef.current.focus === 'function') {
        previouslyFocusedRef.current.focus();
      }
    };
  }, [isOpen]);

  // A result list is only valid for the query/options that produced it.
  useEffect(() => {
    setResults([]);
    setResultSignature('');
    setHasSearched(false);
    setIsCapped(false);
  }, [query, caseSensitive, wholeWord, useRegex]);

  const groupedResults = useMemo(() => {
    const map = new Map<string, SearchResult[]>();
    for (const r of results) {
      const existing = map.get(r.fileId);
      if (existing) {
        existing.push(r);
      } else {
        map.set(r.fileId, [r]);
      }
    }
    return map;
  }, [results]);

  if (!isOpen) return null;

  const handleSearch = async () => {
    if (!query.trim()) {
      setResults([]);
      setIsCapped(false);
      setHasSearched(false);
      return;
    }

    let regex: RegExp;
    try {
      regex = buildSearchRegex(query, { caseSensitive, wholeWord, useRegex });
    } catch (err: unknown) {
      notify.error('Invalid Regex', err instanceof Error ? err.message : 'Invalid regular expression');
      return;
    }

    setSearching(true);
    setIsCapped(false);
    setHasSearched(true);

    try {
      let filesToSearch = files;
      if (onBeforeSearch) {
        try {
          const refreshed = await onBeforeSearch();
          if (Array.isArray(refreshed)) filesToSearch = refreshed;
        } catch (e) {
          console.warn('Failed to refresh files before search:', e);
        }
      }

      const searchResults: SearchResult[] = [];
      let capped = false;

      for (const file of filesToSearch) {
        if (file.isFolder) continue;
        if (searchResults.length >= MAX_SEARCH_RESULTS) {
          capped = true;
          break;
        }
        const content = await getFileContent(file._id);
        const lines = content.split('\n');

        for (let lIdx = 0; lIdx < lines.length; lIdx++) {
          if (searchResults.length >= MAX_SEARCH_RESULTS) {
            capped = true;
            break;
          }
          const lineText = lines[lIdx];
          regex.lastIndex = 0;
          let match: RegExpExecArray | null;
          while ((match = regex.exec(lineText)) !== null) {
            // Guard against infinite loops on zero-length matches (e.g. a*, x?, \b)
            if (match[0] === '') {
              regex.lastIndex += 1;
              continue;
            }

            searchResults.push({
              fileId: file._id,
              fileName: file.name,
              line: lIdx + 1,
              column: match.index + 1,
              lineText,
              matchText: match[0],
            });

            if (searchResults.length >= MAX_SEARCH_RESULTS) {
              capped = true;
              break;
            }
            if (!regex.global) break;
          }
        }
      }

      setResults(searchResults);
      setResultSignature(`${query}\u0000${caseSensitive}\u0000${wholeWord}\u0000${useRegex}`);
      setIsCapped(capped);
    } catch (err: unknown) {
      notify.error('Search failed', err instanceof Error ? err.message : 'Unable to scan workspace files');
    } finally {
      setSearching(false);
    }
  };

  const handleBatchReplace = async () => {
    if (!query || results.length === 0) return;

    const currentSignature = `${query}\u0000${caseSensitive}\u0000${wholeWord}\u0000${useRegex}`;
    if (resultSignature !== currentSignature) {
      notify.error('Search changed', 'Run the search again before replacing occurrences.');
      return;
    }

    let regex: RegExp;
    try {
      regex = buildSearchRegex(query, { caseSensitive, wholeWord, useRegex });
    } catch (err: unknown) {
      notify.error('Invalid Regex', err instanceof Error ? err.message : 'Invalid regular expression');
      return;
    }

    try {
      const batch: { fileId: string; newContent: string }[] = [];
      let changedFiles = 0;
      for (const fileId of groupedResults.keys()) {
        const content = await getFileContent(fileId);
        const replaced = content.replace(regex, replacement);
        if (replaced !== content) changedFiles += 1;
        batch.push({ fileId, newContent: replaced });
      }
      if (changedFiles === 0) {
        notify.error('No matches', 'Nothing matched the current query in the listed files.');
        return;
      }

      await onBatchReplace(batch);
      notify.success(`Replaced occurrences across ${changedFiles} files`);
      setResults([]);
      setIsCapped(false);
      setHasSearched(false);
      onClose();
    } catch (err: unknown) {
      notify.error('Replace failed', err instanceof Error ? err.message : 'Unable to replace occurrences');
    }
  };

  const toggleCollapse = (fileId: string) => {
    setCollapsedFiles((prev) => ({ ...prev, [fileId]: !prev[fileId] }));
  };

  const renderHighlightedLine = (matchItem: SearchResult) => {
    const { lineText, matchText, column } = matchItem;
    if (!matchText) return lineText;
    const startIdx = Math.max(0, column - 1);
    const candidate = lineText.slice(startIdx, startIdx + matchText.length);
    if (
      (caseSensitive && candidate === matchText) ||
      (!caseSensitive && candidate.toLowerCase() === matchText.toLowerCase())
    ) {
      return (
        <>
          <span>{lineText.slice(0, startIdx)}</span>
          <mark className="bg-selection/40 text-ink rounded-sm px-0.5">{candidate}</mark>
          <span>{lineText.slice(startIdx + matchText.length)}</span>
        </>
      );
    }
    return lineText;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center modal-scrim p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Workspace Search & Replace"
    >
      <div
        className="w-full max-w-2xl h-[75vh] rounded-2xl overflow-hidden glass-modal flex flex-col modal-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-(--border-subtle) bg-bone/60">
          <div className="flex items-center gap-2.5">
            <Search className="w-4 h-4 text-ash" />
            <h2 className="text-[15px] font-medium tracking-[-0.015em] text-ink flex items-center gap-2">
              <span>Workspace Search & Replace</span>
              {results.length > 0 && (
                <span className="text-[12px] font-sans tabular-nums text-mist font-normal">
                  ({results.length} result{results.length === 1 ? '' : 's'} in{' '}
                  {groupedResults.size} file{groupedResults.size === 1 ? '' : 's'})
                </span>
              )}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="w-7 h-7 flex items-center justify-center rounded-lg text-ash hover:text-ink hover:bg-white/8 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Input Bar */}
        <div className="p-4 space-y-2.5 bg-bone/40 border-b border-(--border-subtle)">
          {/* Find Row */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <input
                ref={inputRef}
                type="text"
                placeholder="Search across files..."
                aria-label="Search across files"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSearch();
                  }
                }}
                className="input-atelier w-full h-9 text-[12.5px] font-mono"
              />
            </div>

            {/* Modifiers */}
            <div
              className="flex items-center apple-segmented rounded-md p-0.5 h-9"
              role="group"
              aria-label="Search modifiers"
            >
              <button
                type="button"
                onClick={() => setCaseSensitive((prev) => !prev)}
                title="Match Case"
                aria-label="Match Case"
                aria-pressed={caseSensitive}
                className={`px-2.5 h-full text-[12px] font-mono rounded-sm transition focus:outline-none focus-visible:ring-1 focus-visible:ring-amber cursor-pointer ${
                  caseSensitive ? 'apple-segment-active text-ink' : 'text-ash hover:text-ink'
                }`}
              >
                Aa
              </button>
              <button
                type="button"
                onClick={() => setWholeWord((prev) => !prev)}
                title="Match Whole Word"
                aria-label="Match Whole Word"
                aria-pressed={wholeWord}
                className={`px-2.5 h-full text-[12px] font-mono rounded-sm transition focus:outline-none focus-visible:ring-1 focus-visible:ring-amber cursor-pointer ${
                  wholeWord ? 'apple-segment-active text-ink' : 'text-ash hover:text-ink'
                }`}
              >
                \b
              </button>
              <button
                type="button"
                onClick={() => setUseRegex((prev) => !prev)}
                title="Use Regular Expression"
                aria-label="Use Regular Expression"
                aria-pressed={useRegex}
                className={`px-2.5 h-full text-[12px] font-mono rounded-sm transition focus:outline-none focus-visible:ring-1 focus-visible:ring-amber cursor-pointer ${
                  useRegex ? 'apple-segment-active text-ink' : 'text-ash hover:text-ink'
                }`}
              >
                .*
              </button>
            </div>

            <button
              type="button"
              onClick={handleSearch}
              disabled={searching}
              className="btn-primary min-h-0 h-9 px-4 text-[12.5px] disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber"
            >
              {searching ? 'Finding...' : 'Find'}
            </button>
          </div>

          {/* Replace Row */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                placeholder="Replace with..."
                aria-label="Replace with"
                value={replacement}
                onChange={(e) => setReplacement(e.target.value)}
                className="input-atelier w-full h-9 text-[12.5px] font-mono"
              />
            </div>
            <button
              type="button"
              onClick={handleBatchReplace}
              disabled={results.length === 0}
              className="btn-secondary min-h-0 h-9 px-3.5 text-[12.5px] flex items-center gap-1.5 tabular-nums disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber"
            >
              <Replace className="w-3.5 h-3.5" />
              <span>Replace All ({results.length})</span>
            </button>
          </div>
        </div>

        {/* Results Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5 bg-parchment/70 selectable-text">
          {isCapped && (
            <div className="flex items-center gap-2 px-3 py-2 bg-amber/10 border border-amber/20 text-amber text-[12px] font-sans rounded-lg">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>Showing first 2000 matches (capped for performance)</span>
            </div>
          )}

          {results.length === 0 && (
            <p className="text-center text-mist text-[13px] font-sans py-12">
              {hasSearched && query.trim()
                ? 'No matching occurrences found in project files.'
                : 'Enter a query and click Find to search.'}
            </p>
          )}

          {Array.from(groupedResults.entries()).map(([fileId, matches]) => {
            const fileName = matches[0]?.fileName || 'File';
            const isCollapsed = !!collapsedFiles[fileId];

            return (
              <div
                key={fileId}
                className="rounded-xl border border-(--border-subtle) bg-bone inset-glow overflow-hidden"
              >
                <button
                  type="button"
                  aria-expanded={!isCollapsed}
                  onClick={() => toggleCollapse(fileId)}
                  className="w-full flex items-center justify-between px-3.5 py-2 bg-white/3 text-left hover:bg-white/6 transition cursor-pointer"
                >
                  <div className="flex items-center gap-2 text-[12.5px] font-medium text-ink font-sans">
                    {isCollapsed ? (
                      <ChevronRight className="w-3.5 h-3.5 text-ash" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5 text-ash" />
                    )}
                    <FileCode className="w-3.5 h-3.5 text-ash" />
                    <span>{fileName}</span>
                  </div>
                  <span className="text-[11px] font-sans tabular-nums bg-white/6 text-ash px-2 py-0.5 rounded-full border border-white/8">
                    {matches.length}
                  </span>
                </button>

                {!isCollapsed && (
                  <div className="divide-y divide-white/5 font-mono text-[12px]">
                    {matches.map((m, idx) => (
                      <button
                        key={`${m.fileId}-${m.line}-${m.column}-${idx}`}
                        type="button"
                        onClick={() => {
                          onSelectResult(m.fileId, m.line, m.column, m.matchText.length || 0);
                          onClose();
                        }}
                        className="w-full text-left px-4 py-1.5 hover:bg-white/5 flex items-baseline gap-3 transition group cursor-pointer"
                      >
                        <span className="text-mist text-[11px] tabular-nums w-8 shrink-0">{m.line}:</span>
                        <span className="text-driftwood truncate group-hover:text-ink">
                          {renderHighlightedLine(m)}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

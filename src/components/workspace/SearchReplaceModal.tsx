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

interface SearchReplaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  files: ProjectFile[];
  getFileContent: (fileId: string) => Promise<string>;
  onSelectResult: (fileId: string, line: number, column: number, matchLength?: number) => void;
  onBatchReplace: (replacements: { fileId: string; newContent: string }[]) => Promise<void>;
  onBeforeSearch?: () => Promise<void>;
}

const MAX_SEARCH_RESULTS = 2000;

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
  const [isCapped, setIsCapped] = useState(false);
  const [collapsedFiles, setCollapsedFiles] = useState<Record<string, boolean>>({});
  const inputRef = useRef<HTMLInputElement>(null);

  // ESC keydown listener
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Autofocus input on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSearch = async () => {
    if (!query.trim()) {
      setResults([]);
      setIsCapped(false);
      return;
    }

    setSearching(true);
    setIsCapped(false);

    try {
      if (onBeforeSearch) {
        await onBeforeSearch();
      }
    } catch (e) {
      console.warn('Failed to refresh files before search:', e);
    }

    const searchResults: SearchResult[] = [];
    let capped = false;

    let regex: RegExp;
    try {
      let pattern = useRegex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (wholeWord) pattern = `\\b${pattern}\\b`;
      const flags = caseSensitive ? 'g' : 'gi';
      regex = new RegExp(pattern, flags);
    } catch (err: any) {
      notify.error('Invalid Regex', err.message);
      setSearching(false);
      return;
    }

    for (const file of files) {
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
        let match;
        while ((match = regex.exec(lineText)) !== null) {
          // Guard against infinite loop on zero-length matches (e.g. x*, a?, \b)
          if (match[0] === '') {
            regex.lastIndex++;
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
    setIsCapped(capped);
    setSearching(false);
  };

  const groupedResults = useMemo(() => {
    const map = new Map<string, SearchResult[]>();
    for (const r of results) {
      if (!map.has(r.fileId)) map.set(r.fileId, []);
      map.get(r.fileId)!.push(r);
    }
    return map;
  }, [results]);

  const handleBatchReplace = async () => {
    if (!query || results.length === 0) return;

    let regex: RegExp;
    try {
      let pattern = useRegex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (wholeWord) pattern = `\\b${pattern}\\b`;
      const flags = caseSensitive ? 'g' : 'gi';
      regex = new RegExp(pattern, flags);
    } catch (err: any) {
      notify.error('Invalid Regex', err.message);
      return;
    }

    const batch: { fileId: string; newContent: string }[] = [];
    for (const fileId of groupedResults.keys()) {
      const content = await getFileContent(fileId);
      const replaced = content.replace(regex, replacement);
      batch.push({ fileId, newContent: replaced });
    }

    await onBatchReplace(batch);
    notify.success(`Replaced occurrences across ${groupedResults.size} files`);
    setResults([]);
    setIsCapped(false);
    onClose();
  };

  const toggleCollapse = (fileId: string) => {
    setCollapsedFiles((prev) => ({ ...prev, [fileId]: !prev[fileId] }));
  };

  const renderHighlightedLine = (lineText: string, matchText: string, column?: number) => {
    if (!matchText) return lineText;
    const lowerLine = lineText.toLowerCase();
    const lowerMatch = matchText.toLowerCase();
    let idx = -1;
    if (column !== undefined && column > 0) {
      const candidateIdx = column - 1;
      const candidateSegment = lineText.slice(candidateIdx, candidateIdx + matchText.length);
      const isCandidateMatch = caseSensitive
        ? candidateSegment === matchText
        : candidateSegment.toLowerCase() === lowerMatch;
      if (isCandidateMatch) {
        idx = candidateIdx;
      }
    }
    if (idx === -1) {
      idx = caseSensitive ? lineText.indexOf(matchText) : lowerLine.indexOf(lowerMatch);
    }
    if (idx === -1) return lineText;

    const before = lineText.slice(0, idx);
    const matched = lineText.slice(idx, idx + matchText.length);
    const after = lineText.slice(idx + matchText.length);

    return (
      <>
        <span>{before}</span>
        <mark className="bg-selection/40 text-ink rounded-sm px-0.5">{matched}</mark>
        <span>{after}</span>
      </>
    );
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
        className="w-full max-w-2xl h-[75vh] rounded-xl overflow-hidden border border-stone bg-bone shadow-2xl flex flex-col modal-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3.5 border-b border-stone bg-bone">
          <div className="flex items-center space-x-2">
            <Search className="w-5 h-5 text-ash" />
            <h2 className="text-base font-normal text-ink flex items-center gap-2">
              <span>Workspace Search & Replace</span>
              {results.length > 0 && (
                <span className="text-xs font-mono text-mist">
                  ({results.length} result{results.length === 1 ? '' : 's'} in {groupedResults.size} file{groupedResults.size === 1 ? '' : 's'})
                </span>
              )}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="p-1 rounded-md text-ash hover:text-ink hover:bg-linen focus:outline-none focus-visible:ring-2 focus-visible:ring-ink dark:focus-visible:ring-parchment transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Input Bar */}
        <div className="p-4 space-y-3 bg-bone border-b border-stone">
          {/* Find row */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <input
                ref={inputRef}
                type="text"
                placeholder="Search across files..."
                aria-label="Search across files"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="w-full bg-surface border border-stone rounded-lg px-3 py-2 text-xs font-mono text-ink placeholder-mist focus:outline-none focus:ring-2 focus:ring-amber focus-visible:ring-2 focus-visible:ring-amber"
              />
            </div>

            {/* Modifiers */}
            <div className="flex items-center bg-surface border border-stone rounded-lg p-0.5 inset-glow" role="group" aria-label="Search modifiers">
              <button
                type="button"
                onClick={() => setCaseSensitive(!caseSensitive)}
                title="Match Case"
                aria-label="Match Case"
                aria-pressed={caseSensitive}
                className={`px-2 py-1 text-xs font-mono rounded-md transition focus:outline-none focus-visible:ring-1 focus-visible:ring-amber cursor-pointer ${
                  caseSensitive ? 'bg-linen text-ink border border-stone/50' : 'text-ash hover:text-ink'
                }`}
              >
                Aa
              </button>
              <button
                type="button"
                onClick={() => setWholeWord(!wholeWord)}
                title="Match Whole Word"
                aria-label="Match Whole Word"
                aria-pressed={wholeWord}
                className={`px-2 py-1 text-xs font-mono rounded-md transition focus:outline-none focus-visible:ring-1 focus-visible:ring-amber cursor-pointer ${
                  wholeWord ? 'bg-linen text-ink border border-stone/50' : 'text-ash hover:text-ink'
                }`}
              >
                \b
              </button>
              <button
                type="button"
                onClick={() => setUseRegex(!useRegex)}
                title="Use Regular Expression"
                aria-label="Use Regular Expression"
                aria-pressed={useRegex}
                className={`px-2 py-1 text-xs font-mono rounded-md transition focus:outline-none focus-visible:ring-1 focus-visible:ring-amber cursor-pointer ${
                  useRegex ? 'bg-linen text-ink border border-stone/50' : 'text-ash hover:text-ink'
                }`}
              >
                .*
              </button>
            </div>

            <button
              type="button"
              onClick={handleSearch}
              disabled={searching}
              className="btn-primary text-xs px-3.5 py-2 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber"
            >
              {searching ? 'Finding...' : 'Find'}
            </button>
          </div>

          {/* Replace row */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                placeholder="Replace with..."
                aria-label="Replace with"
                value={replacement}
                onChange={(e) => setReplacement(e.target.value)}
                className="w-full bg-surface border border-stone rounded-lg px-3 py-2 text-xs font-mono text-ink placeholder-mist focus:outline-none focus:ring-2 focus:ring-amber focus-visible:ring-2 focus-visible:ring-amber"
              />
            </div>
            <button
              type="button"
              onClick={handleBatchReplace}
              disabled={results.length === 0}
              className="btn-secondary text-xs px-3.5 py-2 flex items-center gap-1.5 disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber"
            >
              <Replace className="w-3.5 h-3.5" />
              <span>Replace All ({results.length})</span>
            </button>
          </div>
        </div>

        {/* Results Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-parchment selectable-text">
          {isCapped && (
            <div className="flex items-center gap-2 px-3 py-2 bg-amber/10 border border-amber/20 text-amber text-xs font-mono rounded-lg">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>Showing first 2000 matches (capped for performance)</span>
            </div>
          )}

          {results.length === 0 && (
            <p className="text-center text-mist text-xs py-12">
              {query ? 'No matching occurrences found in project files.' : 'Enter a query and click Find to search.'}
            </p>
          )}

          {Array.from(groupedResults.entries()).map(([fileId, matches]) => {
            const fileName = matches[0]?.fileName || 'File';
            const isCollapsed = collapsedFiles[fileId];

            return (
              <div key={fileId} className="rounded-lg border border-stone bg-bone inset-glow overflow-hidden">
                <button
                  onClick={() => toggleCollapse(fileId)}
                  className="w-full flex items-center justify-between px-3 py-2 bg-linen/40 text-left hover:bg-linen transition cursor-pointer"
                >
                  <div className="flex items-center gap-2 text-xs font-medium text-ink font-mono">
                    {isCollapsed ? <ChevronRight className="w-3.5 h-3.5 text-ash" /> : <ChevronDown className="w-3.5 h-3.5 text-ash" />}
                    <FileCode className="w-3.5 h-3.5 text-ash" />
                    <span>{fileName}</span>
                  </div>
                  <span className="text-[11px] bg-parchment text-ash px-2 py-0.5 rounded-md border border-stone font-mono">
                    {matches.length}
                  </span>
                </button>

                {!isCollapsed && (
                  <div className="divide-y divide-stone/30 font-mono text-xs">
                    {matches.map((m, idx) => (
                      <button
                        key={idx}
                        onClick={() => {
                          onSelectResult(m.fileId, m.line, m.column, m.matchText?.length || 0);
                          onClose();
                        }}
                        className="w-full text-left px-4 py-1.5 hover:bg-linen/60 flex items-baseline gap-3 transition group cursor-pointer"
                      >
                        <span className="text-mist text-[11px] w-6 shrink-0">{m.line}:</span>
                        <span className="text-driftwood truncate group-hover:text-ink">
                          {renderHighlightedLine(m.lineText, m.matchText, m.column)}
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

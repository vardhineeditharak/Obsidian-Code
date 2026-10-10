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

  const renderHighlightedLine = (lineText: string, matchText: string) => {
    if (!matchText) return lineText;
    const lowerLine = lineText.toLowerCase();
    const lowerMatch = matchText.toLowerCase();
    const idx = caseSensitive ? lineText.indexOf(matchText) : lowerLine.indexOf(lowerMatch);
    if (idx === -1) return lineText;

    const before = lineText.slice(0, idx);
    const matched = lineText.slice(idx, idx + matchText.length);
    const after = lineText.slice(idx + matchText.length);

    return (
      <>
        <span>{before}</span>
        <mark className="bg-blue-500/30 text-blue-200 rounded px-0.5">{matched}</mark>
        <span>{after}</span>
      </>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-6">
      <div className="glass-modal w-full max-w-2xl h-[75vh] rounded-xl overflow-hidden border border-white/10 shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3.5 border-b border-white/10 bg-slate-900/80">
          <div className="flex items-center space-x-2">
            <Search className="w-5 h-5 text-blue-400" />
            <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
              <span>Workspace Search & Replace</span>
              {results.length > 0 && (
                <span className="text-xs text-slate-400 font-normal">
                  ({results.length} result{results.length === 1 ? '' : 's'} in {groupedResults.size} file{groupedResults.size === 1 ? '' : 's'})
                </span>
              )}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-white/5 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Input Bar */}
        <div className="p-4 space-y-3 bg-slate-900/50 border-b border-white/10">
          {/* Find row */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <input
                ref={inputRef}
                type="text"
                placeholder="Search across files..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="w-full bg-slate-950/80 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* Modifiers */}
            <div className="flex items-center bg-slate-800/80 border border-white/10 rounded-lg p-0.5">
              <button
                onClick={() => setCaseSensitive(!caseSensitive)}
                title="Match Case"
                className={`px-2 py-1 text-xs font-semibold rounded ${
                  caseSensitive ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Aa
              </button>
              <button
                onClick={() => setWholeWord(!wholeWord)}
                title="Match Whole Word"
                className={`px-2 py-1 text-xs font-semibold rounded ${
                  wholeWord ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                \b
              </button>
              <button
                onClick={() => setUseRegex(!useRegex)}
                title="Use Regular Expression"
                className={`px-2 py-1 text-xs font-semibold rounded ${
                  useRegex ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                .*
              </button>
            </div>

            <button
              onClick={handleSearch}
              disabled={searching}
              className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition shadow-sm cursor-pointer"
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
                value={replacement}
                onChange={(e) => setReplacement(e.target.value)}
                className="w-full bg-slate-950/80 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>
            <button
              onClick={handleBatchReplace}
              disabled={results.length === 0}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-lg text-sm font-medium transition shadow-sm cursor-pointer"
            >
              <Replace className="w-4 h-4" />
              Replace All ({results.length})
            </button>
          </div>
        </div>

        {/* Results Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {isCapped && (
            <div className="flex items-center gap-2 px-3 py-2 bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs rounded-lg">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>Showing first 2000 matches (capped for performance)</span>
            </div>
          )}

          {results.length === 0 && (
            <p className="text-center text-slate-500 text-xs py-12">
              {query ? 'No matching occurrences found in project files.' : 'Enter a query and click Find to search.'}
            </p>
          )}

          {Array.from(groupedResults.entries()).map(([fileId, matches]) => {
            const fileName = matches[0]?.fileName || 'File';
            const isCollapsed = collapsedFiles[fileId];

            return (
              <div key={fileId} className="rounded-lg border border-white/10 bg-slate-900/40 overflow-hidden">
                <button
                  onClick={() => toggleCollapse(fileId)}
                  className="w-full flex items-center justify-between px-3 py-2 bg-slate-800/40 text-left hover:bg-slate-800/70 transition cursor-pointer"
                >
                  <div className="flex items-center gap-2 text-xs font-medium text-slate-200">
                    {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    <FileCode className="w-3.5 h-3.5 text-blue-400" />
                    <span>{fileName}</span>
                  </div>
                  <span className="text-[11px] bg-slate-700/60 text-slate-300 px-2 py-0.5 rounded-full font-mono">
                    {matches.length}
                  </span>
                </button>

                {!isCollapsed && (
                  <div className="divide-y divide-white/5 font-mono text-xs">
                    {matches.map((m, idx) => (
                      <button
                        key={idx}
                        onClick={() => {
                          onSelectResult(m.fileId, m.line, m.column, m.matchText?.length || 0);
                          onClose();
                        }}
                        className="w-full text-left px-4 py-1.5 hover:bg-blue-600/10 flex items-baseline gap-3 transition group cursor-pointer"
                      >
                        <span className="text-slate-500 text-[11px] w-6 shrink-0">{m.line}:</span>
                        <span className="text-slate-300 truncate group-hover:text-blue-200">
                          {renderHighlightedLine(m.lineText, m.matchText)}
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

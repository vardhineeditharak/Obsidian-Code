import React, { useState, useRef, useEffect } from 'react';
import { RefreshCw, AlertCircle, AlertTriangle } from 'lucide-react';
import { Trash, ChevronUp, ChevronDown } from '../ui/AnimatedIcon';
import { BottomTab, DiagnosticsItem, ExecutionResult } from '../../lib/types';
import { useResizable } from '../../lib/useResizable';
import { api } from '../../lib/api';

interface TerminalLine {
  id: string;
  kind: 'input' | 'stdout' | 'stderr' | 'system';
  text: string;
}

interface BottomPanelProps {
  isOpen: boolean;
  onToggle: () => void;
  activeTab: BottomTab;
  onTabChange: (tab: BottomTab) => void;
  executionResult: ExecutionResult | null;
  onClearOutput: () => void;
  diagnostics: DiagnosticsItem[];
  onSelectProblem: (fileId: string, line: number, column: number) => void;
  previewHtml: string;
  previewNonce?: number;
  onRefreshPreview: () => void;
  onRunTerminalCommand: (command: string) => Promise<ExecutionResult | null> | void;
  activeLanguage?: string;
  activeFileName?: string;
}

export const BottomPanel: React.FC<BottomPanelProps> = ({
  isOpen,
  onToggle,
  activeTab,
  onTabChange,
  executionResult,
  onClearOutput,
  diagnostics,
  onSelectProblem,
  previewHtml,
  previewNonce,
  onRefreshPreview,
  onRunTerminalCommand,
  activeLanguage = 'javascript',
  activeFileName,
}) => {
  const [termInput, setTermInput] = useState('');
  const [terminalLog, setTerminalLog] = useState<TerminalLine[]>([
    { id: 'init-1', kind: 'system', text: 'Obsidian Code Interactive Console. Type "help" for commands.' },
  ]);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const terminalEndRef = useRef<HTMLDivElement>(null);

  const initialMaxHeight = typeof window !== 'undefined' ? Math.floor(window.innerHeight * 0.7) : 500;
  const { size, dragHandleProps } = useResizable({
    key: 'bottomPanel',
    initial: 256,
    min: 120,
    max: initialMaxHeight,
    axis: 'y',
    reverse: true, // Dragging top handle upwards expands bottom panel
  });

  const errorCount = diagnostics.filter((d) => d.severity === 'error').length;
  const warnCount = diagnostics.filter((d) => d.severity === 'warning').length;

  useEffect(() => {
    if (activeTab === 'TERMINAL') {
      terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [terminalLog, activeTab]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length === 0) return;
      const nextIdx = historyIndex === -1 ? history.length - 1 : Math.max(0, historyIndex - 1);
      setHistoryIndex(nextIdx);
      setTermInput(history[nextIdx] || '');
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex === -1) return;
      const nextIdx = historyIndex + 1;
      if (nextIdx >= history.length) {
        setHistoryIndex(-1);
        setTermInput('');
      } else {
        setHistoryIndex(nextIdx);
        setTermInput(history[nextIdx] || '');
      }
    }
  };

  const promptLanguage = activeLanguage === 'javascript' ? 'node' : activeLanguage || 'shell';

  const handleTermSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const raw = termInput.trim();
    if (!raw) return;

    setHistory((prev) => [...prev, raw]);
    setHistoryIndex(-1);
    setTermInput('');

    const promptText = `${promptLanguage} ❯ ${raw}`;
    const newLines: TerminalLine[] = [
      { id: String(Date.now()), kind: 'input', text: promptText },
    ];

    const parts = raw.split(/\s+/);
    const cmd = parts[0].toLowerCase();

    if (cmd === 'clear') {
      setTerminalLog([]);
      return;
    }

    if (cmd === 'help') {
      newLines.push({
        id: String(Date.now() + 1),
        kind: 'system',
        text: [
          'Available commands:',
          '  run [file]         Run active file or specified file in its detected language',
          '  <language> <file>  Execute file with specified language runtime (e.g. python main.py, java Main.java)',
          '  runtimes           List detected execution runtimes and toolchains on this server',
          '  clear              Clear the console output',
          '  help               Show this command reference',
        ].join('\n'),
      });
      setTerminalLog((prev) => [...prev, ...newLines]);
      return;
    }

    if (cmd === 'runtimes') {
      try {
        const res = await api.getRuntimes();
        const lines = res.runtimes.map((r) =>
          `  ${r.language.padEnd(12)} : ${r.available ? `AVAILABLE ${r.version ? `(${r.version})` : ''}` : 'NOT AVAILABLE'}${r.hint ? ` - ${r.hint}` : ''}`
        );
        newLines.push({
          id: String(Date.now() + 1),
          kind: 'system',
          text: `Server Runtimes:\n${lines.join('\n')}`,
        });
      } catch (err: any) {
        newLines.push({
          id: String(Date.now() + 1),
          kind: 'stderr',
          text: `Failed to probe runtimes: ${err.message}`,
        });
      }
      setTerminalLog((prev) => [...prev, ...newLines]);
      return;
    }

    const isRunCmd = cmd === 'run';
    const knownLangs = ['python', 'py', 'node', 'javascript', 'js', 'typescript', 'ts', 'c', 'cpp', 'java', 'go', 'ruby', 'php', 'bash', 'sh'];
    const isLangCmd = knownLangs.includes(cmd) && parts.length > 1;

    if (isRunCmd || isLangCmd) {
      try {
        const res = (await onRunTerminalCommand(raw)) as ExecutionResult | null;
        if (res) {
          if (res.stdout && res.stdout.length > 0) {
            res.stdout.forEach((line, i) => {
              newLines.push({ id: `${Date.now()}-out-${i}`, kind: 'stdout', text: line });
            });
          }
          if (res.stderr && res.stderr.length > 0) {
            res.stderr.forEach((line, i) => {
              newLines.push({ id: `${Date.now()}-err-${i}`, kind: 'stderr', text: line });
            });
          }
          if (res.error) {
            newLines.push({ id: `${Date.now()}-err-main`, kind: 'stderr', text: `Error: ${res.error}` });
          }
          if (res.exitCode !== null && res.exitCode !== undefined) {
            newLines.push({
              id: `${Date.now()}-exit`,
              kind: 'system',
              text: `[Process exited with code ${res.exitCode}]`,
            });
          }
        }
      } catch (err: any) {
        newLines.push({
          id: String(Date.now() + 2),
          kind: 'stderr',
          text: `Execution failed: ${err.message}`,
        });
      }
      setTerminalLog((prev) => [...prev, ...newLines]);
      return;
    }

    // Unrecognized command
    newLines.push({
      id: String(Date.now() + 1),
      kind: 'stderr',
      text: `command not found: ${raw} (try: help)`,
    });
    setTerminalLog((prev) => [...prev, ...newLines]);
  };

  return (
    <div
      style={isOpen ? { height: `${size}px` } : { height: '32px' }}
      className="relative border-t border-stone bg-bone flex flex-col select-none shrink-0 transition-colors duration-200"
    >
      {/* Resizable Top Border Drag Handle (when open) */}
      {isOpen && (
        <div
          {...dragHandleProps}
          title="Drag to resize bottom panel (double-click to reset)"
          className="absolute -top-1 left-0 right-0 h-2 cursor-row-resize hover:bg-ink/30 transition z-30 group"
        />
      )}

      {/* Panel Header Bar */}
      <div className="h-8 px-3 flex items-center justify-between border-b border-stone bg-bone">
        <div role="tablist" aria-label="Bottom panel tabs" className="flex items-center gap-2">
          {/* Tabs */}
          {(['OUTPUT', 'TERMINAL', 'PROBLEMS', 'PREVIEW'] as BottomTab[]).map((tab) => {
            const isActive = activeTab === tab;
            return (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => {
                  onTabChange(tab);
                  if (!isOpen) onToggle();
                }}
                className={`px-2 py-0.5 text-xs font-mono transition flex items-center gap-1.5 cursor-pointer border-b-2 focus:outline-none focus-visible:ring-1 focus-visible:ring-ink dark:focus-visible:ring-parchment ${
                  isActive
                    ? 'text-ink border-ink font-medium'
                    : 'text-ash border-transparent hover:text-ink'
                }`}
              >
                <span>{tab}</span>
                {tab === 'PROBLEMS' && diagnostics.length > 0 && (
                  <span className="text-[10px] font-mono text-mist">
                    ({diagnostics.length})
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Panel Actions & Toggle */}
        <div className="flex items-center gap-1.5">
          {activeTab === 'OUTPUT' && (
            <button
              type="button"
              onClick={onClearOutput}
              title="Clear Output"
              aria-label="Clear Output"
              className="p-1 rounded-md text-ash hover:text-ink hover:bg-linen focus:outline-none focus-visible:ring-2 focus-visible:ring-ink dark:focus-visible:ring-parchment transition cursor-pointer"
            >
              <Trash size={13} />
            </button>
          )}

          {activeTab === 'TERMINAL' && (
            <button
              type="button"
              onClick={() => setTerminalLog([])}
              title="Clear Terminal Console"
              aria-label="Clear Terminal Console"
              className="p-1 rounded-md text-ash hover:text-ink hover:bg-linen focus:outline-none focus-visible:ring-2 focus-visible:ring-ink dark:focus-visible:ring-parchment transition cursor-pointer"
            >
              <Trash size={13} />
            </button>
          )}

          {activeTab === 'PREVIEW' && (
            <button
              type="button"
              onClick={onRefreshPreview}
              title="Refresh Preview"
              aria-label="Refresh Preview"
              className="p-1 rounded-md text-ash hover:text-ink hover:bg-linen focus:outline-none focus-visible:ring-2 focus-visible:ring-ink dark:focus-visible:ring-parchment transition cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            type="button"
            onClick={onToggle}
            title={isOpen ? 'Collapse Panel' : 'Expand Panel'}
            aria-label={isOpen ? 'Collapse Bottom Panel' : 'Expand Bottom Panel'}
            className="p-1 rounded-md text-ash hover:text-ink hover:bg-linen focus:outline-none focus-visible:ring-2 focus-visible:ring-ink dark:focus-visible:ring-parchment transition cursor-pointer"
          >
            {isOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>
        </div>
      </div>

      {/* Panel Content (Visible when expanded) */}
      {isOpen && (
        <div className="flex-1 overflow-hidden p-3 font-mono text-xs select-text selectable-text">
          {/* 1. OUTPUT TAB */}
          {activeTab === 'OUTPUT' && (
            <div className="h-full overflow-y-auto space-y-1">
              {executionResult ? (
                <>
                  <div className="text-[11px] text-driftwood mb-2 border-b border-stone pb-1 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {executionResult.exitCode !== null && executionResult.exitCode !== undefined && (
                        <span
                          className={`font-mono font-medium ${
                            executionResult.exitCode === 0
                              ? 'text-verdant'
                              : 'text-crimson'
                          }`}
                        >
                          exit {executionResult.exitCode}
                        </span>
                      )}
                      <span>Time: {executionResult.executionTimeMs}ms</span>
                      {executionResult.language && (
                        <span className="text-mist">({executionResult.language})</span>
                      )}
                    </div>
                    <span className="text-mist">{new Date(executionResult.timestamp).toLocaleTimeString()}</span>
                  </div>
                  {executionResult.stdout.map((line, idx) => (
                    <div key={idx} className="text-ink whitespace-pre-wrap">
                      {line}
                    </div>
                  ))}
                  {executionResult.stderr.map((line, idx) => (
                    <div key={idx} className="text-amber whitespace-pre-wrap">
                      {line}
                    </div>
                  ))}
                  {executionResult.error && (
                    <div className="text-crimson font-normal whitespace-pre-wrap">
                      Error: {executionResult.error}
                    </div>
                  )}
                </>
              ) : (
                <p className="text-mist italic">No execution output yet. Click 'Run' to test your code.</p>
              )}
            </div>
          )}

          {/* 2. TERMINAL TAB */}
          {activeTab === 'TERMINAL' && (
            <div className="h-full flex flex-col justify-between overflow-hidden">
              <div className="flex-1 overflow-y-auto space-y-1.5 text-ink pr-1">
                {terminalLog.map((line) => (
                  <div
                    key={line.id}
                    className={`whitespace-pre-wrap font-mono text-xs ${
                      line.kind === 'input'
                        ? 'text-ink font-medium'
                        : line.kind === 'stdout'
                        ? 'text-verdant'
                        : line.kind === 'stderr'
                        ? 'text-amber'
                        : 'text-driftwood italic'
                    }`}
                  >
                    {line.text}
                  </div>
                ))}
                <div ref={terminalEndRef} />
              </div>
              <form
                onSubmit={handleTermSubmit}
                className="flex items-center gap-2 border border-stone pt-2 mt-1 bg-parchment px-3 py-1.5 rounded-md focus-within:ring-1 focus-within:ring-ink dark:focus-within:ring-parchment"
              >
                <span className="text-ash font-mono whitespace-nowrap select-none font-medium">
                  {promptLanguage} ❯
                </span>
                <input
                  type="text"
                  aria-label="Terminal command"
                  placeholder="Type 'run', 'python main.py', 'runtimes', or 'help'..."
                  value={termInput}
                  onChange={(e) => setTermInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="flex-1 bg-transparent border-none text-ink focus:outline-none text-xs font-mono placeholder:text-mist"
                />
              </form>
            </div>
          )}

          {/* 3. PROBLEMS TAB */}
          {activeTab === 'PROBLEMS' && (
            <div className="h-full overflow-y-auto space-y-1">
              <div className="flex items-center gap-4 text-[11px] text-driftwood mb-2 border-b border-stone pb-1">
                <span className="flex items-center gap-1 text-crimson">
                  <AlertCircle className="w-3.5 h-3.5" /> {errorCount} Errors
                </span>
                <span className="flex items-center gap-1 text-amber">
                  <AlertTriangle className="w-3.5 h-3.5" /> {warnCount} Warnings
                </span>
              </div>

              {diagnostics.length === 0 ? (
                <p className="text-mist italic">No syntax issues or lint warnings detected in workspace files.</p>
              ) : (
                diagnostics.map((diag) => (
                  <div
                    key={diag.id}
                    onClick={() => onSelectProblem(diag.fileId, diag.line, diag.column)}
                    className="flex items-start gap-2 p-1.5 rounded-md hover:bg-linen/60 cursor-pointer transition text-xs border-b border-stone/30"
                  >
                    {diag.severity === 'error' && <AlertCircle className="w-3.5 h-3.5 text-crimson mt-0.5 shrink-0" />}
                    {diag.severity === 'warning' && <AlertTriangle className="w-3.5 h-3.5 text-amber mt-0.5 shrink-0" />}
                    {diag.severity === 'info' && <AlertCircle className="w-3.5 h-3.5 text-ash mt-0.5 shrink-0" />}

                    <div className="flex-1 overflow-hidden">
                      <div className="text-ink truncate">{diag.message}</div>
                      <div className="text-[10px] text-mist font-mono">
                        {diag.fileName || 'file'} [{diag.line}:{diag.column}] &bull; {diag.source}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* 4. PREVIEW TAB */}
          {activeTab === 'PREVIEW' && (
            <div className="h-full w-full bg-white rounded-md border border-stone overflow-hidden">
              <iframe
                key={previewNonce}
                title="HTML Preview Sandbox"
                srcDoc={previewHtml}
                sandbox="allow-scripts allow-modals"
                className="w-full h-full border-none"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

import React, { useState } from 'react';
import {
  ChevronUp,
  ChevronDown,
  Trash2,
  RefreshCw,
  AlertCircle,
  AlertTriangle,
  Info,
  Terminal as TerminalIcon,
  Play,
} from 'lucide-react';
import { BottomTab, DiagnosticsItem, ExecutionResult } from '../../lib/types';
import { AnimatedIcon } from '../ui/AnimatedIcon';

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
  onRefreshPreview: () => void;
  onRunTerminalCommand: (command: string) => void;
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
  onRefreshPreview,
  onRunTerminalCommand,
}) => {
  const [termInput, setTermInput] = useState('');

  const errorCount = diagnostics.filter((d) => d.severity === 'error').length;
  const warnCount = diagnostics.filter((d) => d.severity === 'warning').length;

  const handleTermSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (termInput.trim()) {
      onRunTerminalCommand(termInput.trim());
      setTermInput('');
    }
  };

  return (
    <div
      className={`border-t border-white/10 bg-[#0A0F1D]/90 backdrop-blur-md flex flex-col transition-all duration-200 select-none ${
        isOpen ? 'h-64' : 'h-8'
      }`}
    >
      {/* Panel Header Bar */}
      <div className="h-8 px-3 flex items-center justify-between border-b border-white/5 bg-slate-900/40">
        <div className="flex items-center gap-1">
          {/* Tabs */}
          {(['OUTPUT', 'TERMINAL', 'PROBLEMS', 'PREVIEW'] as BottomTab[]).map((tab) => {
            const isActive = activeTab === tab;
            return (
              <button
                key={tab}
                onClick={() => {
                  onTabChange(tab);
                  if (!isOpen) onToggle();
                }}
                className={`px-3 py-1 text-xs font-semibold tracking-wider rounded transition flex items-center gap-1.5 ${
                  isActive
                    ? 'text-blue-400 bg-white/5'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                }`}
              >
                <span>{tab}</span>
                {tab === 'PROBLEMS' && diagnostics.length > 0 && (
                  <span className="text-[10px] bg-slate-800 px-1.5 py-0.2 rounded-full font-mono text-slate-300">
                    {diagnostics.length}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Panel Actions & Toggle */}
        <div className="flex items-center gap-2">
          {activeTab === 'OUTPUT' && (
            <button
              onClick={onClearOutput}
              title="Clear Output"
              className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-white/5 transition"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}

          {activeTab === 'PREVIEW' && (
            <button
              onClick={onRefreshPreview}
              title="Refresh Preview"
              className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-white/5 transition"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            onClick={onToggle}
            title={isOpen ? 'Collapse Panel' : 'Expand Panel'}
            className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-white/5 transition"
          >
            {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Panel Content (Visible when expanded) */}
      {isOpen && (
        <div className="flex-1 overflow-hidden p-3 font-mono text-xs">
          {/* 1. OUTPUT TAB */}
          {activeTab === 'OUTPUT' && (
            <div className="h-full overflow-y-auto space-y-1">
              {executionResult ? (
                <>
                  <div className="text-[11px] text-slate-500 mb-2 border-b border-white/5 pb-1 flex items-center justify-between">
                    <span>Measured execution time: {executionResult.executionTimeMs}ms</span>
                    <span>{new Date(executionResult.timestamp).toLocaleTimeString()}</span>
                  </div>
                  {executionResult.stdout.map((line, idx) => (
                    <div key={idx} className="text-slate-200 whitespace-pre-wrap">
                      {line}
                    </div>
                  ))}
                  {executionResult.stderr.map((line, idx) => (
                    <div key={idx} className="text-amber-400 whitespace-pre-wrap">
                      {line}
                    </div>
                  ))}
                  {executionResult.error && (
                    <div className="text-rose-400 font-semibold whitespace-pre-wrap">
                      Error: {executionResult.error}
                    </div>
                  )}
                </>
              ) : (
                <p className="text-slate-500 italic">No execution output yet. Click 'Run' to test your code.</p>
              )}
            </div>
          )}

          {/* 2. TERMINAL TAB */}
          {activeTab === 'TERMINAL' && (
            <div className="h-full flex flex-col justify-between">
              <div className="flex-1 overflow-y-auto space-y-1 text-slate-300">
                <p className="text-slate-500">Obsidian Code Sandboxed Terminal [Environment: Node VM & Web Sandbox]</p>
                <p className="text-slate-500">Type any expression or statement below to evaluate:</p>
                {executionResult?.stdout.map((line, idx) => (
                  <p key={idx} className="text-emerald-400">
                    &gt; {line}
                  </p>
                ))}
              </div>
              <form onSubmit={handleTermSubmit} className="flex items-center gap-2 border-t border-white/10 pt-2">
                <span className="text-emerald-400 font-bold">$</span>
                <input
                  type="text"
                  placeholder="Enter JS expression (e.g., 2 + 2 or Math.random())..."
                  value={termInput}
                  onChange={(e) => setTermInput(e.target.value)}
                  className="flex-1 bg-transparent border-none text-slate-100 focus:outline-none text-xs"
                />
              </form>
            </div>
          )}

          {/* 3. PROBLEMS TAB */}
          {activeTab === 'PROBLEMS' && (
            <div className="h-full overflow-y-auto space-y-1">
              <div className="flex items-center gap-4 text-[11px] text-slate-400 mb-2 border-b border-white/5 pb-1">
                <span className="flex items-center gap-1 text-rose-400">
                  <AlertCircle className="w-3.5 h-3.5" /> {errorCount} Errors
                </span>
                <span className="flex items-center gap-1 text-amber-400">
                  <AlertTriangle className="w-3.5 h-3.5" /> {warnCount} Warnings
                </span>
              </div>

              {diagnostics.length === 0 ? (
                <p className="text-slate-500 italic">No syntax issues or lint warnings detected in workspace files.</p>
              ) : (
                diagnostics.map((diag) => (
                  <div
                    key={diag.id}
                    onClick={() => onSelectProblem(diag.fileId, diag.line, diag.column)}
                    className="flex items-center justify-between p-1.5 rounded hover:bg-white/5 cursor-pointer transition text-xs"
                  >
                    <div className="flex items-center gap-2">
                      {diag.severity === 'error' ? (
                        <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                      ) : diag.severity === 'warning' ? (
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      ) : (
                        <Info className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                      )}
                      <span className="text-slate-200">{diag.message}</span>
                      <span className="text-[10px] text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded">
                        {diag.source}
                      </span>
                    </div>

                    <span className="text-slate-400 text-[11px]">
                      {diag.fileName} [{diag.line}, {diag.column}]
                    </span>
                  </div>
                ))
              )}
            </div>
          )}

          {/* 4. PREVIEW TAB */}
          {activeTab === 'PREVIEW' && (
            <div className="h-full w-full rounded bg-white overflow-hidden shadow-inner">
              <iframe
                title="Obsidian Sandboxed Preview"
                srcDoc={previewHtml}
                sandbox="allow-scripts"
                className="w-full h-full border-none"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

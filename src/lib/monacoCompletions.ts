import type * as Monaco from 'monaco-editor';

export interface CompletionEntry {
  label: string;
  insertText: string;
  detail: string;
  kind: 'keyword' | 'function' | 'snippet' | 'class';
  isSnippet?: boolean;
}

const LANGUAGE_COMPLETIONS: Record<string, CompletionEntry[]> = {
  python: [
    { label: 'print', insertText: 'print(${1:value})', detail: 'Built-in function print(*objects)', kind: 'function', isSnippet: true },
    { label: 'len', insertText: 'len(${1:obj})', detail: 'Built-in function len(obj)', kind: 'function', isSnippet: true },
    { label: 'range', insertText: 'range(${1:stop})', detail: 'Built-in sequence range([start,] stop[, step])', kind: 'function', isSnippet: true },
    { label: 'enumerate', insertText: 'enumerate(${1:iterable})', detail: 'Built-in enumerate(iterable, start=0)', kind: 'function', isSnippet: true },
    { label: 'input', insertText: 'input(${1:prompt})', detail: 'Built-in input(prompt)', kind: 'function', isSnippet: true },
    { label: 'open', insertText: 'open(${1:file}, ${2:"r"})', detail: 'Built-in open(file, mode)', kind: 'function', isSnippet: true },
    { label: 'sorted', insertText: 'sorted(${1:iterable})', detail: 'Built-in sorted(iterable)', kind: 'function', isSnippet: true },
    { label: 'zip', insertText: 'zip(${1:iter1}, ${2:iter2})', detail: 'Built-in zip(*iterables)', kind: 'function', isSnippet: true },
    { label: 'map', insertText: 'map(${1:func}, ${2:iterable})', detail: 'Built-in map(func, iterable)', kind: 'function', isSnippet: true },
    { label: 'filter', insertText: 'filter(${1:func}, ${2:iterable})', detail: 'Built-in filter(func, iterable)', kind: 'function', isSnippet: true },
    { label: 'isinstance', insertText: 'isinstance(${1:obj}, ${2:type})', detail: 'Built-in isinstance(obj, classinfo)', kind: 'function', isSnippet: true },
    { label: 'def', insertText: 'def ${1:name}(${2:params}):\n\t${3:pass}', detail: 'Define a Python function', kind: 'snippet', isSnippet: true },
    { label: 'class', insertText: 'class ${1:ClassName}:\n\tdef __init__(self${2:, args}):\n\t\t${3:pass}', detail: 'Define a Python class', kind: 'snippet', isSnippet: true },
    { label: 'if __name__ == "__main__":', insertText: 'if __name__ == "__main__":\n\t${1:main()}', detail: 'Main entrypoint guard', kind: 'snippet', isSnippet: true },
    { label: 'return', insertText: 'return ', detail: 'Python keyword', kind: 'keyword' },
    { label: 'import', insertText: 'import ', detail: 'Python keyword', kind: 'keyword' },
    { label: 'from', insertText: 'from ', detail: 'Python keyword', kind: 'keyword' },
    { label: 'async', insertText: 'async ', detail: 'Python keyword', kind: 'keyword' },
    { label: 'await', insertText: 'await ', detail: 'Python keyword', kind: 'keyword' },
    { label: 'try', insertText: 'try:\n\t${1:pass}\nexcept ${2:Exception} as e:\n\t${3:print(e)}', detail: 'Try / except block', kind: 'snippet', isSnippet: true },
    { label: 'for', insertText: 'for ${1:item} in ${2:iterable}:\n\t${3:pass}', detail: 'For loop', kind: 'snippet', isSnippet: true },
    { label: 'while', insertText: 'while ${1:condition}:\n\t${2:pass}', detail: 'While loop', kind: 'snippet', isSnippet: true },
    { label: 'with', insertText: 'with ${1:expr} as ${2:var}:\n\t${3:pass}', detail: 'Context manager block', kind: 'snippet', isSnippet: true },
    { label: 'True', insertText: 'True', detail: 'Boolean literal', kind: 'keyword' },
    { label: 'False', insertText: 'False', detail: 'Boolean literal', kind: 'keyword' },
    { label: 'None', insertText: 'None', detail: 'Null singleton', kind: 'keyword' },
  ],
  java: [
    { label: 'System.out.println', insertText: 'System.out.println(${1:});', detail: 'Print line to stdout', kind: 'function', isSnippet: true },
    { label: 'println', insertText: 'System.out.println(${1:});', detail: 'System.out.println(...) stdout print', kind: 'function', isSnippet: true },
    { label: 'System.out.print', insertText: 'System.out.print(${1:});', detail: 'Print to stdout without newline', kind: 'function', isSnippet: true },
    { label: 'System.out.printf', insertText: 'System.out.printf("${1:%s\\n}", ${2:arg});', detail: 'Formatted stdout print', kind: 'function', isSnippet: true },
    { label: 'main', insertText: 'public static void main(String[] args) {\n\t${1:}\n}', detail: 'Java main method', kind: 'snippet', isSnippet: true },
    { label: 'String', insertText: 'String', detail: 'java.lang.String', kind: 'class' },
    { label: 'ArrayList', insertText: 'ArrayList<${1:String}>', detail: 'java.util.ArrayList', kind: 'class', isSnippet: true },
    { label: 'HashMap', insertText: 'HashMap<${1:String}, ${2:Object}>', detail: 'java.util.HashMap', kind: 'class', isSnippet: true },
    { label: 'Scanner', insertText: 'Scanner ${1:sc} = new Scanner(System.in);', detail: 'java.util.Scanner', kind: 'class', isSnippet: true },
    { label: 'public', insertText: 'public ', detail: 'Java visibility modifier', kind: 'keyword' },
    { label: 'private', insertText: 'private ', detail: 'Java visibility modifier', kind: 'keyword' },
    { label: 'protected', insertText: 'protected ', detail: 'Java visibility modifier', kind: 'keyword' },
    { label: 'static', insertText: 'static ', detail: 'Java modifier', kind: 'keyword' },
    { label: 'final', insertText: 'final ', detail: 'Java modifier', kind: 'keyword' },
    { label: 'class', insertText: 'class ${1:Name} {\n\t${2:}\n}', detail: 'Java class declaration', kind: 'snippet', isSnippet: true },
    { label: 'interface', insertText: 'interface ${1:Name} {\n\t${2:}\n}', detail: 'Java interface declaration', kind: 'snippet', isSnippet: true },
    { label: 'return', insertText: 'return ', detail: 'Java keyword', kind: 'keyword' },
    { label: 'import', insertText: 'import ', detail: 'Java keyword', kind: 'keyword' },
  ],
  c: [
    { label: 'printf', insertText: 'printf("${1:%s\\n}"${2:, arg});', detail: 'stdio.h formatted output', kind: 'function', isSnippet: true },
    { label: 'scanf', insertText: 'scanf("${1:%d}", &${2:var});', detail: 'stdio.h formatted input', kind: 'function', isSnippet: true },
    { label: 'fprintf', insertText: 'fprintf(${1:stderr}, "${2:%s\\n}"${3:, arg});', detail: 'stdio.h stream formatted output', kind: 'function', isSnippet: true },
    { label: 'malloc', insertText: 'malloc(${1:size})', detail: 'stdlib.h memory allocation', kind: 'function', isSnippet: true },
    { label: 'calloc', insertText: 'calloc(${1:count}, ${2:size})', detail: 'stdlib.h zeroed allocation', kind: 'function', isSnippet: true },
    { label: 'free', insertText: 'free(${1:ptr});', detail: 'stdlib.h free memory', kind: 'function', isSnippet: true },
    { label: 'sizeof', insertText: 'sizeof(${1:type})', detail: 'C size operator', kind: 'keyword', isSnippet: true },
    { label: 'strlen', insertText: 'strlen(${1:str})', detail: 'string.h string length', kind: 'function', isSnippet: true },
    { label: 'main', insertText: 'int main(void) {\n\t${1:return 0;}\n}', detail: 'C main entrypoint', kind: 'snippet', isSnippet: true },
    { label: '#include <stdio.h>', insertText: '#include <stdio.h>', detail: 'Standard I/O header', kind: 'snippet' },
    { label: '#include <stdlib.h>', insertText: '#include <stdlib.h>', detail: 'Standard library header', kind: 'snippet' },
    { label: 'struct', insertText: 'struct ${1:Name} {\n\t${2:int field;}\n};', detail: 'C struct definition', kind: 'snippet', isSnippet: true },
    { label: 'return', insertText: 'return ', detail: 'C keyword', kind: 'keyword' },
  ],
  cpp: [
    { label: 'std::cout', insertText: 'std::cout << ${1:value} << std::endl;', detail: 'iostream standard output', kind: 'function', isSnippet: true },
    { label: 'std::cin', insertText: 'std::cin >> ${1:var};', detail: 'iostream standard input', kind: 'function', isSnippet: true },
    { label: 'std::endl', insertText: 'std::endl', detail: 'iostream newline + flush', kind: 'keyword' },
    { label: 'std::vector', insertText: 'std::vector<${1:int}>', detail: 'Dynamic array container', kind: 'class', isSnippet: true },
    { label: 'std::string', insertText: 'std::string', detail: 'C++ string class', kind: 'class' },
    { label: 'std::map', insertText: 'std::map<${1:Key}, ${2:Value}>', detail: 'Ordered associative map', kind: 'class', isSnippet: true },
    { label: 'std::unordered_map', insertText: 'std::unordered_map<${1:Key}, ${2:Value}>', detail: 'Hash map container', kind: 'class', isSnippet: true },
    { label: 'std::sort', insertText: 'std::sort(${1:v}.begin(), ${1:v}.end());', detail: 'algorithm sort', kind: 'function', isSnippet: true },
    { label: '#include <iostream>', insertText: '#include <iostream>', detail: 'C++ standard I/O stream', kind: 'snippet' },
    { label: 'main', insertText: 'int main() {\n\t${1:return 0;}\n}', detail: 'C++ main entrypoint', kind: 'snippet', isSnippet: true },
    { label: 'using namespace std;', insertText: 'using namespace std;', detail: 'Namespace directive', kind: 'keyword' },
  ],
  go: [
    { label: 'fmt.Println', insertText: 'fmt.Println(${1:})', detail: 'fmt package print line', kind: 'function', isSnippet: true },
    { label: 'fmt.Printf', insertText: 'fmt.Printf("${1:%v\\n}", ${2:arg})', detail: 'fmt package formatted print', kind: 'function', isSnippet: true },
    { label: 'fmt.Sprintf', insertText: 'fmt.Sprintf("${1:%v}", ${2:arg})', detail: 'fmt package formatted string', kind: 'function', isSnippet: true },
    { label: 'func', insertText: 'func ${1:name}(${2:params}) ${3:error} {\n\t${4:}\n}', detail: 'Go function declaration', kind: 'snippet', isSnippet: true },
    { label: 'main', insertText: 'func main() {\n\t${1:}\n}', detail: 'Go main entrypoint', kind: 'snippet', isSnippet: true },
    { label: 'package main', insertText: 'package main', detail: 'Main package declaration', kind: 'keyword' },
    { label: 'make', insertText: 'make(${1:[]int}, ${2:0})', detail: 'Built-in make', kind: 'function', isSnippet: true },
    { label: 'append', insertText: 'append(${1:slice}, ${2:elem})', detail: 'Built-in append', kind: 'function', isSnippet: true },
  ],
};

const QUALIFIER_REGEX_BY_LANG: Record<string, RegExp> = {
  java: /(System\.out\.[A-Za-z0-9_]*)$/,
  cpp: /(std::[A-Za-z0-9_]*)$/,
  go: /(fmt\.[A-Za-z0-9_]*)$/,
  c: /(#include\s*<?[A-Za-z0-9_.]*>?)$/,
};

const registeredInstances = new WeakSet<object>();

function isInsideSingleLineComment(lang: string, linePrefix: string): boolean {
  const trimmed = linePrefix.trimStart();
  if (lang === 'python') {
    return trimmed.startsWith('#');
  }
  return trimmed.startsWith('//');
}

function getReplacementStartColumn(
  lang: string,
  linePrefix: string,
  defaultStartColumn: number
): number {
  const qualifierPattern = QUALIFIER_REGEX_BY_LANG[lang];
  if (!qualifierPattern) {
    return defaultStartColumn;
  }
  const match = linePrefix.match(qualifierPattern);
  if (!match || match.index === undefined) {
    return defaultStartColumn;
  }
  return Math.min(defaultStartColumn, match.index + 1);
}

/**
 * Returns language-curated completion entries for unit tests and Monaco registration.
 */
export function getLanguageCompletions(language: string): CompletionEntry[] {
  return LANGUAGE_COMPLETIONS[language.toLowerCase()] ?? [];
}

/**
 * Registers context-aware completion providers for Python, Java, C, C++, and Go once per Monaco instance.
 */
export function registerMonacoCompletions(monaco: typeof Monaco): void {
  if (registeredInstances.has(monaco)) return;
  registeredInstances.add(monaco);

  const kindMap: Record<CompletionEntry['kind'], Monaco.languages.CompletionItemKind> = {
    keyword: monaco.languages.CompletionItemKind.Keyword,
    function: monaco.languages.CompletionItemKind.Function,
    snippet: monaco.languages.CompletionItemKind.Snippet,
    class: monaco.languages.CompletionItemKind.Class,
  };

  for (const [lang, entries] of Object.entries(LANGUAGE_COMPLETIONS)) {
    monaco.languages.registerCompletionItemProvider(lang, {
      triggerCharacters: ['.', ':', '#'],
      provideCompletionItems(model, position) {
        const linePrefix = model.getValueInRange({
          startLineNumber: position.lineNumber,
          startColumn: 1,
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        });

        if (isInsideSingleLineComment(lang, linePrefix)) {
          return { suggestions: [] };
        }

        const word = model.getWordUntilPosition(position);
        const startColumn = getReplacementStartColumn(lang, linePrefix, word.startColumn);
        const range: Monaco.IRange = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn,
          endColumn: word.endColumn,
        };

        const typedToken = linePrefix.slice(startColumn - 1);
        const relevantEntries = typedToken.includes('.') || typedToken.includes('::')
          ? entries.filter((entry) => entry.label.startsWith(typedToken.split(/[.:]+/)[0]))
          : entries;
        const activeEntries = relevantEntries.length > 0 ? relevantEntries : entries;

        const suggestions: Monaco.languages.CompletionItem[] = activeEntries.map((entry, idx) => ({
          label: entry.label,
          kind: kindMap[entry.kind],
          detail: entry.detail,
          insertText: entry.insertText,
          insertTextRules: entry.isSnippet
            ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
            : undefined,
          sortText: `00_${String(idx).padStart(3, '0')}_${entry.label}`,
          range,
        }));

        return { suggestions };
      },
    });
  }
}

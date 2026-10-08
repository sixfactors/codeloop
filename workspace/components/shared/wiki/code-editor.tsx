'use client';

// CodeMirror 6 markdown surface. Loaded with next/dynamic (ssr: false) by the page editor so the
// static export never tries to render it on the server.

import CodeMirror from '@uiw/react-codemirror';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { EditorView } from '@codemirror/view';
import { useEffect, useState } from 'react';

const extensions = [markdown({ base: markdownLanguage, codeLanguages: languages }), EditorView.lineWrapping];

// ⌘S is handled once, by the page editor's document listener.
export default function CodeEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const el = document.documentElement;
    const read = () => setDark(el.classList.contains('dark'));
    read();
    const mo = new MutationObserver(read);
    mo.observe(el, { attributes: true, attributeFilter: ['class'] });
    return () => mo.disconnect();
  }, []);
  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      extensions={extensions}
      theme={dark ? 'dark' : 'light'}
      height="100%"
      className="h-full text-[13px] [&_.cm-editor]:h-full [&_.cm-editor]:bg-transparent [&_.cm-focused]:outline-none [&_.cm-gutters]:bg-transparent [&_.cm-scroller]:font-mono"
      basicSetup={{ lineNumbers: false, foldGutter: false, highlightActiveLine: false }}
      data-testid="wiki-editor-body"
    />
  );
}

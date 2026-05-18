'use client';

import { useCallback, useEffect, useState } from 'react';
import Editor, { type EditorMode } from './Editor';
import TocPanel, { type TocItem } from './TocPanel';
import FloatingAI from './FloatingAI';

export default function WikiShell({
  path,
  toc,
  pages,
  children,
}: {
  path: string | null;
  toc: TocItem[];
  pages: Array<{ title: string; path: string; section: string; published?: boolean }>;
  children: React.ReactNode;
}) {
  const [editorMode, setEditorMode] = useState<EditorMode | null>(null);

  useEffect(() => {
    function handle(e: Event) {
      const detail = (e as CustomEvent).detail as EditorMode | undefined;
      if (detail) setEditorMode(detail);
    }
    window.addEventListener('open-editor', handle as EventListener);
    return () => window.removeEventListener('open-editor', handle as EventListener);
  }, []);

  const openEdit = useCallback(() => {
    if (path) setEditorMode({ kind: 'edit', path });
  }, [path]);
  const openNew = useCallback(() => {
    setEditorMode({ kind: 'new' });
  }, []);
  const openManage = useCallback(() => {
    setEditorMode({ kind: 'manage' });
  }, []);
  const openImport = useCallback(() => {
    setEditorMode({ kind: 'import' });
  }, []);

  return (
    <div className="flex-1 min-w-0 flex">
      <main className="flex-1 min-w-0 px-5 md:px-10 lg:px-14 py-8 max-w-[820px] mx-auto w-full">
        {children}
      </main>
      <TocPanel items={toc} onEdit={openEdit} onNew={openNew} onManage={openManage} onImport={openImport} />
      {editorMode && (
        <Editor
          mode={editorMode}
          onClose={() => setEditorMode(null)}
          initialPages={pages}
        />
      )}
      <FloatingAI currentPath={path} />
    </div>
  );
}

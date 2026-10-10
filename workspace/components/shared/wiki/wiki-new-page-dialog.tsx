'use client';

// New page: folder, title, template per folder (lib/wiki.ts). Slug from the title; PUT to
// .codeloop/wiki/<folder>/<slug>.md, then navigate to the page.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSavePage } from '@/hooks/use-api';
import { routes } from '@/lib/routes';
import { folderById, pageIdFor, slugify, WIKI_FOLDERS } from '@/lib/wiki';

export function WikiNewPageDialog({ open, onOpenChange, defaultFolder = 'concepts', existingIds }: { open: boolean; onOpenChange: (o: boolean) => void; defaultFolder?: string; existingIds: Set<string> }) {
  const router = useRouter();
  const save = useSavePage();
  const [folder, setFolder] = useState(defaultFolder);
  const [title, setTitle] = useState('');
  const slug = slugify(title);
  const id = slug ? pageIdFor(folder, slug) : '';
  const taken = Boolean(id) && existingIds.has(id);
  const meta = folderById(folder);

  const create = async () => {
    if (!meta || !slug || taken) return;
    const today = new Date().toISOString().slice(0, 10);
    try {
      await save.mutateAsync({ path: id, write: { frontmatter: { title: title.trim(), ...meta.template.frontmatter, updated: today }, body: meta.template.body } });
      toast.success(`${meta.singular} created`);
      onOpenChange(false);
      setTitle('');
      router.push(routes.wiki(id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Create failed');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]" data-testid="wiki-new-dialog">
        <DialogHeader>
          <DialogTitle>New page</DialogTitle>
          <DialogDescription>Starts from the folder&apos;s template. The file lands under .codeloop/wiki.</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void create(); }}>
          <div className="flex flex-col gap-2">
            <Label htmlFor="wiki-new-folder">Folder</Label>
            <Select value={folder} onValueChange={(v) => v && setFolder(v)}>
              <SelectTrigger id="wiki-new-folder" className="w-full" data-testid="wiki-new-folder"><SelectValue /></SelectTrigger>
              <SelectContent>
                {WIKI_FOLDERS.map((f) => <SelectItem key={f.id} value={f.id}>{f.label}</SelectItem>)}
              </SelectContent>
            </Select>
            {meta ? <p className="text-xs text-muted-foreground">{meta.description}</p> : null}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="wiki-new-title">Title</Label>
            <Input id="wiki-new-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={meta?.id === 'initiatives' ? 'Founder ships without ceremony' : 'What the reader can now do'} autoFocus data-testid="wiki-new-title" />
            <p className="truncate font-mono text-xs text-muted-foreground" aria-live="polite">{id || `${pageIdFor(folder, '…')}`}</p>
            {taken ? <p className="text-xs text-destructive">A page with this slug already exists in {meta?.label}.</p> : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={!slug || taken || save.isPending} data-testid="wiki-new-create">{save.isPending ? 'Creating…' : 'Create'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

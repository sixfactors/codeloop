import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DocPage } from '@/components/doc-page';
import { hasDoc, listDocSlugs, loadDoc, prevNext } from '@/lib/docs';

type Params = { slug: string[] };

export function generateStaticParams(): Params[] {
  return listDocSlugs().map((slug) => ({ slug }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  if (!hasDoc(slug)) return {};
  const d = loadDoc(slug);
  return { title: d.title, description: d.description };
}

export default async function Page({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  if (!hasDoc(slug)) notFound();
  const d = loadDoc(slug);
  const { prev, next } = prevNext(d.href);
  return (
    <DocPage title={d.title} description={d.description} prev={prev} next={next}>
      <div dangerouslySetInnerHTML={{ __html: d.html }} />
    </DocPage>
  );
}

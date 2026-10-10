// Copied from chanl-site/src/components/sections/quote-banner.tsx. The orange-to-rose gradient is
// replaced by this site's primary token so the banner stays inside the Protobox palette.
export function QuoteBanner({ quote, source }: { quote: string; source: string }) {
  return (
    <section className="section-padding container !pt-0">
      <div className="rounded-2xl bg-primary px-8 py-10 md:px-16 md:py-14">
        <div className="mx-auto max-w-4xl text-center">
          <blockquote className="text-xl font-medium leading-snug text-primary-foreground md:text-2xl lg:text-3xl">
            &ldquo;{quote}&rdquo;
          </blockquote>
          <p className="mt-4 text-sm text-primary-foreground/75">{source}</p>
        </div>
      </div>
    </section>
  );
}

import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex-1 grid place-items-center px-6 py-16">
      <div className="max-w-md text-center">
        <div className="font-serif text-[42px] leading-tight mb-2">Page not found</div>
        <p className="text-muted text-[14px] mb-6">
          That page hasn&rsquo;t been created yet, or it has been moved.
        </p>
        <Link
          href="/overview/home"
          className="inline-flex items-center px-4 py-2 rounded-md bg-brand text-white text-[13px] font-medium hover:bg-brand-600"
        >
          Go to wiki home
        </Link>
      </div>
    </main>
  );
}

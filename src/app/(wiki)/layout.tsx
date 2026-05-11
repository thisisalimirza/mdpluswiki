import Sidebar from '@/components/Sidebar';
import MobileNav from '@/components/MobileNav';
import SearchModal from '@/components/SearchModal';
import { getNavTree, getSearchablePages, getRecentChanges } from '@/lib/content';

export default function WikiLayout({ children }: { children: React.ReactNode }) {
  const tree = getNavTree();
  const searchablePages = getSearchablePages();
  const recentChanges = getRecentChanges(5);
  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-white">
      <Sidebar tree={tree} searchablePages={searchablePages} recentChanges={recentChanges} />
      <MobileNav tree={tree} />
      <SearchModal searchablePages={searchablePages} />
      {children}
    </div>
  );
}

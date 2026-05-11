import Sidebar from '@/components/Sidebar';
import MobileNav from '@/components/MobileNav';
import { getNavTree } from '@/lib/content';

export default function WikiLayout({ children }: { children: React.ReactNode }) {
  const tree = getNavTree();
  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-white">
      <Sidebar tree={tree} />
      <MobileNav tree={tree} />
      {children}
    </div>
  );
}

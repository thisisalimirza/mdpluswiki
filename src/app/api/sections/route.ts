import { NextResponse } from 'next/server';
import { discoverSections } from '@/lib/content';

export const dynamic = 'force-dynamic';

export async function GET() {
  const sections = discoverSections();
  return NextResponse.json({ sections });
}

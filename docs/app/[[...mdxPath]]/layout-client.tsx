'use client';

import { usePathname } from 'next/navigation';
import { Footer, Layout, Navbar } from "nextra-theme-docs";
import "nextra-theme-docs/style.css";
import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { useMemo } from "react";
import type { PageMapItem } from "nextra";

// import logo_full.svg directly, its next.js
import logo_full from "../logo_full.svg";

const footer = <Footer>MIT {new Date().getFullYear()} © Babylon.</Footer>;

// API Reference pages (to filter from documentation sidebar)
const API_REFERENCE_PAGES = [
  'api-reference',
  'authentication',
  'real-time',
  'markets',
  'users',
  'social',
  'errors',
  'rest-api-reference',
  '_generated'
] as const;

// Documentation pages (to filter from API reference sidebar)
const DOCUMENTATION_PAGES = [
  'documentation',
  'getting-started',
  'building-agents',
  'agent-examples',
  'a2a',
  'deployment',
  'agents',
  'contracts',
  'cli',
  'moderation',
  'reference',
  'legal',
  'about'
] as const;

// Type for items with route property
interface PageMapItemWithRoute {
  route?: string;
  name?: string;
  children?: PageMapItemWithRoute[];
}

function filterPageMap(pageMap: PageMapItem[], currentPath: string): PageMapItem[] {
  if (!pageMap || !Array.isArray(pageMap)) return pageMap;
  
  const isApiReferencePage = API_REFERENCE_PAGES.some(page => 
    currentPath === `/${page}` || currentPath.startsWith(`/${page}/`)
  );
  
  const isDocumentationPage = DOCUMENTATION_PAGES.some(page => 
    currentPath === `/${page}` || currentPath.startsWith(`/${page}/`)
  );

  if (isApiReferencePage) {
    return pageMap.filter((item) => {
      if (!item || typeof item !== 'object') return false;
      const typedItem = item as PageMapItemWithRoute;
      const route = typedItem.route || '';
      const routeKey = route.replace('/', '');
      return API_REFERENCE_PAGES.includes(routeKey as typeof API_REFERENCE_PAGES[number]) || 
             API_REFERENCE_PAGES.some(page => route.startsWith(`/${page}/`));
    });
  } else if (isDocumentationPage) {
    return pageMap.filter((item) => {
      if (!item || typeof item !== 'object') return false;
      const typedItem = item as PageMapItemWithRoute;
      const route = typedItem.route || '';
      const routeKey = route.replace('/', '');
      return DOCUMENTATION_PAGES.includes(routeKey as typeof DOCUMENTATION_PAGES[number]) || 
             DOCUMENTATION_PAGES.some(page => route.startsWith(`/${page}/`));
    });
  }
  
  return pageMap;
}

export default function DocsLayoutClient({
  children,
  pageMap,
}: {
  children: ReactNode;
  pageMap: PageMapItem[];
}) {
  const pathname = usePathname();
  const currentPath = pathname || '/';
  
  // Filter pageMap by section
  // Always include currentPath in dependencies so Nextra can detect path changes
  // and properly expand collapsed sections when navigating to nested pages
  const filteredPageMap = useMemo(() => {
    return filterPageMap(pageMap, currentPath);
  }, [pageMap, currentPath]); // Include currentPath so Nextra can react to path changes for sidebar expansion

  return (
    <Layout
      navbar={
        <Navbar
          logo={<Image src={logo_full} alt="Babylon Logo" width={160} height={38} />}
          projectLink="https://github.com/elizaos/babylon"
        >
          <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
            <Link href="/documentation" style={{ color: 'inherit', textDecoration: 'none', fontSize: '0.875rem', fontWeight: 500 }}>
              Documentation
            </Link>
            <Link href="/api-reference" style={{ color: 'inherit', textDecoration: 'none', fontSize: '0.875rem', fontWeight: 500 }}>
              API Reference
            </Link>
            <Link href="/about" style={{ color: 'inherit', textDecoration: 'none', fontSize: '0.875rem', fontWeight: 500 }}>
              About
            </Link>
          </div>
        </Navbar>
      }
      pageMap={filteredPageMap}
      docsRepositoryBase="https://github.com/elizaos/babylon/tree/main/docs"
      editLink="Edit this page on GitHub →"
      sidebar={{ 
        defaultMenuCollapseLevel: 1,
        autoCollapse: false, // Disable auto-collapse to prevent glitches when navigating with collapsed sections
        toggleButton: true // Ensure toggle buttons work properly
      }}
      copyPageButton={true}
      toc={{
        float: true,
        title: 'On This Page',
      }}
      footer={footer}
    >
      {children}
    </Layout>
  );
}

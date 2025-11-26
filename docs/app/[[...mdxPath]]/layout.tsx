import { getPageMap } from "nextra/page-map";
import type { ReactNode } from "react";
import DocsLayoutClient from "./layout-client";

export default async function DocsLayout({
  children,
}: {
  children: ReactNode;
}) {
  const pageMap = await getPageMap();

  return (
    <DocsLayoutClient pageMap={pageMap}>
      {children}
    </DocsLayoutClient>
  );
}

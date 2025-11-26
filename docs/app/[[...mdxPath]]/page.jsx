import { generateStaticParamsFor, importPage } from "nextra/pages";
import { useMDXComponents } from "../../mdx-components";
import { notFound } from "next/navigation";

export const generateStaticParams = generateStaticParamsFor("mdxPath");

// Common non-MDX paths that Next.js might route to our catch-all
const NON_MDX_PATTERNS = [
  /\.js$/,
  /\.json$/,
  /\.ts$/,
  /\.tsx$/,
  /^_/,
  /^devSw/,
  /^sw\.js$/,
  /^service-worker/,
];

function isValidMdxPath(mdxPath) {
  if (!mdxPath || !Array.isArray(mdxPath) || mdxPath.length === 0) {
    return false;
  }
  
  const pathStr = mdxPath.join('/');
  return !NON_MDX_PATTERNS.some(pattern => pattern.test(pathStr));
}

export async function generateMetadata(props) {
  const params = await props.params;
  
  // Validate path before attempting to import
  if (!isValidMdxPath(params.mdxPath)) {
    return {};
  }
  
  try {
    const { metadata } = await importPage(params.mdxPath);
    return metadata;
  } catch {
    // If importPage fails, it's not a valid MDX page
    return {};
  }
}

const Wrapper = useMDXComponents().wrapper;

export default async function Page(props) {
  const params = await props.params;
  
  // Validate path before attempting to import
  if (!isValidMdxPath(params.mdxPath)) {
    notFound();
  }
  
  try {
    const result = await importPage(params.mdxPath);
    const { default: MDXContent, toc, metadata } = result;
    return (
      <Wrapper toc={toc} metadata={metadata}>
        <MDXContent {...props} params={params} />
      </Wrapper>
    );
  } catch {
    // If importPage fails, it's not a valid MDX page - return 404
    notFound();
  }
}

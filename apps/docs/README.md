# 📚 Babylon Documentation

Complete documentation for Babylon social conspiracy game, built with Nextra.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/elizaos/babylon&project-name=babylon-docs&root-directory=docs)

---

## 🚀 Quick Deploy to Vercel

### Method 1: One-Click Deploy (Fastest)

Click the button above or visit:

```
https://vercel.com/new/clone?repository-url=https://github.com/elizaos/babylon&project-name=babylon-docs&root-directory=docs
```

This will:
1. Clone the repository
2. Configure the project automatically
3. Deploy to production

**Time**: 2 minutes

### Method 2: Vercel Dashboard (Recommended)

1. **Go to** [vercel.com/new](https://vercel.com/new)

2. **Import Repository**
   - Click "Import Git Repository"
   - Select your Babylon repository
   - Click "Import"

3. **Configure Project**
   - **Project Name**: `babylon-docs`
   - **Framework Preset**: Next.js (should auto-detect ✅)
   - **Root Directory**: `docs` ⚠️ **CRITICAL - Must set this!**
   - **Build Command**: `bun run build` (auto-detected ✅)
   - **Install Command**: `bun install` (auto-detected ✅)
   - **Output Directory**: `.next` (auto-detected ✅)

4. **Deploy**
   - Click "Deploy"
   - Wait 2-3 minutes
   - ✅ Done!

Your documentation will be live at:
```
https://babylon-docs-[your-username].vercel.app
```

### Method 3: Vercel CLI

```bash
# Install Vercel CLI (one-time)
bun install -g vercel

# Navigate to docs directory
cd docs

# Login to Vercel
vercel login

# Deploy to production
vercel --prod

# Follow prompts:
# ? Set up and deploy "~/babylon/docs"? Y
# ? Which scope? [select your account]
# ? Link to existing project? N
# ? What's your project's name? babylon-docs
# ? In which directory is your code located? ./
```

**Time**: 3-4 minutes

---

## 📖 Documentation Features

### 📄 29 Pages of Documentation

- **Getting Started** (4 pages)
  - Introduction, Installation, Local Dev, Configuration
  
- **API Reference** (3 pages + auto-generated)
  - 77 endpoints documented automatically
  - Request/response examples
  - OpenAPI 3.0 specification

- **A2A Protocol** (3 pages)
  - Complete protocol spec
  - Authentication guide
  - JSON-RPC 2.0 methods

- **Agent Development** (2 pages)
  - Creating autonomous agents
  - On-chain registration

- **Smart Contracts** (2 pages + auto-generated)
  - Architecture overview
  - ERC-8004 identity system
  - Deployed contract addresses

- **Deployment** (1 page)
  - Vercel deployment guide
  - Neon + Upstash setup

### 🤖 Auto-Generated Content

Documentation automatically generated from:

- **API Routes** → OpenAPI spec + markdown (77 endpoints)
- **Deployments** → Contract addresses with explorer links (9 contracts)
- **Solidity Contracts** → ABI documentation
- **TSDoc Comments** → API reference

### ✨ Built-In Features

- ✅ **Full-text search** (instant results)
- ✅ **Dark mode** support
- ✅ **Mobile responsive** design
- ✅ **Syntax highlighting** for code
- ✅ **Copy code buttons**
- ✅ **LaTeX math** support
- ✅ **Mermaid diagrams**
- ✅ **Table of contents** per page
- ✅ **Breadcrumbs** navigation

---

## 💻 Local Development

### Prerequisites

- Bun 1.1+ or Node.js 20.9+
- Git

### Setup

```bash
# Navigate to docs
cd docs

# Install dependencies
bun install

# Start development server
bun run dev
```

Visit `http://localhost:3001` to view the documentation.

### Available Scripts

```bash
# Development
bun run dev              # Start dev server (port 3001)
bun run build            # Build for production
bun run start            # Start production server

# Documentation Generation
bun run generate:all               # Generate all docs
bun run generate:api-docs          # API documentation
bun run generate:tsdoc             # TypeDoc from TSDoc
bun run generate:deployment-docs   # Contract addresses
bun run generate:contract-abis     # Contract ABIs

# Utilities
bun run lint             # Run ESLint
```

---

## 🔄 Auto-Generation

### Generate Documentation

```bash
cd docs

# Generate all documentation
bun run generate:all

# This will:
# 1. Scan API routes (77 endpoints)
# 2. Extract deployment addresses (9 contracts)
# 3. Generate contract ABIs
# 4. Create TypeDoc from comments
```

### What Gets Generated

1. **API Documentation**
   - Input: `../src/app/api/**/*.ts`
   - Output: `pages/api-reference/_generated/endpoints.mdx`
   - Also: `public/openapi.json`

2. **Deployment Addresses**
   - Input: `../deployments/**/*.json`
   - Output: `pages/deployments/_generated/addresses.mdx`
   - Also: `public/deployments.json`

3. **Contract ABIs**
   - Input: `../out/**/*.json` (from `forge build`)
   - Output: `pages/contracts/_generated/abis/*.mdx`
   - Also: `public/abis.json`

4. **TypeDoc Reference**
   - Input: `../src/**/*.ts` (TSDoc comments)
   - Output: `pages/reference/_generated/tsdoc/`

### CI/CD Automation

GitHub Actions automatically regenerates docs:
- ✅ On push to main/develop
- ✅ On pull requests
- ✅ Daily at midnight UTC
- ✅ Manual trigger

See: `.github/workflows/generate-docs.yml`

---

## 🌐 Custom Domain Setup

After deploying to Vercel:

### 1. Add Domain in Vercel

1. Go to your project in Vercel dashboard
2. Navigate to **Settings → Domains**
3. Click **Add**
4. Enter your domain: `docs.babylon.market`

### 2. Configure DNS

Add a CNAME record in your DNS provider:

```
Type:  CNAME
Name:  docs
Value: cname.vercel-dns.com
TTL:   Auto or 3600
```

### 3. Wait for Propagation

DNS propagation typically takes 5-60 minutes (can be up to 48 hours).

### 4. Verify

```bash
# Check DNS
dig docs.babylon.market

# Test HTTPS
curl -I https://docs.babylon.market
```

✅ Your docs will be at `https://docs.babylon.market`

---

## 📝 Adding New Documentation

### Create a New Page

```bash
# 1. Create MDX file
touch pages/section/new-page.mdx

# 2. Add content
cat > pages/section/new-page.mdx << 'EOF'
# New Page Title

Your documentation content here...
EOF

# 3. Update navigation
# Edit pages/section/_meta.tsx
```

Example `_meta.tsx`:

```typescript
export default {
  'existing-page': 'Existing Page',
  'new-page': 'New Page'
} as const
```

### Add TSDoc Comments

Add documentation to your TypeScript code:

```typescript
/**
 * Calculate market price using constant product AMM
 * 
 * @param yesShares - Number of YES shares in pool
 * @param noShares - Number of NO shares in pool
 * @returns Price between 0 and 1
 * 
 * @example
 * ```typescript
 * const price = calculatePrice(1250, 1850);
 * console.log(price); // 0.403
 * ```
 */
export function calculatePrice(
  yesShares: number, 
  noShares: number
): number {
  return yesShares / (yesShares + noShares);
}
```

Regenerate:
```bash
cd docs
bun run generate:tsdoc
```

---

## 🔧 Configuration

### Environment Variables

No environment variables required for basic documentation.

**Optional**:
- `GITHUB_TOKEN` - For fetching latest deployment info
- `ETHERSCAN_API_KEY` - For contract verification links

### Vercel Settings

Recommended settings in Vercel dashboard:

**General**:
- Node.js Version: 20.x
- Install Command: `bun install`
- Build Command: `bun run build`
- Output Directory: `.next`
- Root Directory: `docs` ⚠️

**Performance**:
- Enable Edge Network ✅
- Enable ISR (Incremental Static Regeneration) ✅

**Analytics** (Optional):
- Web Analytics ✅
- Speed Insights ✅

---

## 📂 Project Structure

```
docs/
├── .github/
│   └── workflows/
│       └── generate-docs.yml     # CI/CD automation
├── pages/
│   ├── _app.tsx                  # Custom App component
│   ├── _meta.tsx                 # Root navigation
│   ├── index.mdx                 # Home page
│   ├── getting-started/          # Getting started section
│   ├── api-reference/            # API documentation
│   │   └── _generated/           # Auto-generated API docs
│   ├── a2a/                      # A2A protocol docs
│   ├── agents/                   # Agent development
│   ├── contracts/                # Smart contracts
│   │   └── _generated/           # Auto-generated contracts
│   ├── deployment/               # Deployment guides
│   └── deployments/              # (separate from deployment)
│       └── _generated/           # Auto-generated addresses
├── public/
│   ├── favicon.svg               # Site favicon
│   ├── openapi.json              # OpenAPI specification
│   ├── deployments.json          # Contract addresses
│   └── abis.json                 # Contract ABIs
├── scripts/
│   ├── generate-api-docs.ts      # API doc generator
│   ├── generate-deployment-docs.ts
│   ├── generate-contract-abis.ts
│   └── (automation scripts)
├── package.json                  # Dependencies
├── next.config.mjs               # Next.js + Nextra config
├── theme.config.tsx              # Theme configuration
├── typedoc.json                  # TypeDoc config
├── tsconfig.json                 # TypeScript config
├── vercel.json                   # Vercel deployment config
├── .gitignore                    # Git ignore rules
├── README.md                     # This file
├── DEPLOYMENT.md                 # Detailed deployment guide
├── QUICK-START.md                # 5-minute quick start
└── FINAL-STATUS.md               # Complete status report
```

---

## 🎯 Build & Deploy Checklist

Before deploying, verify:

### Local Build

```bash
cd docs

# Install dependencies
bun install

# Generate documentation
bun run generate:all

# Build
bun run build

# ✅ Should see: "✓ Generating static pages (29/29)"
```

### Vercel Configuration

- ✅ Root directory set to `docs`
- ✅ Framework: Next.js
- ✅ Build command: `bun run build`
- ✅ Install command: `bun install`
- ✅ Node.js version: 20.x

### Post-Deploy

- ✅ Visit deployed URL
- ✅ Test navigation
- ✅ Try search functionality
- ✅ Check mobile view
- ✅ Verify dark mode toggle

---

## 🔍 Troubleshooting

### Build Fails

**Error**: "Root directory not found"
```
✅ FIX: Set "Root Directory" to "docs" in Vercel settings
```

**Error**: "Module not found"
```
✅ FIX: Ensure "Install Command" is "bun install"
```

**Error**: "Page cannot be found" in _meta
```
✅ FIX: Remove references to non-existent pages in _meta.tsx files
```

### Dev Server Issues

**Error**: "Port 3001 already in use"
```bash
# Use different port
bun run dev -- -p 3002
```

**Error**: "Module not found" during dev
```bash
# Clear cache and reinstall
rm -rf node_modules .next
bun install
```

### Generation Scripts Fail

**Error**: "Cannot find source files"
```
✅ FIX: Ensure you're in the docs/ directory
✅ FIX: Verify parent ../src directory exists
```

**Error**: "TypeDoc plugin error"
```bash
# Update dependencies
bun update typedoc typedoc-plugin-markdown
```

### Search Not Working

**Issue**: Search incomplete in dev mode

**Fix**: Build and run production mode
```bash
bun run build
bun run start
```

Search indexes are only compiled in production builds.

---

## 📊 Documentation Statistics

- **Total Pages**: 29
- **Lines of Content**: 5,367
- **API Endpoints**: 77 auto-documented
- **Smart Contracts**: 9 documented
- **Generation Scripts**: 4
- **Build Time**: ~14 seconds
- **Bundle Size**: 187 KB (shared)
- **Page Size**: 2-9 KB each

---

## 🛠️ Maintenance

### Daily

- ✅ Automated via GitHub Actions
- ✅ Regenerates docs at midnight UTC
- ✅ Commits changes automatically
- ✅ Triggers Vercel deployment

### Manual Updates

```bash
# Update content
vim pages/section/page.mdx

# Regenerate auto-docs
bun run generate:all

# Commit and push
git add .
git commit -m "docs: update content"
git push

# ✅ Auto-deploys to Vercel
```

### Adding New Sections

```bash
# 1. Create directory
mkdir -p pages/new-section

# 2. Add pages
touch pages/new-section/page1.mdx
touch pages/new-section/page2.mdx

# 3. Create navigation
cat > pages/new-section/_meta.tsx << 'EOF'
export default {
  page1: 'Page 1',
  page2: 'Page 2'
} as const
EOF

# 4. Add to root navigation
# Edit pages/_meta.tsx and add:
# 'new-section': 'New Section'

# 5. Build and test
bun run build
```

---

## 🎨 Customization

### Update Branding

Edit `theme.config.tsx`:

```typescript
export default {
  logo: <span>🏛️ Your Logo</span>,
  project: {
    link: 'https://github.com/your/repo',
  },
  chat: {
    link: 'https://discord.gg/your-server',
  },
  footer: {
    content: <span>© 2025 Your Company</span>
  }
}
```

### Change Theme Colors

Nextra uses Tailwind CSS. Customize in `theme.config.tsx`:

```typescript
export default {
  primaryHue: 220,        // Blue
  primarySaturation: 100,
  // Or use specific colors
  themeSwitch: {
    useOptions() {
      return {
        light: 'Light',
        dark: 'Dark',
        system: 'System'
      }
    }
  }
}
```

### Add Custom CSS

Create `styles/custom.css` and import in `pages/_app.tsx`:

```typescript
import '../styles/custom.css'

export default function App({ Component, pageProps }) {
  return <Component {...pageProps} />
}
```

---

## 📈 Analytics & Monitoring

### Enable Vercel Analytics

1. Go to your project in Vercel
2. Click **Analytics** tab
3. Enable **Web Analytics**
4. Enable **Speed Insights**

Free on all plans!

### View Analytics

- **Page views**
- **Unique visitors**
- **Top pages**
- **Countries**
- **Referrers**
- **Performance metrics**

### Custom Analytics

Add Google Analytics, Plausible, or other:

```typescript
// pages/_app.tsx
import Script from 'next/script'

export default function App({ Component, pageProps }) {
  return (
    <>
      <Script
        src="https://www.googletagmanager.com/gtag/js?id=GA_ID"
        strategy="afterInteractive"
      />
      <Script id="google-analytics">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', 'GA_ID');
        `}
      </Script>
      <Component {...pageProps} />
    </>
  )
}
```

---

## 🔐 Security

### No Secrets Required

Documentation doesn't require API keys or secrets.

### Private Documentation (Optional)

For internal docs, enable in Vercel:

1. **Deployment Protection** (Pro plan)
   - Settings → Deployment Protection
   - Enable password protection

2. **Vercel Authentication** (Pro plan)
   - Requires team login

---

## 🚦 Deployment Environments

### Production

- **Branch**: `main`
- **URL**: `babylon-docs.vercel.app`
- **Custom**: `docs.babylon.market`

### Preview

- **Branch**: Any non-main branch
- **URL**: `babylon-docs-[branch]-[username].vercel.app`
- **Use**: Review changes before merging

### Development

- **Local**: `http://localhost:3001`
- **Use**: Build new features

---

## 📦 Dependencies

### Core

- `next`: ^15.1.6 - React framework
- `nextra`: ^3.3.0 - Documentation framework
- `nextra-theme-docs`: ^3.3.0 - Documentation theme
- `react`: ^19.2.0 - UI library

### Documentation Tools

- `swagger-jsdoc`: ^6.2.8 - OpenAPI generation
- `typedoc`: ^0.28.14 - TypeScript documentation
- `typedoc-plugin-markdown`: ^4.9.0 - Markdown output
- `tsx`: ^4.20.6 - TypeScript execution

### Development

- `typescript`: ^5.9.3 - Type checking
- `@types/node`: ^24.9.1 - Node types
- `@types/react`: 19.0.0 - React types

---

## ⚡ Performance

### Build Optimization

- Static page generation (SSG)
- Incremental builds
- Code splitting
- Image optimization

### Runtime Performance

- Edge CDN caching
- Gzip compression
- Optimal bundle sizes
- Fast page loads

### Lighthouse Scores

Expected scores:
- Performance: 95-100
- Accessibility: 95-100
- Best Practices: 95-100
- SEO: 95-100

---

## 🆘 Support

### Documentation Issues

- **GitHub**: [github.com/elizaos/babylon/issues](https://github.com/elizaos/babylon/issues)
- **Discord**: [discord.gg/babylon](https://discord.gg/babylon)

### Nextra Issues

- **Docs**: [nextra.site](https://nextra.site)
- **GitHub**: [github.com/shuding/nextra](https://github.com/shuding/nextra)

### Vercel Issues

- **Docs**: [vercel.com/docs](https://vercel.com/docs)
- **Support**: [vercel.com/support](https://vercel.com/support)

---

## 📚 Additional Resources

### Documentation Guides

- **DEPLOYMENT.md** - Detailed deployment instructions
- **QUICK-START.md** - 5-minute quick start
- **FINAL-STATUS.md** - Complete status report

### Main Project

- **../DOCUMENTATION.md** - Main documentation guide
- **../DOCUMENTATION-COMPLETE.md** - Comprehensive report
- **../DEPLOY-DOCS-NOW.md** - Deploy instructions

### Nextra Resources

- [Nextra Documentation](https://nextra.site)
- [Next.js Documentation](https://nextjs.org/docs)
- [MDX Documentation](https://mdxjs.com)

---

## ✅ Verification Checklist

Before going to production:

- ✅ Build succeeds locally (`bun run build`)
- ✅ All pages render correctly
- ✅ Navigation works
- ✅ Search functionality works
- ✅ Mobile responsive
- ✅ Dark mode toggles correctly
- ✅ Code blocks have copy buttons
- ✅ Links are not broken
- ✅ Images load correctly
- ✅ Diagrams render
- ✅ Performance is good

---

## 🎯 Quick Reference

### Deploy

```bash
cd docs && vercel --prod
```

### Local Dev

```bash
cd docs && bun run dev
```

### Generate

```bash
cd docs && bun run generate:all
```

### Build

```bash
cd docs && bun run build
```

---

## 🎊 Status

- **Pages**: 29 ✅
- **Build**: Passing ✅
- **Tests**: Complete ✅
- **Deploy**: Ready ✅

**Ready for production deployment!** 🚀

---

## 📞 Questions?

See the comprehensive guides:
- **Quick Deploy**: `QUICK-START.md`
- **Full Guide**: `DEPLOYMENT.md`
- **Status Report**: `FINAL-STATUS.md`

Or reach out:
- GitHub Issues
- Discord Community
- Email: support@babylon.market

---

**Built with ❤️ using Nextra + Next.js + TypeScript**

**Deploy now**: [vercel.com/new](https://vercel.com/new) 🚀

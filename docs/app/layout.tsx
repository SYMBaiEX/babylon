import { Footer, Layout, Navbar } from 'nextra-theme-docs'
import { Banner, Head } from 'nextra/components'
import { getPageMap } from 'nextra/page-map'
import 'nextra-theme-docs/style.css'

export const metadata = {
  title: 'Babylon Documentation',
  description: 'Documentation for Babylon prediction market platform with autonomous agents',
}

const navbar = (
  <Navbar
    logo={<span style={{ fontWeight: 700, fontSize: '1.25rem' }}>🏛️ Babylon Docs</span>}
    projectLink="https://github.com/yourusername/babylon"
    chatLink="https://discord.gg/babylon"
  />
)

const footer = (
  <Footer>
    <span>© 2025 Babylon - Prediction Market Game with Autonomous Agents</span>
  </Footer>
)

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <Head />
      <body>
        <Layout
          navbar={navbar}
          pageMap={await getPageMap()}
          docsRepositoryBase="https://github.com/yourusername/babylon/tree/main/docs"
          footer={footer}
          editLink="Edit this page on GitHub →"
          feedback={{
            content: 'Question? Give us feedback →',
            labels: 'feedback',
          }}
          sidebar={{
            defaultMenuCollapseLevel: 1,
            toggleButton: true,
          }}
          toc={{
            float: true,
            title: 'On This Page',
          }}
        >
          {children}
        </Layout>
      </body>
    </html>
  )
}

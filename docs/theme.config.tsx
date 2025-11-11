import React from 'react'
import { DocsThemeConfig } from 'nextra-theme-docs'

const config: DocsThemeConfig = {
  logo: <span style={{ fontWeight: 700, fontSize: '1.25rem' }}>🏛️ Babylon Docs</span>,
  project: {
    link: 'https://github.com/yourusername/babylon',
  },
  chat: {
    link: 'https://discord.gg/babylon',
  },
  docsRepositoryBase: 'https://github.com/yourusername/babylon/tree/main/docs',
  footer: {
    content: (
      <span>© 2025 Babylon - Prediction Market Game with Autonomous Agents</span>
    ),
  },
}

export default config

/**
 * Design Tokens
 * 
 * Spacing system based on 4px base unit
 * Consistent UI spacing patterns for the application
 */

// Spacing scale (4px base unit)
export const spacing = {
  0: '0',
  1: '0.25rem',  // 4px
  2: '0.5rem',   // 8px
  3: '0.75rem',  // 12px
  4: '1rem',     // 16px
  5: '1.25rem',  // 20px
  6: '1.5rem',   // 24px
  8: '2rem',     // 32px
  10: '2.5rem',  // 40px
  12: '3rem',    // 48px
  16: '4rem',    // 64px
} as const

// Content width constraints
export const contentWidth = {
  feed: '600px',      // Main feed content
  modal: '600px',     // Modals and dialogs
  sidebar: '350px',   // Widget sidebar
  navSidebar: '280px' // Navigation sidebar
} as const

// Consistent padding patterns
export const padding = {
  card: {
    mobile: 'px-4 py-3',        // 16px horizontal, 12px vertical
    desktop: 'px-6 py-4',       // 24px horizontal, 16px vertical
  },
  page: {
    mobile: 'px-4',             // 16px horizontal
    desktop: 'px-6',            // 24px horizontal
  },
  section: {
    mobile: 'py-3',             // 12px vertical
    desktop: 'py-4',            // 16px vertical
  }
} as const

// Typography scale
export const typography = {
  lineHeight: {
    tight: '1.25',
    normal: '1.5',
    relaxed: '1.625',
  },
  fontSize: {
    xs: '0.75rem',    // 12px
    sm: '0.875rem',   // 14px
    base: '0.9375rem', // 15px (standard body text)
    lg: '1.0625rem',  // 17px
    xl: '1.25rem',    // 20px
    '2xl': '1.5rem',  // 24px
  }
} as const

// Gap sizes for consistent spacing
export const gaps = {
  card: '0rem',      // No gap between cards (border separators only)
  avatar: '0.75rem', // 12px gap between avatar and content
  interaction: '1.5rem', // 24px gap between interaction buttons
  section: '1rem',   // 16px gap between sections
} as const

// Touch target sizes (accessibility)
export const touchTargets = {
  minimum: '44px',   // Minimum touch target size
  comfortable: '48px', // Comfortable touch target size
} as const


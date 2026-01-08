/**
 * Test data constants for synpress tests
 *
 * Comprehensive routes and test data for E2E testing of the Babylon app.
 */

/**
 * All page routes in the application
 */
export const ROUTES = {
  // Core routes
  HOME: '/',
  FEED: '/feed',
  CHATS: '/chats',

  // Profile routes
  PROFILE: '/profile',
  PROFILE_BY_ID: (id: string) => `/profile/${id}`,

  // Markets routes
  MARKETS: '/markets',
  MARKETS_PERPS: '/markets?tab=perps',
  MARKETS_PERPS_BY_TICKER: (ticker: string) => `/markets/perps/${ticker}`,
  MARKETS_PREDICTIONS: '/markets?tab=predictions',
  MARKETS_PREDICTIONS_BY_ID: (id: string) => `/markets/predictions/${id}`,

  // Other main pages
  BETTING: '/betting',
  GAME: '/game',
  LEADERBOARD: '/leaderboard',
  NOTIFICATIONS: '/notifications',
  REWARDS: '/rewards',
  REPUTATION: '/reputation',
  REGISTRY: '/registry',

  // Settings
  SETTINGS: '/settings',
  SETTINGS_MODERATION: '/settings/moderation',

  // Agents
  AGENTS: '/agents',
  AGENTS_CREATE: '/agents/create',
  AGENTS_BY_ID: (id: string) => `/agents/${id}`,
  AGENTS_TEAM_CHAT: '/agents/team',

  // Content
  POST_BY_ID: (id: string) => `/post/${id}`,
  ARTICLE_BY_ID: (id: string) => `/article/${id}`,
  TRENDING_BY_TAG: (tag: string) => `/trending/${tag}`,
  TRENDING_GROUP: '/trending/group',

  // Admin
  ADMIN: '/admin',
  ADMIN_GROUPS: '/admin/groups',
  ADMIN_PERFORMANCE: '/admin/performance',
  ADMIN_RL_TRAINING: '/admin/rl-training',
  ADMIN_TRAINING: '/admin/training',

  // Share
  SHARE_PNL: (userId: string) => `/share/pnl/${userId}`,
  SHARE_REFERRAL: (userId: string) => `/share/referral/${userId}`,

  // API docs
  API_DOCS: '/api-docs',
} as const;

/**
 * All routes that should be accessible without authentication
 */
export const PUBLIC_ROUTES = [
  ROUTES.HOME,
  ROUTES.FEED,
  ROUTES.MARKETS,
  ROUTES.LEADERBOARD,
  ROUTES.REGISTRY,
  ROUTES.REPUTATION,
  ROUTES.PROFILE,
  ROUTES.AGENTS,
  ROUTES.API_DOCS,
];

/**
 * Routes that require authentication
 */
export const AUTHENTICATED_ROUTES = [
  ROUTES.CHATS,
  ROUTES.NOTIFICATIONS,
  ROUTES.REWARDS,
  ROUTES.SETTINGS,
  ROUTES.SETTINGS_MODERATION,
  ROUTES.AGENTS_CREATE,
];

/**
 * Admin-only routes
 */
export const ADMIN_ROUTES = [
  ROUTES.ADMIN,
  ROUTES.ADMIN_GROUPS,
  ROUTES.ADMIN_PERFORMANCE,
  ROUTES.ADMIN_RL_TRAINING,
  ROUTES.ADMIN_TRAINING,
];

/**
 * Test selectors for common UI elements
 */
export const SELECTORS = {
  // Auth
  LOGIN_BUTTON:
    'button:has-text("Log in"), button:has-text("Login"), button:has-text("Connect Wallet"), button:has-text("Connect")',
  USER_MENU: '[data-testid="user-menu"]',
  EMAIL_INPUT: 'input[type="email"], input[name="email"]',
  PASSWORD_INPUT: 'input[type="password"]',
  SUBMIT_BUTTON: 'button[type="submit"]',

  // Navigation
  NAV_LINK: 'nav a, [role="navigation"] a',
  BOTTOM_NAV: '[data-testid="bottom-nav"], nav.fixed.bottom-0',

  // Feed
  POST_CARD: '[data-testid="post-card"], article, .post-card',
  CREATE_POST_BUTTON:
    'button[aria-label="Create Post"], button:has-text("Post")',
  FEED_TOGGLE: '[data-testid="feed-toggle"]',

  // Markets
  MARKET_TAB: '[role="tab"]',
  MARKET_CARD: 'button:has-text("$"), [data-testid="market-card"]',
  PREDICTION_CARD: '[data-testid="prediction-card"]',
  SEARCH_INPUT: 'input[type="search"], input[placeholder*="Search"]',
  SORT_BUTTON: 'button:has-text("Trending"), button:has-text("Volume")',

  // Profile
  PROFILE_AVATAR: '[data-testid="profile-avatar"], img[alt*="avatar" i]',
  FOLLOW_BUTTON: 'button:has-text("Follow")',
  MESSAGE_BUTTON: 'button:has-text("Message")',
  EDIT_PROFILE_BUTTON: 'button:has-text("Edit")',

  // Settings
  SETTINGS_TAB: 'button[role="tab"], .settings-tab',
  SAVE_BUTTON: 'button:has-text("Save")',
  THEME_RADIO: 'input[type="radio"][name="theme"]',

  // Chat
  CHAT_LIST: '[data-testid="chat-list"]',
  CHAT_INPUT:
    'textarea[placeholder*="message" i], input[placeholder*="message" i]',
  SEND_BUTTON: 'button[aria-label*="send" i], button:has-text("Send")',

  // Admin
  ADMIN_TAB: '[data-testid="admin-tab"], button.admin-tab',
  ADMIN_TABLE: 'table, [role="table"]',

  // Common
  LOADING_SKELETON: '[data-testid="skeleton"], .skeleton',
  ERROR_MESSAGE: '[role="alert"], .error, .text-red',
  MODAL: '[role="dialog"], .modal',
  TOAST: '[data-testid="toast"], [role="status"]',
  BUTTON: 'button',
  INPUT: 'input',
  TEXTAREA: 'textarea',
  SELECT: 'select',
  CHECKBOX: 'input[type="checkbox"]',
  SLIDER: 'input[type="range"], [role="slider"]',
} as const;

/**
 * Test form data
 */
export const TEST_FORM_DATA = {
  // Profile
  DISPLAY_NAME: 'Test User Display Name',
  USERNAME: 'testuser123',
  BIO: 'This is a test bio for E2E testing purposes.',

  // Post
  POST_CONTENT: 'This is a test post from E2E tests',

  // Chat
  CHAT_MESSAGE: 'Hello, this is a test message!',

  // Search
  SEARCH_QUERY: 'test search query',

  // Edge cases
  EMPTY_STRING: '',
  LONG_STRING: 'A'.repeat(5000),
  SPECIAL_CHARS: '!@#$%^&*(){}[]<>?/\\|`~',
  UNICODE_STRING: '日本語テスト 🎉 émojis äöü',
  XSS_ATTEMPT: '<script>alert("xss")</script>',
  SQL_INJECTION: "'; DROP TABLE users; --",
  WHITESPACE_ONLY: '   \t\n   ',
  NEGATIVE_NUMBER: -999999,
  LARGE_NUMBER: 999999999999,
  ZERO: 0,
  DECIMAL: 0.001,
} as const;

/**
 * Viewport sizes for responsive testing
 */
export const VIEWPORTS = {
  MOBILE_SMALL: { width: 320, height: 568 }, // iPhone SE
  MOBILE: { width: 375, height: 667 }, // iPhone 8
  MOBILE_LARGE: { width: 414, height: 896 }, // iPhone 11 Pro Max
  TABLET: { width: 768, height: 1024 }, // iPad
  DESKTOP: { width: 1280, height: 800 },
  DESKTOP_LARGE: { width: 1920, height: 1080 },
  DESKTOP_ULTRAWIDE: { width: 2560, height: 1440 },
} as const;

/**
 * Timeouts for different operations
 */
export const TIMEOUTS = {
  SHORT: 3000,
  MEDIUM: 10000,
  LONG: 30000,
  EXTRA_LONG: 60000,
  PAGE_LOAD: 15000,
  API_CALL: 10000,
  ANIMATION: 500,
} as const;

/**
 * Test data for trading operations
 */
export const TRADING_TEST_DATA = {
  // Perp trading
  PERP_SIZES: [1, 10, 100, 0.5, 0.01],
  LEVERAGE_VALUES: [1, 2, 5, 10, 20],

  // Prediction market
  PREDICTION_AMOUNTS: [1, 10, 100, 0.5],
  YES_NO_SIDES: ['YES', 'NO'] as const,

  // Invalid inputs
  INVALID_SIZE: -1,
  INVALID_LEVERAGE: 1000,
} as const;

/**
 * Default test account - uses anvil default wallet
 * This wallet should already be an admin in localnet
 */
export const DEFAULT_ANVIL_ACCOUNT = {
  address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
  privateKey:
    '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  mnemonic: 'test test test test test test test test test test test junk',
} as const;

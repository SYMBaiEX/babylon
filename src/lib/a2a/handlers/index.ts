/**
 * A2A Handler Exports
 * 
 * All A2A method handlers organized by feature category
 */

// Social features (11 methods)
export {
  handleGetFeed,
  handleGetPost,
  handleCreatePost,
  handleDeletePost,
  handleLikePost,
  handleUnlikePost,
  handleSharePost,
  handleGetComments,
  handleCreateComment,
  handleDeleteComment,
  handleLikeComment,
} from './social'

// Trading features (8 methods)
export {
  handleGetPredictions,
  handleGetPerpetuals,
  handleBuyShares,
  handleSellShares,
  handleOpenPosition,
  handleClosePosition,
  handleGetTrades,
  handleGetTradeHistory,
} from './trading'

// User management (7 methods)
export {
  handleGetUserProfile,
  handleUpdateProfile,
  handleFollowUser,
  handleUnfollowUser,
  handleGetFollowers,
  handleGetFollowing,
  handleSearchUsers,
} from './users'

// Messaging (6 methods)
export {
  handleGetChats,
  handleGetChatMessages,
  handleSendMessage,
  handleCreateGroup,
  handleLeaveChat,
  handleGetUnreadCount,
} from './messaging'

// Notifications (5 methods)
export {
  handleGetNotifications,
  handleMarkNotificationsRead,
  handleGetGroupInvites,
  handleAcceptGroupInvite,
  handleDeclineGroupInvite,
} from './notifications'

// Stats & Discovery (13 methods)
export {
  handleGetLeaderboard,
  handleGetUserStats,
  handleGetSystemStats,
  handleGetReferrals,
  handleGetReferralStats,
  handleGetReferralCode,
  handleGetReputation,
  handleGetReputationBreakdown,
  handleGetTrendingTags,
  handleGetPostsByTag,
  handleGetOrganizations,
} from './stats'

// Moderation (10 methods)
export {
  handleBlockUser,
  handleUnblockUser,
  handleMuteUser,
  handleUnmuteUser,
  handleReportUser,
  handleReportPost,
  handleGetBlocks,
  handleGetMutes,
  handleCheckBlockStatus,
  handleCheckMuteStatus,
} from '../moderation-handlers'

// Points Transfer (1 method)
export {
  handleTransferPoints,
} from './points'

// Favorites (4 methods)
export {
  handleFavoriteProfile,
  handleUnfavoriteProfile,
  handleGetFavorites,
  handleGetFavoritePosts,
} from './favorites'


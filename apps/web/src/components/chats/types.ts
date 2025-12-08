export type ChatFilter = 'all' | 'dms' | 'groups';

export interface Chat {
  id: string;
  name: string;
  isGroup: boolean;
  lastMessage?: {
    id: string;
    content: string;
    createdAt: string;
  } | null;
  messageCount?: number;
  qualityScore?: number;
  participants?: number;
  updatedAt: string;
  otherUser?: {
    id: string;
    displayName: string | null;
    username: string | null;
    profileImageUrl: string | null;
  };
}

export interface Message {
  id: string;
  content: string;
  senderId: string;
  createdAt: string;
}

export interface ChatParticipant {
  id: string;
  displayName: string;
  username?: string;
  profileImageUrl?: string;
}

export interface ChatDetails {
  chat: {
    id: string;
    name: string | null;
    isGroup: boolean;
    createdAt: string;
    updatedAt: string;
    otherUser?: {
      id: string;
      displayName: string | null;
      username: string | null;
      profileImageUrl: string | null;
    } | null;
  };
  messages: Message[];
  participants: ChatParticipant[];
}

// Helper to get the best profile URL identifier (prefer username over id)
export const getProfilePath = (user: { id: string; username?: string | null }) => {
  const identifier = user.username || user.id;
  return `/profile/${identifier}`;
};

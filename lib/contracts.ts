export type Reaction = "like" | "pass" | "strong-like";
export type Gender = "woman" | "man" | "nonbinary";
export type Intent = "relationship" | "casual" | "figuring-it-out";
export type RadiusMiles = 5 | 10 | 25 | 50 | 100;

export interface Preferences {
  genders: Gender[];
  minAge: number;
  maxAge: number;
  radiusMiles: RadiusMiles;
  /** Minimum invented meme-match score required for Discover. */
  minMatchPercent?: number;
}

export interface PublicProfile {
  id: string;
  name: string;
  age: number;
  town: string;
  state: string;
  stateCode: string;
  bio: string;
  photo: string;
  photos: string[];
  interests: string[];
  humorTags: string[];
  intent: Intent;
  /** @deprecated use town */
  location: string;
}

export interface Profile {
  id: string;
  name: string;
  dob: string;
  bio: string;
  town: string;
  state: string;
  country: string;
  stateCode: string;
  countryCode: string;
  gender: Gender;
  matchLocation: string;
  photo: string;
  photos: string[];
  favoriteMemes: string[];
  interests: string[];
  intent: Intent;
  preferences: Preferences;
  initialTags: string[];
  complete: boolean;
  /** @deprecated use town */
  location: string;
}

export interface Me {
  user: { id: string; email: string; name: string };
  profile: Profile | null;
  demoMode: boolean;
}

export interface Meme {
  id: string;
  type: "image" | "video";
  src: string;
  poster: string | null;
  caption: string;
  author?: { id: string; name: string } | null;
  likeCount?: number;
  commentCount?: number;
  saved?: boolean;
}

export interface Tasteprint {
  reactionCount: number;
  positiveCount: number;
  calibrated: boolean;
  tags: { tag: string; weight: number }[];
  summary: string;
}

export interface Compatibility {
  score: number;
  cosine: number;
  jaccard: number;
  sharedTags: string[];
  sharedMemes: Meme[];
  explanation: string;
}

export interface Candidate extends PublicProfile {
  compatibility: Compatibility;
  /** Profiles shown for context when current filters have no matches. */
  browseOnly?: boolean;
}
export interface Match {
  id: string;
  profile: PublicProfile;
  compatibility: Compatibility;
  createdAt: string;
  lastActivityAt: string;
  lastMessage: string | null;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  body: string;
  memeId: string | null;
  createdAt: string;
}

export interface Generation {
  id: string;
  type: "image" | "video";
  status: "queued" | "generating" | "ready" | "failed" | "expired";
  failure: string | null;
  src: string | null;
}

export interface ApiError {
  error: { code: string; message: string; fields?: Record<string, string> };
}
export type NotificationType = "match" | "message" | "like" | "comment";
export interface FeedComment {
  id: string;
  memeId: string;
  author: { id: string; name: string };
  body: string;
  createdAt: string;
}
export interface AppNotification {
  id: string;
  type: NotificationType;
  message: string;
  actor: { id: string; name: string } | null;
  memeId: string | null;
  matchId: string | null;
  createdAt: string;
  readAt: string | null;
}

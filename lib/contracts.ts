export type Reaction = "like" | "pass" | "strong-like";
export type Gender = "woman" | "man" | "nonbinary";
export type Intent = "relationship" | "casual" | "figuring-it-out";
export interface Preferences {
  genders: Gender[];
  minAge: number;
  maxAge: number;
}
export interface PublicProfile {
  id: string;
  name: string;
  age: number;
  bio: string;
  location: string;
  photo: string;
  intent: Intent;
}
export interface Profile {
  id: string;
  name: string;
  dob: string;
  bio: string;
  location: string;
  gender: Gender;
  photo: string;
  intent: Intent;
  preferences: Preferences;
  initialTags: string[];
  complete: boolean;
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
}
export interface Tasteprint {
  reactionCount: number;
  positiveCount: number;
  calibrated: boolean;
  tags: { tag: string; weight: number }[];
  summary: string;
}
export interface Compatibility {
  score: number | null;
  cosine: number;
  jaccard: number;
  sharedTags: string[];
  sharedMemes: Meme[];
  explanation: string;
}
export interface Candidate extends PublicProfile {
  compatibility: Compatibility;
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

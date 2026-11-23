export type UserRole = 'student' | 'moderator' | 'content_admin' | 'admin' | 'super_admin';

export interface UserProfile {
  uid: string;
  email: string;
  email_verified?: boolean;
  display_name: string;
  photo_url?: string | null;
  level_id?: string | null;
  grp?: string | null;
  institution?: string | null;
  locale: 'bn' | 'en' | 'zh' | string;
  role: UserRole;
  blocked?: number | boolean;
  profile_visibility: 'public' | 'followers' | 'private';
  created_at?: number;
}

export interface ResourceManifestItem {
  id: string;
  version: string;
  url: string;
  sizeBytes: number;
  sha256: string;
  required: boolean;
  platformMinVersion?: string;
  type?: string;
  title?: string;
  chapterId?: string;
}

export interface SyncOperation {
  operationId: string;
  type: 'study_event' | 'completion' | 'profile';
  payload: Record<string, unknown>;
}

'use client';
import { api } from './api';

export interface Book { id: string; title: string; subject_id: string; edition: string; author: string; cover_c1: string; cover_c2: string; featured_rank: number | null; sort: number; status: string; levels: string[] }
export interface Chapter { id: string; book_id: string; number: number; title: string; sort: number; status: string }
export interface ResourceVersion { version: number; url: string; change_note: string; created_at: number }
export interface Resource { id: string; chapter_id: string; type: string; title: string; sort: number; current_version: number; pages: number | null; licence: string; status: string; url: string | null; versions: ResourceVersion[] }
export interface Exam { id: string; title: string; type: string; book_id: string | null; chapter_id: string | null; duration_sec: number; question_count: number; pass_pct: number; status: string; opens_at: number | null; closes_at: number | null }
export interface Announcement { id: string; title: string; body: string; created_at: number }
export interface Subject { id: string; name_en: string; name_bn: string; name_zh?: string; icon?: string; color?: string; sort?: number }
export interface Content {
  levels: { id: string; name_en: string }[]; subjects: Subject[]; books: Book[]; chapters: Chapter[]; resources: Resource[];
  notes: { chapter_id: string; current_version: number; latest: number; updated_at: number }[]; exams: Exam[]; announcements: Announcement[];
  questionCounts: Record<string, number>;
}
export const loadContent = () => api<Content>('/v1/admin/content');

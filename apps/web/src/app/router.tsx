import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { LoadingState } from '../components/SanzarUI';

const HomePage = lazy(() => import('../features/home/HomePage').then((m) => ({ default: m.HomePage })));
const LibraryPage = lazy(() => import('../features/library/LibraryPage').then((m) => ({ default: m.LibraryPage })));
const DictionaryPage = lazy(() => import('../features/dictionary/DictionaryPage').then((m) => ({ default: m.DictionaryPage })));
const LearnPage = lazy(() => import('../features/learning/LearnPage').then((m) => ({ default: m.LearnPage })));
const ExamsPage = lazy(() => import('../features/exams/ExamsPage').then((m) => ({ default: m.ExamsPage })));
const ProgressPage = lazy(() => import('../features/progress/ProgressPage').then((m) => ({ default: m.ProgressPage })));
const CommunityPage = lazy(() => import('../features/community/CommunityPage').then((m) => ({ default: m.CommunityPage })));
const ProfilePage = lazy(() => import('../features/profile/ProfilePage').then((m) => ({ default: m.ProfilePage })));
const AuthPage = lazy(() => import('../features/auth/AuthPage').then((m) => ({ default: m.AuthPage })));
const AdminDashboard = lazy(() => import('../features/admin/AdminDashboard').then((m) => ({ default: m.AdminDashboard })));

export const AppRouter: React.FC = () => {
  return (
    <Suspense fallback={<LoadingState />}>
      <Routes>
        {/* Admin Dashboard with its own sticky sidebar shell */}
        <Route path="/admin/*" element={<AdminDashboard />} />

        {/* Student App */}
        <Route path="/" element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path="library" element={<LibraryPage />} />
          <Route path="dictionary" element={<DictionaryPage />} />
          <Route path="learn" element={<LearnPage mode="root" />} />
          <Route path="learn/book/:bookId" element={<LearnPage mode="book" />} />
          <Route path="learn/chapter/:bookId/:chapterId" element={<LearnPage mode="chapter" />} />
          <Route path="learn/resource/:resourceId" element={<LearnPage mode="resource" />} />
          <Route path="exams" element={<ExamsPage view="list" />} />
          <Route path="exams/:examId" element={<ExamsPage view="run" />} />
          <Route path="attempts/:attemptId" element={<ExamsPage view="result" />} />
          <Route path="progress" element={<ProgressPage />} />
          <Route path="community" element={<CommunityPage />} />
          <Route path="tutor" element={<Navigate to="/" replace />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="settings" element={<ProfilePage />} />
          <Route path="login" element={<AuthPage mode="login" />} />
          <Route path="register" element={<AuthPage mode="register" />} />
          <Route path="forgot-password" element={<AuthPage mode="forgot" />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Suspense>
  );
};

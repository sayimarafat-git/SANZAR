import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { HomePage } from '../features/home/HomePage';
import { LibraryPage } from '../features/library/LibraryPage';
import { LearnPage } from '../features/learning/LearnPage';
import { ExamsPage } from '../features/exams/ExamsPage';
import { ProgressPage } from '../features/progress/ProgressPage';
import { CommunityPage } from '../features/community/CommunityPage';
import { TutorPage } from '../features/tutor/TutorPage';
import { ProfilePage } from '../features/profile/ProfilePage';
import { AuthPage } from '../features/auth/AuthPage';
import { AdminDashboard } from '../features/admin/AdminDashboard';

export const AppRouter: React.FC = () => {
  return (
    <Routes>
      {/* Admin Dashboard with its own sticky sidebar shell */}
      <Route path="/admin/*" element={<AdminDashboard />} />

      {/* Student App */}
      <Route path="/" element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="library" element={<LibraryPage />} />
        <Route path="learn" element={<LearnPage mode="root" />} />
        <Route path="learn/book/:bookId" element={<LearnPage mode="book" />} />
        <Route path="learn/chapter/:bookId/:chapterId" element={<LearnPage mode="chapter" />} />
        <Route path="learn/resource/:resourceId" element={<LearnPage mode="resource" />} />
        <Route path="exams" element={<ExamsPage view="list" />} />
        <Route path="exams/:examId" element={<ExamsPage view="run" />} />
        <Route path="attempts/:attemptId" element={<ExamsPage view="result" />} />
        <Route path="progress" element={<ProgressPage />} />
        <Route path="community" element={<CommunityPage />} />
        <Route path="tutor" element={<TutorPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="settings" element={<ProfilePage />} />
        <Route path="login" element={<AuthPage mode="login" />} />
        <Route path="register" element={<AuthPage mode="register" />} />
        <Route path="forgot-password" element={<AuthPage mode="forgot" />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
};

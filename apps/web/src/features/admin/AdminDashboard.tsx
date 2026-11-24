import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AdminLayout, RoleGuard } from './AdminLayout';
import { AdminOverviewPage } from './AdminOverviewPage';
import { AdminContentPage } from './AdminContentPage';
import { AdminDictionaryPage } from './AdminDictionaryPage';
import { AdminExamsPage } from './AdminExamsPage';
import { AdminUsersPage } from './AdminUsersPage';
import { AdminGamificationPage } from './AdminGamificationPage';
import { AdminModerationPage } from './AdminModerationPage';
import { AdminAnnouncementsPage } from './AdminAnnouncementsPage';
import { AdminAuditPage } from './AdminAuditPage';
import { AdminSettingsPage } from './AdminSettingsPage';

export const AdminDashboard: React.FC = () => {
  return (
    <Routes>
      <Route element={<AdminLayout />}>
        <Route index element={<AdminOverviewPage />} />
        <Route
          path="content"
          element={
            <RoleGuard min="teacher">
              <AdminContentPage view="books" />
            </RoleGuard>
          }
        />
        <Route
          path="content/book/:bookId"
          element={
            <RoleGuard min="teacher">
              <AdminContentPage view="book" />
            </RoleGuard>
          }
        />
        <Route
          path="content/chapter/:chapterId"
          element={
            <RoleGuard min="teacher">
              <AdminContentPage view="chapter" />
            </RoleGuard>
          }
        />
        <Route
          path="dictionary"
          element={
            <RoleGuard min="teacher">
              <AdminDictionaryPage />
            </RoleGuard>
          }
        />
        <Route
          path="exams"
          element={
            <RoleGuard min="teacher">
              <AdminExamsPage />
            </RoleGuard>
          }
        />
        <Route
          path="users"
          element={
            <RoleGuard min="admin">
              <AdminUsersPage />
            </RoleGuard>
          }
        />
        <Route
          path="xp-streaks"
          element={
            <RoleGuard min="admin">
              <AdminGamificationPage />
            </RoleGuard>
          }
        />
        <Route path="moderation" element={<AdminModerationPage />} />
        <Route
          path="announcements"
          element={
            <RoleGuard min="admin">
              <AdminAnnouncementsPage />
            </RoleGuard>
          }
        />
        <Route
          path="audit"
          element={
            <RoleGuard min="admin">
              <AdminAuditPage />
            </RoleGuard>
          }
        />
        <Route
          path="settings"
          element={
            <RoleGuard min="admin">
              <AdminSettingsPage />
            </RoleGuard>
          }
        />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Route>
    </Routes>
  );
};

import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { HomePage } from '../features/home/HomePage';
import { AuthPage } from '../features/auth/AuthPage';
import { AdminDashboard } from '../features/admin/AdminDashboard';
import { LearnAndDictionaryPage } from '../features/learning/LearnPage';

export const AppRouter: React.FC = () => {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="login" element={<AuthPage mode="login" />} />
        <Route path="register" element={<AuthPage mode="register" />} />
        <Route path="forgot-password" element={<AuthPage mode="forgot" />} />
        <Route path="learn" element={<LearnAndDictionaryPage type="learn" />} />
        <Route path="dictionary" element={<LearnAndDictionaryPage type="dictionary" />} />
        <Route path="profile" element={<AdminDashboard />} />
        
        {/* Admin Dashboard: Single project /admin per architecture doc */}
        <Route path="admin/*" element={<AdminDashboard />} />
        
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
};

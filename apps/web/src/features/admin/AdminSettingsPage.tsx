import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest, errorText } from '../../lib/api-client';
import { useToast } from '../../components/SanzarUI';

const ROLE_DESCRIPTIONS: { role: string; label: string; access: string }[] = [
  { role: 'student', label: 'Student', access: 'Learning app, dictionary, exams, community, and personal progress.' },
  { role: 'moderator', label: 'Moderator', access: 'Admin Overview and Community moderation reports.' },
  { role: 'teacher', label: 'Teacher', access: 'Create & manage Content (books, notes, resources), Dictionary entries, Exams, and Moderation.' },
  { role: 'content_admin', label: 'Content Admin', access: 'Senior curriculum access across Content, Dictionary, Exams, and Moderation.' },
  { role: 'admin', label: 'Admin', access: 'Manage Users, XP & Streaks, Announcements, Audit logs, and platform Settings.' },
  { role: 'super_admin', label: 'Super Admin', access: 'Full ownership including assigning user roles and running database migrations.' },
];

export const AdminSettingsPage: React.FC = () => {
  const toast = useToast();
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const runMigrate = async () => {
    setErr(null);
    setBusy(true);
    try {
      const res = await apiRequest<{ applied?: string[] }>('/v1/admin/migrate', {
        method: 'POST',
        bodyJson: {},
      });
      toast(res.applied?.length ? `Applied: ${res.applied.join(', ')}` : 'Schema up to date');
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold">Settings</h1>

      <div className="sanzar-card p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold">Roles &amp; permissions</h2>
            <p className="text-xs text-sanzar-muted mt-0.5">
              Assign roles (including <b>teacher</b>) to accounts from the Users panel.
            </p>
          </div>
          <Link
            to="/admin/users"
            className="px-3.5 py-1.5 rounded-xl border border-sanzar-border text-xs font-semibold hover:bg-sanzar-surface2 transition"
          >
            Manage user roles →
          </Link>
        </div>
        <div className="grid sm:grid-cols-2 gap-2.5 text-xs">
          {ROLE_DESCRIPTIONS.map((r) => (
            <div key={r.role} className="p-3 rounded-xl bg-sanzar-surface2/70 border border-sanzar-border space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sanzar-text">{r.label}</span>
                <span className="sanzar-pill text-[10px]">{r.role}</span>
              </div>
              <p className="text-sanzar-text2 leading-relaxed">{r.access}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="sanzar-card p-5 space-y-3">
        <h2 className="text-lg font-bold">Database migrations</h2>
        <p className="text-xs text-sanzar-muted">
          Apply pending D1 SQL schema migrations (owner / super_admin only).
        </p>
        <button
          onClick={runMigrate}
          disabled={busy}
          className="px-4 py-2 rounded-xl border border-sanzar-border text-sm font-semibold hover:bg-sanzar-surface2"
        >
          Run migrations
        </button>
      </div>

      {err && <div className="text-sm text-sanzar-danger">{err}</div>}
    </div>
  );
};

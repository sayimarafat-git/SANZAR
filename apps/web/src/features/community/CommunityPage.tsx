import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Heart,
  MessageCircle,
  Flag,
  Trash2,
  Ban,
  Plus,
  Send,
  Link as LinkIcon,
  BarChart3,
  ExternalLink,
  Search,
  X,
} from 'lucide-react';
import { useAuth } from '../../lib/auth-context';
import { useSettings } from '../../lib/settings-context';
import { apiRequest, errorText } from '../../lib/api-client';
import type { Comment, Post, PostAttachment, PublicProfile } from '../../lib/models';
import { ErrorRetry, LoadingState, Modal, timeAgo, useToast } from '../../components/SanzarUI';

const HTTPS_URL_RE = /https?:\/\/[^\s<>()]+/gi;

function extractHttpsLinks(text: string): PostAttachment[] {
  const matches = text.match(HTTPS_URL_RE) || [];
  const seen = new Set<string>();
  const out: PostAttachment[] = [];
  for (const raw of matches) {
    const cleaned = raw.replace(/[.,!?;:'")\]}]+$/, '');
    try {
      const u = new URL(cleaned);
      if ((u.protocol === 'https:' || u.protocol === 'http:') && !seen.has(u.href)) {
        seen.add(u.href);
        out.push({ url: u.href, name: u.hostname, mime: 'text/uri-list' });
        if (out.length >= 5) break;
      }
    } catch {
      /* ignore invalid URL */
    }
  }
  return out;
}

function renderLinkedText(text: string): React.ReactNode {
  const parts = text.split(/(https?:\/\/[^\s<>()]+)/gi);
  return parts.map((part, idx) => {
    if (/^https?:\/\//i.test(part)) {
      const cleaned = part.replace(/[.,!?;:'")\]}]+$/, '');
      const trail = part.slice(cleaned.length);
      return (
        <React.Fragment key={idx}>
          <a
            href={cleaned}
            target="_blank"
            rel="noreferrer noopener"
            className="text-sanzar-primary underline break-all hover:opacity-80"
          >
            {cleaned}
          </a>
          {trail}
        </React.Fragment>
      );
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}

export const CommunityPage: React.FC = () => {
  const { user } = useAuth();
  const { t } = useSettings();
  const toast = useToast();

  const [posts, setPosts] = useState<Post[]>([]);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [category, setCategory] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [composeOpen, setComposeOpen] = useState(false);
  const [activePost, setActivePost] = useState<Post | null>(null);
  const [profileUid, setProfileUid] = useState<string | null>(null);
  const [reportTarget, setReportTarget] = useState<{ type: 'post' | 'comment'; id: string } | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(searchQuery.trim()), 280);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  const loadFeed = async (reset = true) => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (!reset && nextCursor) qs.set('before', String(nextCursor));
      if (category) qs.set('category', category);
      if (debouncedQuery) qs.set('q', debouncedQuery);
      const q = qs.toString();
      const res = await apiRequest<{ posts: Post[]; next: number | null }>(`/v1/feed${q ? `?${q}` : ''}`);
      setPosts((prev) => (reset ? res.posts : [...prev, ...res.posts]));
      setNextCursor(res.next);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) void loadFeed(true);
  }, [user, category, debouncedQuery]);

  if (!user) {
    return (
      <div className="sanzar-card p-8 text-center max-w-md mx-auto my-8 space-y-4">
        <h1 className="text-xl font-bold">{t('community')}</h1>
        <p className="text-sm text-sanzar-text2">{t('guestMode')}</p>
        <Link to="/login" className="inline-block px-5 py-2.5 rounded-xl bg-sanzar-primary text-sanzar-onPrimary font-semibold text-sm">
          {t('signIn')}
        </Link>
      </div>
    );
  }

  const toggleLike = async (post: Post) => {
    try {
      const res = await apiRequest<{ liked: boolean; likeCount: number }>(`/v1/posts/${post.id}/like`, {
        method: 'POST',
        bodyJson: {},
      });
      setPosts((prev) =>
        prev.map((p) => (p.id === post.id ? { ...p, likedByMe: res.liked, likeCount: res.likeCount } : p))
      );
    } catch {
      toast(t('err.generic'));
    }
  };

  const votePoll = async (post: Post, option: number) => {
    try {
      const res = await apiRequest<{ poll: Post['poll'] }>(`/v1/posts/${post.id}/vote`, {
        method: 'POST',
        bodyJson: { option },
      });
      setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, poll: res.poll } : p)));
    } catch {
      toast(t('err.generic'));
    }
  };

  const deletePost = async (id: string) => {
    try {
      await apiRequest(`/v1/posts/${id}`, { method: 'DELETE' });
      setPosts((prev) => prev.filter((p) => p.id !== id));
    } catch {
      toast(t('err.generic'));
    }
  };

  const blockUser = async (uid: string) => {
    try {
      await apiRequest(`/v1/users/${uid}/block`, { method: 'POST', bodyJson: {} });
      toast(t('blockedDone'));
      void loadFeed(true);
    } catch {
      toast(t('err.generic'));
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold">{t('community')}</h1>
        <button
          onClick={() => setComposeOpen(true)}
          className="px-4 py-2 rounded-xl bg-sanzar-primary text-sanzar-onPrimary font-semibold text-sm flex items-center gap-1.5 shadow-sm"
        >
          <Plus className="w-4 h-4" /> {t('post')}
        </button>
      </div>

      {/* Search + Category Filter */}
      <div className="sanzar-card p-3 space-y-2.5">
        <div className="relative">
          <Search className="w-4 h-4 text-sanzar-muted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none z-10" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('searchCommunity')}
            aria-label={t('searchCommunity')}
            className="sanzar-input pl-10 pr-9 text-sm"
          />
          {searchQuery && (
            <button
              type="button"
              aria-label={t('clearSearch')}
              onClick={() => setSearchQuery('')}
              className="p-1 rounded-lg text-sanzar-muted hover:text-sanzar-text absolute right-2.5 top-1/2 -translate-y-1/2 z-10"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {[
            { k: '', label: t('feed') },
            { k: 'general', label: t('general') },
            { k: 'research', label: t('research') },
          ].map((c) => (
            <button
              key={c.k}
              onClick={() => setCategory(c.k)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition ${
                category === c.k
                  ? 'bg-sanzar-primary text-sanzar-onPrimary border-sanzar-primary'
                  : 'bg-sanzar-surface border-sanzar-border text-sanzar-text2'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {loading && posts.length === 0 ? (
        <LoadingState />
      ) : posts.length === 0 ? (
        <div className="sanzar-card p-10 text-center text-sm text-sanzar-muted space-y-2">
          <p>{t('noPosts')}</p>
          {error && (
            <button onClick={() => loadFeed(true)} className="sanzar-pill text-sanzar-primary hover:opacity-90">
              {t('retry')}
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {posts
            .filter((p) => {
              const q = searchQuery.trim().toLowerCase();
              if (!q) return true;
              return (
                p.text.toLowerCase().includes(q) ||
                p.authorName.toLowerCase().includes(q) ||
                (p.poll?.question.toLowerCase().includes(q) ?? false)
              );
            })
            .map((p) => {
            const pollTotal = p.poll ? p.poll.options.reduce((a, o) => a + o.votes, 0) : 0;
            return (
              <article key={p.id} className="sanzar-card p-4 sm:p-5 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <button
                    onClick={() => !p.mine && setProfileUid(p.authorUid)}
                    className="flex items-center gap-2.5 text-left group min-w-0"
                  >
                    <div className="w-9 h-9 rounded-full bg-sanzar-primarySoft text-sanzar-primary font-bold text-sm flex items-center justify-center shrink-0">
                      {(p.authorName || '?')[0].toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-sm truncate group-hover:text-sanzar-primary transition">
                        {p.authorName}
                      </p>
                      <p className="text-xs text-sanzar-muted">
                        {timeAgo(t, p.createdAt)}
                        {p.category === 'research' ? ` · ${t('research')}` : ''}
                      </p>
                    </div>
                  </button>

                  <div className="flex items-center gap-1">
                    {p.mine ? (
                      <button
                        onClick={() => deletePost(p.id)}
                        title={t('deletePost')}
                        className="p-1.5 rounded-lg text-sanzar-muted hover:text-sanzar-danger hover:bg-sanzar-surface2"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => setReportTarget({ type: 'post', id: p.id })}
                          title={t('report')}
                          className="p-1.5 rounded-lg text-sanzar-muted hover:text-sanzar-warning hover:bg-sanzar-surface2"
                        >
                          <Flag className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => blockUser(p.authorUid)}
                          title={t('block')}
                          className="p-1.5 rounded-lg text-sanzar-muted hover:text-sanzar-danger hover:bg-sanzar-surface2"
                        >
                          <Ban className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {p.text && <p className="text-sm leading-relaxed whitespace-pre-wrap">{renderLinkedText(p.text)}</p>}

                {/* Attachments */}
                {(p.attachments ?? []).length > 0 && (
                  <div className="space-y-2">
                    {p.attachments!.map((att, idx) =>
                      att.url ? (
                        att.mime?.startsWith('image/') ? (
                          <a key={idx} href={att.url} target="_blank" rel="noreferrer noopener" className="block">
                            <img
                              src={att.url}
                              alt={att.name}
                              className="rounded-xl max-h-72 w-full object-cover border border-sanzar-border"
                            />
                          </a>
                        ) : (
                          <a
                            key={idx}
                            href={att.url}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="p-3 rounded-xl border border-sanzar-border bg-sanzar-surface2 flex items-center justify-between gap-2 text-xs font-semibold hover:border-sanzar-primary"
                          >
                            <span className="flex items-center gap-2 truncate">
                              <LinkIcon className="w-4 h-4 text-sanzar-primary shrink-0" />
                              <span className="truncate">{att.name}</span>
                            </span>
                            <ExternalLink className="w-3.5 h-3.5 text-sanzar-muted shrink-0" />
                          </a>
                        )
                      ) : null
                    )}
                  </div>
                )}

                {/* Poll */}
                {p.poll && (
                  <div className="pt-1 space-y-2">
                    <p className="font-semibold text-sm">{p.poll.question}</p>
                    <div className="space-y-1.5">
                      {p.poll.options.map((opt, idx) => {
                        const pct = pollTotal > 0 ? Math.round((opt.votes / pollTotal) * 100) : 0;
                        const selected = p.poll!.myVote === idx;
                        return (
                          <button
                            key={idx}
                            onClick={() => votePoll(p, idx)}
                            className={`w-full relative overflow-hidden rounded-xl border px-3.5 py-2 text-left text-xs font-medium flex items-center justify-between transition ${
                              selected ? 'border-sanzar-primary font-bold' : 'border-sanzar-border'
                            }`}
                          >
                            <span
                              style={{ width: `${pct}%` }}
                              className="absolute inset-y-0 left-0 bg-sanzar-primarySoft transition-all"
                            />
                            <span className="relative z-10">{opt.text}</span>
                            <span className="relative z-10 font-bold">{pollTotal > 0 ? `${pct}%` : ''}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-4 pt-1 border-t border-sanzar-border text-xs font-semibold">
                  <button
                    onClick={() => toggleLike(p)}
                    className={`flex items-center gap-1.5 py-1 transition ${
                      p.likedByMe ? 'text-sanzar-danger' : 'text-sanzar-text2 hover:text-sanzar-danger'
                    }`}
                  >
                    <Heart className={`w-4 h-4 ${p.likedByMe ? 'fill-current' : ''}`} />
                    <span>{p.likeCount}</span>
                  </button>
                  <button
                    onClick={() => setActivePost(p)}
                    className="flex items-center gap-1.5 py-1 text-sanzar-text2 hover:text-sanzar-primary transition"
                  >
                    <MessageCircle className="w-4 h-4" />
                    <span>
                      {p.commentCount} {t('comments')}
                    </span>
                  </button>
                </div>
              </article>
            );
          })}

          {nextCursor != null && (
            <div className="text-center">
              <button
                onClick={() => loadFeed(false)}
                disabled={loading}
                className="px-5 py-2 rounded-xl border border-sanzar-border text-xs font-bold hover:bg-sanzar-surface2"
              >
                {t('loadMore')}
              </button>
            </div>
          )}
        </div>
      )}

      {composeOpen && (
        <ComposeModal
          onClose={() => setComposeOpen(false)}
          onCreated={() => {
            setComposeOpen(false);
            void loadFeed(true);
          }}
        />
      )}

      {activePost && (
        <CommentsModal
          post={activePost}
          onClose={() => setActivePost(null)}
          onCountChange={(count) =>
            setPosts((prev) => prev.map((x) => (x.id === activePost.id ? { ...x, commentCount: count } : x)))
          }
          onReportComment={(cid) => setReportTarget({ type: 'comment', id: cid })}
        />
      )}

      {profileUid && (
        <UserProfileModal
          uid={profileUid}
          onClose={() => setProfileUid(null)}
          onBlocked={() => {
            setProfileUid(null);
            void loadFeed(true);
          }}
        />
      )}

      {reportTarget && (
        <ReportModal target={reportTarget} onClose={() => setReportTarget(null)} />
      )}
    </div>
  );
};

const ComposeModal: React.FC<{ onClose: () => void; onCreated: () => void }> = ({ onClose, onCreated }) => {
  const { t } = useSettings();
  const toast = useToast();
  const [text, setText] = useState('');
  const [research, setResearch] = useState(false);
  const [withPoll, setWithPoll] = useState(false);
  const [pollQ, setPollQ] = useState('');
  const [pollOpts, setPollOpts] = useState(['', '']);
  const [busy, setBusy] = useState(false);

  const detectedLinks = extractHttpsLinks(text);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const opts = pollOpts.map((o) => o.trim()).filter(Boolean);
    if (!text.trim() && !withPoll) return;
    if (withPoll && (!pollQ.trim() || opts.length < 2)) return;
    setBusy(true);
    try {
      const res = await apiRequest<{ xpAwarded?: number }>('/v1/posts', {
        method: 'POST',
        bodyJson: {
          text: text.trim(),
          category: research ? 'research' : 'general',
          attachments: detectedLinks,
          ...(withPoll ? { poll: { question: pollQ.trim(), options: opts } } : {}),
        },
      });
      if (res.xpAwarded) toast(t('xpEarned', { n: res.xpAwarded }));
      onCreated();
    } catch (err) {
      toast(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={t('post')} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <textarea
          rows={4}
          maxLength={2000}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('whatsOnMind')}
          className="sanzar-input text-sm"
        />

        <p className="text-[11px] text-sanzar-muted flex items-center gap-1.5">
          <LinkIcon className="w-3.5 h-3.5 text-sanzar-primary shrink-0" />
          <span>{t('linksAutoDetected')}</span>
        </p>

        {detectedLinks.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {detectedLinks.map((a, idx) => (
              <span key={idx} className="sanzar-pill gap-1.5">
                <LinkIcon className="w-3 h-3 text-sanzar-primary" />
                {a.name}
              </span>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setWithPoll((v) => !v)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border flex items-center gap-1.5 ${
              withPoll ? 'bg-sanzar-primarySoft text-sanzar-primary border-sanzar-primary/40' : 'border-sanzar-border'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" /> {t('addPoll')}
          </button>
          <button
            type="button"
            onClick={() => setResearch((v) => !v)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border ${
              research ? 'bg-sanzar-primarySoft text-sanzar-primary border-sanzar-primary/40' : 'border-sanzar-border'
            }`}
          >
            {t('research')}
          </button>
        </div>

        {withPoll && (
          <div className="p-3.5 rounded-xl border border-sanzar-border bg-sanzar-surface2 space-y-2.5">
            <input
              value={pollQ}
              onChange={(e) => setPollQ(e.target.value)}
              placeholder={t('pollQuestion')}
              maxLength={200}
              className="sanzar-input text-sm"
            />
            {pollOpts.map((opt, idx) => (
              <input
                key={idx}
                value={opt}
                onChange={(e) => setPollOpts((p) => p.map((x, i) => (i === idx ? e.target.value : x)))}
                placeholder={t('option', { n: idx + 1 })}
                maxLength={80}
                className="sanzar-input text-xs"
              />
            ))}
            {pollOpts.length < 6 && (
              <button
                type="button"
                onClick={() => setPollOpts((p) => [...p, ''])}
                className="text-xs font-semibold text-sanzar-primary hover:underline"
              >
                + {t('option', { n: pollOpts.length + 1 })}
              </button>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-sanzar-border text-sm font-semibold">
            {t('cancel')}
          </button>
          <button
            type="submit"
            disabled={busy}
            className="px-5 py-2 rounded-xl bg-sanzar-primary text-sanzar-onPrimary text-sm font-semibold disabled:opacity-50"
          >
            {t('post')}
          </button>
        </div>
      </form>
    </Modal>
  );
};

const CommentsModal: React.FC<{
  post: Post;
  onClose: () => void;
  onCountChange: (count: number) => void;
  onReportComment: (commentId: string) => void;
}> = ({ post, onClose, onCountChange, onReportComment }) => {
  const { t } = useSettings();
  const toast = useToast();
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const res = await apiRequest<{ comments: Comment[] }>(`/v1/posts/${post.id}/comments`);
      setComments(res.comments);
    } catch {
      setComments([]);
    }
  };

  useEffect(() => {
    void load();
  }, [post.id]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      const res = await apiRequest<{ comment: Comment }>(`/v1/posts/${post.id}/comments`, {
        method: 'POST',
        bodyJson: { text: text.trim() },
      });
      const next = [...(comments ?? []), res.comment];
      setComments(next);
      onCountChange(next.length);
      setText('');
    } catch {
      toast(t('err.generic'));
    } finally {
      setBusy(false);
    }
  };

  const del = async (id: string) => {
    try {
      await apiRequest(`/v1/comments/${id}`, { method: 'DELETE' });
      const next = (comments ?? []).filter((c) => c.id !== id);
      setComments(next);
      onCountChange(next.length);
    } catch {
      toast(t('err.generic'));
    }
  };

  return (
    <Modal title={t('comments')} onClose={onClose}>
      <div className="space-y-4">
        <div className="p-3 rounded-xl bg-sanzar-surface2 text-sm">
          <p className="font-bold text-xs text-sanzar-muted mb-1">{post.authorName}</p>
          <p className="whitespace-pre-wrap">{post.text}</p>
        </div>

        <div className="space-y-3 max-h-72 overflow-y-auto">
          {comments === null ? (
            <LoadingState />
          ) : comments.length === 0 ? (
            <p className="text-xs text-sanzar-muted text-center py-4">{t('noPosts')}</p>
          ) : (
            comments.map((c) => (
              <div key={c.id} className="flex items-start justify-between gap-2 pb-2.5 border-b border-sanzar-border last:border-0">
                <div className="min-w-0">
                  <p className="font-semibold text-xs">
                    {c.authorName}{' '}
                    <span className="font-normal text-sanzar-muted">· {timeAgo(t, c.createdAt)}</span>
                  </p>
                  <p className="text-sm text-sanzar-text2 mt-0.5">{c.text}</p>
                </div>
                {c.mine ? (
                  <button onClick={() => del(c.id)} className="text-sanzar-muted hover:text-sanzar-danger p-1">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <button
                    onClick={() => onReportComment(c.id)}
                    className="text-sanzar-muted hover:text-sanzar-warning p-1"
                  >
                    <Flag className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))
          )}
        </div>

        <form onSubmit={send} className="flex gap-2 pt-2 border-t border-sanzar-border">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={1000}
            placeholder={t('writeComment')}
            className="sanzar-input text-sm flex-1"
          />
          <button
            type="submit"
            disabled={busy || !text.trim()}
            className="px-4 py-2 rounded-xl bg-sanzar-primary text-sanzar-onPrimary disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </Modal>
  );
};

const UserProfileModal: React.FC<{ uid: string; onClose: () => void; onBlocked: () => void }> = ({
  uid,
  onClose,
  onBlocked,
}) => {
  const { t } = useSettings();
  const toast = useToast();
  const [data, setData] = useState<PublicProfile | null>(null);

  const load = async () => {
    const res = await apiRequest<PublicProfile>(`/v1/users/${uid}`);
    setData(res);
  };

  useEffect(() => {
    void load().catch(() => toast(t('err.generic')));
  }, [uid]);

  return (
    <Modal title={data?.user.name || t('profile')} onClose={onClose}>
      {!data ? (
        <LoadingState />
      ) : (
        <div className="space-y-4 text-center">
          <div className="w-16 h-16 rounded-full bg-sanzar-primarySoft text-sanzar-primary font-black text-2xl flex items-center justify-center mx-auto">
            {(data.user.name || '?')[0].toUpperCase()}
          </div>
          <div>
            <h3 className="font-bold text-lg">{data.user.name}</h3>
            <p className="text-xs text-sanzar-muted">
              {t('followers', { n: data.followers })} · {t('followingN', { n: data.following })}
            </p>
          </div>
          {data.limited ? (
            <p className="text-xs text-sanzar-muted">{t('privateProfile')}</p>
          ) : (
            <div className="text-xs text-sanzar-text2 space-y-1">
              {data.user.xp != null && <p className="font-bold">{t('xpTotal', { n: data.user.xp })}</p>}
              {data.user.institution && <p>{data.user.institution}</p>}
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button
              onClick={async () => {
                await apiRequest(`/v1/users/${uid}/follow`, {
                  method: data.isFollowing ? 'DELETE' : 'POST',
                  bodyJson: data.isFollowing ? undefined : {},
                });
                await load();
              }}
              className="flex-1 py-2.5 rounded-xl bg-sanzar-primary text-sanzar-onPrimary font-semibold text-sm"
            >
              {data.isFollowing ? t('unfollow') : t('follow')}
            </button>
            <button
              onClick={async () => {
                await apiRequest(`/v1/users/${uid}/block`, { method: 'POST', bodyJson: {} });
                toast(t('blockedDone'));
                onBlocked();
              }}
              className="flex-1 py-2.5 rounded-xl border border-sanzar-danger text-sanzar-danger font-semibold text-sm"
            >
              {t('block')}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
};

const ReportModal: React.FC<{ target: { type: 'post' | 'comment'; id: string }; onClose: () => void }> = ({
  target,
  onClose,
}) => {
  const { t } = useSettings();
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (reason.trim().length < 3) return;
    setBusy(true);
    try {
      await apiRequest('/v1/reports', {
        method: 'POST',
        bodyJson: { targetType: target.type, targetId: target.id, reason: reason.trim() },
      });
      toast(t('reported'));
      onClose();
    } catch {
      toast(t('err.generic'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={t('report')} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={500}
          placeholder={t('reportReason')}
          className="sanzar-input text-sm"
        />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-sanzar-border text-sm font-semibold">
            {t('cancel')}
          </button>
          <button
            type="submit"
            disabled={busy || reason.trim().length < 3}
            className="px-4 py-2 rounded-xl bg-sanzar-primary text-sanzar-onPrimary text-sm font-semibold disabled:opacity-50"
          >
            {t('report')}
          </button>
        </div>
      </form>
    </Modal>
  );
};

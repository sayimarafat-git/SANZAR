import React, { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Send, Sparkles } from 'lucide-react';
import { useAuth } from '../../lib/auth-context';
import { useSettings } from '../../lib/settings-context';
import { apiRequest } from '../../lib/api-client';
import type { TutorAnswer, TutorReference } from '../../lib/models';
import { BrandMark } from '../../components/SanzarUI';

interface ChatMsg {
  fromMe: boolean;
  text: string;
  answer?: TutorAnswer;
}

export const TutorPage: React.FC = () => {
  const { user } = useAuth();
  const { t } = useSettings();
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  if (!user) {
    return (
      <div className="sanzar-card p-8 text-center max-w-md mx-auto my-8 space-y-4">
        <h1 className="text-xl font-bold">{t('tutor')}</h1>
        <p className="text-sm text-sanzar-text2">{t('tutorIntro')}</p>
        <Link to="/login" className="inline-block px-5 py-2.5 rounded-xl bg-sanzar-primary text-sanzar-onPrimary font-semibold text-sm">
          {t('signIn')}
        </Link>
      </div>
    );
  }

  const lastRef: TutorReference | undefined = [...msgs]
    .reverse()
    .map((m) => m.answer?.reference)
    .find((r): r is TutorReference => !!r);

  const ask = async (q: string) => {
    const query = q.trim();
    if (!query || busy) return;
    setMsgs((prev) => [...prev, { fromMe: true, text: query }]);
    setInput('');
    setBusy(true);
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);

    try {
      const a = await apiRequest<TutorAnswer>('/v1/tutor/ask', {
        method: 'POST',
        bodyJson: {
          q: query,
          ...(lastRef ? { prev: { chapterId: lastRef.chapterId, section: lastRef.section } } : {}),
        },
      });
      setMsgs((prev) => [...prev, { fromMe: false, text: a.text, answer: a }]);
    } catch {
      setMsgs((prev) => [...prev, { fromMe: false, text: t('err.generic') }]);
    } finally {
      setBusy(false);
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    }
  };

  return (
    <div className="max-w-3xl mx-auto flex flex-col h-[calc(100vh-11rem)] sanzar-card overflow-hidden">
      <div className="px-5 py-3.5 border-b border-sanzar-border flex items-center gap-3 bg-sanzar-surface">
        <BrandMark size={32} />
        <div>
          <h1 className="font-bold text-base flex items-center gap-1.5">
            {t('tutor')} <Sparkles className="w-4 h-4 text-sanzar-primary" />
          </h1>
          <p className="text-xs text-sanzar-muted">{t('tagline')}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        <div className="p-4 rounded-2xl bg-sanzar-surface2 border border-sanzar-border text-sm text-sanzar-text2">
          {t('tutorIntro')}
        </div>

        {msgs.map((m, idx) => (
          <div key={idx} className={`flex ${m.fromMe ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] rounded-2xl p-4 text-sm space-y-2 ${
                m.fromMe
                  ? 'bg-brand-grad text-white'
                  : 'bg-sanzar-surface2 border border-sanzar-border text-sanzar-text'
              }`}
            >
              {m.answer?.heading && <p className="font-bold">{m.answer.heading}</p>}
              <p className="whitespace-pre-wrap leading-relaxed select-text">{m.text}</p>
              {m.answer?.reference && (
                <div className="pt-2 border-t border-sanzar-border/70 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs text-sanzar-muted font-medium">
                    <BookOpen className="w-3.5 h-3.5 text-sanzar-primary shrink-0" />
                    <span>
                      {t('reference')}: {m.answer.reference.bookTitle} –{' '}
                      {t('chapter', { n: m.answer.reference.chapterNumber })}:{' '}
                      {m.answer.reference.chapterTitle}
                      {m.answer.reference.page != null
                        ? ` (${t('page', { n: m.answer.reference.page })})`
                        : ''}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-3 text-xs font-semibold">
                    <Link
                      to={`/learn/chapter/${m.answer.reference.bookId}/${m.answer.reference.chapterId}`}
                      className="text-sanzar-primary hover:underline"
                    >
                      {t('openChapter')}
                    </Link>
                    <button
                      onClick={() => ask(t('tutorMore'))}
                      className="text-sanzar-primary hover:underline"
                    >
                      {t('tutorMore')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}

        {busy && (
          <div className="flex justify-start">
            <div className="px-4 py-3 rounded-2xl bg-sanzar-surface2 border border-sanzar-border">
              <div className="w-5 h-5 rounded-full border-2 border-sanzar-border border-t-sanzar-primary animate-spin" />
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void ask(input);
        }}
        className="p-3.5 border-t border-sanzar-border bg-sanzar-surface flex gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          maxLength={500}
          placeholder={t('tutorHint')}
          className="sanzar-input text-sm flex-1"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="px-4 py-2 rounded-xl bg-sanzar-primary text-sanzar-onPrimary disabled:opacity-50"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
};

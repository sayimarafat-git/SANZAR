import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, RotateCcw, Send, Sparkles, X } from 'lucide-react';
import { useAuth } from '../lib/auth-context';
import { useSettings } from '../lib/settings-context';
import { apiRequest } from '../lib/api-client';
import type { TutorAnswer, TutorReference } from '../lib/models';
import { BrandMark } from './SanzarUI';

interface ChatMsg {
  fromMe: boolean;
  text: string;
  answer?: TutorAnswer;
}

interface FloatingTutorWidgetProps {
  open: boolean;
  onClose: () => void;
}

export const FloatingTutorWidget: React.FC<FloatingTutorWidgetProps> = ({ open, onClose }) => {
  const { user } = useAuth();
  const { t } = useSettings();
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
      endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 60);
    return () => {
      document.removeEventListener('keydown', onKey);
      window.clearTimeout(timer);
    };
  }, [open, onClose]);

  if (!open) return null;

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
    window.setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);

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
      window.setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    }
  };

  return (
    <section
      role="dialog"
      aria-label={t('tutor')}
      className="fixed right-4 bottom-24 md:bottom-20 z-50 w-[calc(100vw-2rem)] sm:w-[390px] h-[520px] max-h-[75vh] flex flex-col rounded-[24px] border border-sanzar-border bg-[var(--glass-bg-strong)] backdrop-blur-2xl shadow-2xl overflow-hidden"
    >
      <div className="px-4 py-3 border-b border-sanzar-border flex items-center justify-between gap-2 sanzar-glass-bar rounded-none border-x-0 border-t-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <BrandMark size={28} />
          <div className="min-w-0">
            <h2 className="font-bold text-sm flex items-center gap-1.5 truncate">
              {t('tutor')} <Sparkles className="w-3.5 h-3.5 text-sanzar-primary shrink-0" />
            </h2>
            <p className="text-[11px] text-sanzar-muted truncate">{t('tagline')}</p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {msgs.length > 0 && (
            <button
              type="button"
              onClick={() => setMsgs([])}
              title="Reset chat"
              aria-label="Reset chat"
              className="p-1.5 rounded-xl text-sanzar-muted hover:text-sanzar-text hover:bg-sanzar-surface2 transition"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close AI Tutor"
            className="p-1.5 rounded-xl text-sanzar-muted hover:text-sanzar-text hover:bg-sanzar-surface2 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {!user ? (
        <div className="flex-1 p-6 flex flex-col items-center justify-center text-center space-y-3">
          <p className="text-sm text-sanzar-text2 leading-relaxed">{t('tutorIntro')}</p>
          <Link
            to="/login"
            onClick={onClose}
            className="inline-block px-5 py-2.5 rounded-xl bg-sanzar-primary text-sanzar-onPrimary font-semibold text-sm"
          >
            {t('signIn')}
          </Link>
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            <div className="p-3 rounded-2xl bg-sanzar-surface2 border border-sanzar-border text-xs text-sanzar-text2 leading-relaxed">
              {t('tutorIntro')}
            </div>

            {msgs.map((m, idx) => (
              <div key={idx} className={`flex ${m.fromMe ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-xs sm:text-sm space-y-1.5 ${
                    m.fromMe
                      ? 'bg-brand-grad text-white'
                      : 'bg-sanzar-surface2 border border-sanzar-border text-sanzar-text'
                  }`}
                >
                  {m.answer?.heading && <p className="font-bold">{m.answer.heading}</p>}
                  <p className="whitespace-pre-wrap leading-relaxed select-text">{m.text}</p>
                  {m.answer?.reference && (
                    <div className="pt-2 border-t border-sanzar-border/70 space-y-1.5">
                      <div className="flex items-center gap-1.5 text-[11px] text-sanzar-muted font-medium">
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
                      <div className="flex flex-wrap gap-3 text-[11px] font-semibold">
                        <Link
                          to={`/learn/chapter/${m.answer.reference.bookId}/${m.answer.reference.chapterId}`}
                          onClick={onClose}
                          className="text-sanzar-primary hover:underline"
                        >
                          {t('openChapter')}
                        </Link>
                        <button
                          type="button"
                          onClick={() => void ask(t('tutorMore'))}
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
                <div className="px-3.5 py-2.5 rounded-2xl bg-sanzar-surface2 border border-sanzar-border">
                  <div className="w-4 h-4 rounded-full border-2 border-sanzar-border border-t-sanzar-primary animate-spin" />
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
            className="p-3 border-t border-sanzar-border bg-sanzar-surface/70 backdrop-blur-md flex gap-2"
          >
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              maxLength={500}
              placeholder={t('tutorHint')}
              className="sanzar-input text-xs sm:text-sm flex-1"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              aria-label="Send"
              className="px-3.5 py-2 rounded-xl bg-sanzar-primary text-sanzar-onPrimary disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </>
      )}
    </section>
  );
};

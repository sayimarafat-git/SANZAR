import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  BookA,
  Check,
  ClipboardCheck,
  Globe,
  Sparkles,
  Star,
  TrendingUp,
} from 'lucide-react';
import { useAuth } from '../lib/auth-context';
import { useSettings } from '../lib/settings-context';
import type { Lang } from '../lib/i18n';
import { apiRequest } from '../lib/api-client';
import { LEVELS } from '../lib/models';
import { BrandMark, useToast } from './SanzarUI';

const K_FIRST_ONBOARDED = 'sanzar.onboarded';
export const postOnboardedKey = (uid: string) => `sanzar.post_onboarded.${uid}`;

export const FirstVisitOnboarding: React.FC<{ onDone: (goTo?: '/login' | '/register') => void }> = ({ onDone }) => {
  const { lang, setLang, t } = useSettings();
  const [step, setStep] = useState(0);

  const slides = [
    { icon: BookOpen, title: t('onb1.title'), body: t('onb1.body') },
    { icon: TrendingUp, title: t('onb2.title'), body: t('onb2.body') },
    { icon: BookA, title: t('onb4.title'), body: t('onb4.body') },
    { icon: Star, title: t('onb3.title'), body: t('onb3.body') },
  ];

  const isLast = step === slides.length - 1;
  const finish = (goTo?: '/login' | '/register') => {
    localStorage.setItem(K_FIRST_ONBOARDED, '1');
    onDone(goTo);
  };

  const ActiveIcon = slides[step].icon;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-md flex items-center justify-center p-4">
      <div className="sanzar-card w-full max-w-lg p-6 sm:p-8 shadow-2xl space-y-6 relative">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <BrandMark size={36} />
            <span className="font-extrabold text-base tracking-tight">SANZAR</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative flex items-center">
              <Globe className="w-3.5 h-3.5 text-sanzar-muted absolute left-2 pointer-events-none" />
              <select
                aria-label={t('language')}
                value={lang}
                onChange={(e) => setLang(e.target.value as Lang)}
                className="pl-7 pr-2 py-1 rounded-xl border border-sanzar-border bg-sanzar-surface2 text-xs font-semibold text-sanzar-text cursor-pointer"
              >
                <option value="en">EN</option>
                <option value="bn">বাংলা</option>
                <option value="zh">中文</option>
                <option value="id">Bahasa Indonesia</option>
              </select>
            </div>
            <button
              type="button"
              onClick={() => finish()}
              className="px-2.5 py-1 text-xs font-semibold text-sanzar-muted hover:text-sanzar-text transition"
            >
              {t('skip')}
            </button>
          </div>
        </div>

        <div className="py-4 text-center space-y-5">
          <div className="w-28 h-28 mx-auto rounded-3xl bg-hero-grad text-white flex items-center justify-center shadow-lg">
            <ActiveIcon className="w-12 h-12" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-extrabold leading-snug">{slides[step].title}</h2>
            <p className="text-sm text-sanzar-text2 leading-relaxed max-w-md mx-auto">{slides[step].body}</p>
          </div>
        </div>

        <div className="flex items-center justify-center gap-2">
          {slides.map((_, idx) => (
            <button
              key={idx}
              type="button"
              aria-label={`Slide ${idx + 1}`}
              onClick={() => setStep(idx)}
              className={`h-2 rounded-full transition-all ${
                idx === step ? 'w-7 bg-sanzar-primary' : 'w-2 bg-sanzar-border hover:bg-sanzar-muted/40'
              }`}
            />
          ))}
        </div>

        <div className="flex items-center justify-between gap-3 pt-2">
          {step > 0 ? (
            <button
              type="button"
              onClick={() => setStep((s) => s - 1)}
              className="px-4 py-2.5 rounded-xl border border-sanzar-border text-sm font-semibold flex items-center gap-1.5 hover:bg-sanzar-surface2 transition"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => finish('/login')}
              className="px-4 py-2.5 rounded-xl border border-sanzar-border text-xs font-semibold text-sanzar-text2 hover:bg-sanzar-surface2 transition"
            >
              {t('signIn')}
            </button>
          )}

          {isLast ? (
            <button
              type="button"
              onClick={() => finish('/register')}
              className="flex-1 py-2.5 px-5 rounded-xl bg-sanzar-primary text-sanzar-onPrimary font-bold text-sm shadow-sm hover:opacity-95 transition flex items-center justify-center gap-2"
            >
              <span>{t('getStarted')}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setStep((s) => s + 1)}
              className="flex-1 py-2.5 px-5 rounded-xl bg-sanzar-primary text-sanzar-onPrimary font-bold text-sm shadow-sm hover:opacity-95 transition flex items-center justify-center gap-2"
            >
              <span>{t('next')}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export const PostLoginOnboarding: React.FC<{ onCompleted: () => void }> = ({ onCompleted }) => {
  const { user, profile, updateProfile } = useAuth();
  const { lang, setLang, t } = useSettings();
  const toast = useToast();
  const navigate = useNavigate();

  const [step, setStep] = useState(0);
  const [name, setName] = useState(profile?.display_name || user?.displayName || '');
  const [institution, setInstitution] = useState(profile?.institution || '');
  const [levelId, setLevelId] = useState<string>(profile?.level_id || '');
  const [busy, setBusy] = useState(false);

  const finish = async () => {
    if (!user) return;
    setBusy(true);
    try {
      await updateProfile({
        ...(name.trim().length >= 2 ? { display_name: name.trim() } : {}),
        ...(institution.trim() ? { institution: institution.trim() } : {}),
        ...(levelId ? { level_id: levelId } : {}),
        locale: lang,
        onboarding_completed: true,
      });
      localStorage.setItem(postOnboardedKey(user.uid), '1');
      onCompleted();
      navigate('/');
    } catch {
      toast(t('err.generic'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/55 backdrop-blur-md flex items-center justify-center p-4">
      <div className="sanzar-card w-full max-w-xl p-6 sm:p-8 shadow-2xl space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <BrandMark size={36} />
            <div>
              <h2 className="font-extrabold text-base">{t('welcomeToSanzar')}</h2>
              <p className="text-xs text-sanzar-muted">{t('stepOf', { a: step + 1, b: 3 })}</p>
            </div>
          </div>
          <div className="flex gap-1.5">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className={`h-2 rounded-full transition-all ${i === step ? 'w-6 bg-sanzar-primary' : 'w-2 bg-sanzar-border'}`}
              />
            ))}
          </div>
        </div>

        {step === 0 && (
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-bold">{t('setupProfile')}</h3>
              <p className="text-xs text-sanzar-text2 mt-0.5">{t('setupSubtitle')}</p>
            </div>
            <div className="space-y-3">
              <label className="block space-y-1 text-xs font-semibold text-sanzar-text2">
                <span>{t('name')}</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={60}
                  className="sanzar-input text-sm"
                />
              </label>
              <label className="block space-y-1 text-xs font-semibold text-sanzar-text2">
                <span>{t('language')}</span>
                <select
                  value={lang}
                  onChange={(e) => {
                    const v = e.target.value as Lang;
                    setLang(v);
                    apiRequest('/v1/me', { method: 'PATCH', bodyJson: { locale: v } }).catch(() => {});
                  }}
                  className="sanzar-input text-sm"
                >
                  <option value="en">English</option>
                  <option value="bn">বাংলা</option>
                  <option value="zh">中文</option>
                  <option value="id">Bahasa Indonesia</option>
                </select>
              </label>
              <label className="block space-y-1 text-xs font-semibold text-sanzar-text2">
                <span>{t('institution')}</span>
                <input
                  value={institution}
                  onChange={(e) => setInstitution(e.target.value)}
                  maxLength={100}
                  placeholder="Optional"
                  className="sanzar-input text-sm"
                />
              </label>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-bold">{t('chooseClass')}</h3>
              <p className="text-xs text-sanzar-text2 mt-0.5">{t('setupSubtitle')}</p>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              {LEVELS.map((l) => {
                const selected = levelId === l.id;
                const label =
                  lang === 'bn' ? l.name_bn : lang === 'zh' ? l.name_zh : lang === 'id' ? l.name_id : l.name;
                return (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => setLevelId(l.id)}
                    className={`p-4 rounded-2xl border text-left transition flex items-center justify-between gap-3 ${
                      selected
                        ? 'border-sanzar-primary bg-sanzar-primarySoft text-sanzar-primary shadow-sm'
                        : 'border-sanzar-border bg-sanzar-surface2/70 hover:border-sanzar-primary/50'
                    }`}
                  >
                    <div>
                      <p className="font-bold text-base">{label || l.name}</p>
                      <p className="text-xs opacity-75">{l.name}</p>
                    </div>
                    {selected && <Check className="w-5 h-5 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-bold">{t('quickTour')}</h3>
              <p className="text-xs text-sanzar-text2 mt-0.5">{t('tagline')}</p>
            </div>
            <div className="grid sm:grid-cols-2 gap-3 text-xs">
              {[
                { icon: BookOpen, title: t('library'), desc: t('onb1.body') },
                { icon: BookA, title: t('dictionary'), desc: t('dictionarySubtitle') },
                { icon: ClipboardCheck, title: t('exams'), desc: t('onb2.body') },
                { icon: Sparkles, title: t('tutor'), desc: t('onb4.body') },
              ].map((item) => (
                <div key={item.title} className="p-3.5 rounded-2xl bg-sanzar-surface2 border border-sanzar-border space-y-1.5">
                  <div className="flex items-center gap-2 font-bold text-sm text-sanzar-primary">
                    <item.icon className="w-4 h-4 shrink-0" />
                    <span>{item.title}</span>
                  </div>
                  <p className="text-sanzar-text2 leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 pt-2">
          {step > 0 ? (
            <button
              type="button"
              onClick={() => setStep((s) => s - 1)}
              className="px-4 py-2.5 rounded-xl border border-sanzar-border text-sm font-semibold flex items-center gap-1.5 hover:bg-sanzar-surface2 transition"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          ) : (
            <span />
          )}

          {step < 2 ? (
            <button
              type="button"
              disabled={(step === 0 && name.trim().length < 2) || (step === 1 && !levelId)}
              onClick={() => setStep((s) => s + 1)}
              className="px-6 py-2.5 rounded-xl bg-sanzar-primary text-sanzar-onPrimary font-bold text-sm shadow-sm hover:opacity-95 disabled:opacity-50 flex items-center gap-2"
            >
              <span>{t('continue')}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={finish}
              className="px-6 py-2.5 rounded-xl bg-sanzar-primary text-sanzar-onPrimary font-bold text-sm shadow-sm hover:opacity-95 disabled:opacity-50 flex items-center gap-2"
            >
              <span>{busy ? '…' : t('finishSetup')}</span>
              <Check className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

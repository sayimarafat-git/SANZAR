import React from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, BookOpen, Compass, Award, Smartphone, CheckCircle, ArrowRight } from 'lucide-react';

export const HomePage: React.FC = () => {
  return (
    <div className="space-y-16 py-6">
      {/* Hero Section */}
      <section className="text-center max-w-3xl mx-auto space-y-6">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold uppercase tracking-wider border border-emerald-200">
          <Sparkles className="w-3.5 h-3.5" /> Modern Architecture v1.1.0 Released
        </div>
        <h1 className="text-4xl sm:text-6xl font-extrabold text-slate-900 tracking-tight leading-tight">
          Master Languages &amp; Concepts <span className="text-emerald-600">Anywhere, Anytime</span>.
        </h1>
        <p className="text-lg text-slate-600 leading-relaxed">
          SANZAR brings an offline-first learning system built on Cloudflare Pages, Workers, D1 database, and native Android with local Room persistence.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
          <Link
            to="/learn"
            className="px-6 py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-md shadow-emerald-600/20 flex items-center gap-2 transition"
          >
            Start Learning Free <ArrowRight className="w-4 h-4" />
          </Link>
          <a
            href="https://github.com/sayimarafat-git/SANZAR-Release/releases"
            target="_blank"
            rel="noopener noreferrer"
            className="px-6 py-3.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 font-semibold border border-slate-300 shadow-sm flex items-center gap-2 transition"
          >
            <Smartphone className="w-4 h-4" /> Download Android APK (v1.1.0)
          </a>
        </div>
      </section>

      {/* Feature Highlights */}
      <section className="grid md:grid-cols-3 gap-8">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-4">
            <BookOpen className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-slate-900 mb-2">Structured Curriculum</h3>
          <p className="text-slate-600 text-sm leading-relaxed">
            Levels, chapters, interactive notes, and quizzes organized for maximum recall and study progress.
          </p>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition">
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-4">
            <Smartphone className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-slate-900 mb-2">100% Offline Android App</h3>
          <p className="text-slate-600 text-sm leading-relaxed">
            Room local database stores your progress on-device. WorkManager auto-syncs when you are back online.
          </p>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition">
          <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center mb-4">
            <Award className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-slate-900 mb-2">Real-time Performance</h3>
          <p className="text-slate-600 text-sm leading-relaxed">
            Firebase Auth JWT token verification on the edge via Cloudflare Workers with zero latency.
          </p>
        </div>
      </section>

      {/* System Status Banner */}
      <section className="bg-gradient-to-r from-slate-900 to-slate-800 rounded-3xl p-8 text-white flex flex-col md:flex-row items-center justify-between gap-6">
        <div>
          <span className="text-emerald-400 font-semibold text-xs tracking-wider uppercase">Architecture Status</span>
          <h3 className="text-2xl font-bold mt-1">Single Cloudflare Worker + D1 Backend Live</h3>
          <p className="text-slate-300 text-sm mt-1">
            Web Pages front-end and Admin control center deployed in harmony with Firebase Authentication.
          </p>
        </div>
        <Link
          to="/register"
          className="px-6 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold whitespace-nowrap transition"
        >
          Create Free Account
        </Link>
      </section>
    </div>
  );
};

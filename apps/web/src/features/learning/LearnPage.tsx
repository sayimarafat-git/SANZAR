import React, { useState } from 'react';
import { Search, BookOpen, Volume2, Bookmark, Check } from 'lucide-react';

export const LearnAndDictionaryPage: React.FC<{ type: 'learn' | 'dictionary' }> = ({ type }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeLevel, setActiveLevel] = useState('Level 1');

  const vocab = [
    { word: 'Salam', translation: 'Hello / Peace', phonetic: '/sa-lam/', example: 'Salam, kemon acho?' },
    { word: 'Shukriya', translation: 'Thank you', phonetic: '/shook-ree-ya/', example: 'Onek shukriya.' },
    { word: 'Bhalo', translation: 'Good / Well', phonetic: '/bha-lo/', example: 'Ami bhalo achi.' },
    { word: 'Porashona', translation: 'Studies / Education', phonetic: '/po-ra-sho-na/', example: 'Porashona cholche.' },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-extrabold text-slate-900">
          {type === 'learn' ? 'Curriculum & Lessons' : 'Interactive Dictionary'}
        </h1>
        <p className="text-slate-600 text-sm mt-1">
          {type === 'learn' 
            ? 'Complete your daily milestones. Available offline anytime on your Android device.' 
            : 'Look up vocabulary, grammar structures, and native pronunciations.'}
        </p>
      </div>

      {type === 'dictionary' && (
        <div className="relative max-w-xl">
          <Search className="w-5 h-5 text-slate-400 absolute left-3 top-3.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search words, meanings or translations..."
            className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm text-sm"
          />
        </div>
      )}

      {type === 'learn' && (
        <div className="flex gap-2 border-b border-slate-200">
          {['Level 1', 'Level 2', 'Level 3', 'Advanced'].map((lvl) => (
            <button
              key={lvl}
              onClick={() => setActiveLevel(lvl)}
              className={`px-4 py-2 font-semibold text-sm border-b-2 transition ${
                activeLevel === lvl ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-slate-500 hover:text-slate-900'
              }`}
            >
              {lvl}
            </button>
          ))}
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        {vocab.map((item, idx) => (
          <div key={idx} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-2 hover:border-emerald-300 transition">
            <div className="flex items-center justify-between">
              <span className="font-extrabold text-lg text-slate-900">{item.word}</span>
              <span className="text-xs text-slate-400 font-mono">{item.phonetic}</span>
            </div>
            <p className="text-sm font-semibold text-emerald-700">{item.translation}</p>
            <p className="text-xs text-slate-500 italic">"{item.example}"</p>
          </div>
        ))}
      </div>
    </div>
  );
};

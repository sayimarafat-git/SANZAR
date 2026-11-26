/**
 * Offline Linguistic Dataset Builder & D1 Batch SQL Generator
 * Enriches all curated English, Bangla, and Chinese (HSK 1-6) entries with:
 *  - Synonyms (with Pinyin for Chinese)
 *  - Antonyms (400+ bidirectional pairs projected across EN, BN, and ZH)
 *  - Collocations & compound phrases
 *  - POS & level-aware Grammar Notes
 *  - Curated Trilingual Grammar Rules table (`grammar_rules`)
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const OUT_SQL_DIR = process.argv[2] || path.join(ROOT, 'datasets', 'generated-sql');
const GRAMMAR_JSON_PATH = path.join(ROOT, 'datasets', 'grammar-rules', 'grammar-rules-trilingual.json');

fs.mkdirSync(OUT_SQL_DIR, { recursive: true });
fs.mkdirSync(path.dirname(GRAMMAR_JSON_PATH), { recursive: true });

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
}

const enEntries = readJson('datasets/english-cefr/oxford-5000-complete.json');
const bnEntries = readJson('datasets/bangla-cefr/bangla-cefr-complete.json');
const zhEntries = [
  ...readJson('datasets/hsk1/hsk1-complete.json'),
  ...readJson('datasets/hsk2/hsk2-complete.json'),
  ...readJson('datasets/hsk3/hsk3-complete.json'),
  ...readJson('datasets/hsk4/hsk4-complete.json'),
  ...readJson('datasets/hsk5/hsk5-complete.json'),
  ...readJson('datasets/hsk6/hsk6-complete.json'),
];

const allEntries = [...enEntries, ...bnEntries, ...zhEntries];
console.log(`Loaded ${enEntries.length} EN, ${bnEntries.length} BN, ${zhEntries.length} ZH (${allEntries.length} total).`);

// Core English bidirectional antonym pairs (projected across EN, ZH, and BN!)
const CORE_EN_ANTONYMS = [
  ['big', 'small'], ['large', 'small'], ['huge', 'tiny'], ['tall', 'short'], ['long', 'short'],
  ['high', 'low'], ['good', 'bad'], ['great', 'awful'], ['better', 'worse'], ['best', 'worst'],
  ['fast', 'slow'], ['quick', 'slow'], ['rapid', 'gradual'], ['early', 'late'],
  ['hot', 'cold'], ['warm', 'cool'], ['new', 'old'], ['young', 'old'], ['modern', 'ancient'], ['modern', 'traditional'],
  ['open', 'close'], ['open', 'shut'], ['start', 'stop'], ['start', 'finish'], ['begin', 'end'],
  ['buy', 'sell'], ['give', 'take'], ['give', 'receive'], ['borrow', 'lend'], ['send', 'receive'],
  ['push', 'pull'], ['enter', 'exit'], ['arrive', 'leave'], ['arrive', 'depart'], ['come', 'go'],
  ['bring', 'take'], ['rise', 'fall'], ['increase', 'decrease'], ['grow', 'shrink'], ['expand', 'contract'],
  ['happy', 'sad'], ['glad', 'upset'], ['joy', 'sorrow'], ['love', 'hate'], ['like', 'dislike'],
  ['laugh', 'cry'], ['smile', 'frown'], ['hope', 'despair'], ['optimistic', 'pessimistic'],
  ['easy', 'difficult'], ['easy', 'hard'], ['simple', 'complex'], ['simple', 'complicated'],
  ['hard', 'soft'], ['heavy', 'light'], ['dark', 'bright'], ['dark', 'light'],
  ['clean', 'dirty'], ['pure', 'impure'], ['neat', 'messy'], ['clear', 'vague'],
  ['rich', 'poor'], ['wealthy', 'poor'], ['cheap', 'expensive'], ['free', 'busy'],
  ['strong', 'weak'], ['powerful', 'weak'], ['healthy', 'sick'], ['healthy', 'ill'],
  ['true', 'false'], ['right', 'wrong'], ['correct', 'incorrect'], ['accurate', 'inaccurate'],
  ['left', 'right'], ['up', 'down'], ['top', 'bottom'], ['front', 'back'], ['ahead', 'behind'],
  ['inside', 'outside'], ['inner', 'outer'], ['internal', 'external'], ['interior', 'exterior'],
  ['above', 'below'], ['over', 'under'], ['upper', 'lower'], ['north', 'south'], ['east', 'west'],
  ['before', 'after'], ['past', 'future'], ['first', 'last'], ['previous', 'next'],
  ['always', 'never'], ['often', 'seldom'], ['often', 'rarely'], ['usually', 'rarely'],
  ['all', 'none'], ['everything', 'nothing'], ['everyone', 'nobody'], ['many', 'few'], ['much', 'little'], ['more', 'less'], ['most', 'least'],
  ['win', 'lose'], ['victory', 'defeat'], ['success', 'failure'], ['succeed', 'fail'], ['pass', 'fail'],
  ['teach', 'learn'], ['ask', 'answer'], ['question', 'answer'], ['speak', 'listen'],
  ['remember', 'forget'], ['find', 'lose'], ['accept', 'refuse'], ['accept', 'reject'], ['agree', 'disagree'],
  ['allow', 'forbid'], ['permit', 'prohibit'], ['approve', 'disapprove'], ['include', 'exclude'],
  ['safe', 'dangerous'], ['safety', 'danger'], ['security', 'risk'], ['peace', 'war'], ['calm', 'nervous'],
  ['polite', 'rude'], ['kind', 'cruel'], ['generous', 'selfish'], ['honest', 'dishonest'], ['brave', 'afraid'], ['brave', 'cowardly'],
  ['quiet', 'noisy'], ['quiet', 'loud'], ['silent', 'noisy'],
  ['full', 'empty'], ['wet', 'dry'], ['wide', 'narrow'], ['broad', 'narrow'], ['deep', 'shallow'], ['thick', 'thin'], ['fat', 'thin'],
  ['sweet', 'bitter'], ['sweet', 'sour'], ['sharp', 'dull'], ['smooth', 'rough'], ['tight', 'loose'],
  ['public', 'private'], ['local', 'global'], ['native', 'foreign'], ['urban', 'rural'],
  ['friend', 'enemy'], ['guest', 'host'], ['leader', 'follower'], ['master', 'servant'],
  ['awake', 'asleep'], ['alive', 'dead'], ['life', 'death'], ['birth', 'death'],
  ['positive', 'negative'], ['active', 'passive'], ['direct', 'indirect'], ['formal', 'informal'],
  ['appear', 'disappear'], ['connect', 'disconnect'], ['attach', 'detach'], ['join', 'separate'], ['unite', 'divide'],
  ['import', 'export'], ['input', 'output'], ['supply', 'demand'], ['profit', 'loss'], ['save', 'spend'], ['save', 'waste'],
  ['create', 'destroy'], ['build', 'destroy'], ['construct', 'demolish'], ['protect', 'attack'], ['defend', 'attack'],
  ['add', 'subtract'], ['add', 'remove'], ['gain', 'lose'], ['reward', 'punish'], ['praise', 'criticize'],
  ['permanent', 'temporary'], ['constant', 'variable'], ['major', 'minor'], ['maximum', 'minimum'], ['majority', 'minority'],
  ['visible', 'invisible'], ['possible', 'impossible'], ['legal', 'illegal'], ['regular', 'irregular'], ['normal', 'strange'],
  ['careful', 'careless'], ['useful', 'useless'], ['helpful', 'helpless'], ['hopeful', 'hopeless'],
  ['same', 'different'], ['similar', 'different'], ['equal', 'unequal'], ['common', 'rare'], ['ordinary', 'special'],
  ['real', 'fake'], ['true', 'real'], ['natural', 'artificial'], ['modern', 'old-fashioned'],
  ['near', 'far'], ['close', 'distant'], ['together', 'apart'], ['whole', 'part'],
  ['day', 'night'], ['morning', 'evening'], ['summer', 'winter'], ['male', 'female'],
];

// Curated English synonym sets to boost high-frequency words
const CORE_EN_SYNONYM_GROUPS = [
  ['do', 'perform', 'execute', 'act', 'complete', 'accomplish'],
  ['make', 'create', 'produce', 'build', 'construct', 'form'],
  ['good', 'great', 'fine', 'excellent', 'wonderful', 'positive'],
  ['bad', 'poor', 'awful', 'terrible', 'negative', 'unpleasant'],
  ['big', 'large', 'huge', 'enormous', 'vast', 'massive'],
  ['small', 'little', 'tiny', 'minor', 'compact', 'slight'],
  ['happy', 'glad', 'joyful', 'pleased', 'cheerful', 'delighted'],
  ['sad', 'unhappy', 'upset', 'depressed', 'sorrowful', 'miserable'],
  ['fast', 'quick', 'rapid', 'swift', 'speedy'],
  ['slow', 'gradual', 'unhurried', 'steady'],
  ['smart', 'clever', 'intelligent', 'bright', 'wise', 'brilliant'],
  ['beautiful', 'pretty', 'lovely', 'attractive', 'gorgeous'],
  ['important', 'significant', 'essential', 'vital', 'crucial', 'major'],
  ['help', 'assist', 'support', 'aid', 'guide'],
  ['begin', 'start', 'commence', 'launch', 'initiate'],
  ['end', 'finish', 'complete', 'conclude', 'stop'],
  ['think', 'believe', 'consider', 'suppose', 'reflect'],
  ['know', 'understand', 'comprehend', 'realize', 'recognize'],
  ['say', 'tell', 'speak', 'state', 'express', 'mention'],
  ['look', 'see', 'watch', 'observe', 'view', 'notice'],
  ['walk', 'stroll', 'march', 'step', 'wander'],
  ['run', 'sprint', 'race', 'rush', 'hurry'],
  ['get', 'obtain', 'receive', 'acquire', 'gain'],
  ['give', 'provide', 'offer', 'supply', 'grant', 'present'],
  ['use', 'utilize', 'employ', 'apply', 'operate'],
  ['show', 'display', 'demonstrate', 'present', 'reveal'],
  ['keep', 'maintain', 'preserve', 'retain', 'hold'],
  ['change', 'alter', 'modify', 'transform', 'adjust'],
  ['hard', 'difficult', 'tough', 'challenging', 'demanding'],
  ['easy', 'simple', 'effortless', 'straightforward'],
  ['study', 'learn', 'research', 'examine', 'review'],
  ['work', 'labor', 'job', 'task', 'effort'],
];

const enAntonymMap = new Map();
for (const [a, b] of CORE_EN_ANTONYMS) {
  if (a === b) continue;
  if (!enAntonymMap.has(a)) enAntonymMap.set(a, new Set());
  if (!enAntonymMap.has(b)) enAntonymMap.set(b, new Set());
  enAntonymMap.get(a).add(b);
  enAntonymMap.get(b).add(a);
}

const enSynGroupMap = new Map();
for (const grp of CORE_EN_SYNONYM_GROUPS) {
  for (const w of grp) {
    if (!enSynGroupMap.has(w)) enSynGroupMap.set(w, new Set());
    for (const other of grp) if (other !== w) enSynGroupMap.get(w).add(other);
  }
}

function normGlossTokens(gloss) {
  return String(gloss || '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .split(/[;,/]+/)
    .map((s) => s.replace(/^to\s+/, '').trim())
    .filter((s) => s.length >= 2 && s.length <= 28);
}

// Index entries by language & normalized English gloss token
const byLangAndEnGloss = { en: new Map(), bn: new Map(), zh: new Map() };
const enByWord = new Map();
const zhByFirstChar = new Map();

for (const e of enEntries) {
  const w = e.word.trim().toLowerCase();
  if (!enByWord.has(w)) enByWord.set(w, e);
  for (const tok of [w, ...normGlossTokens(e.meaning_bn)]) {
    if (!byLangAndEnGloss.en.has(tok)) byLangAndEnGloss.en.set(tok, []);
    byLangAndEnGloss.en.get(tok).push(e);
  }
}

for (const e of bnEntries) {
  if (e.part_of_speech === 'letter') continue;
  for (const tok of normGlossTokens(e.meaning_en)) {
    if (!byLangAndEnGloss.bn.has(tok)) byLangAndEnGloss.bn.set(tok, []);
    byLangAndEnGloss.bn.get(tok).push(e);
  }
}

for (const e of zhEntries) {
  for (const tok of normGlossTokens(e.meaning_en)) {
    if (!byLangAndEnGloss.zh.has(tok)) byLangAndEnGloss.zh.set(tok, []);
    byLangAndEnGloss.zh.get(tok).push(e);
  }
  for (const ch of Array.from(e.word)) {
    if (/[\u4e00-\u9fff]/.test(ch)) {
      if (!zhByFirstChar.has(ch)) zhByFirstChar.set(ch, []);
      zhByFirstChar.get(ch).push(e);
    }
  }
}

// Also group EN entries by shared Bangla meaning for rich EN synonyms!
const enByBnMeaning = new Map();
for (const e of enEntries) {
  const bnKey = String(e.meaning_bn || '').split(/[;,/]+/)[0]?.trim();
  if (bnKey && bnKey.length >= 2) {
    if (!enByBnMeaning.has(bnKey)) enByBnMeaning.set(bnKey, []);
    enByBnMeaning.get(bnKey).push(e);
  }
}

function buildGrammarNote(e) {
  const pos = String(e.part_of_speech || '').toLowerCase();
  const lvl = e.hsk_level ? ` [${e.hsk_level}]` : '';
  if (e.language === 'zh') {
    if (pos.includes('verb')) return `Chinese verb${lvl}: takes aspect particles like 了 (completed), 过 (experienced), or 着 (ongoing); negated with 不 (present/habitual) or 没 (past).`;
    if (pos.includes('adj')) return `Chinese stative adjective${lvl}: often linked with 很 before the adjective in simple statements (e.g., 很${e.word}) without needing 是.`;
    if (pos.includes('noun')) return `Chinese noun${lvl}: requires an appropriate measure word (such as 个) between a number/demonstrative and the noun.`;
    if (pos.includes('adv')) return `Chinese adverb${lvl}: placed directly before the verb or adjective it modifies, after the subject.`;
    if (pos.includes('measure') || pos.includes('classifier')) return `Chinese measure word${lvl}: placed between numerals/demonstratives (一, 这, 那) and the noun.`;
    return `Chinese vocabulary item${lvl}: placed following standard Subject + Time + Place + Verb + Object word order.`;
  }
  if (e.language === 'bn') {
    if (pos === 'letter') return `Bangla alphabet character${lvl}: foundation letter used in Bangla script and conjunct consonant/vowel formations.`;
    if (pos.includes('verb')) return `Bangla verb${lvl}: placed at the end of the clause (SOV order) and conjugated to match pronoun formality (আপনি / তুমি / তুই).`;
    if (pos.includes('adj')) return `Bangla adjective${lvl}: typically precedes the noun it modifies without changing for gender or number.`;
    if (pos.includes('noun')) return `Bangla noun${lvl}: takes case suffixes/বিভক্তি (-কে, -র/-এর, -তে/-য়) and classifiers (-টা, -টি, -জন) for definiteness.`;
    return `Bangla ${e.part_of_speech || 'expression'}${lvl}: used in standard Subject + Object + Verb (SOV) Bangla clause structure.`;
  }
  // English
  if (pos.includes('verb')) return `English verb${lvl}: inflects for tense and 3rd-person singular (-s/-es in present simple); check transitive vs. intransitive object usage.`;
  if (pos.includes('noun')) return `English noun${lvl}: check whether countable (takes a/an or plural -s) or uncountable (no indefinite article).`;
  if (pos.includes('adj')) return `English adjective${lvl}: placed before nouns or after linking verbs (be, seem, become); forms comparative/superlative with -er/-est or more/most.`;
  if (pos.includes('adv')) return `English adverb${lvl}: modifies verbs, adjectives, or clauses; frequency adverbs normally appear before the main verb.`;
  if (pos.includes('prep')) return `English preposition${lvl}: followed by a noun phrase, pronoun, or gerund (-ing verb form).`;
  return `English ${e.part_of_speech || 'term'}${lvl}: used in standard Subject + Verb + Object sentence structure.`;
}

function enrichEntry(e) {
  const synonyms = [];
  const antonyms = [];
  const collocations = [];
  const seenSyn = new Set([e.word.toLowerCase()]);
  const seenAnt = new Set([e.word.toLowerCase()]);

  if (e.language === 'en') {
    const w = e.word.trim().toLowerCase();
    // 1. Curated synonym groups
    for (const syn of enSynGroupMap.get(w) || []) {
      if (!seenSyn.has(syn) && synonyms.length < 6) {
        seenSyn.add(syn);
        synonyms.push({ word: syn });
      }
    }
    // 2. Shared Bangla gloss synonyms
    const bnKey = String(e.meaning_bn || '').split(/[;,/]+/)[0]?.trim();
    if (bnKey && enByBnMeaning.has(bnKey)) {
      for (const peer of enByBnMeaning.get(bnKey)) {
        const pw = peer.word.trim();
        if (!seenSyn.has(pw.toLowerCase()) && synonyms.length < 6) {
          seenSyn.add(pw.toLowerCase());
          synonyms.push({ word: pw });
        }
      }
    }
    // 3. Antonyms
    for (const ant of enAntonymMap.get(w) || []) {
      if (!seenAnt.has(ant) && antonyms.length < 5) {
        seenAnt.add(ant);
        antonyms.push({ word: ant });
      }
    }
    // 4. Collocation from example
    if (e.example) {
      collocations.push({ phrase: e.example, ...(e.example_translation ? { meaning: e.example_translation } : {}) });
    }
  } else if (e.language === 'zh') {
    const glosses = normGlossTokens(e.meaning_en);
    // 1. Synonyms sharing primary English glosses in HSK
    for (const g of glosses) {
      for (const peer of byLangAndEnGloss.zh.get(g) || []) {
        if (!seenSyn.has(peer.word) && synonyms.length < 6) {
          seenSyn.add(peer.word);
          synonyms.push({ word: peer.word, ...(peer.phonetic ? { pinyin: peer.phonetic } : {}) });
        }
      }
      // Also check English synonym cluster -> Chinese peers
      for (const enSyn of enSynGroupMap.get(g) || []) {
        for (const peer of byLangAndEnGloss.zh.get(enSyn) || []) {
          if (!seenSyn.has(peer.word) && synonyms.length < 6) {
            seenSyn.add(peer.word);
            synonyms.push({ word: peer.word, ...(peer.phonetic ? { pinyin: peer.phonetic } : {}) });
          }
        }
      }
      // 2. Antonyms projected from English antonym pairs -> HSK entries!
      for (const enAnt of enAntonymMap.get(g) || []) {
        for (const peer of byLangAndEnGloss.zh.get(enAnt) || []) {
          if (!seenAnt.has(peer.word) && antonyms.length < 5) {
            seenAnt.add(peer.word);
            antonyms.push({ word: peer.word, ...(peer.phonetic ? { pinyin: peer.phonetic } : {}) });
          }
        }
      }
    }
    // 3. Compound HSK collocations containing this word + example sentence
    const candidates = zhByFirstChar.get(Array.from(e.word)[0]) || [];
    for (const c of candidates) {
      if (c.word !== e.word && c.word.includes(e.word) && collocations.length < 4) {
        collocations.push({
          phrase: c.word,
          ...(c.phonetic ? { pinyin: c.phonetic } : {}),
          ...(c.meaning_en ? { meaning: c.meaning_en } : {}),
        });
      }
    }
    if (e.example && collocations.length < 5) {
      collocations.push({
        phrase: e.example,
        ...(e.example_translation ? { meaning: e.example_translation } : {}),
      });
    }
  } else if (e.language === 'bn') {
    const glosses = normGlossTokens(e.meaning_en);
    if (e.part_of_speech !== 'letter') {
      for (const g of glosses) {
        for (const peer of byLangAndEnGloss.bn.get(g) || []) {
          if (!seenSyn.has(peer.word) && synonyms.length < 6) {
            seenSyn.add(peer.word);
            synonyms.push({ word: peer.word });
          }
        }
        for (const enSyn of enSynGroupMap.get(g) || []) {
          for (const peer of byLangAndEnGloss.bn.get(enSyn) || []) {
            if (!seenSyn.has(peer.word) && synonyms.length < 6) {
              seenSyn.add(peer.word);
              synonyms.push({ word: peer.word });
            }
          }
        }
        for (const enAnt of enAntonymMap.get(g) || []) {
          for (const peer of byLangAndEnGloss.bn.get(enAnt) || []) {
            if (!seenAnt.has(peer.word) && antonyms.length < 5) {
              seenAnt.add(peer.word);
              antonyms.push({ word: peer.word });
            }
          }
        }
      }
    }
    if (e.example) {
      collocations.push({
        phrase: e.example,
        ...(e.example_translation ? { meaning: e.example_translation } : {}),
      });
    }
  }

  return {
    id: e.id,
    synonyms,
    antonyms,
    collocations,
    grammar_note: buildGrammarNote(e),
  };
}

// Curated Trilingual Grammar Rules (Chinese HSK 1-6, English CEFR A1-C1, Bangla CEFR A1-C1)
const GRAMMAR_RULES = [
  // Chinese (zh)
  { id: 'zh-gr-01', language: 'zh', pattern: '', title: 'Standard Chinese SVO & Time/Place Order', explanation: 'Mandarin places Time and Place BEFORE the verb: Subject + Time + Place + Verb + Object.', example: '我今天在图书馆学习中文。', example_translation: 'Today I study Chinese at the library.', level_tag: 'HSK 1', sort: 1 },
  { id: 'zh-gr-02', language: 'zh', pattern: '了', title: 'Aspect & Change-of-State Particle 了 (le)', explanation: 'Placed right after a verb to mark a completed action, or at the end of a sentence to indicate a new situation.', example: '我已经吃了早饭。', example_translation: 'I have already eaten breakfast.', level_tag: 'HSK 1', sort: 2 },
  { id: 'zh-gr-03', language: 'zh', pattern: '的|地|得', title: 'Structural Particles 的 / 地 / 得', explanation: '的 modifies nouns (我的书), 地 turns adjectives into adverbs before verbs (认真地学), and 得 introduces degree complements after verbs (说得很好).', example: '他高兴地说得很快。', example_translation: 'He happily spoke very fast.', level_tag: 'HSK 2', sort: 3 },
  { id: 'zh-gr-04', language: 'zh', pattern: '不|没', title: 'Negation: 不 (bù) vs. 没 (méi)', explanation: 'Use 不 to negate present, future, or habitual actions and adjectives; use 没 / 没有 to negate past actions or 有 (possession).', example: '我昨天没去，今天也不去。', example_translation: 'I did not go yesterday, and I am not going today either.', level_tag: 'HSK 1', sort: 4 },
  { id: 'zh-gr-05', language: 'zh', pattern: '吗|呢|吧', title: 'Question & Modal Particles 吗 / 呢 / 吧', explanation: '吗 turns a statement into a yes/no question; 呢 asks bounce-back questions ("and you?"); 吧 softens suggestions or seeks agreement.', example: '我们一起去学习吧！', example_translation: 'Let’s go study together!', level_tag: 'HSK 1', sort: 5 },
  { id: 'zh-gr-06', language: 'zh', pattern: '过', title: 'Experiential Particle 过 (guò)', explanation: 'Placed immediately after a verb (Verb + 过) to express having experienced something at least once in the past.', example: '我去过北京两次。', example_translation: 'I have been to Beijing twice.', level_tag: 'HSK 2', sort: 6 },
  { id: 'zh-gr-07', language: 'zh', pattern: '着', title: 'Continuous State Particle 着 (zhe)', explanation: 'Verb + 着 indicates an ongoing state or posture (e.g., 门开着 — the door is open).', example: '墙上挂着一张地图。', example_translation: 'A map is hanging on the wall.', level_tag: 'HSK 2', sort: 7 },
  { id: 'zh-gr-08', language: 'zh', pattern: '比', title: 'Comparison Structure with 比 (bǐ)', explanation: 'A + 比 + B + Adjective (+ degree) compares two things. Never put 很 directly before the adjective in a 比 sentence.', example: '今天比昨天冷一点儿。', example_translation: 'Today is a little colder than yesterday.', level_tag: 'HSK 2', sort: 8 },
  { id: 'zh-gr-09', language: 'zh', pattern: '把', title: 'The 把 (bǎ) Disposal Construction', explanation: 'Subject + 把 + Object + Verb + Result/Complement highlights how a definite object is affected, moved, or handled.', example: '请把作业放在桌子上。', example_translation: 'Please put the homework on the desk.', level_tag: 'HSK 3', sort: 9 },
  { id: 'zh-gr-10', language: 'zh', pattern: '被', title: 'Passive Voice with 被 (bèi)', explanation: 'Receiver + 被 (+ Agent) + Verb + Result expresses passive actions where something happens to the subject.', example: '我的词典被同学借走了。', example_translation: 'My dictionary was borrowed by a classmate.', level_tag: 'HSK 3', sort: 10 },
  { id: 'zh-gr-11', language: 'zh', pattern: '因为|所以', title: 'Cause & Effect: 因为…所以…', explanation: 'Pairs 因为 (because) in the cause clause with 所以 (therefore) in the result clause.', example: '因为下雨，所以我们留在家里。', example_translation: 'Because it rained, we stayed home.', level_tag: 'HSK 2', sort: 11 },
  { id: 'zh-gr-12', language: 'zh', pattern: '虽然|但是', title: 'Concession: 虽然…但是…', explanation: '虽然 (although) always pairs with 但是 / 可是 (but) in Mandarin — unlike English, both conjunctions appear together.', example: '虽然汉字很难，但是很有意思。', example_translation: 'Although Chinese characters are hard, they are very interesting.', level_tag: 'HSK 2', sort: 12 },
  { id: 'zh-gr-13', language: 'zh', pattern: '不但|而且', title: 'Progressive Structure: 不但…而且…', explanation: 'Means "not only... but also...". Keep不但 after the subject if both clauses share the same subject.', example: '她不但会说英语，而且会说中文。', example_translation: 'She speaks not only English, but also Chinese.', level_tag: 'HSK 3', sort: 13 },
  { id: 'zh-gr-14', language: 'zh', pattern: '越来越', title: 'Gradual Change: 越来越 + Adj/Mental Verb', explanation: 'Expresses "more and more..." over time. Do not add 很 with 越来越.', example: '你的发音越来越标准了。', example_translation: 'Your pronunciation is getting more and more accurate.', level_tag: 'HSK 3', sort: 14 },

  // English (en)
  { id: 'en-gr-01', language: 'en', pattern: '', title: 'English SVO Order & Subject–Verb Agreement', explanation: 'Standard English follows Subject + Verb + Object. In the present simple, 3rd-person singular subjects (he/she/it) require -s/-es on the verb.', example: 'She studies vocabulary every morning.', example_translation: 'সে প্রতিদিন সকালে শব্দভাণ্ডার পড়ে।', level_tag: 'A1', sort: 1 },
  { id: 'en-gr-02', language: 'en', pattern: 'a|an|the', title: 'Articles: a / an / the', explanation: 'Use "a" before consonant sounds, "an" before vowel sounds for non-specific singular countable nouns, and "the" when the listener knows which specific item is meant.', example: 'I bought a book. The book is very helpful.', example_translation: '', level_tag: 'A1', sort: 2 },
  { id: 'en-gr-03', language: 'en', pattern: 'have|has|had', title: 'Perfect Aspect (have / has / had + Past Participle)', explanation: 'Links past actions to the present (have/has + V3) or an earlier past moment (had + V3). Avoid pairing present perfect with specific past times like "yesterday".', example: 'I have already finished my assignment.', example_translation: '', level_tag: 'A2', sort: 3 },
  { id: 'en-gr-04', language: 'en', pattern: 'can|could|should|must|would|might', title: 'Modal Verbs + Base Infinitive', explanation: 'Modal verbs (can, could, should, must, might, would) are always followed directly by the base verb without "to" or "-s".', example: 'You should practice speaking every day.', example_translation: '', level_tag: 'A2', sort: 4 },
  { id: 'en-gr-05', language: 'en', pattern: 'if|unless', title: 'Conditional Clauses (If / Unless)', explanation: 'First conditional (If + present simple, will + verb) expresses real future possibilities; second conditional (If + past simple, would + verb) expresses hypothetical situations.', example: 'If you review daily, you will remember more words.', example_translation: '', level_tag: 'B1', sort: 5 },
  { id: 'en-gr-06', language: 'en', pattern: 'in|on|at', title: 'Prepositions of Time & Place (in / on / at)', explanation: 'Use "at" for exact times/points (at 7 PM, at school), "on" for days/dates/surfaces (on Monday, on the desk), and "in" for months/years/enclosed spaces (in July, in Dhaka).', example: 'Our exam starts at 9:00 AM on Monday.', example_translation: '', level_tag: 'A1', sort: 6 },
  { id: 'en-gr-07', language: 'en', pattern: 'although|despite|however', title: 'Contrast Connectors: Although vs. Despite / However', explanation: '"Although" is followed by a full Subject + Verb clause; "despite / in spite of" is followed by a noun or -ing gerund.', example: 'Although it was late, he kept studying.', example_translation: '', level_tag: 'B2', sort: 7 },
  { id: 'en-gr-08', language: 'en', pattern: 'do|does|did', title: 'Auxiliary Do / Does / Did in Questions & Negatives', explanation: 'When forming questions or negatives with do/does/did, keep the main verb in its base form (e.g., "Did she go?" — never "Did she went?").', example: 'Does he understand this grammar rule?', example_translation: '', level_tag: 'A1', sort: 8 },

  // Bangla (bn)
  { id: 'bn-gr-01', language: 'bn', pattern: '', title: 'Bangla SOV Word Order', explanation: 'Bangla places the conjugated verb at the end of the sentence: Subject (কর্তা) + Object (কর্ম) + Verb (ক্রিয়া).', example: 'আমি প্রতিদিন নতুন শব্দ শিখি।', example_translation: 'I learn new words every day.', level_tag: 'A1', sort: 1 },
  { id: 'bn-gr-02', language: 'bn', pattern: 'আপনি|আপনার|তুমি|তোমার|তুই', title: 'Pronoun Honorific Levels & Verb Agreement', explanation: 'Bangla has 3 second-person registers that require matching verb endings: আপনি (formal: করেন/যান), তুমি (familiar: করো/যাও), and তুই (intimate: করিস/যাস).', example: 'আপনি কেমন আছেন? / তুমি কেমন আছো?', example_translation: 'How are you? (formal / familiar)', level_tag: 'A1', sort: 2 },
  { id: 'bn-gr-03', language: 'bn', pattern: 'না|নি|নয়', title: 'Bangla Negation: না vs. নি vs. নয়', explanation: 'Place না after the verb for present/future negation, নি (with present-form stem) for past/perfect negation, and নয়/নন to negate identity ("is not").', example: 'আমি আজ যাইনি, কালও যাবো না।', example_translation: 'I did not go today, and I will not go tomorrow either.', level_tag: 'A2', sort: 3 },
  { id: 'bn-gr-04', language: 'bn', pattern: 'টা|টি|জন|খানা', title: 'Definite Classifiers (-টা / -টি / -জন)', explanation: 'Attaching -টা or -টি to a noun (বইটি = the book) or -জন for people (একজন শিক্ষক = a teacher) marks definiteness or counting.', example: 'বইটি খুব উপকারী।', example_translation: 'The book is very useful.', level_tag: 'A1', sort: 4 },
  { id: 'bn-gr-05', language: 'bn', pattern: 'কে|এর|তে|থেকে|জন্য|সাথে', title: 'Case Endings (বিভক্তি) & Postpositions (অনুসর্গ)', explanation: 'Instead of prepositions before nouns, Bangla attaches suffixes (-কে object, -র/-এর possessive, -তে/-য় locative) and places postpositions (জন্য, থেকে, সাথে) after the possessive noun.', example: 'শিক্ষকের সাথে কথা বলুন।', example_translation: 'Speak with the teacher.', level_tag: 'A2', sort: 5 },
  { id: 'bn-gr-06', language: 'bn', pattern: 'যদি|তাহলে', title: 'Conditional Sentences: যদি … তাহলে …', explanation: 'Pairs যদি (if) at the start of the condition clause with তাহলে / তবে (then) at the start of the result clause.', example: 'যদি নিয়মিত পড়ো, তাহলে ভালো ফল করবে।', example_translation: 'If you study regularly, you will do well.', level_tag: 'B1', sort: 6 },
];

fs.writeFileSync(GRAMMAR_JSON_PATH, JSON.stringify(GRAMMAR_RULES, null, 2), 'utf8');
console.log(`Saved ${GRAMMAR_RULES.length} curated grammar rules to ${GRAMMAR_JSON_PATH}`);

function escSql(val) {
  return `'${String(val ?? '').replace(/'/g, "''")}'`;
}

// Build SQL batch files (800 statements per file for fast, reliable wrangler d1 execute)
const enriched = allEntries.map(enrichEntry);
let synCount = 0;
let antCount = 0;
let colCount = 0;
for (const x of enriched) {
  if (x.synonyms.length) synCount++;
  if (x.antonyms.length) antCount++;
  if (x.collocations.length) colCount++;
}
console.log(`Enriched stats: ${synCount} with synonyms, ${antCount} with antonyms, ${colCount} with collocations.`);

// File 00: Grammar rules seed
const nowMs = Date.now();
const grSql = GRAMMAR_RULES.map(
  (r) =>
    `INSERT INTO grammar_rules (id, language, pattern, title, explanation, example, example_translation, level_tag, sort, created_at, updated_at) VALUES (${escSql(r.id)}, ${escSql(r.language)}, ${escSql(r.pattern)}, ${escSql(r.title)}, ${escSql(r.explanation)}, ${escSql(r.example)}, ${escSql(r.example_translation)}, ${escSql(r.level_tag)}, ${r.sort}, ${nowMs}, ${nowMs}) ON CONFLICT(id) DO UPDATE SET pattern=excluded.pattern, title=excluded.title, explanation=excluded.explanation, example=excluded.example, example_translation=excluded.example_translation, level_tag=excluded.level_tag, sort=excluded.sort, updated_at=excluded.updated_at;`
).join('\n');
fs.writeFileSync(path.join(OUT_SQL_DIR, 'batch_00_grammar_rules.sql'), grSql + '\n', 'utf8');

const BATCH = 1500;
let fileIdx = 1;
for (let i = 0; i < enriched.length; i += BATCH) {
  const slice = enriched.slice(i, i + BATCH);
  const stmts = slice
    .map(
      (u) =>
        `UPDATE dictionary_entries SET synonyms_json=${escSql(JSON.stringify(u.synonyms))}, antonyms_json=${escSql(JSON.stringify(u.antonyms))}, collocations_json=${escSql(JSON.stringify(u.collocations))}, grammar_note=${escSql(u.grammar_note)} WHERE id=${escSql(u.id)};`
    )
    .join('\n');
  const fname = `batch_${String(fileIdx++).padStart(2, '0')}_entries.sql`;
  fs.writeFileSync(path.join(OUT_SQL_DIR, fname), stmts + '\n', 'utf8');
}
console.log(`Generated ${fileIdx} SQL batch files in ${OUT_SQL_DIR}`);

/* Bangla / English for the public pages.
 *
 *  - Picks the language by itself: the visitor's saved choice, else a Bangla browser
 *    language, else a browser in the Asia/Dhaka time zone, else English.
 *  - The "বাংলা / English" button in the top bar switches (and remembers) the language.
 *  - Marked-up text:  data-t (text), data-t-ph (placeholder), data-t-label (aria-label).
 *    The English text in the HTML is the key of the dictionary below.
 *  - Also formats the live date/time, dates, "x min ago" and the visitor count.
 *
 *  Text written by the site owner (titles, bio, summaries ...) is shown as typed.
 */
(() => {
  'use strict';

  const BN = {
    /* navigation */
    'Home': 'হোম', 'Videos': 'ভিডিও', 'Work': 'কাজ', 'Connect': 'যোগাযোগ', 'Admin': 'অ্যাডমিন',
    'Sections': 'বিভাগসমূহ', 'Switch language': 'ভাষা পরিবর্তন করুন',
    'Date, time and visitors': 'তারিখ, সময় ও ভিজিটর', 'Visitors': 'ভিজিটর',
    /* hero */
    'Watch & read': 'দেখুন ও পড়ুন', 'Social links': 'সোশ্যাল লিংক',
    /* videos */
    'Library': 'লাইব্রেরি', 'Videos & articles': 'ভিডিও ও লেখা',
    'Tap any card to read what it is about — no need to watch the video.':
      'যেকোনো কার্ডে ট্যাপ করে পড়ুন এটি কী নিয়ে — ভিডিও দেখার দরকার নেই।',
    'Search videos and topics': 'ভিডিও ও বিষয় খুঁজুন', 'Search videos and articles': 'ভিডিও ও লেখা খুঁজুন',
    'Filter': 'ফিল্টার', 'All': 'সব', 'Articles': 'লেখা', 'Video': 'ভিডিও', 'Article': 'লেখা',
    'Quick read': 'সংক্ষেপে পড়ুন', 'Nothing matches your search.': 'আপনার খোঁজার সঙ্গে কিছু মেলেনি।',
    'No videos or articles yet.': 'এখনও কোনো ভিডিও বা লেখা নেই।',
    /* work */
    'Career': 'ক্যারিয়ার', 'Where he works': 'তিনি যেখানে কাজ করেন', 'Present': 'বর্তমান',
    'Work details will appear here.': 'কাজের তথ্য এখানে দেখা যাবে।',
    /* links */
    'Follow': 'অনুসরণ', 'Follow & connect': 'অনুসরণ করুন ও যুক্ত থাকুন', 'No links yet.': 'এখনও কোনো লিংক নেই।',
    /* sheet / post */
    'Details': 'বিস্তারিত', 'Close': 'বন্ধ করুন', 'Loading…': 'লোড হচ্ছে…',
    'Key points': 'মূল পয়েন্ট', 'What this video covers': 'এই ভিডিওতে যা আছে', 'Read': 'পড়ুন',
    'Open on': 'খুলুন:', 'the original site': 'মূল সাইট', 'Share': 'শেয়ার', 'Link copied ✓': 'লিংক কপি হয়েছে ✓',
    'All videos & articles': 'সব ভিডিও ও লেখা',
    'Draft — only you can see this.': 'খসড়া — শুধু আপনি এটি দেখতে পাচ্ছেন।',
    /* comments */
    'Comments': 'মন্তব্য', 'Your name': 'আপনার নাম', 'Write a comment…': 'একটি মন্তব্য লিখুন…',
    'Post comment': 'মন্তব্য করুন', 'Be the first to comment.': 'প্রথম মন্তব্যটি আপনিই করুন।',
    'Posting…': 'পোস্ট হচ্ছে…', 'Posted ✓': 'পোস্ট হয়েছে ✓', 'just now': 'এইমাত্র',
    'Could not post your comment. Please try again.': 'মন্তব্য পোস্ট করা যায়নি। আবার চেষ্টা করুন।',
    'Thanks! Your comment was posted.': 'ধন্যবাদ! আপনার মন্তব্য পোস্ট হয়েছে।',
    'Please enter your name and a comment.': 'অনুগ্রহ করে আপনার নাম ও মন্তব্য লিখুন।',
    'You are commenting too fast. Please try again in a few minutes.':
      'আপনি খুব দ্রুত মন্তব্য করছেন। কয়েক মিনিট পরে আবার চেষ্টা করুন।',
    /* welcome bot */
    'Online · happy to help': 'অনলাইনে · সাহায্য করতে প্রস্তুত', 'Close chat': 'চ্যাট বন্ধ করুন',
    'See my work': 'আমার কাজ দেখুন', 'Watch videos': 'ভিডিও দেখুন', 'Follow me': 'আমাকে ফলো করুন',
    'Here is where I work 👇': 'আমি যেখানে কাজ করি 👇', 'Here are my videos 👇': 'এই যে আমার ভিডিওগুলো 👇',
    'You can find me here 👇': 'আমাকে এখানে পাবেন 👇', 'Here you go 👇': 'এই যে 👇',
    'Hi! 👋 My name is Izaz Ahmad. Please see my work.': 'হ্যালো! 👋 আমি Izaz Ahmad। দয়া করে আমার কাজ দেখুন।',
    'Every video has a short written summary, so you can read it instead of watching.':
      'প্রতিটি ভিডিওর সঙ্গে ছোট একটি লিখিত সারাংশ আছে, তাই দেখার বদলে পড়ে নিতে পারেন।',
    'You can leave a comment under any video. I read them all.':
      'যেকোনো ভিডিওর নিচে মন্তব্য করতে পারেন। আমি সবগুলো পড়ি।',
    'Follow me on YouTube and Facebook so you do not miss new videos.':
      'নতুন ভিডিও মিস না করতে YouTube ও Facebook-এ আমাকে ফলো করুন।',
  };

  const root = document.documentElement;
  const TZ = root.dataset.tz || 'Asia/Dhaka';
  const store = {
    get: k => { try { return localStorage.getItem(k); } catch (_) { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch (_) {} },
  };

  const detect = () => {
    const saved = store.get('lang');
    if (saved === 'bn' || saved === 'en') return saved;
    const langs = (navigator.languages && navigator.languages.length) ? navigator.languages : [navigator.language || ''];
    if (langs.some(l => /^bn(\b|-|_)/i.test(l))) return 'bn';
    try { if (Intl.DateTimeFormat().resolvedOptions().timeZone === 'Asia/Dhaka') return 'bn'; } catch (_) {}
    return 'en';
  };

  let lang = detect();
  const locale = () => (lang === 'bn' ? 'bn-BD' : 'en-GB');
  const t = s => (lang === 'bn' ? (BN[String(s).trim()] || s) : s);

  /* ---------- formatters (rebuilt when the language changes) ---------- */
  let fDate, fTime, fClock, fShort, fNum, fRel, fHour;

  /* "রাত ১১:০৪:১৬" instead of "১১:০৪:১৬ PM" (in Bangla the part of the day comes first) */
  const period = h => (h < 4 ? 'রাত' : h < 6 ? 'ভোর' : h < 12 ? 'সকাল' : h < 15 ? 'দুপুর' : h < 18 ? 'বিকাল' : h < 20 ? 'সন্ধ্যা' : 'রাত');
  const bnTime = (fmt, d) => {
    const body = fmt.formatToParts(d).filter(x => x.type !== 'dayPeriod').map(x => x.value).join('').trim();
    return period(parseInt(fHour.format(d), 10) % 24) + ' ' + body;
  };

  const build = () => {
    const L = locale();
    try {
      fDate = new Intl.DateTimeFormat(L, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ });
      fTime = new Intl.DateTimeFormat(L, { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true, timeZone: TZ });
      fShort = new Intl.DateTimeFormat(L, { day: 'numeric', month: 'short', year: 'numeric', timeZone: TZ });
      fClock = new Intl.DateTimeFormat(L, { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: TZ });
      fHour = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: TZ });
      fNum = new Intl.NumberFormat(L);
      fRel = new Intl.RelativeTimeFormat(L, { numeric: 'always', style: 'short' });
    } catch (_) { fDate = fTime = fClock = fShort = fNum = fRel = fHour = null; }
  };

  const tick = () => {
    const d = new Date();
    const de = document.getElementById('liveDate');
    const te = document.getElementById('liveTime');
    if (de && fDate) de.textContent = fDate.format(d);
    if (te && fTime) te.textContent = lang === 'bn' ? bnTime(fTime, d) : fTime.format(d);
  };

  /* ---------- translate a part of the page ---------- */
  const keep = (el, key, val) => (el.dataset[key] === undefined ? (el.dataset[key] = val) : el.dataset[key]);

  const apply = scope => {
    const rootEl = scope || document;
    const all = sel => {
      const list = Array.from(rootEl.querySelectorAll ? rootEl.querySelectorAll(sel) : []);
      if (rootEl.matches && rootEl.matches(sel)) list.unshift(rootEl);
      return list;
    };

    all('[data-t]').forEach(el => {
      const en = keep(el, 'en', el.textContent.trim());
      const out = lang === 'bn' ? (BN[en] || en) : en;
      if (el.textContent !== out) el.textContent = out;
    });
    all('[data-t-ph]').forEach(el => {
      const en = keep(el, 'enPh', el.getAttribute('placeholder') || '');
      el.setAttribute('placeholder', lang === 'bn' ? (BN[en] || en) : en);
    });
    all('[data-t-label]').forEach(el => {
      const en = keep(el, 'enLabel', el.getAttribute('aria-label') || '');
      el.setAttribute('aria-label', lang === 'bn' ? (BN[en] || en) : en);
    });

    all('.js-date').forEach(el => {
      const en = keep(el, 'en', el.textContent);
      const d = new Date(el.getAttribute('datetime'));
      if (lang !== 'bn' || !fShort || !fClock || isNaN(d)) { el.textContent = en; return; }
      el.textContent = el.hasAttribute('data-full') ? fShort.format(d) + ', ' + bnTime(fClock, d) : fShort.format(d);
    });
    all('.js-ago').forEach(el => {
      const en = keep(el, 'en', el.textContent);
      const d = new Date(el.getAttribute('datetime'));
      if (lang !== 'bn' || !fRel || isNaN(d)) { el.textContent = en; return; }
      const s = Math.max(0, Math.round((Date.now() - d.getTime()) / 1000));
      if (s < 60) el.textContent = BN['just now'];
      else if (s < 3600) el.textContent = fRel.format(-Math.floor(s / 60), 'minute');
      else if (s < 86400) el.textContent = fRel.format(-Math.floor(s / 3600), 'hour');
      else if (s < 7 * 86400) el.textContent = fRel.format(-Math.floor(s / 86400), 'day');
      else el.textContent = fShort.format(d);
    });
    all('[data-num]').forEach(el => {
      const n = Number(el.dataset.num);
      if (fNum && isFinite(n)) el.textContent = fNum.format(n);
    });
  };

  const setLang = (next, remember) => {
    lang = next;
    if (remember) store.set('lang', next);
    root.lang = next;
    build();
    apply(document);
    tick();
    const btn = document.getElementById('langBtn');
    if (btn) {                       /* the button offers the OTHER language */
      btn.textContent = next === 'bn' ? 'English' : 'বাংলা';
      btn.lang = next === 'bn' ? 'en' : 'bn';
    }
  };

  const init = () => {
    setLang(lang, false);
    setInterval(tick, 1000);
    const btn = document.getElementById('langBtn');
    if (btn) btn.addEventListener('click', () => setLang(lang === 'bn' ? 'en' : 'bn', true));

    /* pages load post details, comments, ... after start: translate those too */
    if ('MutationObserver' in window) {
      new MutationObserver(records => {
        for (const r of records) r.addedNodes.forEach(n => { if (n.nodeType === 1) apply(n); });
      }).observe(document.body, { childList: true, subtree: true });
    }
  };

  window.i18n = { t, apply, get lang() { return lang; } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();

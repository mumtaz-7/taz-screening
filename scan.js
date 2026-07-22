/* =====================================================================
   Crypto SMC Scanner → Telegram  (ChoCh + BoS READY, M15)
   Port dari LuxAlgo_ChoCh_Screener_v4.1.html (ChoCh + BoS; TP BoS = OB di atas Weak High).
   Jalan di GitHub Actions tiap ~15 menit. Kirim notif cuma buat READY BARU.
   Data: data-api.binance.vision (endpoint publik Binance, minim geo-block).
   ===================================================================== */
const fs = require('fs');

// ---------- KONFIG (samain sama v4) ----------
const BASE        = 'https://data-api.binance.vision';
const TF          = '15m';
const LIMIT       = 700;      // candle per koin (cukup buat swing 50)
const SWING_LEN   = 50;
const INTERNAL_LEN= 5;
const MAX_BARS    = 25;       // maks bar sejak break (fresh)
const CONFLUENCE  = true;     // ON, sesuai chart
const MIN_VOL     = 3e6;      // volume 24h minimal (USDT) = 3 juta
const MIN_TP      = 5;        // notif cuma kalau potensi TP >= 5% (saring cuan receh). Naikin/turunin sesuka.
const SL_BUFFER   = 0.5;      // Opsi 3: SL = internal low − 0.5×(entry−internal low). 0.5 = 50%.
const CONC        = 5;        // request paralel
const STATE_FILE  = __dirname + '/state.json';
const TG_TOKEN    = process.env.TELEGRAM_TOKEN;
const TG_CHAT     = process.env.TELEGRAM_CHAT_ID;

const STABLE_BASES = new Set(["USDC","FDUSD","TUSD","BUSD","DAI","USDP","UST","USTC","EUR","GBP","AEUR","USD1","XUSD","PYUSD","EURI","TRY","BRL","ARS","ZAR","BIDR","IDRT","NGN","UAH","RUB","PLN","RON","JPY","MXN","COP","CZK"]);
const LEVERAGE_TAGS = ["UP","DOWN","BULL","BEAR"];
// Filter halal (sama persis v4) — editable
const HARAM_BASES = new Set([
  // — Meme / nirutilitas: spekulasi murni (tabzir + maysir + garar), Fatwa syarat objek #2 —
  "DOGE","SHIB","PEPE","FLOKI","BONK","WIF","BOME","MEME","BABYDOGE","ELON","SAMO",
  "MEW","POPCAT","BRETT","MOG","TURBO","LADYS","WEN","MYRO","SLERF","NEIRO","PNUT",
  "ACT","CHILLGUY","CHEEMS","MOODENG","GOAT","FARTCOIN","DOGS","CAT","MUMU","SPX",
  "HIPPO","PEOPLE","AIDOGE","SUNDOG","BAN","TROLL","GIGA","DEGEN","SNEK","HARRY",
  "TRUMP","MELANIA","NOT","HMSTR","CATI","ORDI","1000SATS","RATS","PEIPEI","PONKE",
  "BILLY","GME","MOTHER","BROCCOLI","TUT","MUBARAK","VINE","USELESS",
  // — Derivatif/perp/futures DEX: ekosistem jual-beli kontrak (bay' al-kali'), Fatwa mekanisme #1 —
  "DYDX","GMX","GNS","PERP","LEVER","MUX","VELA","APEX","HMX","KTX","INTX",
  "AEVO","DRIFT","SNX","ORDER","HYPE",
  // — Lending/yield ribawi: riba qard (bunga pinjaman), Fatwa mekanisme #5 —
  "AAVE","COMP","MKR","XVS","QI","RDNT","CREAM","JST","ALPHA","FORTH","TRU",
  "ALPACA","SPELL","LQTY","MORPHO",
  // — Judi/gambling: maysir, Fatwa syarat objek #1 —
  "ROLL","DICE","WINK","BET","FUN","ZKB"
]);

// ---------- NETWORK ----------
async function apiGet(path, params){
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  const r = await fetch(BASE + path + qs);
  if(!r.ok) throw new Error('HTTP ' + r.status + ' ' + path);
  return r.json();
}

// ---------- PORT LOGIKA LUXALGO (struktur internal + swing) ----------
function computeLeg(c, t, size, prev){
  if(t < size) return prev;
  const hAgo = c[t-size].h, lAgo = c[t-size].l;
  let maxR = -Infinity, minR = Infinity;
  for(let k = t-size+1; k <= t; k++){ if(c[k].h > maxR) maxR = c[k].h; if(c[k].l < minR) minR = c[k].l; }
  if(hAgo > maxR) return 0;   // bearish leg
  if(lAgo < minR) return 1;   // bullish leg
  return prev;
}
const ATR_LEN = 200;
function luxStructure(c, swingLen, confluence){
  const n = c.length;
  const sH = {level:NaN,crossed:false}, sL = {level:NaN,crossed:false};
  const iH = {level:NaN,crossed:false,idx:-1}, iL = {level:NaN,crossed:false,idx:-1};
  let swingTrend = 0, internalTrend = 0, legS = 0, legI = 0;
  let trailTop = c[0].h, trailBot = c[0].l;
  const events = [];
  const pHigh = new Array(n), pLow = new Array(n);   // parsed high/low (filter volatilitas LuxAlgo)
  const obsBear = [];                                // bearish OB aktif = supply di atas (buat TP BoS)
  let atr = 0, trSum = 0;
  for(let t = 0; t < n; t++){
    const tr = t > 0 ? Math.max(c[t].h-c[t].l, Math.abs(c[t].h-c[t-1].c), Math.abs(c[t].l-c[t-1].c)) : (c[t].h-c[t].l);
    if(t < ATR_LEN){ trSum += tr; atr = trSum/(t+1); } else { atr = (atr*(ATR_LEN-1)+tr)/ATR_LEN; }
    const highVol = (c[t].h - c[t].l) >= 2*atr;
    pHigh[t] = highVol ? c[t].l : c[t].h;
    pLow[t]  = highVol ? c[t].h : c[t].l;
    if(c[t].h > trailTop) trailTop = c[t].h;
    if(c[t].l < trailBot) trailBot = c[t].l;
    const pS = legS; legS = computeLeg(c, t, swingLen, legS);
    if(legS !== pS && t >= swingLen){
      if(legS === 1){ sL.level = c[t-swingLen].l; sL.crossed = false; trailBot = sL.level; }
      else          { sH.level = c[t-swingLen].h; sH.crossed = false; trailTop = sH.level; }
    }
    const pI = legI; legI = computeLeg(c, t, INTERNAL_LEN, legI);
    if(legI !== pI && t >= INTERNAL_LEN){
      if(legI === 1){ iL.level = c[t-INTERNAL_LEN].l; iL.crossed = false; iL.idx = t-INTERNAL_LEN; }
      else          { iH.level = c[t-INTERNAL_LEN].h; iH.crossed = false; iH.idx = t-INTERNAL_LEN; }
    }
    if(t > 0){
      const cl = c[t].c, clp = c[t-1].c, o = c[t].o, h = c[t].h, l = c[t].l;
      let bull = true, bear = true;
      if(confluence){ const up = h - Math.max(cl,o), m = Math.min(cl, o - l); bull = up > m; bear = up < m; }
      if(!isNaN(iH.level) && clp <= iH.level && cl > iH.level && !iH.crossed && iH.level !== sH.level && bull){
        const tag = internalTrend === -1 ? 'CHoCH' : 'BOS'; internalTrend = 1; iH.crossed = true;
        // snapshot: dasar bearish OB terdekat yg aktif & ada DI ATAS Weak High (target lanjutan buat BoS)
        let obTP = null;
        for(const o of obsBear){ if(o.barLow > trailTop && (obTP === null || o.barLow < obTP)) obTP = o.barLow; }
        events.push({idx:t, dir:'bull', tag, level:iH.level, weakHigh:trailTop,
                     internalLow: isNaN(iL.level) ? null : iL.level, obTP});
      }
      if(!isNaN(iL.level) && clp >= iL.level && cl < iL.level && !iL.crossed && iL.level !== sL.level && bear){
        const tag = internalTrend === 1 ? 'CHoCH' : 'BOS'; internalTrend = -1; iL.crossed = true;
        events.push({idx:t, dir:'bear', tag, level:iL.level});
        // simpan BEARISH OB: candle dgn parsedHigh terbesar di leg sebelum break (persis LuxAlgo)
        if(iL.idx >= 0){ let maxH = -Infinity, mi = iL.idx;
          for(let k = iL.idx; k < t; k++){ if(pHigh[k] > maxH){ maxH = pHigh[k]; mi = k; } }
          obsBear.unshift({barHigh:pHigh[mi], barLow:pLow[mi], idx:mi});
          if(obsBear.length > 100) obsBear.pop();
        }
      }
      if(!isNaN(sH.level) && clp <= sH.level && cl > sH.level && !sH.crossed){ swingTrend = 1; sH.crossed = true; }
      if(!isNaN(sL.level) && clp >= sL.level && cl < sL.level && !sL.crossed){ swingTrend = -1; sL.crossed = true; }
    }
    // mitigasi bearish OB (default HIGH/LOW): hapus kalau high > OB.barHigh
    for(let i2 = obsBear.length-1; i2 >= 0; i2--){ if(c[t].h > obsBear[i2].barHigh) obsBear.splice(i2,1); }
  }
  return {swingTrend, internalTrend, trailBot, trailTop, events};
}
// ChoCh & BoS READY di atas Strong Low (persis v4). Kalau dua-duanya, ambil event PALING BARU.
// ChoCh → SL Strong Low. BoS → SL internal low (higher-low sebelum break).
function analyze(c){
  const n = c.length; if(n < SWING_LEN*4 + 20) return null;
  const st = luxStructure(c, SWING_LEN, CONFLUENCE);
  const price = c[n-1].c, strongLow = st.trailBot, weakHigh = st.trailTop;
  if(st.swingTrend !== 1 || !(price > strongLow)) return null;
  const ok = ev => {
    const bearAfter = st.events.some(e => e.dir === 'bear' && e.idx > ev.idx);
    return st.internalTrend === 1 && !bearAfter && (n-1-ev.idx) <= MAX_BARS
        && ev.level > strongLow && weakHigh > ev.level;
  };
  // SL Opsi 3: patokan = swing low internal terakhir (LL utk ChoCh, HL utk BoS) − buffer di bawahnya
  const slOpt3 = (entry, internalLow) => {
    const lo = (internalLow != null && internalLow < entry) ? internalLow : strongLow;
    const sl = lo - SL_BUFFER*(entry - lo);
    return (sl > 0 && sl < entry) ? sl : (strongLow > 0 && strongLow < entry ? strongLow : entry*0.5);
  };
  const build = (ev, setup, sl, tp, tpSrc) => {
    const entry = ev.level, slPct = (entry-sl)/entry*100, gainPct = (tp-entry)/entry*100;
    return {setup, entry, sl, tp, tpSrc, weakHigh, internalLow: ev.internalLow, slPct, gainPct, rr: gainPct/slPct, barsSince: n-1-ev.idx, evIdx: ev.idx};
  };
  let choch = null, bos = null;
  const chs = st.events.filter(e => e.dir === 'bull' && e.tag === 'CHoCH');
  if(chs.length){ const ev = chs[chs.length-1];
    if(ok(ev)){
      // TP ChoCh: (1) ChoCh dalam (fib>0.618) → equilibrium; (2) selain itu → Weak High,
      // tapi kalau Weak High kekecilan (<MIN_TP%) & ADA bearish OB di atasnya → naik ke OB
      // (biar sinyal bottom bagus ga ke-buang filter MIN_TP; kalau ga ada OB → biarin di-skip filter = opsi A)
      const entry = ev.level, eq = (strongLow + weakHigh)/2;
      const cr = (weakHigh - strongLow) > 0 ? (weakHigh - entry)/(weakHigh - strongLow) : null;
      const useEQ = (cr != null && cr > 0.618 && eq > entry);
      let tpC, tpSrcC;
      if(useEQ){ tpC = eq; tpSrcC = 'EQ'; }
      else {
        const whGain = (weakHigh - entry)/entry*100;
        if(whGain < MIN_TP && ev.obTP != null && ev.obTP > weakHigh){ tpC = ev.obTP; tpSrcC = 'OB'; }
        else { tpC = weakHigh; tpSrcC = 'WH'; }
      }
      choch = build(ev, 'ChoCh', slOpt3(entry, ev.internalLow), tpC, tpSrcC);
    } }
  const bss = st.events.filter(e => e.dir === 'bull' && e.tag === 'BOS');
  if(bss.length){ const ev = bss[bss.length-1];
    if(ok(ev)){
      // TP BoS = dasar bearish OB terdekat DI ATAS Weak High; kalau nggak ada → Weak High
      const useOB = (ev.obTP != null && ev.obTP > weakHigh);
      bos = build(ev, 'BoS', slOpt3(ev.level, ev.internalLow), useOB ? ev.obTP : weakHigh, useOB ? 'OB' : 'WH'); } }
  if(!choch && !bos) return null;
  if(choch && bos) return bos.evIdx > choch.evIdx ? bos : choch;   // event terbaru menang
  return choch || bos;
}

// ---------- TELEGRAM ----------
function fmt(x){ const a = Math.abs(x); return a >= 1000 ? x.toFixed(2) : (+x.toPrecision(6)).toString(); }
async function notify(fresh, ready){
  if(!TG_TOKEN || !TG_CHAT){ console.log('TELEGRAM_TOKEN / CHAT_ID kosong — skip kirim.'); return; }
  const cap = 25;
  const shown = fresh.slice(0, cap);
  let msg = `▸ <b>${fresh.length} Sinyal Ready baru</b> · <b>M15</b>\n\n`;
  for(const k of shown){ const s = k.split('::')[0], a = ready[s];
    const src   = a.tpSrc === 'OB' ? ' · OB' : a.tpSrc === 'EQ' ? ' · EQ' : '';
    const inval = a.internalLow != null ? ` · inval ${fmt(a.internalLow)}` : '';
    msg += `<b>${s}</b> · ${a.setup}\n`;
    msg += `• Entry : <code>${fmt(a.entry)}</code>\n`;
    msg += `• TP +${a.gainPct.toFixed(1)}%${src} : <code>${fmt(a.tp)}</code>\n`;
    msg += `• SL -${a.slPct.toFixed(1)}%${inval} : <code>${fmt(a.sl)}</code>\n`;
    msg += `• R:R : ${a.rr.toFixed(2)}\n`;
    msg += `• <a href="https://www.tradingview.com/chart/?symbol=BINANCE:${s}">Buka chart</a>\n\n`;
  }
  if(fresh.length > cap) msg += `…+${fresh.length - cap} lagi\n\n`;
  msg += `— Bukan sinyal buy. Verifikasi di chart (LuxAlgo swing=50, internal=5) dulu.\n`;
  msg += `<i>Not Financial Advice · Do Your Own Research.</i>`;
  const r = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({chat_id: TG_CHAT, text: msg, parse_mode: 'HTML', disable_web_page_preview: true})
  });
  console.log('telegram sendMessage:', r.status);
}

// Notif UPDATE STATUS posisi yg dilacak journal (entry kefill / TP / SL / void)
async function notifyUpdates(updates){
  if(!TG_TOKEN || !TG_CHAT){ console.log('TG kosong — skip update.'); return; }
  let msg = `▸ <b>Update Posisi</b> · <b>M15</b>\n\n`;
  for(const t of updates){
    msg += `<b>${t.symbol}</b> · ${t.setup}\n`;
    if(t.status === 'open'){
      const src = t.tpSrc === 'OB' ? ' · OB' : t.tpSrc === 'EQ' ? ' · EQ' : '';
      msg += `• Status : ● Entry kefill — posisi jalan\n`;
      msg += `• Entry : <code>${fmt(t.entry)}</code>\n`;
      msg += `• TP +${t.gainPct.toFixed(1)}%${src} : <code>${fmt(t.tp)}</code>\n`;
      msg += `• SL -${t.slPct.toFixed(1)}% : <code>${fmt(t.sl)}</code>\n`;
    } else if(t.status === 'win'){
      msg += `• Status : ✓ TP kena · WIN +${t.R}R\n`;
      msg += `• Entry <code>${fmt(t.entry)}</code> → TP <code>${fmt(t.tp)}</code>\n`;
    } else if(t.status === 'loss'){
      msg += `• Status : ✗ SL kena · LOSS -1R\n`;
      msg += `• Entry <code>${fmt(t.entry)}</code> → SL <code>${fmt(t.sl)}</code>\n`;
    } else if(t.status === 'void'){
      const why = t.voidReason === 'tp-duluan' ? 'harga ke TP duluan sebelum entry' : 'harga nggak retest ke entry';
      msg += `• Status : ○ Void — ${why}\n`;
    }
    msg += `\n`;
  }
  msg += `<i>Auto-tracking track record · bukan aba-aba entry/exit.</i>`;
  const r = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({chat_id: TG_CHAT, text: msg, parse_mode:'HTML', disable_web_page_preview:true})
  });
  console.log('telegram update:', r.status, `(${updates.length} posisi)`);
}

// ---------- TRACK RECORD ----------
const JOURNAL_FILE = __dirname + '/journal.json';
const STATS_FILE   = __dirname + '/stats.json';
const RETEST_WIN   = 25;          // jendela retest (bar) buat fill limit
const MAX_HOLD_DAYS= 3;           // open > 3 hari & belum resolve → dianggap expired (nggak dihitung)
const TERMINAL     = ['win','loss','void','expired'];
const round = x => x==null ? null : Math.round(x*100)/100;

// Evaluasi 1 trade pakai candle terbaru. Model: limit @ entry (retest), same-bar SL+TP = loss.
function evalTrade(tr, candles){
  if(TERMINAL.includes(tr.status)) return tr;
  const ageDays = (Date.now() - tr.signalTime) / 86400000;
  const start = candles.findIndex(c => c.t > tr.signalTime);   // bar pertama SETELAH sinyal
  if(start < 0) return ageDays > MAX_HOLD_DAYS ? {...tr, status:'void', voidReason:'ga-retest'} : tr;
  // cari fill (harga retest turun ke entry) dalam jendela.
  // Kalau harga nyentuh TP DULUAN sebelum retest ke entry → setup basi (nggak pernah kefill) → void.
  // Cek fill dulu tiap bar: kalau 1 candle nyentuh entry & TP sekaligus, dianggap fill (dip dulu baru naik).
  let fill = -1;
  for(let i = start; i < candles.length && (i-start) < RETEST_WIN; i++){
    if(candles[i].l <= tr.entry){ fill = i; break; }
    if(candles[i].h >= tr.tp){ return {...tr, status:'void', voidReason:'tp-duluan', resolvedTime:candles[i].t}; }
  }
  if(fill < 0){
    if((candles.length - start) >= RETEST_WIN || ageDays > MAX_HOLD_DAYS) return {...tr, status:'void', voidReason:'ga-retest'};
    return {...tr, status:'pending'};
  }
  // resolusi dari bar fill: SL dicek dulu (same-bar = loss)
  for(let i = fill; i < candles.length; i++){
    if(candles[i].l <= tr.sl) return {...tr, status:'loss', R:-1, fillTime:candles[fill].t, resolvedTime:candles[i].t};
    if(candles[i].h >= tr.tp){ const RR=(tr.tp-tr.entry)/(tr.entry-tr.sl);
      return {...tr, status:'win', R:round(RR), fillTime:candles[fill].t, resolvedTime:candles[i].t}; }
  }
  if(ageDays > MAX_HOLD_DAYS) return {...tr, status:'expired', fillTime:candles[fill].t};
  return {...tr, status:'open', fillTime:candles[fill].t};
}

function computeStats(journal){
  const done = journal.filter(t => t.status==='win' || t.status==='loss');
  const agg = list => { const n = list.length; if(!n) return {n:0, win:null, er:null, avgWin:null};
    const wins = list.filter(t => t.status==='win');
    const er = list.reduce((s,t) => s + t.R, 0) / n;
    const avgWin = wins.length ? wins.reduce((s,t)=>s+t.R,0)/wins.length : null;
    return {n, wins:wins.length, losses:n-wins.length, win:Math.round(wins.length/n*1000)/10,
            er:round(er), avgWin:round(avgWin)}; };
  return {
    updatedAt: new Date().toISOString(),
    all: agg(done), ChoCh: agg(done.filter(t=>t.setup==='ChoCh')), BoS: agg(done.filter(t=>t.setup==='BoS')),
    open: journal.filter(t=>t.status==='open').length,
    pending: journal.filter(t=>t.status==='pending').length,
    void: journal.filter(t=>t.status==='void').length,
    expired: journal.filter(t=>t.status==='expired').length,
    totalSignals: journal.length
  };
}

// ---------- MAIN ----------
async function main(){
  const info = await apiGet('/api/v3/exchangeInfo');
  const valid = new Set();
  for(const s of info.symbols){
    if(s.quoteAsset !== 'USDT' || s.status !== 'TRADING' || !s.isSpotTradingAllowed) continue;
    const b = s.baseAsset;
    if(STABLE_BASES.has(b) || HARAM_BASES.has(b) || LEVERAGE_TAGS.some(t => b.endsWith(t))) continue;
    valid.add(s.symbol);
  }
  const tick = await apiGet('/api/v3/ticker/24hr');
  const liquid = tick.filter(x => valid.has(x.symbol) && parseFloat(x.quoteVolume) >= MIN_VOL).map(x => x.symbol);

  const ready = {}; let i = 0;
  async function worker(){
    while(i < liquid.length){ const sym = liquid[i++];
      try{
        const raw = await apiGet('/api/v3/klines', {symbol: sym, interval: TF, limit: LIMIT});
        const c = raw.map(k => ({t:k[0], o:+k[1], h:+k[2], l:+k[3], c:+k[4]}));
        const a = analyze(c); if(a && a.gainPct >= MIN_TP) ready[sym] = {...a, signalTime: c[c.length-1].t};   // filter TP min + anchor waktu
      }catch(e){}
    }
  }
  await Promise.all(Array.from({length: CONC}, worker));

  let prev = [];
  try{ prev = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')).ready || []; }catch(e){}
  // kunci = SIMBOL::setup → kalau setup-nya berubah (ChoCh → BoS), dianggap sinyal baru
  const curr  = Object.keys(ready).map(s => `${s}::${ready[s].setup}`).sort();
  const fresh = curr.filter(k => !prev.includes(k));
  console.log(`scan: ${liquid.length} coin · ${curr.length} READY · ${fresh.length} baru → ${fresh.join(', ') || '-'}`);
  if(fresh.length) await notify(fresh, ready);
  fs.writeFileSync(STATE_FILE, JSON.stringify({ready: curr, at: new Date().toISOString()}, null, 2));

  // ---------- TRACK RECORD OTOMATIS ----------
  let journal = [];
  try{ journal = JSON.parse(fs.readFileSync(JOURNAL_FILE, 'utf8')); }catch(e){}
  // 1) catat sinyal BARU yang barusan dikirim (status pending, nunggu retest)
  const ids = new Set(journal.map(t => t.id));
  for(const k of fresh){ const sym = k.split('::')[0], a = ready[sym]; if(!a) continue;
    const id = `${sym}::${a.setup}::${a.signalTime}`;
    if(ids.has(id)) continue; ids.add(id);
    journal.push({ id, symbol:sym, setup:a.setup, entry:a.entry, sl:a.sl, tp:a.tp, tpSrc:a.tpSrc,
      slPct:round(a.slPct), gainPct:round(a.gainPct), rr:round(a.rr), signalTime:a.signalTime,
      status:'pending', createdAt:Date.now() });
  }
  // 2) update trade yg belum kelar (fetch klines terbaru → cek fill/TP/SL)
  const alive = journal.filter(t => !TERMINAL.includes(t.status));
  const symsNeeded = [...new Set(alive.map(t => t.symbol))];
  const cache = {}; let ti = 0;
  async function trackWorker(){ while(ti < symsNeeded.length){ const sym = symsNeeded[ti++];
    try{ const raw = await apiGet('/api/v3/klines', {symbol:sym, interval:TF, limit:LIMIT});
      cache[sym] = raw.map(k => ({t:k[0], o:+k[1], h:+k[2], l:+k[3], c:+k[4]})); }catch(e){ cache[sym] = null; } } }
  await Promise.all(Array.from({length: CONC}, trackWorker));
  const updates = [];
  for(let j = 0; j < journal.length; j++){ const t = journal[j];
    if(TERMINAL.includes(t.status)) continue;
    if(!cache[t.symbol]) continue;
    const before = t.status;
    const after  = evalTrade(t, cache[t.symbol]);
    journal[j] = after;
    // notif kalau status pindah ke: open (entry kefill) / win / loss / void. Expired di-skip.
    if(after.status !== before && ['open','win','loss','void'].includes(after.status)) updates.push(after);
  }
  if(updates.length) await notifyUpdates(updates);
  // 3) hitung statistik + simpan
  const stats = computeStats(journal);
  fs.writeFileSync(JOURNAL_FILE, JSON.stringify(journal, null, 1));
  fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2));
  console.log(`journal: ${journal.length} sinyal · resolved ${stats.all.n} (win ${stats.all.win}%) · open ${stats.open} · pending ${stats.pending}`);
}

if(require.main === module){ main().catch(e => { console.error(e); process.exit(1); }); }
module.exports = { analyze, luxStructure, computeLeg, MIN_TP, evalTrade, computeStats };

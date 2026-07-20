/* =====================================================================
   Crypto SMC Scanner → Telegram  (ChoCh READY, M15)
   Port dari LuxAlgo_ChoCh_Screener_v3.html (logika CHoCH persis sama).
   Jalan di GitHub Actions tiap ~15 menit. Kirim notif cuma buat READY BARU.
   Data: data-api.binance.vision (endpoint publik Binance, minim geo-block).
   ===================================================================== */
const fs = require('fs');

// ---------- KONFIG (samain sama v3) ----------
const BASE        = 'https://data-api.binance.vision';
const TF          = '15m';
const LIMIT       = 700;      // candle per koin (cukup buat swing 50)
const SWING_LEN   = 50;
const INTERNAL_LEN= 5;
const MAX_BARS    = 25;       // maks bar sejak CHoCH (fresh)
const CONFLUENCE  = true;     // ON, sesuai chart
const MIN_VOL     = 3e6;      // volume 24h minimal (USDT) = 3 juta
const CONC        = 5;        // request paralel
const STATE_FILE  = __dirname + '/state.json';
const TG_TOKEN    = process.env.TELEGRAM_TOKEN;
const TG_CHAT     = process.env.TELEGRAM_CHAT_ID;

const STABLE_BASES = new Set(["USDC","FDUSD","TUSD","BUSD","DAI","USDP","UST","USTC","EUR","GBP","AEUR","USD1","XUSD","PYUSD","EURI","TRY","BRL","ARS","ZAR","BIDR","IDRT","NGN","UAH","RUB","PLN","RON","JPY","MXN","COP","CZK"]);
const LEVERAGE_TAGS = ["UP","DOWN","BULL","BEAR"];
// Filter halal (sama persis v3) — editable
const HARAM_BASES = new Set([
  "DOGE","SHIB","PEPE","FLOKI","BONK","WIF","BOME","MEME","BABYDOGE","ELON","SAMO",
  "MEW","POPCAT","BRETT","MOG","TURBO","LADYS","WEN","MYRO","SLERF","NEIRO","PNUT",
  "ACT","CHILLGUY","CHEEMS","MOODENG","GOAT","FARTCOIN","DOGS","CAT","MUMU","SPX",
  "HIPPO","PEOPLE","AIDOGE","SUNDOG","BAN","TROLL","GIGA","DEGEN","SNEK","HARRY",
  "DYDX","GMX","GNS","PERP","LEVER","MUX","VELA","APEX","HMX","KTX","INTX",
  "AAVE","COMP","MKR","XVS","QI","RDNT","CREAM","JST","ALPHA","FORTH","TRU",
  "ROLL","DICE","WINK","BET","FUN","ZKB"
]);

// ---------- NETWORK ----------
async function apiGet(path, params){
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  const r = await fetch(BASE + path + qs);
  if(!r.ok) throw new Error('HTTP ' + r.status + ' ' + path);
  return r.json();
}

// ---------- PORT LOGIKA LUXALGO (CHoCH) ----------
function computeLeg(c, t, size, prev){
  if(t < size) return prev;
  const hAgo = c[t-size].h, lAgo = c[t-size].l;
  let maxR = -Infinity, minR = Infinity;
  for(let k = t-size+1; k <= t; k++){ if(c[k].h > maxR) maxR = c[k].h; if(c[k].l < minR) minR = c[k].l; }
  if(hAgo > maxR) return 0;   // bearish leg
  if(lAgo < minR) return 1;   // bullish leg
  return prev;
}
function luxStructure(c, swingLen, confluence){
  const n = c.length;
  const sH = {level:NaN,crossed:false}, sL = {level:NaN,crossed:false};
  const iH = {level:NaN,crossed:false}, iL = {level:NaN,crossed:false};
  let swingTrend = 0, internalTrend = 0, legS = 0, legI = 0;
  let trailTop = c[0].h, trailBot = c[0].l;
  const events = [];
  for(let t = 0; t < n; t++){
    if(c[t].h > trailTop) trailTop = c[t].h;
    if(c[t].l < trailBot) trailBot = c[t].l;
    const pS = legS; legS = computeLeg(c, t, swingLen, legS);
    if(legS !== pS && t >= swingLen){
      if(legS === 1){ sL.level = c[t-swingLen].l; sL.crossed = false; trailBot = sL.level; }
      else          { sH.level = c[t-swingLen].h; sH.crossed = false; trailTop = sH.level; }
    }
    const pI = legI; legI = computeLeg(c, t, INTERNAL_LEN, legI);
    if(legI !== pI && t >= INTERNAL_LEN){
      if(legI === 1){ iL.level = c[t-INTERNAL_LEN].l; iL.crossed = false; }
      else          { iH.level = c[t-INTERNAL_LEN].h; iH.crossed = false; }
    }
    if(t > 0){
      const cl = c[t].c, clp = c[t-1].c, o = c[t].o, h = c[t].h, l = c[t].l;
      let bull = true, bear = true;
      if(confluence){ const up = h - Math.max(cl,o), m = Math.min(cl, o - l); bull = up > m; bear = up < m; }
      if(!isNaN(iH.level) && clp <= iH.level && cl > iH.level && !iH.crossed && iH.level !== sH.level && bull){
        const tag = internalTrend === -1 ? 'CHoCH' : 'BOS'; internalTrend = 1; iH.crossed = true;
        events.push({idx:t, dir:'bull', tag, level:iH.level});
      }
      if(!isNaN(iL.level) && clp >= iL.level && cl < iL.level && !iL.crossed && iL.level !== sL.level && bear){
        const tag = internalTrend === 1 ? 'CHoCH' : 'BOS'; internalTrend = -1; iL.crossed = true;
        events.push({idx:t, dir:'bear', tag, level:iL.level});
      }
      if(!isNaN(sH.level) && clp <= sH.level && cl > sH.level && !sH.crossed){ swingTrend = 1; sH.crossed = true; }
      if(!isNaN(sL.level) && clp >= sL.level && cl < sL.level && !sL.crossed){ swingTrend = -1; sL.crossed = true; }
    }
  }
  return {swingTrend, internalTrend, trailBot, trailTop, events};
}
// CHoCH READY di atas Strong Low (persis v3). return null kalau bukan READY.
function analyze(c){
  const n = c.length; if(n < SWING_LEN*4 + 20) return null;
  const st = luxStructure(c, SWING_LEN, CONFLUENCE);
  const price = c[n-1].c, strongLow = st.trailBot, weakHigh = st.trailTop;
  if(st.swingTrend !== 1 || !(price > strongLow)) return null;
  const bulls = st.events.filter(e => e.dir === 'bull' && e.tag === 'CHoCH');
  if(!bulls.length) return null;
  const ev = bulls[bulls.length-1];
  const bearAfter = st.events.some(e => e.dir === 'bear' && e.idx > ev.idx);
  if(!(st.internalTrend === 1 && !bearAfter && (n-1-ev.idx) <= MAX_BARS && ev.level > strongLow && weakHigh > ev.level)) return null;
  const entry = ev.level, slPct = (entry-strongLow)/entry*100, gainPct = (weakHigh-entry)/entry*100;
  return {entry, strongLow, weakHigh, slPct, gainPct, rr: gainPct/slPct, barsSince: n-1-ev.idx};
}

// ---------- TELEGRAM ----------
function fmt(x){ const a = Math.abs(x); return a >= 1000 ? x.toFixed(2) : (+x.toPrecision(6)).toString(); }
async function notify(fresh, ready){
  if(!TG_TOKEN || !TG_CHAT){ console.log('TELEGRAM_TOKEN / CHAT_ID kosong — skip kirim.'); return; }
  const cap = 25;
  const shown = fresh.slice(0, cap);
  let msg = `▸ <b>${fresh.length} ChoCh Ready baru</b> · <b>M15</b>\n\n`;
  for(const s of shown){ const a = ready[s];
    msg += `<b>${s}</b>\n  entry ${fmt(a.entry)} · SL ${fmt(a.strongLow)} (-${a.slPct.toFixed(1)}%) · TP ${fmt(a.weakHigh)} (+${a.gainPct.toFixed(1)}%) · R:R ${a.rr.toFixed(2)}\n  https://www.tradingview.com/chart/?symbol=BINANCE:${s}\n\n`;
  }
  if(fresh.length > cap) msg += `…+${fresh.length - cap} lagi\n`;
  msg += `\n— Bukan sinyal buy. Verifikasi di chart (LuxAlgo swing=50, internal=5) dulu.`;
  msg += `\nNot Financial Advice · Do Your Own Research.`;
  const r = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({chat_id: TG_CHAT, text: msg, parse_mode: 'HTML', disable_web_page_preview: true})
  });
  console.log('telegram sendMessage:', r.status);
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
        const a = analyze(c); if(a) ready[sym] = a;
      }catch(e){}
    }
  }
  await Promise.all(Array.from({length: CONC}, worker));

  let prev = [];
  try{ prev = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')).ready || []; }catch(e){}
  const curr  = Object.keys(ready).sort();
  const fresh = curr.filter(s => !prev.includes(s));
  console.log(`scan: ${liquid.length} coin · ${curr.length} READY · ${fresh.length} baru → ${fresh.join(', ') || '-'}`);
  if(fresh.length) await notify(fresh, ready);
  fs.writeFileSync(STATE_FILE, JSON.stringify({ready: curr, at: new Date().toISOString()}, null, 2));
}

if(require.main === module){ main().catch(e => { console.error(e); process.exit(1); }); }
module.exports = { analyze, luxStructure, computeLeg };

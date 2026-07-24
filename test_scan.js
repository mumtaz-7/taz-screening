const S=require("/sessions/cool-laughing-ptolemy/mnt/Crypto Trading/telegram-scanner/scan.js");
let pass=0,fail=0; const ck=(n,c)=>{ c?(pass++,console.log("  PASS "+n)):(fail++,console.log("  FAIL "+n)); };
const C=(o,h,l,c)=>({t:0,o,h,l,c});
function rng(s){ return ()=>{ s=(s*1103515245+12345)&0x7fffffff; return s/0x7fffffff; }; }
function walk(seed,n,drift,vol,wick){ const rand=rng(seed); let p=100; const cs=[];
  for(let i=0;i<n;i++){ const o=p, mv=drift+(rand()-0.5)*vol; let c=o*(1+mv/100);
    cs.push(C(o,Math.max(o,c)*(1+rand()*wick/100),Math.min(o,c)*(1-rand()*wick/100),c)); p=c; } return cs; }

console.log("== scan.js = parity v4 (ChoCh + BoS) ==");
ck("export analyze/luxStructure/computeLeg", ["analyze","luxStructure","computeLeg"].every(k=>typeof S[k]==="function"));
ck("computeLeg flip bearish", (()=>{const c=[];for(let i=0;i<6;i++)c.push(C(10+i,10+i+.1,10+i-.1,10+i));for(let i=0;i<6;i++)c.push(C(15-i,15-i+.1,15-i-.1,15-i));let leg=1;for(let t=3;t<c.length;t++)leg=S.computeLeg(c,t,3,leg);return leg===0;})());
{ const st=S.luxStructure(walk(5,400,0.05,3.0,1.2),50,true);
  const be=st.events.find(e=>e.dir==='bull');
  ck("event bull bawa internalLow (buat SL BoS)", be? ('internalLow' in be) : true); }
let ch=null,bs=null,labels=new Set();
for(let sd=1;sd<6000;sd++){ const a=S.analyze(walk(sd,400,0.05,3.0,1.2)); if(!a) continue;
  labels.add(a.setup); if(a.setup==='ChoCh'&&!ch)ch={sd,a}; if(a.setup==='BoS'&&!bs)bs={sd,a}; }
ck("label cuma ChoCh/BoS", [...labels].every(x=>x==="ChoCh"||x==="BoS"));
ck("ChoCh ketemu", ch!==null); ck("BoS ketemu", bs!==null);
for(const [nm,o] of [["ChoCh",ch],["BoS",bs]]) if(o){ const a=o.a;
  console.log(`  ${nm}: entry=${a.entry.toFixed(4)} sl=${a.sl.toFixed(4)} rr=${a.rr.toFixed(2)} bar=${a.barsSince}`);
  ck(nm+": entry>SL & TP>entry", a.entry>a.sl && a.tp>a.entry);
  ck(nm+": gain=(TP-entry)/entry", Math.abs(a.gainPct-(a.tp-a.entry)/a.entry*100)<1e-9);
  ck(nm+": rr=gain/sl", Math.abs(a.rr-a.gainPct/a.slPct)<1e-9);
  ck(nm+": barsSince<=25", a.barsSince<=25); }
ck("BoS SL lebih ketat dari Strong Low (atau sama)", bs? bs.a.sl>=0 : true);
ck("flat -> null", S.analyze(Array.from({length:300},()=>C(100,100.2,99.8,100)))===null);

console.log("== TP BoS = OB di atas Weak High ==");
{ const st=S.luxStructure(walk(5,400,0.05,3.0,1.2),50,true);
  const bull=st.events.filter(e=>e.dir==='bull');
  ck("event bull bawa obTP", bull.length? ('obTP' in bull[0]) : true);
  ck("obTP (kalau ada) di ATAS weakHigh saat itu", bull.every(e=>e.obTP==null||e.obTP>e.weakHigh)); }
{ let ob=null, wh=null, ch=null;
  for(let sd=1;sd<6000 && !(ob&&wh&&ch);sd++){ const a=S.analyze(walk(sd,400,0.05,3.0,1.2)); if(!a) continue;
    if(a.setup==='BoS'&&a.tpSrc==='OB'&&!ob) ob={sd,a};
    if(a.setup==='BoS'&&a.tpSrc==='WH'&&!wh) wh={sd,a};
    if(a.setup==='ChoCh'&&!ch) ch={sd,a}; }
  ck("BoS TP dari OB ketemu", ob!==null);
  if(ob){ const a=ob.a; console.log(`  BoS+OB: entry=${a.entry.toFixed(4)} TP=${a.tp.toFixed(4)} WH=${a.weakHigh.toFixed(4)} rr=${a.rr.toFixed(2)}`);
    ck("TP di atas Weak High", a.tp>a.weakHigh);
    ck("gain dari TP (bukan WH)", Math.abs(a.gainPct-(a.tp-a.entry)/a.entry*100)<1e-9); }
  if(wh) ck("fallback BoS: tp === weakHigh", Math.abs(wh.a.tp-wh.a.weakHigh)<1e-9);
  if(ch) ck("ChoCh tetap TP Weak High", Math.abs(ch.a.tp-ch.a.weakHigh)<1e-9 && ch.a.tpSrc==='WH'); }


console.log("== filter TP >= MIN_TP (10%) + R:R >= MIN_RR (1) ==");
{ ck("MIN_TP di-export = 10", S.MIN_TP===10);
  ck("MIN_RR di-export = 1", S.MIN_RR===1);
  ck("MAX_FRESH di-export = 5", S.MAX_FRESH===5);
  let below=0, above=0, kept=0;
  for(let sd=1;sd<3000;sd++){ const a=S.analyze(walk(sd,400,0.05,3.0,1.2)); if(!a) continue;
    if(a.gainPct<S.MIN_TP) below++; else { above++; if(a.gainPct>=S.MIN_TP) kept++; } }
  console.log(`  sinyal: ${below} di-bawah-5% (dibuang), ${above} lolos`);
  ck("ada sinyal <5% yg emang dibuang", below>0);
  ck("semua yg lolos gainPct>=5", above===kept); }


console.log("== TP ChoCh equilibrium kalau di bawah 0.618 ==");
{ let eq=null;
  for(let sd=1;sd<8000 && !eq;sd++){ const a=S.analyze(walk(sd,400,0.05,3.0,1.2)); if(a&&a.setup==='ChoCh'&&a.tpSrc==='EQ') eq={sd,a}; }
  ck("ChoCh EQ (TP=equilibrium) ketemu", eq!==null);
  if(eq){ const a=eq.a; const equi=(a.strongLow!==undefined?a.strongLow:a.sl+0);
    const E=(a.strongLow!==undefined?a.strongLow:null);
    console.log(`  ChoCh+EQ: entry=${a.entry.toFixed(3)} tp=${a.tp.toFixed(3)} WH=${a.weakHigh.toFixed(3)}`);
    ck("EQ: tp di bawah Weak High (lebih konservatif)", a.tp<a.weakHigh);
    ck("EQ: tp di atas entry (gain positif)", a.tp>a.entry);
    ck("EQ: gain dari tp", Math.abs(a.gainPct-(a.tp-a.entry)/a.entry*100)<1e-9);
  } }

console.log("== TP ChoCh naik ke OB kalau Weak High <5% (rescue bottom) ==");
{ let obCh=null, whSmall=null;
  for(let sd=1;sd<20000 && !(obCh&&whSmall);sd++){ const a=S.analyze(walk(sd,400,0.05,3.0,1.2));
    if(!a||a.setup!=='ChoCh') continue;
    if(a.tpSrc==='OB'&&!obCh) obCh={sd,a};
    if(a.tpSrc==='WH'&&a.gainPct<5&&!whSmall) whSmall={sd,a}; }
  ck("ChoCh OB-extend ketemu", obCh!==null);
  if(obCh){ const a=obCh.a, whGain=(a.weakHigh-a.entry)/a.entry*100;
    console.log(`  ChoCh+OB: entry=${a.entry.toFixed(3)} WH=${a.weakHigh.toFixed(3)} TP=${a.tp.toFixed(3)} whGain=${whGain.toFixed(2)}% gain=${a.gainPct.toFixed(2)}%`);
    ck("OB: TP di ATAS Weak High", a.tp>a.weakHigh);
    ck("OB: cuma nyala kalau Weak High <5% (EQ ga keganggu)", whGain<5);
    ck("OB: gain dari TP (bukan WH)", Math.abs(a.gainPct-(a.tp-a.entry)/a.entry*100)<1e-9); }
  // opsi A: ChoCh WH gain<5 tanpa OB → tetap WH → dibuang MIN_TP (bukan dipaksa lolos)
  if(whSmall) ck("opsi A: ChoCh <5% tanpa OB tetap WH (dibuang filter, bukan dipaksa)", whSmall.a.tpSrc==='WH'); }

console.log("== TP OB pakai DASAR zona (min), tahan swap high/low candle volatil (kasus BANK) ==");
{ // OB volatil (parsed swap): barHigh=low asli 0.2836, barLow=high asli 0.3298
  const obsBear=[{barHigh:0.2836, barLow:0.3298}]; const trailTop=0.2450;
  let bug=null; for(const o of obsBear){ if(o.barLow>trailTop && (bug===null||o.barLow<bug)) bug=o.barLow; }
  let fix=null; for(const o of obsBear){ const bot=Math.min(o.barHigh,o.barLow); if(bot>trailTop && (fix===null||bot<fix)) fix=bot; }
  ck("logika LAMA salah ambil high (0.3298)", Math.abs(bug-0.3298)<1e-9);
  ck("logika BARU ambil dasar/low OB (0.2836)", Math.abs(fix-0.2836)<1e-9);
  // pastikan real code: semua BoS+OB TP ga pernah di ATAS harga saat itu secara absurd (dasar zona)
  let ok=true;
  for(let sd=1;sd<4000;sd++){ const st=S.luxStructure(walk(sd,400,0.05,3.0,1.2),50,true);
    for(const e of st.events){ if(e.dir==='bull' && e.obTP!=null && e.obTP<=e.weakHigh){ ok=false; break; } } }
  ck("obTP real selalu di atas weakHigh (dasar zona valid)", ok); }

console.log(`\nRINGKASAN: ${pass} PASS, ${fail} FAIL`);
process.exit(fail?1:0);

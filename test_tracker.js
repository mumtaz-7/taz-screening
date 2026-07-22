const S=require("/sessions/cool-laughing-ptolemy/mnt/Crypto Trading/telegram-scanner/scan.js");
let pass=0,fail=0; const ck=(n,c)=>{ c?(pass++,console.log("  PASS "+n)):(fail++,console.log("  FAIL "+n)); };
const now=Date.now(), M=900000;                       // M15 = 900k ms
const st=now-2*3600*1000;                             // sinyal 2 jam lalu (age < 3 hari)
const C=(k,o,h,l,c)=>({t:st+(k+1)*M,o,h,l,c});        // candle ke-k SETELAH sinyal
const base={signalTime:st,entry:100,sl:95,tp:110,setup:'ChoCh',status:'pending'};
const R2=(110-100)/(100-95);                          // RR = 2

console.log("== evalTrade: void kalau TP nyentuh SEBELUM entry ==");
{ // harga naik ke TP tanpa pernah dip ke entry
  const cs=[C(0,102,105,101,104), C(1,104,111,103,110)];   // ga ada low<=100; bar-2 high 111>=110
  const r=S.evalTrade({...base}, cs);
  ck("TP duluan -> void", r.status==='void');
  ck("TP duluan -> voidReason 'tp-duluan'", r.voidReason==='tp-duluan'); }

{ // WIN normal: dip ke entry dulu, baru naik ke TP
  const cs=[C(0,102,103,99,100), C(1,100,111,100,110)];    // c0 low 99<=100 fill; c1 high 111>=110 win
  const r=S.evalTrade({...base}, cs);
  ck("dip->entry lalu TP = win", r.status==='win');
  ck("win R = RR (2)", r.R===S.round?S.round(R2):r.R===R2 || Math.abs(r.R-2)<1e-9); }

{ // LOSS: fill lalu kena SL
  const cs=[C(0,102,103,99,100), C(1,100,101,94,96)];      // fill c0; c1 low 94<=95 loss
  const r=S.evalTrade({...base}, cs);
  ck("fill lalu SL = loss", r.status==='loss' && r.R===-1); }

{ // VOID no-retest: harga ngambang di atas entry, ga sentuh entry & ga sentuh TP, window abis
  const cs=[]; for(let k=0;k<26;k++) cs.push(C(k,102,105,101,103));  // 26 bar, low 101>entry, high 105<tp
  const r=S.evalTrade({...base}, cs);
  ck("ngambang (no retest, no TP) -> void", r.status==='void');
  ck("no-retest -> voidReason 'ga-retest'", r.voidReason==='ga-retest'); }

{ // EDGE: 1 candle sentuh entry & TP sekaligus -> dianggap fill (win), bukan void
  const cs=[C(0,101,111,99,105)];                          // low 99<=100 (fill) & high 111>=110 (TP)
  const r=S.evalTrade({...base}, cs);
  ck("1 candle entry+TP = fill->win (bukan void)", r.status==='win'); }

{ // PENDING: sinyal baru, belum fill, window belum abis
  const st2=now-30*60*1000;                               // 30 menit lalu
  const c2=[{t:st2+M,o:101,h:105,l:101,c:103}];            // no fill, no TP
  const r=S.evalTrade({...base, signalTime:st2}, c2);
  ck("belum fill & window belum abis -> pending", r.status==='pending'); }

{ // FROZEN: status terminal ga diubah lagi
  const r=S.evalTrade({...base, status:'void'}, [C(0,102,103,99,100),C(1,100,111,100,110)]);
  ck("status terminal (void) tetap beku", r.status==='void'); }

console.log("== fill ke-hit di candle sinyal sendiri (wick), jangan ke-skip ==");
{ // candle TEPAT di signalTime wick ke entry (retest langsung), candle berikutnya udah lari ke TP
  const cs=[{t:st,o:102,h:103,l:99,c:101},       // t==signalTime, low 99<=entry100 → harus FILL di sini
            {t:st+M,o:101,h:111,l:101,c:110}];    // low 101>entry (ga fill di sini), high 111>=tp
  const r=S.evalTrade({...base}, cs);
  // dgn start>=signalTime: fill di candle0 → candle1 kena TP → win.  (dgn > lama: candle0 ke-skip → void tp-duluan)
  ck("retest di candle sinyal → fill lalu win (bukan void)", r.status==='win'); }

console.log("== computeStats: void ga masuk win/loss ==");
{ const j=[{status:'win',R:2,setup:'ChoCh'},{status:'loss',R:-1,setup:'ChoCh'},
           {status:'void',setup:'ChoCh'},{status:'void',setup:'BoS'},{status:'pending',setup:'BoS'}];
  const s=S.computeStats(j);
  ck("all.n cuma win+loss (=2)", s.all.n===2);
  ck("void kehitung terpisah (=2)", s.void===2);
  ck("totalSignals = semua (5)", s.totalSignals===5); }

console.log(`\nRINGKASAN: ${pass} PASS, ${fail} FAIL`);
process.exit(fail?1:0);

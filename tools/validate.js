// 업로드 전 데이터 검증 러너 — app.js 안의 validateData()를 노드 샌드박스에서 실행.
// 사용법(Node 필요, Codex 번들 node 가능):
//   node tools/validate.js
// 결과: 문제 목록 출력, 문제 있으면 종료코드 1.
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');

const fakeCtx = { beginPath(){},arc(){},fill(){},stroke(){},moveTo(){},lineTo(){},fillRect(){},fillText(){},
  measureText:()=>({width:0}),save(){},restore(){},translate(){},scale(){},clearRect(){},
  set fillStyle(v){},set strokeStyle(v){},set lineWidth(v){},set globalAlpha(v){},set shadowColor(v){},
  set shadowBlur(v){},set textAlign(v){},set font(v){},set lineCap(v){} };
const el = () => ({ textContent:'',style:{setProperty(){}},classList:{add(){},remove(){},toggle(){},contains(){return false;}},
  addEventListener(){},appendChild(){},innerHTML:'',clientWidth:800,clientHeight:600,width:800,height:600,
  getContext:()=>fakeCtx, dataset:{} });
const ctx = {
  window:{ addEventListener(){}, devicePixelRatio:1 },
  document:{ getElementById:el, createElement:el, querySelectorAll:()=>[], addEventListener(){} },
  localStorage:{ getItem(){return null;}, setItem(){} },
  navigator:{ geolocation:{} },
  console,
};
ctx.window.document = ctx.document;
vm.createContext(ctx);

for (const f of ['data/kanto.js','data/kanto2.js','data/services.js','app.js']) {
  const p = path.join(ROOT, f);
  if (!fs.existsSync(p)) { console.error('파일 없음: ' + f); process.exit(1); }
  try { vm.runInContext(fs.readFileSync(p,'utf8'), ctx, {filename:f}); }
  catch(e){ console.error(`${f} 실행 오류: ${e.message}`); process.exit(1); }
}

const issues = ctx.window.__dataIssues || [];
const lines = ctx.window.JR_DATA ? Object.values(ctx.window.JR_DATA).flat().length : 0;
console.log(`노선 항목 ${lines}개 로드.`);
if (issues.length) {
  console.log(`❌ 검증 실패 ${issues.length}건:`);
  issues.forEach(s=>console.log('  - '+s));
  process.exit(1);
}
console.log('✅ 데이터 검증 통과 (0건)');

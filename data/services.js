// ═══════════════════════════════════════════
// 운행 계통/서비스 데이터 — 노선(선로) 데이터와 분리된 "계통" 정의.
// app.js보다 먼저 로드되어야 함(index.html 스크립트 순서).
// 여기의 노선 id·역 이름은 앱 시작 시 validateData()가 전수 검증하고,
// 오타·불일치가 있으면 콘솔에 경고를 띄움(조용한 실패 방지).
// ═══════════════════════════════════════════
window.JR_SERVICES = {

  // ── 크레딧 그룹: base=각역정차(최소단위) 노선. 그룹 내 어떤 서비스를 타든
  //    양 끝역이 base에서 인접일 때만 그 atomic이 채워짐(쾌속 통과구간은 미인정).
  //    새 그룹 = {base, members} 한 줄.
  LINE_GROUPS: [
    { base:'joban_local', members:['joban_rapid','joban'] }, // 조반: base=완행. 쾌속·중거리는 우에노~토리데 동일정차(완행역 통과)
    // 츄오·소부: base=츄오·소부완행선. 츄오쾌속=오차노미즈~나카노 건너뜀, 소부쾌속=킨시초~치바 건너뜀(도쿄~바쿠로초는 쾌속고유)
    { base:'sobu', members:['chuo','sobu_rapid'] }
  ],

  // ── 가상 통합 보기: 별도 색 선을 긋지 않는 노선 목록의 가상 항목.
  //    members = 노선id 문자열(전구간) 또는 {id,from,to}(역명으로 구간 클립).
  //    완료율 총합엔 미반영(중복 카운트 없음).
  VIEW_COMPOSITES: [
    // 츄오 본선: 쾌속(도쿄~타카오)+산악구간+완행(미타카~오차노미즈 각역) 묶음
    { id:'__chuo_honsen', name:'츄오 본선 中央本線', color:'#2E6FB0',
      badges:[{code:'JC',color:'#F15A22'},{code:'CO',color:'#2E6FB0'}],
      members:['chuo','chuo_higashi','chuo_tatsuno',{id:'sobu',from:'미타카',to:'오차노미즈'}] },
    // 조반선 통합: 공식구간 닛포리~이와누마(우에노~닛포리는 東北本線이라 제외)
    { id:'__joban_honsen', name:'조반선 常磐線', color:'#0079C2',
      members:[{id:'joban_rapid',from:'닛포리',to:'토리데'},'joban_local',{id:'joban',from:'닛포리',to:'이와누마'}] },
    // 소부 본선: 도쿄~쵸시
    { id:'__sobu_honsen', name:'소부 본선 総武本線', color:'#FFD400',
      members:['sobu_rapid',{id:'sobu',from:'오차노미즈',to:'치바'},'sobu_main'] },
    // 우에노도쿄라인(직결): 도카이도→이토, 우츠노미야, 타카사키→마에바시, 조반→타카하기(이북은 특급뿐)
    { id:'__ueno_tokyo', name:'우에노도쿄라인 (직결) 上野東京ライン', color:'#A0228E',
      badges:[{code:'JU',color:'#F68B1E'},{code:'JJ',color:'#00B261'},{code:'JT',color:'#F68B1E'}],
      members:['ueno_tokyo','tokaido','ito',{id:'utsunomiya',from:'도쿄',to:'우츠노미야'},'takasaki',
               {id:'joetsu',from:'타카사키',to:'신마에바시'},
               {id:'ryomo',from:'신마에바시',to:'마에바시'},{id:'joban',from:'우에노',to:'타카하기'}] },
    // 쇼난신주쿠라인(직결): 트렁크+북쪽(우츠노미야/마에바시)+남쪽(즈시=JS, 오후나~오다와라=도카이도)
    { id:'__shonan', name:'쇼난신주쿠라인 (직결) 湘南新宿ライン', color:'#E4002B',
      badges:[{code:'JS',color:'#E4002B'}],
      members:['shonan',{id:'utsunomiya',from:'오미야',to:'우츠노미야'},'takasaki',
               {id:'joetsu',from:'타카사키',to:'신마에바시'},{id:'ryomo',from:'신마에바시',to:'마에바시'},
               {id:'tokaido',from:'오후나',to:'오다와라'}] },
    // 신에츠 본선(통합): 역사적 전 회랑 타카사키~니가타. JR 3구간+사철 3구간(집계 제외).
    // 요코카와~카루이자와는 폐선(JR버스 대체)이라 지도에 빈틈으로 남음 — note로 안내.
    { id:'__shinetsu_honsen', name:'신에츠 본선 信越本線', color:'#3AA0DB',
      badges:[{code:'SE',color:'#3AA0DB'}],
      note:'완주율 집계 대상은 JR 3구간(타카사키~요코카와·시노노이~나가노·나오에츠~니가타)뿐입니다. 카루이자와~시노노이·나가노~나오에츠는 사철 이관(표시만), 요코카와~카루이자와는 폐선으로 JR버스 관동이 대체 운행 중입니다(지도 미표시).',
      members:['shinetsu_takasaki','shinano_tetsudo','shinetsu_shinonoi','kitashinano','myoko_haneuma','shinetsu_naoetsu'] }
  ],

  // ── 노선 목록 카드에서 숨길 노선 id(지도·통합·팝업엔 그대로).
  HIDDEN_FROM_LIST: [],

  // ── 노선 → 그 노선의 (직결) 통합 id. 선택 시 맵 3번째 버튼이 '직결'로 바뀜.
  //    여기 지정된 통합은 노선 목록에 안 뜨고 직결 버튼으로만 접근.
  LINE_CHOKKETSU: { shonan:'__shonan', ueno_tokyo:'__ueno_tokyo' },

  // ── 물리 공유 구간: 같은 선로의 같은 두 역 구간을 여러 노선이 자기 구간으로 가질 때,
  //    한 노선으로 타면 나머지도 완료 인정. stations=[역A,역B](인접), lines=공유 노선들.
  //    역명 기반이라 역 삽입/인덱스 변화에 안전(로드 시 인접쌍을 찾아 해석, 못 찾으면 경고).
  SHARED_SEGMENTS: [
    { stations:['도쿄','우에노'],   lines:['utsunomiya','ueno_tokyo'] }, // 列車선(우츠노미야↔우에노도쿄라인)
    { stations:['신주쿠','시부야'], lines:['sotetsu','saikyo'] },        // 소테츠 직통 신주쿠~오사키(사이쿄 선로)
    { stations:['시부야','에비스'], lines:['sotetsu','saikyo'] },
    { stations:['에비스','오사키'], lines:['sotetsu','saikyo'] }
  ]
};

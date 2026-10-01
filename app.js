const $ = id => document.getElementById(id);
const TIRE_PRESETS = {
  "700x23C": 2096,
  "700x25C": 2105,
  "700x28C": 2136,
  "custom": null
};

let state = {
  riders: [],
  riderSetup: {},
  activeRiders: [],
  leaderIndex: 0,
  running: false,
  startAt: 0,
  elapsed: 0,
  lastLapAt: 0,
  pull: 1,
  laps: [],
  events: []
};
let raf = null;
let lapBoardTimer = null;

function now(){ return performance.now(); }
function fmt(ms){
  const total = Math.max(0, ms);
  const m = Math.floor(total / 60000);
  const s = Math.floor((total % 60000) / 1000);
  const x = Math.floor(total % 1000);
  return String(m).padStart(2,"0") + ":" + String(s).padStart(2,"0") + "." + String(x).padStart(3,"0");
}
function lapFmt(ms){ return (ms/1000).toFixed(3); }
function save(){
  localStorage.setItem("trackCyclingTimer", JSON.stringify({...state, running:false, startAt:0}));
}
function currentElapsed(){ return state.running ? state.elapsed + (now() - state.startAt) : state.elapsed; }
function refreshClock(){
  $("clock").textContent = fmt(currentElapsed());
  if(state.running) raf = requestAnimationFrame(refreshClock);
}
const RIDER_COLORS=["#00E5FF","#FFEA00","#FF3D71","#7CFF00","#FF8A00","#B388FF","#00FFA8","#FF5CC8"];
function riderColor(name){
  const i=Math.max(0,state.riders.indexOf(name));
  return RIDER_COLORS[i%RIDER_COLORS.length];
}
function defaultSetup(){
  return {chainring:64, sprocket:15, tire:"700x23C", circumferenceMm:2096};
}
function ensureRiderSetup(name){
  if(!state.riderSetup[name]) state.riderSetup[name] = defaultSetup();
  return state.riderSetup[name];
}
function rolloutMeters(setup){
  const c = Number(setup.circumferenceMm) / 1000;
  const ratio = Number(setup.chainring) / Number(setup.sprocket);
  return c * ratio;
}
function speedKph(distanceM, lapMs){
  if(!lapMs) return 0;
  return distanceM / (lapMs/1000) * 3.6;
}
function cadenceRpm(speed, setup){
  const rollout = rolloutMeters(setup);
  if(!rollout) return 0;
  return (speed * 1000 / 60) / rollout;
}
function renderGearTable(){
  $("gearBody").innerHTML = state.riders.map((name,i)=>{
    const g = ensureRiderSetup(name);
    const opts = Object.keys(TIRE_PRESETS).map(k => '<option value="'+k+'" '+(g.tire===k?'selected':'')+'>'+k+'</option>').join("");
    return '<tr data-rider="'+i+'">' +
      '<td>'+name+'</td>' +
      '<td><input class="gear-input chainring" type="number" min="30" max="80" value="'+g.chainring+'"></td>' +
      '<td><input class="gear-input sprocket" type="number" min="8" max="30" value="'+g.sprocket+'"></td>' +
      '<td><select class="gear-input tire">'+opts+'</select></td>' +
      '<td><input class="gear-input circumference" type="number" min="1800" max="2300" step="1" value="'+g.circumferenceMm+'"></td>' +
      '<td class="rollout">'+rolloutMeters(g).toFixed(3)+'</td>' +
    '</tr>';
  }).join("");

  document.querySelectorAll("#gearBody tr").forEach(row=>{
    const idx = Number(row.dataset.rider);
    const name = state.riders[idx];
    const chainring = row.querySelector(".chainring");
    const sprocket = row.querySelector(".sprocket");
    const tire = row.querySelector(".tire");
    const circumference = row.querySelector(".circumference");
    const rollout = row.querySelector(".rollout");

    function sync(){
      const g = ensureRiderSetup(name);
      g.chainring = Number(chainring.value) || 64;
      g.sprocket = Number(sprocket.value) || 15;
      g.tire = tire.value;
      g.circumferenceMm = Number(circumference.value) || 2096;
      rollout.textContent = rolloutMeters(g).toFixed(3);
      save();
    }
    tire.addEventListener("change",()=>{
      const preset = TIRE_PRESETS[tire.value];
      if(preset) circumference.value = preset;
      sync();
    });
    chainring.addEventListener("input",sync);
    sprocket.addEventListener("input",sync);
    circumference.addEventListener("input",()=>{
      if(TIRE_PRESETS[tire.value] !== Number(circumference.value)) tire.value = "custom";
      sync();
    });
  });
}
function syncSegmentDistance(){
  const track = Number($("trackLength").value) || 250;
  const preset = $("segmentPreset").value;
  let distance = Number($("segmentDistance").value) || track;
  if(preset==="quarter") distance = track/4;
  if(preset==="half") distance = track/2;
  if(preset==="full") distance = track;
  if(preset!=="custom") $("segmentDistance").value = distance.toFixed(3).replace(/\.000$/,"");
  $("distanceHint").textContent = preset==="custom"
    ? "自訂計時距離："+distance.toFixed(3)+" m"
    : track.toFixed(3).replace(/\.000$/,"")+" m 場地 × "+(preset==="quarter"?"1/4":preset==="half"?"1/2":"1")+" 圈 = "+distance.toFixed(3)+" m";
}
function renderRoster(){
  const names = $("riders").value.split(/\n|,/).map(x=>x.trim()).filter(Boolean);
  state.riders = names;
  names.forEach(ensureRiderSetup);
  if(!state.activeRiders?.length || state.activeRiders.some(n=>!names.includes(n))){
    state.activeRiders=[...names];
  }
  $("startingLeader").innerHTML = names.map((n,i)=>'<option value="'+i+'">'+n+'</option>').join("");
  if(names.length){
    state.leaderIndex = Math.min(state.leaderIndex, names.length-1);
    $("startingLeader").value = state.leaderIndex;
  }
  renderGearTable();
  renderRotation();
  render();
  save();
}
function leaderName(){ return state.riders[state.leaderIndex] || ""; }
function nextActiveLeader(){
  if(!state.activeRiders?.length) return "";
  const current=leaderName();
  let i=state.activeRiders.indexOf(current);
  if(i<0) i=0;
  return state.activeRiders[(i+1)%state.activeRiders.length];
}
function setLeaderByName(name, eventType="manual_leader"){
  if(!name || !state.riders.includes(name)) return;
  const from=leaderName();
  state.leaderIndex=state.riders.indexOf(name);
  state.events.push({type:eventType,atMs:currentElapsed(),from,to:name,pull:state.pull});
  renderRotation(); render(); save();
}
function renderRotation(){
  const current=leaderName();
  const next=nextActiveLeader();
  $("nextLeader").textContent=next||"—";
  $("manualLeaderSelect").innerHTML=state.riders.map(n=>'<option value="'+n+'" '+(n===current?'selected':'')+'>'+n+(state.activeRiders.includes(n)?"":" (OUT)")+'</option>').join("");
  $("rotationRoster").innerHTML=state.riders.map(n=>{
    const active=state.activeRiders.includes(n);
    return '<button class="rider-chip '+(active?'':'inactive')+'" data-name="'+n+'" style="--rider:'+riderColor(n)+'"><span class="dot"></span>'+n+(active?'':' · RETURN')+'</button>';
  }).join("");
  document.querySelectorAll(".rider-chip").forEach(btn=>btn.addEventListener("click",()=>{
    const n=btn.dataset.name;
    if(state.activeRiders.includes(n)) setLeaderByName(n);
    else { state.activeRiders.push(n); state.events.push({type:"return",atMs:currentElapsed(),rider:n}); renderRotation(); render(); save(); }
  }));
}
function segmentsPerFullLap(){
  const preset=$("segmentPreset").value;
  if(preset==="quarter") return 4;
  if(preset==="half") return 2;
  if(preset==="full") return 1;
  const track=Number($("trackLength").value)||250;
  const distance=Number($("segmentDistance").value)||0;
  if(!distance) return 0;
  const n=Math.round(track/distance);
  if(n<1) return 0;
  return Math.abs(track-(distance*n))<=0.5 ? n : 0;
}
function buildFullLaps(){
  const segmentsPerLap=segmentsPerFullLap();
  if(!segmentsPerLap) return [];
  const full=[];
  const track=Number($("trackLength").value)||250;
  for(let i=0;i+segmentsPerLap-1<state.laps.length;i+=segmentsPerLap){
    const group=state.laps.slice(i,i+segmentsPerLap);
    const lapMs=group.reduce((sum,x)=>sum+x.lapMs,0);
    const end=group[group.length-1];
    const leaders=[];
    group.forEach(x=>{ if(leaders.at(-1)!==x.leader) leaders.push(x.leader); });
    full.push({
      lap:full.length+1,
      distanceM:group.reduce((sum,x)=>sum+x.distanceM,0),
      lapMs,
      totalMs:end.totalMs,
      splits:group.map(x=>(x.lapMs/1000).toFixed(3)),
      splitData:group.map(x=>({timeS:x.lapMs/1000,speedKph:x.speedKph,leader:x.leader})),
      leaders,
      speedKph:speedKph(track,lapMs)
    });
  }
  return full;
}
function showFullLapBoard(fullLap){
  const board=$("lapBoard");
  $("lapBoardMeta").textContent="LAP "+fullLap.lap;
  const fullLapSeconds=fullLap.lapMs/1000;
  $("lapBoardTime").textContent=(fullLapSeconds%10).toFixed(1);
  board.classList.add("show");
  board.setAttribute("aria-hidden","false");
  clearTimeout(lapBoardTimer);
  lapBoardTimer=setTimeout(hideFullLapBoard,2000);
}
function hideFullLapBoard(){
  const board=$("lapBoard");
  board.classList.remove("show");
  board.setAttribute("aria-hidden","true");
}
$("lapBoard").addEventListener("click",hideFullLapBoard);

function renderQuarterCharts(){
  const full=buildFullLaps();
  const barWrap=$("continuousBars");
  const svg=$("quarterCompareChart");
  const legend=$("chartLegend");

  if(!state.laps.length){
    barWrap.innerHTML='<div class="empty-chart">開始計時後，整場速度變化會連續顯示在這裡。</div>';
    svg.innerHTML='';
    legend.innerHTML='';
    return;
  }

  const allSpeeds=state.laps.map(x=>x.speedKph);
  const minV=Math.min(...allSpeeds);
  const maxV=Math.max(...allSpeeds);
  const range=Math.max(0.1,maxV-minV);

  barWrap.innerHTML=state.laps.map((d,i)=>{
    const h=40+((d.speedKph-minV)/range)*130;
    const c=riderColor(d.leader);
    const lapNo=segmentsPerFullLap()?Math.ceil((i+1)/segmentsPerFullLap()):"";
    return '<div class="continuous-col">'+
      '<div class="continuous-value">'+d.speedKph.toFixed(1)+'</div>'+
      '<div class="continuous-bar" style="height:'+h.toFixed(1)+'px;background:'+c+'" title="'+d.leader+' · '+(d.lapMs/1000).toFixed(3)+'s"></div>'+
      '<div class="continuous-label">S'+(i+1)+'</div>'+
      (lapNo?'<div class="continuous-lap">L'+lapNo+'</div>':'')+
      '</div>';
  }).join("");

  if(!full.length){
    svg.innerHTML='';
    legend.innerHTML=state.riders.map(n=>'<span><i style="background:'+riderColor(n)+'"></i>'+n+(state.activeRiders.includes(n)?"":" (OUT)")+'</span>').join("");
    return;
  }

  const all=full.flatMap(x=>x.splitData.map(d=>d.speedKph));
  const globalMin=Math.min(...all);
  const globalMax=Math.max(...all);
  const chartRange=Math.max(0.1,globalMax-globalMin);

  const W=720,H=320,left=54,right=20,top=24,bottom=46;
  const plotW=W-left-right,plotH=H-top-bottom;
  const maxPoints=Math.max(...full.map(x=>x.splitData.length));
  const xs=Array.from({length:maxPoints},(_,i)=>maxPoints===1?left+plotW/2:left+(plotW/(maxPoints-1))*i);
  const y=v=>top+((globalMax-v)/chartRange)*plotH;

  let svgHtml='';
  for(let i=0;i<5;i++){
    const val=globalMin+(chartRange/4)*i;
    const yy=y(val);
    svgHtml+='<line x1="'+left+'" y1="'+yy+'" x2="'+(W-right)+'" y2="'+yy+'" class="chart-grid"/>';
    svgHtml+='<text x="'+(left-8)+'" y="'+(yy+4)+'" class="chart-axis" text-anchor="end">'+val.toFixed(1)+'</text>';
  }
  xs.forEach((x,i)=>{
    svgHtml+='<text x="'+x+'" y="'+(H-16)+'" class="chart-axis" text-anchor="middle">S'+(i+1)+'</text>';
  });

  full.forEach(lap=>{
    const points=lap.splitData.map((d,i)=>xs[i]+','+y(d.speedKph)).join(' ');
    svgHtml+='<polyline points="'+points+'" fill="none" stroke="#94a3b8" stroke-opacity=".35" stroke-width="2"/>';
    lap.splitData.forEach((d,i)=>{
      svgHtml+='<circle cx="'+xs[i]+'" cy="'+y(d.speedKph)+'" r="5" fill="'+riderColor(d.leader)+'"/>';
    });
  });
  svgHtml+='<text x="12" y="16" class="chart-axis">km/h</text>';
  svg.innerHTML=svgHtml;

  legend.innerHTML=state.riders.map(n=>'<span><i style="background:'+riderColor(n)+'"></i>'+n+(state.activeRiders.includes(n)?"":" (OUT)")+'</span>').join("");
}
function renderFullLaps(){
  const full=buildFullLaps();
  $("fullLapCount").textContent=full.length;
  const last=full.at(-1);
  $("lastFullLap").textContent=last?lapFmt(last.lapMs):"—";
  $("lastFullLapSpeed").textContent=last?last.speedKph.toFixed(1)+" km/h":"—";
  $("fullLapsBody").innerHTML=full.map(x =>
    '<tr><td>'+x.lap+'</td><td>'+x.distanceM.toFixed(1)+'</td><td>'+lapFmt(x.lapMs)+'</td><td>'+fmt(x.totalMs)+'</td><td>'+x.splits.join(" / ")+'</td><td>'+x.leaders.join(" → ")+'</td><td>'+x.speedKph.toFixed(1)+'</td></tr>'
  ).join("");
  renderQuarterCharts();
}
function render(){
  $("leader").textContent = state.riders[state.leaderIndex] || "—";
  $("leader").style.color = leaderName()?riderColor(leaderName()):"";
  $("lapCount").textContent = state.laps.length;
  const last = state.laps.at(-1);
  $("lastLap").textContent = last ? lapFmt(last.lapMs) : "—";
  $("lastSpeed").textContent = last ? last.speedKph.toFixed(1)+" km/h" : "—";
  $("lastCadence").textContent = last ? last.cadenceRpm.toFixed(1)+" rpm" : "—";
  $("delta").textContent = last ? (last.delta>=0?"+":"") + last.delta.toFixed(2)+"s" : "—";
  $("startStopBtn").textContent = state.running ? "STOP" : "START";
  $("status").textContent = state.running ? "計時中" : (state.elapsed>0 ? "已暫停" : "尚未開始");
  $("lapsBody").innerHTML = state.laps.map(x =>
    '<tr><td>'+x.lap+'</td><td>'+x.cumulativeDistanceM.toFixed(3).replace(/\.000$/,"")+'</td><td>'+x.distanceM.toFixed(3).replace(/\.000$/,"")+'</td><td>'+lapFmt(x.lapMs)+'</td><td>'+fmt(x.totalMs)+'</td><td>'+x.leader+'</td><td>'+x.chainring+'×'+x.sprocket+'</td><td>'+x.speedKph.toFixed(1)+'</td><td>'+x.cadenceRpm.toFixed(1)+'</td><td>'+(x.delta>=0?"+":"")+x.delta.toFixed(2)+'</td></tr>'
  ).join("");
  renderFullLaps();
  renderRotation();
}

$("trackLength").addEventListener("change",()=>{syncSegmentDistance();render();});
$("segmentPreset").addEventListener("change",()=>{syncSegmentDistance();render();});
$("segmentDistance").addEventListener("input",()=>{
  $("segmentPreset").value="custom";
  syncSegmentDistance();
});
syncSegmentDistance();

$("prepareBtn").addEventListener("click",()=>{
  renderRoster();
  state.leaderIndex = Number($("startingLeader").value || 0);
  state.activeRiders=[...state.riders];
  state.pull = 1;
  renderRotation(); render(); save();
});
$("startingLeader").addEventListener("change",()=>{
  state.leaderIndex = Number($("startingLeader").value);
  render();
  save();
});
$("startStopBtn").addEventListener("click",()=>{
  if(!state.riders.length){
    renderRoster();
    if(!state.riders.length) return alert("請先輸入選手名稱");
  }
  if(!state.running){
    state.running = true;
    state.startAt = now();
    if(state.elapsed===0) state.lastLapAt = 0;
  } else {
    state.elapsed = currentElapsed();
    state.running = false;
    cancelAnimationFrame(raf);
  }
  state.events.push({type:state.running?"start":"stop",atMs:currentElapsed(),leader:state.riders[state.leaderIndex]});
  render();
  refreshClock();
  save();
});
$("lapBtn").addEventListener("click",()=>{
  if(!state.running) return;
  const total = currentElapsed();
  const lapMs = total - state.lastLapAt;
  state.lastLapAt = total;
  const target = (Number($("targetLap").value)||0)*1000;
  const distanceM = Number($("segmentDistance").value)||62.5;
  const cumulativeDistanceM = state.laps.reduce((sum,x)=>sum + Number(x.distanceM||0),0) + distanceM;
  const leader = state.riders[state.leaderIndex] || "";
  const g = {...ensureRiderSetup(leader)};
  const speed = speedKph(distanceM, lapMs);
  const cadence = cadenceRpm(speed, g);

  state.laps.push({
    lap:state.laps.length+1,
    distanceM,
    cumulativeDistanceM,
    lapMs,
    totalMs:total,
    leader,
    pull:state.pull,
    delta:target?(lapMs-target)/1000:0,
    chainring:g.chainring,
    sprocket:g.sprocket,
    tire:g.tire,
    circumferenceMm:g.circumferenceMm,
    rolloutM:rolloutMeters(g),
    speedKph:speed,
    cadenceRpm:cadence
  });
  state.events.push({type:"lap",atMs:total,leader,pull:state.pull});
  const perLap=segmentsPerFullLap();
  const completedFullLap=perLap && state.laps.length%perLap===0 ? buildFullLaps().at(-1) : null;
  render();
  if(completedFullLap) showFullLapBoard(completedFullLap);
  save();
});
$("changeBtn").addEventListener("click",()=>{
  if(!state.activeRiders?.length) return;
  const t=currentElapsed();
  const from=leaderName();
  const to=nextActiveLeader();
  if(!to) return;
  state.leaderIndex=state.riders.indexOf(to);
  state.pull+=1;
  state.events.push({type:"change",atMs:t,from,to,pull:state.pull});
  renderRotation(); render(); save();
});
$("setLeaderBtn").addEventListener("click",()=>{
  const to=$("manualLeaderSelect").value;
  if(to && to!==leaderName()){ state.pull+=1; setLeaderByName(to,"manual_change"); }
});
$("outBtn").addEventListener("click",()=>{
  const out=leaderName();
  if(!out) return;
  if(state.activeRiders.length<=1) return alert("至少需要保留一位有效選手");
  const next=nextActiveLeader();
  state.activeRiders=state.activeRiders.filter(n=>n!==out);
  state.events.push({type:"out",atMs:currentElapsed(),rider:out,next});
  if(next && next!==out){ state.leaderIndex=state.riders.indexOf(next); state.pull+=1; }
  renderRotation(); render(); save();
});
$("undoBtn").addEventListener("click",()=>{
  if(state.laps.length){
    state.laps.pop();
    state.lastLapAt = state.laps.at(-1)?.totalMs || 0;
    render();
    save();
  }
});
$("resetBtn").addEventListener("click",()=>{
  if(!confirm("確定清除本次計時？")) return;
  cancelAnimationFrame(raf);
  state.running=false; state.startAt=0; state.elapsed=0; state.lastLapAt=0; state.pull=1; state.laps=[]; state.events=[];
  clearTimeout(lapBoardTimer); hideFullLapBoard();
  render();
  $("clock").textContent="00:00.000";
  save();
});
function sessionSummaryRows(){
  const track=Number($("trackLength").value)||250;
  const seg=Number($("segmentDistance").value)||0;
  const target=Number($("targetLap").value)||0;
  const rows=[
    ["SESSION SETTINGS",""],
    ["Track length (m)",track],
    ["Segment mode",$("segmentPreset").options[$("segmentPreset").selectedIndex].text],
    ["Segment distance (m)",seg],
    ["Target segment time (s)",target],
    ["Starting leader",state.riders[Number($("startingLeader").value||0)]||""],
    ["",""],
    ["RIDER SETUP",""]
  ];
  state.riders.forEach(n=>{
    const g=ensureRiderSetup(n);
    rows.push([n, g.chainring+"x"+g.sprocket+" | "+g.tire+" | "+g.circumferenceMm+" mm | rollout "+rolloutMeters(g).toFixed(3)+" m"]);
  });
  return rows;
}

function compactCsvRows(){
  const rows=[
    ["split","distance_m","segment_time_s","total_time_s","leader","pull","speed_kph","cadence_rpm"],
    ...state.laps.map(x=>[
      x.lap,
      x.cumulativeDistanceM.toFixed(3),
      (x.lapMs/1000).toFixed(3),
      (x.totalMs/1000).toFixed(3),
      x.leader,
      x.pull,
      x.speedKph.toFixed(2),
      x.cadenceRpm.toFixed(1)
    ])
  ];
  return [...sessionSummaryRows(),["",""],...rows];
}

function makeChartCanvas(){
  const canvas=document.createElement("canvas");
  const scale=2;
  const width=Math.max(1200,state.laps.length*34);
  const height=520;
  canvas.width=width*scale;
  canvas.height=height*scale;
  const ctx=canvas.getContext("2d");
  ctx.scale(scale,scale);
  ctx.fillStyle="#ffffff";ctx.fillRect(0,0,width,height);

  if(!state.laps.length) return canvas;
  const speeds=state.laps.map(x=>x.speedKph);
  const minV=Math.min(...speeds),maxV=Math.max(...speeds),range=Math.max(0.1,maxV-minV);
  const left=70,right=20,top=30,bottom=80;
  const plotH=height-top-bottom;
  const barW=Math.max(10,(width-left-right)/state.laps.length*0.72);
  const gap=(width-left-right)/state.laps.length;

  ctx.strokeStyle="#d1d5db";ctx.fillStyle="#374151";ctx.font="14px sans-serif";
  for(let i=0;i<5;i++){
    const v=minV+(range/4)*i;
    const y=top+plotH-(v-minV)/range*plotH;
    ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(width-right,y);ctx.stroke();
    ctx.fillText(v.toFixed(1),8,y+5);
  }

  state.laps.forEach((d,i)=>{
    const x=left+i*gap+(gap-barW)/2;
    const h=40+((d.speedKph-minV)/range)*(plotH-40);
    const y=top+plotH-h;
    ctx.fillStyle=riderColor(d.leader);
    ctx.fillRect(x,y,barW,h);
    ctx.save();ctx.translate(x+barW/2,height-bottom+8);ctx.rotate(-Math.PI/2);
    ctx.fillStyle="#374151";ctx.font="11px sans-serif";ctx.fillText("S"+(i+1),0,0);ctx.restore();
  });

  ctx.fillStyle="#111827";ctx.font="bold 20px sans-serif";
  ctx.fillText("Continuous segment speed (km/h)",left,22);
  return canvas;
}

$("exportBtn").addEventListener("click",()=>{
  if(!state.laps.length) return alert("目前沒有圈速資料");
  const rows=compactCsvRows();
  const csv=rows.map(r=>r.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(",")).join("\n");
  const blob=new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"});
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);
  a.download="track-session-"+new Date().toISOString().replaceAll(":","-")+".csv";
  a.click();
  URL.revokeObjectURL(a.href);
});

$("exportXlsxBtn").addEventListener("click",async()=>{
  if(!state.laps.length) return alert("目前沒有圈速資料");
  if(typeof ExcelJS==="undefined") return alert("Excel 匯出模組尚未載入，請在有網路時重新整理頁面後再試。");

  const wb=new ExcelJS.Workbook();
  wb.creator="Track Cycling Timer";
  wb.created=new Date();

  const summary=wb.addWorksheet("Summary");
  sessionSummaryRows().forEach(r=>summary.addRow(r));
  summary.columns=[{width:26},{width:64}];
  summary.getRow(1).font={bold:true,size:14};
  const ssHeader=summary.getRow(sessionSummaryRows().findIndex(r=>r[0]==="RIDER SETUP")+1);
  ssHeader.font={bold:true};

  const splits=wb.addWorksheet("Splits");
  splits.addRow(["Split","Distance m","Segment time s","Total time s","Leader","Pull","Speed km/h","Cadence rpm"]);
  state.laps.forEach(x=>splits.addRow([
    x.lap,Number(x.cumulativeDistanceM.toFixed(3)),Number((x.lapMs/1000).toFixed(3)),Number((x.totalMs/1000).toFixed(3)),
    x.leader,x.pull,Number(x.speedKph.toFixed(2)),Number(x.cadenceRpm.toFixed(1))
  ]));
  splits.getRow(1).font={bold:true};
  splits.views=[{state:"frozen",ySplit:1}];
  splits.columns=[{width:9},{width:14},{width:16},{width:15},{width:18},{width:9},{width:14},{width:14}];

  const laps=wb.addWorksheet("Full Laps");
  laps.addRow(["Lap","Lap time s","Total time s","Average speed km/h","Leader sequence","Segment splits s"]);
  buildFullLaps().forEach(x=>laps.addRow([
    x.lap,Number((x.lapMs/1000).toFixed(3)),Number((x.totalMs/1000).toFixed(3)),Number(x.speedKph.toFixed(2)),x.leaders.join(" > "),x.splits.join(" / ")
  ]));
  laps.getRow(1).font={bold:true};
  laps.columns=[{width:8},{width:14},{width:15},{width:19},{width:34},{width:36}];

  const chart=wb.addWorksheet("Speed Chart");
  chart.getCell("A1").value="Continuous segment speed";
  chart.getCell("A1").font={bold:true,size:16};
  const canvas=makeChartCanvas();
  const dataUrl=canvas.toDataURL("image/png");
  const imageId=wb.addImage({base64:dataUrl,extension:"png"});
  chart.addImage(imageId,{tl:{col:0,row:2},ext:{width:Math.min(1500,Math.max(900,state.laps.length*24)),height:390}});

  const buffer=await wb.xlsx.writeBuffer();
  const blob=new Blob([buffer],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);
  a.download="track-session-report-"+new Date().toISOString().replaceAll(":","-")+".xlsx";
  a.click();
  URL.revokeObjectURL(a.href);
});
window.addEventListener("beforeunload",save);
const saved = localStorage.getItem("trackCyclingTimer");
if(saved){
  try{
    Object.assign(state,JSON.parse(saved));
    if(!state.riderSetup) state.riderSetup={};
    if(!state.activeRiders?.length) state.activeRiders=[...state.riders];
    $("riders").value = state.riders.join("\n");
    renderRoster();
    $("startingLeader").value = state.leaderIndex;
  }catch(e){}
}
render();
refreshClock();
if("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js");
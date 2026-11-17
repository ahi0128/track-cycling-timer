const $ = id => document.getElementById(id);
const TIRE_PRESETS = {
  "700x22C": 2092,
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
let controllerLearnSlot=null;
let controllerSlots={};
let gamepadPrev={};
const CONTROLLER_SLOT_ORDER=["redLeft","redRight","up","left","right","down"];
const DEFAULT_SLOT_ACTIONS={
  redLeft:"lap",
  redRight:"change",
  up:"startStop",
  left:"undo",
  right:"reset",
  down:"out"
};
const ACTION_OPTIONS=["lap","change","startStop","undo","reset","out"];
const CONTROLLER_ACTIONS={
  lap:"lapBtn",
  change:"changeBtn",
  startStop:"startStopBtn",
  out:"outBtnTop",
  undo:"undoBtn",
  reset:"resetBtn"
};
const CONTROLLER_LABELS={
  lap:"LAP",
  change:"CHANGE",
  startStop:"START/STOP",
  out:"OUT",
  undo:"UNDO",
  reset:"RESET"
};

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
function currentFullLapElapsed(totalMs){
  const perLap=segmentsPerFullLap();
  if(!perLap) return 0;
  const completedFullLapSegments=Math.floor(state.laps.length/perLap)*perLap;
  if(completedFullLapSegments<=0) return totalMs;
  const boundary=state.laps[completedFullLapSegments-1]?.totalMs||0;
  return Math.max(0,totalMs-boundary);
}
function refreshClock(){
  const total=currentElapsed();
  $("clock").textContent = fmt(total);
  const seg=Math.max(0,total-state.lastLapAt);
  const segEl=$("segmentClock");
  if(segEl) segEl.textContent=(seg/1000).toFixed(3);
  const fullNow=$("currentFullLapClock");
  if(fullNow) fullNow.textContent=(currentFullLapElapsed(total)/1000).toFixed(3);
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
function targetSpeedKph(){
  const distance=Number($("segmentDistance").value)||0;
  const seconds=Number($("targetLap").value)||0;
  return distance>0 && seconds>0 ? (distance/seconds)*3.6 : 0;
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

  const targetSpeed=targetSpeedKph();
  const allSpeeds=state.laps.map(x=>x.speedKph);
  const minV=Math.min(...allSpeeds, targetSpeed||Infinity);
  const maxV=Math.max(...allSpeeds, targetSpeed||-Infinity);
  const range=Math.max(0.1,maxV-minV);
  const plotPx=130;
  const basePx=40;
  const targetH=targetSpeed ? basePx+((targetSpeed-minV)/range)*plotPx : 0;

  const barsHtml=state.laps.map((d,i)=>{
    const h=basePx+((d.speedKph-minV)/range)*plotPx;
    const c=riderColor(d.leader);
    const lapNo=segmentsPerFullLap()?Math.ceil((i+1)/segmentsPerFullLap()):"";
    const under=targetSpeed && d.speedKph<targetSpeed;
    return '<div class="continuous-col">'+
      '<div class="continuous-value">'+d.speedKph.toFixed(1)+'</div>'+
      '<div class="continuous-bar '+(under?'under-target':'')+'" style="height:'+h.toFixed(1)+'px;background:'+c+'" title="'+d.leader+' · '+(d.lapMs/1000).toFixed(3)+'s"></div>'+
      '<div class="continuous-label">S'+(i+1)+'</div>'+
      (lapNo?'<div class="continuous-lap">L'+lapNo+'</div>':'')+
      '</div>';
  }).join("");
  const targetLine=targetSpeed
    ? '<div class="continuous-target-line" style="bottom:'+(35+targetH).toFixed(1)+'px"><span>Target '+targetSpeed.toFixed(1)+' km/h</span></div>'
    : '';
  barWrap.innerHTML=targetLine+barsHtml;

  if(!full.length){
    svg.innerHTML='';
    legend.innerHTML=state.riders.map(n=>'<span><i style="background:'+riderColor(n)+'"></i>'+n+(state.activeRiders.includes(n)?"":" (OUT)")+'</span>').join("");
    return;
  }

  const all=full.flatMap(x=>x.splitData.map(d=>d.speedKph));
  const targetForChart=targetSpeedKph();
  const globalMin=Math.min(...all,targetForChart||Infinity);
  const globalMax=Math.max(...all,targetForChart||-Infinity);
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
  if(targetForChart){
    const ty=y(targetForChart);
    svgHtml+='<line x1="'+left+'" y1="'+ty+'" x2="'+(W-right)+'" y2="'+ty+'" class="target-speed-line"/>';
    svgHtml+='<text x="'+(W-right-4)+'" y="'+(ty-6)+'" class="target-speed-label" text-anchor="end">Target '+targetForChart.toFixed(1)+'</text>';
  }

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
function formatResultTime(ms){
  if(!ms) return "0.00";
  const s=ms/1000;
  return s>=60?fmt(ms):(s.toFixed(2));
}
function resultDateLabel(){
  const d=new Date();
  return d.getFullYear()+" "+String(d.getMonth()+1).padStart(2,"0")+String(d.getDate()).padStart(2,"0");
}
function resultGearingText(){
  if(!state.riders.length) return "—";
  const values=state.riders.map(n=>{
    const g=ensureRiderSetup(n);
    return n+" "+g.chainring+"×"+g.sprocket;
  });
  const unique=[...new Set(state.riders.map(n=>{
    const g=ensureRiderSetup(n); return g.chainring+"×"+g.sprocket;
  }))];
  return unique.length===1?unique[0]:values.join(" / ");
}
function resultEmailBody(){
  const totalDistance=state.laps.at(-1)?.cumulativeDistanceM||0;
  const totalMs=state.laps.at(-1)?.totalMs||currentElapsed();
  const avgSpeed=totalMs?totalDistance/(totalMs/1000)*3.6:0;
  const avgCadence=state.laps.length?state.laps.reduce((s,x)=>s+x.cadenceRpm,0)/state.laps.length:0;
  const lines=[
    "Results: "+resultDateLabel()+" - "+totalDistance.toFixed(1)+" m",
    "",
    "Athlete/Team: "+(state.riders.join(" / ")||"—"),
    "Distance: "+totalDistance.toFixed(1)+" m",
    "Time: "+formatResultTime(totalMs),
    "Gearing: "+resultGearingText(),
    "Average Speed: "+avgSpeed.toFixed(1)+" kph",
    "Average Cadence: "+avgCadence.toFixed(1)+" rpm",
    "",
    "Lap | Distance | Time | Lap Time | vs Previous | Speed | Overall Avg | Cadence | Leader"
  ];
  let cumulative=0;
  state.laps.forEach((x,i)=>{
    cumulative+=x.distanceM;
    const prev=i?state.laps[i-1].lapMs:null;
    const diff=prev==null?0:(x.lapMs-prev)/1000;
    const overall=x.totalMs?cumulative/(x.totalMs/1000)*3.6:0;
    lines.push([
      x.lap,
      cumulative.toFixed(1)+" m",
      formatResultTime(x.totalMs),
      (x.lapMs/1000).toFixed(2),
      (diff>=0?"+":"")+diff.toFixed(2),
      x.speedKph.toFixed(1)+" kph",
      overall.toFixed(1)+" kph",
      x.cadenceRpm.toFixed(1)+" rpm",
      x.leader
    ].join(" | "));
  });
  return lines.join("\n");
}

function render(){
  $("leader").textContent = state.riders[state.leaderIndex] || "—";
  $("leader").style.color = leaderName()?riderColor(leaderName()):"";
  renderTimerController();

  const fullForTimer=buildFullLaps();
  const previousFull=fullForTimer.at(-1);
  const previousFullEl=$("previousFullLap");
  if(previousFullEl) previousFullEl.textContent=previousFull?lapFmt(previousFull.lapMs)+" s":"—";
  const currentFullEl=$("currentFullLapClock");
  if(currentFullEl) currentFullEl.textContent=(currentFullLapElapsed(currentElapsed())/1000).toFixed(3);

  $("status").textContent = state.running ? "計時中" : (state.elapsed>0 ? "已暫停" : "尚未開始");

  const totalDistance=state.laps.at(-1)?.cumulativeDistanceM||0;
  const totalMs=state.laps.at(-1)?.totalMs||currentElapsed();
  const avgSpeed=totalMs?totalDistance/(totalMs/1000)*3.6:0;
  const avgCadence=state.laps.length?state.laps.reduce((s,x)=>s+x.cadenceRpm,0)/state.laps.length:0;

  if($("resultTitle")) $("resultTitle").textContent="Results: "+resultDateLabel()+" - "+totalDistance.toFixed(1)+" m";
  if($("resultAthlete")) $("resultAthlete").textContent=state.riders.join(" / ")||"—";
  if($("resultDistance")) $("resultDistance").textContent=totalDistance.toFixed(1)+" m";
  if($("resultTime")) $("resultTime").textContent=formatResultTime(totalMs);
  if($("resultGearing")) $("resultGearing").textContent=resultGearingText();
  if($("resultAvgSpeed")) $("resultAvgSpeed").textContent=state.laps.length?avgSpeed.toFixed(1)+" kph":"—";
  if($("resultAvgCadence")) $("resultAvgCadence").textContent=state.laps.length?avgCadence.toFixed(1)+" rpm":"—";

  let cumulative=0;
  $("lapsBody").innerHTML = state.laps.map((x,i)=>{
    cumulative+=Number(x.distanceM||0);
    const prev=i?state.laps[i-1].lapMs:null;
    const diff=prev==null?0:(x.lapMs-prev)/1000;
    const overall=x.totalMs?cumulative/(x.totalMs/1000)*3.6:0;
    return '<tr>'+
      '<td>'+x.lap+'</td>'+
      '<td>'+cumulative.toFixed(1)+'</td>'+
      '<td>'+formatResultTime(x.totalMs)+'</td>'+
      '<td>'+(x.lapMs/1000).toFixed(2)+'</td>'+
      '<td>'+(diff>=0?"+":"")+diff.toFixed(2)+'</td>'+
      '<td>'+x.speedKph.toFixed(1)+'</td>'+
      '<td>'+overall.toFixed(1)+'</td>'+
      '<td>'+x.cadenceRpm.toFixed(1)+'</td>'+
      '<td style="color:'+riderColor(x.leader)+';font-weight:800">'+x.leader+'</td>'+
    '</tr>';
  }).join("");

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
$("outBtnTop").addEventListener("click",()=>{
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
  if($("segmentClock")) $("segmentClock").textContent="0.000";
  if($("currentFullLapClock")) $("currentFullLapClock").textContent="0.000";
  if($("previousFullLap")) $("previousFullLap").textContent="—";
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
    ["split","distance_m","segment_time_s","total_time_s","leader","pull","speed_kph","delta_target_kph","cadence_rpm"],
    ...state.laps.map(x=>[
      x.lap,
      x.cumulativeDistanceM.toFixed(3),
      (x.lapMs/1000).toFixed(3),
      (x.totalMs/1000).toFixed(3),
      x.leader,
      x.pull,
      x.speedKph.toFixed(2),
      (x.speedKph-targetSpeedKph()).toFixed(2),
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
  const target=targetSpeedKph();
  const speeds=state.laps.map(x=>x.speedKph);
  const minV=Math.min(...speeds,target||Infinity);
  const maxV=Math.max(...speeds,target||-Infinity);
  const range=Math.max(0.1,maxV-minV);
  const left=70,right=20,top=38,bottom=78;
  const plotH=height-top-bottom;
  const barW=Math.max(10,(width-left-right)/state.laps.length*0.72);
  const gap=(width-left-right)/state.laps.length;
  const yFor=v=>top+plotH-((v-minV)/range)*plotH;

  ctx.strokeStyle="#d1d5db";ctx.fillStyle="#374151";ctx.font="14px sans-serif";
  for(let i=0;i<5;i++){
    const v=minV+(range/4)*i;
    const y=yFor(v);
    ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(width-right,y);ctx.stroke();
    ctx.fillText(v.toFixed(1),8,y+5);
  }

  state.laps.forEach((d,i)=>{
    const x=left+i*gap+(gap-barW)/2;
    const y=yFor(d.speedKph);
    const h=(top+plotH)-y;
    ctx.fillStyle=riderColor(d.leader);
    ctx.fillRect(x,y,barW,h);
    if(target && d.speedKph<target){
      ctx.strokeStyle="#d32f2f";
      ctx.lineWidth=2;
      ctx.strokeRect(x,y,barW,h);
    }
    ctx.save();ctx.translate(x+barW/2,height-bottom+8);ctx.rotate(-Math.PI/2);
    ctx.fillStyle="#374151";ctx.font="11px sans-serif";ctx.fillText("S"+(i+1),0,0);ctx.restore();
  });

  if(target){
    const ty=yFor(target);
    ctx.save();
    ctx.strokeStyle="#111111";
    ctx.lineWidth=1.5;
    ctx.setLineDash([8,5]);
    ctx.beginPath();ctx.moveTo(left,ty);ctx.lineTo(width-right,ty);ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle="#111111";ctx.font="bold 13px sans-serif";
    ctx.fillText("Target "+target.toFixed(1)+" km/h",Math.max(left,width-right-155),ty-7);
    ctx.restore();
  }

  ctx.fillStyle="#111827";ctx.font="bold 20px sans-serif";
  ctx.fillText("Continuous segment speed (km/h)",left,24);
  return canvas;
}
const savedResultEmail=localStorage.getItem("trackCyclingResultEmail");
if(savedResultEmail && $("resultEmail")) $("resultEmail").value=savedResultEmail;
$("resultEmail")?.addEventListener("input",()=>localStorage.setItem("trackCyclingResultEmail",$("resultEmail").value.trim()));
$("emailResultBtn")?.addEventListener("click",()=>{
  if(!state.laps.length) return alert("目前沒有計時結果");
  const to=$("resultEmail")?.value.trim()||"";
  const totalDistance=state.laps.at(-1)?.cumulativeDistanceM||0;
  const subject="Results: "+resultDateLabel()+" - "+totalDistance.toFixed(1)+" m";
  const body=resultEmailBody();
  window.location.href="mailto:"+encodeURIComponent(to)+"?subject="+encodeURIComponent(subject)+"&body="+encodeURIComponent(body);
});

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

  const ws=wb.addWorksheet("Results",{
    pageSetup:{
      paperSize:9,
      orientation:"landscape",
      fitToPage:true,
      fitToWidth:1,
      fitToHeight:1,
      horizontalCentered:true,
      verticalCentered:false,
      margins:{left:0.18,right:0.18,top:0.22,bottom:0.22,header:0.08,footer:0.08}
    }
  });
  ws.views=[{showGridLines:false}];
  ws.properties.defaultRowHeight=17;

  // A:I is the entire printable report. No hidden wide data area.
  const widths=[7,12,12,12,16,14,15,14,18];
  widths.forEach((w,i)=>ws.getColumn(i+1).width=w);

  const totalDistance=state.laps.at(-1)?.cumulativeDistanceM||0;
  const totalMs=state.laps.at(-1)?.totalMs||currentElapsed();
  const avgSpeed=totalMs?totalDistance/(totalMs/1000)*3.6:0;
  const avgCadence=state.laps.length?state.laps.reduce((s,x)=>s+x.cadenceRpm,0)/state.laps.length:0;
  const target=targetSpeedKph();

  // Title
  ws.mergeCells("A1:I1");
  ws.getCell("A1").value="Results: "+resultDateLabel()+" - "+totalDistance.toFixed(1)+" m";
  ws.getCell("A1").font={bold:true,size:18,color:{argb:"FFFFFFFF"}};
  ws.getCell("A1").fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF1F2937"}};
  ws.getCell("A1").alignment={horizontal:"left",vertical:"middle"};
  ws.getRow(1).height=28;

  // Legacy-app style summary: labels at left, value beside them, only once.
  const summaryRows=[
    ["Athlete/Team",state.riders.join(" / ")||"—"],
    ["Distance",totalDistance.toFixed(1)+" m"],
    ["Time",formatResultTime(totalMs)],
    ["Gearing",resultGearingText()],
    ["Average Speed",avgSpeed.toFixed(1)+" kph"],
    ["Average Cadence",avgCadence.toFixed(1)+" rpm"]
  ];
  summaryRows.forEach((r,idx)=>{
    const row=2+idx;
    ws.mergeCells(row,2,row,9);
    ws.getCell(row,1).value=r[0];
    ws.getCell(row,2).value=r[1];
    ws.getCell(row,1).font={bold:true,size:10,color:{argb:"FF374151"}};
    ws.getCell(row,2).font={size:10};
    ws.getCell(row,1).alignment={horizontal:"left"};
    ws.getCell(row,2).alignment={horizontal:"left"};
  });

  // Dynamic result table directly under summary.
  const tableStart=9;
  const headers=["Lap","Distance m","Time","Lap Time","vs Previous","Lap Speed kph","Overall Avg kph","Cadence rpm","Leader"];
  ws.getRow(tableStart).values=headers;
  ws.getRow(tableStart).height=24;
  ws.getRow(tableStart).font={bold:true,color:{argb:"FFFFFFFF"},size:9};
  ws.getRow(tableStart).fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF1F2937"}};
  ws.getRow(tableStart).alignment={horizontal:"center",vertical:"middle",wrapText:true};

  let cumulative=0;
  state.laps.forEach((x,i)=>{
    const row=tableStart+1+i;
    cumulative+=Number(x.distanceM||0);
    const prev=i?state.laps[i-1].lapMs:null;
    const diff=prev==null?0:(x.lapMs-prev)/1000;
    const overall=x.totalMs?cumulative/(x.totalMs/1000)*3.6:0;
    ws.getRow(row).values=[
      x.lap,
      Number(cumulative.toFixed(1)),
      formatResultTime(x.totalMs),
      Number((x.lapMs/1000).toFixed(2)),
      Number(diff.toFixed(2)),
      Number(x.speedKph.toFixed(1)),
      Number(overall.toFixed(1)),
      Number(x.cadenceRpm.toFixed(1)),
      x.leader
    ];
    ws.getRow(row).font={size:8.5};
    ws.getRow(row).alignment={vertical:"middle"};
    ws.getCell(row,9).font={bold:true,color:{argb:"FF"+riderColor(x.leader).replace("#","")}};
    if(target && x.speedKph<target){
      for(let c=1;c<=9;c++){
        ws.getCell(row,c).border={
          top:{style:"thin",color:{argb:"FFEF4444"}},
          left:{style:"thin",color:{argb:"FFEF4444"}},
          bottom:{style:"thin",color:{argb:"FFEF4444"}},
          right:{style:"thin",color:{argb:"FFEF4444"}}
        };
      }
    }
  });

  // Speed chart goes LAST, like a report footer, not between summary and table.
  const chartTitleRow=tableStart+state.laps.length+2;
  ws.mergeCells(chartTitleRow,1,chartTitleRow,9);
  ws.getCell(chartTitleRow,1).value="Segment Speed Profile";
  ws.getCell(chartTitleRow,1).font={bold:true,size:10,color:{argb:"FFFFFFFF"}};
  ws.getCell(chartTitleRow,1).fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF334155"}};

  try{
    const canvas=makeChartCanvas();
    const imageId=wb.addImage({base64:canvas.toDataURL("image/png"),extension:"png"});
    ws.addImage(imageId,{tl:{col:0,row:chartTitleRow},ext:{width:960,height:250}});
  }catch(e){}

  const endRow=chartTitleRow+15;
  ws.pageSetup.printArea="A1:I"+endRow;
  ws.pageSetup.fitToWidth=1;
  ws.pageSetup.fitToHeight=1;
  ws.pageSetup.horizontalCentered=true;

  const buffer=await wb.xlsx.writeBuffer();
  const blob=new Blob([buffer],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
  const filename="track-results-"+resultDateLabel().replaceAll(" ","-")+"-"+totalDistance.toFixed(0)+"m.xlsx";
  const file=new File([blob],filename,{type:blob.type});

  // iPad/iPhone: prefer system Share Sheet. This lets Mail/Gmail receive the xlsx as an attachment.
  try{
    if(navigator.canShare && navigator.canShare({files:[file]}) && navigator.share){
      await navigator.share({
        title:"Results: "+resultDateLabel()+" - "+totalDistance.toFixed(1)+" m",
        text:"Track cycling timing results",
        files:[file]
      });
      return;
    }
  }catch(e){
    if(e && e.name==="AbortError") return;
  }

  // Desktop / unsupported browser fallback.
  const a=document.createElement("a");
  const url=URL.createObjectURL(blob);
  a.href=url;
  a.download=filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1500);
});

function actionDisplay(action){
  if(action==="startStop") return state.running?"STOP":"START";
  return CONTROLLER_LABELS[action]||"未指定";
}
function actionSelectText(action){
  return action==="startStop"?"START/STOP":(CONTROLLER_LABELS[action]||action);
}
function migrateOldControllerMap(){
  let old={};
  try{ old=JSON.parse(localStorage.getItem("trackCyclingControllerMap")||"{}"); }catch(e){}
  const migrated={};
  for(const slot of CONTROLLER_SLOT_ORDER){
    const action=DEFAULT_SLOT_ACTIONS[slot];
    migrated[slot]={action,signature:old[action]?.signature||"",label:old[action]?.label||""};
  }
  return migrated;
}
function loadControllerMap(){
  try{ controllerSlots=JSON.parse(localStorage.getItem("trackCyclingControllerSlots")||"null")||migrateOldControllerMap(); }
  catch(e){ controllerSlots=migrateOldControllerMap(); }
  for(const slot of CONTROLLER_SLOT_ORDER){
    if(!controllerSlots[slot]) controllerSlots[slot]={action:DEFAULT_SLOT_ACTIONS[slot],signature:"",label:""};
    if(!controllerSlots[slot].action) controllerSlots[slot].action=DEFAULT_SLOT_ACTIONS[slot];
  }
}
function saveControllerMap(){
  localStorage.setItem("trackCyclingControllerSlots",JSON.stringify(controllerSlots));
}
function renderTimerController(){
  CONTROLLER_SLOT_ORDER.forEach(slot=>{
    const action=controllerSlots[slot]?.action||DEFAULT_SLOT_ACTIONS[slot];
    const el=document.querySelector('[data-timer-label="'+slot+'"]');
    if(el) el.textContent=actionDisplay(action);
  });
}
function renderControllerMap(){
  CONTROLLER_SLOT_ORDER.forEach(slot=>{
    const slotData=controllerSlots[slot]||{action:DEFAULT_SLOT_ACTIONS[slot],signature:"",label:""};
    const setupLabel=document.querySelector('[data-slot-label="'+slot+'"]');
    const sig=document.querySelector('[data-slot-sig="'+slot+'"]');
    if(setupLabel) setupLabel.textContent=actionSelectText(slotData.action);
    if(sig) sig.textContent=slotData.label||"未設定";
    const sel=document.querySelector('.slot-action-select[data-slot="'+slot+'"]');
    if(sel){
      if(!sel.options.length){
        sel.innerHTML=ACTION_OPTIONS.map(a=>'<option value="'+a+'">'+actionSelectText(a)+'</option>').join("");
      }
      sel.value=slotData.action;
    }
  });
  document.querySelectorAll(".slot-learn").forEach(btn=>{
    btn.classList.toggle("learning",btn.dataset.slot===controllerLearnSlot);
  });
  const summary=$("controllerSummaryState");
  if(summary){
    const mapped=CONTROLLER_SLOT_ORDER.filter(s=>controllerSlots[s]?.signature).length;
    summary.textContent=mapped+"/6 已設定";
  }
  renderTimerController();
}
function executeAction(action){
  const targetId=CONTROLLER_ACTIONS[action];
  const target=targetId?$(targetId):null;
  if(target && !target.disabled){ target.click(); return true; }
  return false;
}
function controllerInput(signature,label){
  const monitor=$("lastControllerInput");
  if(monitor) monitor.textContent=label;
  if(controllerLearnSlot){
    controllerSlots[controllerLearnSlot].signature=signature;
    controllerSlots[controllerLearnSlot].label=label;
    saveControllerMap();
    const learnedSlot=controllerLearnSlot;
    controllerLearnSlot=null;
    const hint=$("controllerLearnHint");
    if(hint) hint.textContent="已記住 "+learnedSlot+" 的實體按鍵，可繼續設定其他位置。";
    renderControllerMap();
    return true;
  }
  const slot=CONTROLLER_SLOT_ORDER.find(s=>controllerSlots[s]?.signature===signature);
  if(!slot) return false;
  return executeAction(controllerSlots[slot].action);
}
document.querySelectorAll(".slot-learn").forEach(btn=>{
  btn.addEventListener("click",()=>{
    controllerLearnSlot=btn.dataset.slot;
    const hint=$("controllerLearnHint");
    if(hint) hint.textContent="請現在按下實體控制器的這一顆按鍵…";
    renderControllerMap();
  });
});
document.querySelectorAll(".slot-action-select").forEach(sel=>{
  sel.addEventListener("change",()=>{
    const slot=sel.dataset.slot;
    controllerSlots[slot].action=sel.value;
    saveControllerMap();
    renderControllerMap();
  });
});
document.querySelectorAll(".timer-slot-button").forEach(btn=>{
  btn.addEventListener("click",()=>{
    const slot=btn.dataset.timerSlot;
    executeAction(controllerSlots[slot]?.action||DEFAULT_SLOT_ACTIONS[slot]);
  });
});
$("clearControllerMap")?.addEventListener("click",()=>{
  controllerSlots={};
  for(const slot of CONTROLLER_SLOT_ORDER){
    controllerSlots[slot]={action:DEFAULT_SLOT_ACTIONS[slot],signature:"",label:""};
  }
  controllerLearnSlot=null;
  saveControllerMap();
  renderControllerMap();
  $("controllerLearnHint").textContent="按鍵設定已清除；功能位置已恢復預設。";
});
document.addEventListener("keydown",e=>{
  if(e.repeat) return;
  const signature="key:"+e.code;
  const label=(e.code||"Key")+" · "+(e.key||"");
  const inForm=["INPUT","TEXTAREA","SELECT"].includes(document.activeElement?.tagName);
  if(controllerLearnSlot){
    e.preventDefault();
    controllerInput(signature,label);
    return;
  }
  if(inForm) return;
  const handled=controllerInput(signature,label);
  if(handled) e.preventDefault();
},{capture:true});

function pollGamepads(){
  const pads=(navigator.getGamepads?navigator.getGamepads():[])||[];
  for(const gp of pads){
    if(!gp) continue;
    gp.buttons.forEach((b,i)=>{
      const key="gp"+gp.index+"b"+i;
      const pressed=!!b.pressed;
      if(pressed && !gamepadPrev[key]){
        controllerInput("gamepad:button:"+i,"Gamepad B"+i);
      }
      gamepadPrev[key]=pressed;
    });
  }
  requestAnimationFrame(pollGamepads);
}
window.addEventListener("gamepadconnected",e=>{
  const monitor=$("lastControllerInput");
  if(monitor) monitor.textContent="Gamepad connected: "+(e.gamepad.id||"controller");
});
loadControllerMap();
renderControllerMap();
requestAnimationFrame(pollGamepads);

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
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
  $("startingLeader").innerHTML = names.map((n,i)=>'<option value="'+i+'">'+n+'</option>').join("");
  if(names.length){
    state.leaderIndex = Math.min(state.leaderIndex, names.length-1);
    $("startingLeader").value = state.leaderIndex;
  }
  renderGearTable();
  render();
  save();
}
function buildFullLaps(){
  if($("segmentPreset").value!=="quarter") return [];
  const full=[];
  const track=Number($("trackLength").value)||250;
  for(let i=0;i+3<state.laps.length;i+=4){
    const group=state.laps.slice(i,i+4);
    const lapMs=group.reduce((sum,x)=>sum+x.lapMs,0);
    const end=group[3];
    const leaders=[];
    group.forEach(x=>{ if(leaders.at(-1)!==x.leader) leaders.push(x.leader); });
    full.push({
      lap:full.length+1,
      distanceM:group.reduce((sum,x)=>sum+x.distanceM,0),
      lapMs,
      totalMs:end.totalMs,
      splits:group.map(x=>(x.lapMs/1000).toFixed(3)),
      leaders,
      speedKph:speedKph(track,lapMs)
    });
  }
  return full;
}
function renderQuarterCharts(){
  const full=buildFullLaps();
  const bars=$("quarterBars");
  const svg=$("quarterCompareChart");
  const legend=$("chartLegend");
  if(!full.length){
    bars.innerHTML='<div class="empty-chart">完成 4 個 1/4 圈 split 後會出現圖表。</div>';
    svg.innerHTML='';
    legend.innerHTML='';
    return;
  }

  const all=full.flatMap(x=>x.splits.map(Number));
  const globalMin=Math.min(...all);
  const globalMax=Math.max(...all);
  const range=Math.max(0.001,globalMax-globalMin);

  bars.innerHTML=full.map(lap=>{
    const splitNums=lap.splits.map(Number);
    const leaderText=lap.leaders.join(" → ");
    const cols=splitNums.map((v,i)=>{
      const h=32+((v-globalMin)/range)*88;
      return '<div class="qcol"><div class="qvalue">'+v.toFixed(3)+'s</div><div class="qbar" style="height:'+h.toFixed(1)+'px"></div><div class="qlabel">Q'+(i+1)+'</div></div>';
    }).join("");
    return '<div class="lap-chart-card"><div class="lap-chart-title">Lap '+lap.lap+' · '+lapFmt(lap.lapMs)+'s</div><div class="lap-chart-leader">'+leaderText+'</div><div class="qgrid">'+cols+'</div></div>';
  }).join("");

  const W=720,H=320,left=54,right=20,top=24,bottom=46;
  const plotW=W-left-right,plotH=H-top-bottom;
  const xs=[0,1,2,3].map(i=>left+(plotW/3)*i);
  const y=v=>top+((globalMax-v)/range)*plotH;

  let svgHtml='';
  for(let i=0;i<5;i++){
    const val=globalMin+(range/4)*i;
    const yy=y(val);
    svgHtml+='<line x1="'+left+'" y1="'+yy+'" x2="'+(W-right)+'" y2="'+yy+'" class="chart-grid"/>';
    svgHtml+='<text x="'+(left-8)+'" y="'+(yy+4)+'" class="chart-axis" text-anchor="end">'+val.toFixed(2)+'</text>';
  }
  xs.forEach((x,i)=>{
    svgHtml+='<text x="'+x+'" y="'+(H-16)+'" class="chart-axis" text-anchor="middle">Q'+(i+1)+'</text>';
  });

  full.forEach((lap,idx)=>{
    const vals=lap.splits.map(Number);
    const points=vals.map((v,i)=>xs[i]+','+y(v)).join(' ');
    const hue=(idx*67)%360;
    svgHtml+='<polyline points="'+points+'" fill="none" stroke="hsl('+hue+' 80% 65%)" stroke-width="3" vector-effect="non-scaling-stroke"/>';
    vals.forEach((v,i)=>{
      svgHtml+='<circle cx="'+xs[i]+'" cy="'+y(v)+'" r="4" fill="hsl('+hue+' 80% 65%)"/>';
    });
  });
  svgHtml+='<text x="12" y="16" class="chart-axis">秒</text>';
  svg.innerHTML=svgHtml;

  legend.innerHTML=full.map((lap,idx)=>{
    const hue=(idx*67)%360;
    return '<span><i style="background:hsl('+hue+' 80% 65%)"></i>Lap '+lap.lap+' ('+lapFmt(lap.lapMs)+'s)</span>';
  }).join("");
}

function renderFullLaps(){
  const full=buildFullLaps();
  $("fullLapCount").textContent=full.length;
  const last=full.at(-1);
  $("lastFullLap").textContent=last?lapFmt(last.lapMs):"—";
  $("lastFullLapSpeed").textContent=last?last.speedKph.toFixed(1)+" km/h":"—";
  $("fullLapsBody").innerHTML=[...full].reverse().map(x =>
    '<tr><td>'+x.lap+'</td><td>'+x.distanceM.toFixed(1)+'</td><td>'+lapFmt(x.lapMs)+'</td><td>'+fmt(x.totalMs)+'</td><td>'+x.splits.join(" / ")+'</td><td>'+x.leaders.join(" → ")+'</td><td>'+x.speedKph.toFixed(1)+'</td></tr>'
  ).join("");
  renderQuarterCharts();
}
function render(){
  $("leader").textContent = state.riders[state.leaderIndex] || "—";
  $("lapCount").textContent = state.laps.length;
  const last = state.laps.at(-1);
  $("lastLap").textContent = last ? lapFmt(last.lapMs) : "—";
  $("lastSpeed").textContent = last ? last.speedKph.toFixed(1)+" km/h" : "—";
  $("lastCadence").textContent = last ? last.cadenceRpm.toFixed(1)+" rpm" : "—";
  $("delta").textContent = last ? (last.delta>=0?"+":"") + last.delta.toFixed(2)+"s" : "—";
  $("startStopBtn").textContent = state.running ? "STOP" : "START";
  $("status").textContent = state.running ? "計時中" : (state.elapsed>0 ? "已暫停" : "尚未開始");
  $("lapsBody").innerHTML = [...state.laps].reverse().map(x =>
    '<tr><td>'+x.lap+'</td><td>'+x.cumulativeDistanceM.toFixed(3).replace(/\.000$/,"")+'</td><td>'+x.distanceM.toFixed(3).replace(/\.000$/,"")+'</td><td>'+lapFmt(x.lapMs)+'</td><td>'+fmt(x.totalMs)+'</td><td>'+x.leader+'</td><td>'+x.chainring+'×'+x.sprocket+'</td><td>'+x.speedKph.toFixed(1)+'</td><td>'+x.cadenceRpm.toFixed(1)+'</td><td>'+(x.delta>=0?"+":"")+x.delta.toFixed(2)+'</td></tr>'
  ).join("");
  renderFullLaps();
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
  state.pull = 1;
  render();
  save();
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
  render();
  save();
});
$("changeBtn").addEventListener("click",()=>{
  if(!state.riders.length) return;
  const t = currentElapsed();
  const from = state.riders[state.leaderIndex];
  state.leaderIndex = (state.leaderIndex+1)%state.riders.length;
  state.pull += 1;
  state.events.push({type:"change",atMs:t,from,to:state.riders[state.leaderIndex],pull:state.pull});
  render();
  save();
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
  render();
  $("clock").textContent="00:00.000";
  save();
});
$("exportBtn").addEventListener("click",()=>{
  if(!state.laps.length) return alert("目前沒有圈速資料");
  const full=buildFullLaps();
  const rows=[
    ["record_type","split_or_lap","cumulative_distance_m","segment_distance_m","time_s","cumulative_time_s","leader_or_sequence","pull","chainring","sprocket","tire","circumference_mm","rollout_m","speed_kph","cadence_rpm","delta_target_s","quarter_splits"],
    ...state.laps.map(x=>[
      "split",x.lap,x.cumulativeDistanceM.toFixed(3),x.distanceM.toFixed(3),(x.lapMs/1000).toFixed(3),(x.totalMs/1000).toFixed(3),x.leader,x.pull,
      x.chainring,x.sprocket,x.tire,x.circumferenceMm,x.rolloutM.toFixed(3),x.speedKph.toFixed(2),x.cadenceRpm.toFixed(1),x.delta.toFixed(3),""
    ]),
    ...full.map(x=>[
      "full_lap",x.lap,(x.lap*Number($("trackLength").value)).toFixed(3),x.distanceM.toFixed(3),(x.lapMs/1000).toFixed(3),(x.totalMs/1000).toFixed(3),x.leaders.join(" > "),"","","","","","",x.speedKph.toFixed(2),"","",x.splits.join(" / ")
    ])
  ];
  const csv = rows.map(r=>r.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(",")).join("\n");
  const blob = new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "track-session-"+new Date().toISOString().replaceAll(":","-")+".csv";
  a.click();
  URL.revokeObjectURL(a.href);
});

window.addEventListener("beforeunload",save);
const saved = localStorage.getItem("trackCyclingTimer");
if(saved){
  try{
    Object.assign(state,JSON.parse(saved));
    if(!state.riderSetup) state.riderSetup={};
    $("riders").value = state.riders.join("\n");
    renderRoster();
    $("startingLeader").value = state.leaderIndex;
  }catch(e){}
}
render();
refreshClock();
if("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js");
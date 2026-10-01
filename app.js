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
    '<tr><td>'+x.lap+'</td><td>'+x.distanceM.toFixed(0)+'</td><td>'+lapFmt(x.lapMs)+'</td><td>'+fmt(x.totalMs)+'</td><td>'+x.leader+'</td><td>'+x.chainring+'×'+x.sprocket+'</td><td>'+x.speedKph.toFixed(1)+'</td><td>'+x.cadenceRpm.toFixed(1)+'</td><td>'+(x.delta>=0?"+":"")+x.delta.toFixed(2)+'</td></tr>'
  ).join("");
}

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
  const distanceM = Number($("trackLength").value)||250;
  const leader = state.riders[state.leaderIndex] || "";
  const g = {...ensureRiderSetup(leader)};
  const speed = speedKph(distanceM, lapMs);
  const cadence = cadenceRpm(speed, g);

  state.laps.push({
    lap:state.laps.length+1,
    distanceM,
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
  const rows=[
    ["lap","distance_m","lap_time_s","cumulative_s","leader","pull","chainring","sprocket","tire","circumference_mm","rollout_m","speed_kph","cadence_rpm","delta_target_s"],
    ...state.laps.map(x=>[
      x.lap,x.distanceM.toFixed(0),(x.lapMs/1000).toFixed(3),(x.totalMs/1000).toFixed(3),x.leader,x.pull,
      x.chainring,x.sprocket,x.tire,x.circumferenceMm,x.rolloutM.toFixed(3),x.speedKph.toFixed(2),x.cadenceRpm.toFixed(1),x.delta.toFixed(3)
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
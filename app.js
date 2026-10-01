const $=id=>document.getElementById(id);
let state={riders:[],leaderIndex:0,running:false,startAt:0,elapsed:0,lastLapAt:0,pull:1,laps:[],events:[]};
let raf=null;

function now(){return performance.now()}
function fmt(ms){const total=Math.max(0,ms);const m=Math.floor(total/60000);const s=Math.floor((total%60000)/1000);const x=Math.floor(total%1000);return \`\${String(m).padStart(2,"0")}:\${String(s).padStart(2,"0")}.\${String(x).padStart(3,"0")}\`}
function lapFmt(ms){return (ms/1000).toFixed(3)}
function save(){localStorage.setItem("trackCyclingTimer",JSON.stringify({...state,running:false,startAt:0}))}
function currentElapsed(){return state.running?state.elapsed+(now()-state.startAt):state.elapsed}
function refreshClock(){$("clock").textContent=fmt(currentElapsed());if(state.running)raf=requestAnimationFrame(refreshClock)}
function renderRoster(){
  const names=$("riders").value.split(/\n|,/).map(x=>x.trim()).filter(Boolean);
  state.riders=names;
  $("startingLeader").innerHTML=names.map((n,i)=>\`<option value="\${i}">\${n}</option>\`).join("");
  if(names.length){state.leaderIndex=Math.min(state.leaderIndex,names.length-1);$("startingLeader").value=state.leaderIndex}
  render();save();
}
function render(){
  $("leader").textContent=state.riders[state.leaderIndex]||"—";
  $("lapCount").textContent=state.laps.length;
  const last=state.laps.at(-1);
  $("lastLap").textContent=last?lapFmt(last.lapMs):"—";
  $("delta").textContent=last?\`\${last.delta>=0?"+":""}\${last.delta.toFixed(2)}s\`:"—";
  $("startStopBtn").textContent=state.running?"STOP":"START";
  $("status").textContent=state.running?"計時中":(state.elapsed>0?"已暫停":"尚未開始");
  $("lapsBody").innerHTML=[...state.laps].reverse().map(x=>\`<tr><td>\${x.lap}</td><td>\${lapFmt(x.lapMs)}</td><td>\${fmt(x.totalMs)}</td><td>\${x.leader}</td><td>\${x.pull}</td><td>\${x.delta>=0?"+":""}\${x.delta.toFixed(2)}</td></tr>\`).join("");
}
$("prepareBtn").addEventListener("click",()=>{renderRoster();state.leaderIndex=Number($("startingLeader").value||0);state.pull=1;render();save()});
$("startingLeader").addEventListener("change",()=>{state.leaderIndex=Number($("startingLeader").value);render();save()});
$("startStopBtn").addEventListener("click",()=>{
  if(!state.riders.length){renderRoster();if(!state.riders.length)return alert("請先輸入選手名稱")}
  if(!state.running){state.running=true;state.startAt=now();if(state.elapsed===0)state.lastLapAt=0}
  else{state.elapsed=currentElapsed();state.running=false;cancelAnimationFrame(raf)}
  state.events.push({type:state.running?"start":"stop",atMs:currentElapsed(),leader:state.riders[state.leaderIndex]});
  render();refreshClock();save();
});
$("lapBtn").addEventListener("click",()=>{
  if(!state.running)return;
  const total=currentElapsed();const lapMs=total-state.lastLapAt;state.lastLapAt=total;
  const target=(Number($("targetLap").value)||0)*1000;
  state.laps.push({lap:state.laps.length+1,lapMs,totalMs:total,leader:state.riders[state.leaderIndex]||"",pull:state.pull,delta:target?(lapMs-target)/1000:0});
  state.events.push({type:"lap",atMs:total,leader:state.riders[state.leaderIndex],pull:state.pull});
  render();save();
});
$("changeBtn").addEventListener("click",()=>{
  if(!state.riders.length)return;
  const t=currentElapsed();const from=state.riders[state.leaderIndex];
  state.leaderIndex=(state.leaderIndex+1)%state.riders.length;state.pull+=1;
  state.events.push({type:"change",atMs:t,from,to:state.riders[state.leaderIndex],pull:state.pull});
  render();save();
});
$("undoBtn").addEventListener("click",()=>{if(state.laps.length){state.laps.pop();state.lastLapAt=state.laps.at(-1)?.totalMs||0;render();save()}});
$("resetBtn").addEventListener("click",()=>{
  if(!confirm("確定清除本次計時？"))return;
  cancelAnimationFrame(raf);state.running=false;state.startAt=0;state.elapsed=0;state.lastLapAt=0;state.pull=1;state.laps=[];state.events=[];render();$("clock").textContent="00:00.000";save();
});
$("exportBtn").addEventListener("click",()=>{
  if(!state.laps.length)return alert("目前沒有圈速資料");
  const rows=[["lap","lap_time_s","cumulative_s","leader","pull","delta_target_s"],...state.laps.map(x=>[x.lap,(x.lapMs/1000).toFixed(3),(x.totalMs/1000).toFixed(3),x.leader,x.pull,x.delta.toFixed(3)])];
  const csv=rows.map(r=>r.map(v=>\`"\${String(v).replaceAll('"','""')}"\`).join(",")).join("\n");
  const blob=new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=\`track-session-\${new Date().toISOString().replaceAll(":","-")}.csv\`;a.click();URL.revokeObjectURL(a.href);
});
window.addEventListener("beforeunload",save);
const saved=localStorage.getItem("trackCyclingTimer");
if(saved){try{Object.assign(state,JSON.parse(saved));$("riders").value=state.riders.join("\n");renderRoster();$("startingLeader").value=state.leaderIndex}catch{}}
render();refreshClock();
if("serviceWorker" in navigator)navigator.serviceWorker.register("./sw.js");
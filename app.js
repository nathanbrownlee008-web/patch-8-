const $ = (id) => document.getElementById(id);

// LocalStorage helpers
function getData(key){
  const d = localStorage.getItem(key);
  return d ? JSON.parse(d) : [];
}
function saveData(key, rows){
  localStorage.setItem(key, JSON.stringify(rows));
}

// Global state
const state = {
  datasets: [],
  current: null,
  raw: [],
  columns: []
};

// Load dataset
async function loadDataset(slug){
  const ds = state.datasets.find(d=>d.slug===slug);
  if(!ds) return;

  state.current = ds;

  try{
    const res = await fetch(ds.file, {cache:"no-store"});
    const json = await res.json();

    const storageKey = slug.replace(/-/g,"_") + "_data";
    const stored = getData(storageKey);

    state.raw = stored.length ? stored : (json.rows || []);
    state.columns = state.raw.length ? Object.keys(state.raw[0]) : (json.columns || []);

  }catch(e){
    console.error("Dataset load error:", e);
    state.raw = [];
    state.columns = [];
  }

  render();
}

// Render logic
function render(){
  buildTable();
  if(state.current.slug === "bet-history"){
    showHistoryStats();
  } else {
    hideHistoryStats();
  }
}

function buildTable(){
  const thead = $("tbl").querySelector("thead");
  const tbody = $("tbl").querySelector("tbody");
  thead.innerHTML = "";
  tbody.innerHTML = "";

  if(!state.columns.length) return;

  const trh = document.createElement("tr");
  state.columns.forEach(c=>{
    const th = document.createElement("th");
    th.textContent = c;
    trh.appendChild(th);
  });
  thead.appendChild(trh);

  state.raw.forEach(r=>{
    const tr = document.createElement("tr");
    tr.onclick = ()=> openDetails(r);

    state.columns.forEach(c=>{
      const td = document.createElement("td");

      if(state.current.slug === "bet-history" && c === "Result"){
        const sel = document.createElement("select");
        ["","win","loss","void"].forEach(v=>{
          const opt = document.createElement("option");
          opt.value = v;
          opt.textContent = v.toUpperCase();
          if(r[c] === v) opt.selected = true;
          sel.appendChild(opt);
        });
        sel.onchange = ()=>{
          r[c] = sel.value;
          saveData("bet_history_data", state.raw);
          render();
        };
        td.appendChild(sel);
      } else {
        td.textContent = r[c] ?? "";
      }

      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
}

// Add to Bet History
function addToHistory(row){
  const history = getData("bet_history_data");

  history.push({
    "Date": row["DateUTC (date)"] || "",
    "League": row["League"] || "",
    "Fixture": (row["Home"]+" vs "+row["Away"]) || "",
    "Market": row["Market"] || "",
    "Odds Taken": row["Bookmaker Odds"] || "",
    "Stake": "",
    "Result": "",
    "Profit": ""
  });

  saveData("bet_history_data", history);
  alert("Added to history!");
  if(state.current.slug === "bet-history"){
    loadDataset("bet-history");
  }
}

let historyChart = null;

function calculateHistoryStats(){
  const all = state.raw;
  const validBets = all.filter(r=>r.Result);

  const totalBets = validBets.length;
  const wins = validBets.filter(r=>r.Result==="win").length;
  const winRate = totalBets ? ((wins / totalBets)*100).toFixed(1) : 0;

  const avgOdds = totalBets ?
    (validBets.reduce((s,r)=>s + (Number(r["Odds Taken"])||0),0)/totalBets).toFixed(2) : 0;

  const totalProfit = validBets.reduce((s,r)=>{
    const stake = Number(r.Stake)||0;
    const odds = Number(r["Odds Taken"])||0;
    let p = 0;
    if(r.Result==="win") p = stake*(odds-1);
    if(r.Result==="loss") p = -stake;
    if(r.Result==="void") p = 0;
    return s + p;
  },0);

  return { totalBets, winRate, avgOdds, totalProfit };
}

function showHistoryStats(){
  $("historyStats").classList.remove("hidden");
  const stats = calculateHistoryStats();
  $("statTotals").innerHTML = `
    Total Bets: ${stats.totalBets} |
    Win Rate: ${stats.winRate}% |
    Avg Odds: ${stats.avgOdds} |
    Profit: £${stats.totalProfit}
  `;

  const sorted = [...state.raw].sort((a,b)=>{
    return new Date(a.Date).getTime() - new Date(b.Date).getTime();
  });

  const labels = sorted.map(r=>r.Date);
  let runningBank = 0;
  const bankLine = [];
  const profitBars = [];

  sorted.forEach(r=>{
    const stake = Number(r.Stake)||0;
    const odds = Number(r["Odds Taken"])||0;
    let p = 0;
    if(r.Result==="win") p = stake*(odds-1);
    if(r.Result==="loss") p = -stake;
    if(r.Result==="void") p = 0;
    runningBank += p;
    bankLine.push(runningBank);
    profitBars.push(p);
  });

  const ctx = document.getElementById("historyChart").getContext("2d");
  if(historyChart) historyChart.destroy();
  historyChart = new Chart(ctx,{
    type:"bar",
    data:{
      labels,
      datasets:[
        { label:"Profit/Loss", data:profitBars, yAxisID:"yBar", backgroundColor:"rgba(75,192,192,0.6)"},
        { label:"Bank", data:bankLine, yAxisID:"yLine", type:"line", borderColor:"rgb(255,99,132)", fill:false }
      ]
    },
    options:{
      scales:{
        yBar:{ type:"linear", position:"left" },
        yLine:{ type:"linear", position:"right" }
      }
    }
  });
}

function hideHistoryStats(){
  $("historyStats").classList.add("hidden");
}

function openDetails(row){
  $("d_body").innerHTML="";
  Object.keys(row).forEach(k=>{
    const p=document.createElement("div");
    p.textContent=`${k}: ${row[k]}`;
    $("d_body").appendChild(p);
  });
  $("details").showModal();
}

async function init(){
  const dsRes = await fetch("datasets.json",{cache:"no-store"});
  state.datasets = await dsRes.json();

  state.datasets.forEach(d=>{
    const b=document.createElement("button");
    b.className="tab";
    b.textContent=d.name;
    b.onclick=()=>loadDataset(d.slug);
    $("tabs").appendChild(b);
  });

  const addBtn=document.createElement("button");
  addBtn.className="btn";
  addBtn.textContent="Add Row";
  addBtn.onclick=()=>openFormEditor(null);
  document.querySelector(".actions").appendChild(addBtn);

  await loadDataset(state.datasets[0]?.slug);
}

init();

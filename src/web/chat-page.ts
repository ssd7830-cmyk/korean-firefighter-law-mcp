/** 단일 HTML 챗봇 화면. 대화 목록은 현재 탭의 sessionStorage에만 저장한다. */
export const CHAT_PAGE_HTML = `<!doctype html>
<html lang="ko">
<head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>소방 AI 도우미</title>
<style>
  :root { --bg:#212121; --side:#171717; --panel:#2f2f2f; --text:#ececec; --sub:#9b9b9b; --accent:#e5533d; } * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family:-apple-system,BlinkMacSystemFont,"Malgun Gothic","Apple SD Gothic Neo",sans-serif; background:var(--bg); color:var(--text); height:100vh; display:flex; }
  #side { width:260px; background:var(--side); display:flex; flex-direction:column; padding:12px; gap:8px; flex-shrink:0; } #convList { flex:1; overflow-y:auto; display:flex; flex-direction:column; gap:2px; }
  #newChat { background:transparent; border:1px solid #444; color:var(--text); border-radius:8px; padding:10px; cursor:pointer; text-align:left; font-size:14px; } #newChat:hover { background:#2a2a2a; }
  .conv { border-radius:8px; font-size:13px; color:var(--sub); display:flex; align-items:center; gap:4px; }
  .conv-open { flex:1; min-width:0; padding:8px 10px; border:0; background:none; color:inherit; text-align:left; cursor:pointer; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .conv:hover,.conv.active { background:#2a2a2a; color:var(--text); } .conv .del { display:none; background:none; border:none; color:var(--sub); cursor:pointer; font-size:12px; padding:0 2px; flex-shrink:0; }
  .conv:hover .del,.conv.active .del { display:block; } .conv .del:hover { color:var(--text); }
  #brand { font-size:12px; color:var(--sub); padding:8px 4px; border-top:1px solid #333; } #main { flex:1; display:flex; flex-direction:column; min-width:0; }
  #mobileBar { display:none; height:50px; align-items:center; padding:6px 12px; border-bottom:1px solid #333; }
  #menu { background:none; border:1px solid #444; border-radius:7px; color:var(--text); padding:7px 10px; cursor:pointer; }
  #chat { flex:1; overflow-y:auto; padding:24px 0; }
  .row { max-width:760px; margin:0 auto 20px; padding:0 20px; display:flex; gap:12px; }
  .avatar { width:30px; height:30px; border-radius:50%; flex-shrink:0; display:flex; align-items:center; justify-content:center; font-size:15px; }
  .user .avatar { background:#444; } .bot .avatar { background:var(--accent); }
  .bubble { line-height:1.7; font-size:15px; white-space:pre-wrap; word-break:break-word; padding-top:3px; min-width:0; }
  .meta { font-size:11px; color:var(--sub); margin-top:6px; }
  #empty { max-width:760px; margin:12vh auto 0; padding:0 20px; text-align:center; color:var(--sub); }
  #empty h1 { color:var(--text); font-size:26px; margin-bottom:10px; }
  #empty .ex { display:inline-block; margin:6px; padding:10px 14px; border:1px solid #444; border-radius:10px; background:transparent; color:var(--sub); font-size:13px; cursor:pointer; }
  #empty .ex:hover { background:var(--panel); }
  #inputWrap { padding:12px 20px 20px; }
  #inputBox { max-width:760px; margin:0 auto; background:var(--panel); border-radius:24px; display:flex; align-items:flex-end; padding:8px 8px 8px 20px; }
  #input { flex:1; background:transparent; border:none; outline:none; color:var(--text); font-size:15px; font-family:inherit; resize:none; max-height:160px; line-height:1.5; padding:8px 0; }
  #send { background:var(--text); color:var(--bg); border:none; border-radius:50%; width:34px; height:34px; cursor:pointer; font-size:16px; flex-shrink:0; }
  #send:disabled { opacity:.3; cursor:default; }
  #notice { max-width:760px; margin:6px auto 0; text-align:center; font-size:11px; color:var(--sub); }
  .md-heading { font-weight:700; font-size:17px; margin:10px 0 4px; } .md-list { padding-left:14px; } .bubble code { background:#333; border-radius:4px; padding:1px 4px; }
  @media (max-width:720px) { #mobileBar { display:flex; }
    #side { display:none; position:fixed; inset:0 auto 0 0; z-index:10; box-shadow:8px 0 24px #0008; } body.side-open #side { display:flex; } }
</style>
</head>
<body>
<div id="side">
  <button id="newChat">＋ 새 대화</button><div id="convList"></div>
  <div id="brand">소방 AI 도우미<br>소방청 공공데이터 · 법제처 국가법령정보 기반</div>
</div>
<div id="main">
  <div id="mobileBar"><button id="menu" aria-label="대화 목록 열기">☰ 대화 목록</button></div>
  <div id="chat">
    <div id="empty">
      <h1>무엇을 도와드릴까요?</h1>
      <div>소방청·법제처 공식 데이터를 조회해서 답합니다</div>
      <div style="margin-top:18px">
        <button class="ex">소방시설법 제10조 알려줘</button><button class="ex">화재예방법 시행령 검색</button>
        <button class="ex">소방시설 판례 찾아줘</button><button class="ex">2025년 1월 1일 화재 현황</button>
      </div>
    </div>
  </div>
  <div id="inputWrap">
    <div id="inputBox">
      <textarea id="input" rows="1" aria-label="질문 입력" placeholder="무엇이든 물어보세요"></textarea>
      <button id="send" aria-label="질문 보내기">↑</button>
    </div>
    <div id="notice">답변은 조회된 공식 데이터를 근거로 생성됩니다. 중요한 판단은 원문을 확인하세요.</div>
  </div>
</div>
<script>
const chat=document.getElementById("chat"),input=document.getElementById("input"),send=document.getElementById("send"),empty=document.getElementById("empty"),convList=document.getElementById("convList");
let convs = [];
try { convs = JSON.parse(sessionStorage.getItem("fire-convs") || "[]"); } catch { convs = []; }
if (!Array.isArray(convs)) convs = [];
convs = convs.filter(c => c && typeof c.title === "string" && Array.isArray(c.msgs)).slice(0, 30).map(c => ({
  title:c.title.slice(0,100), msgs:c.msgs.filter(m => m && (m.role === "user" || m.role === "bot") && typeof m.text === "string")
    .slice(-200).map(m => ({ role:m.role, text:m.text, meta:typeof m.meta === "string" ? m.meta : "" }))
}));
let chatToken = sessionStorage.getItem("fire-chat-token") || "";
let current = null;

function renderList() {
  convList.innerHTML = "";
  convs.forEach((c, i) => {
    const d=document.createElement("div"); d.className="conv"+(current===i ? " active" : "");
    const t=document.createElement("button"); t.className="conv-open"; t.textContent=c.title; t.setAttribute("aria-label","대화 열기: "+c.title);
    const x = document.createElement("button"); x.className = "del"; x.textContent = "✕"; x.title = "대화 삭제";
    x.onclick = (e) => {
      e.stopPropagation(); convs.splice(i, 1);
      if (current === i) current = null; else if (current > i) current--;
      save(); renderList(); renderConv();
    };
    t.onclick = () => { current = i; renderConv(); renderList(); closeSide(); };
    d.appendChild(t); d.appendChild(x);
    convList.appendChild(d);
  });
}
function renderConv() {
  chat.innerHTML = "";
  if (current === null || !convs[current]) { chat.appendChild(empty); return; }
  convs[current].msgs.forEach(m => addRow(m.role, m.text, m.meta, false));
  chat.scrollTop = chat.scrollHeight;
}
function addRow(role, text, meta, scroll = true) {
  const row=document.createElement("div"); row.className="row "+(role === "user" ? "user" : "bot");
  const av=document.createElement("div"); av.className="avatar";
  av.textContent = role === "user" ? "나" : "🚒";
  const b=document.createElement("div"); b.className="bubble";
  if (role === "user") b.textContent = text; else renderSafeMarkdown(b, text);
  if (meta) { const mm = document.createElement("div"); mm.className = "meta"; mm.textContent = meta; b.appendChild(mm); }
  row.appendChild(av); row.appendChild(b); chat.appendChild(row);
  if (scroll) chat.scrollTop = chat.scrollHeight;
  return b;
}
function appendInline(parent, text) {
  const pattern = /(\\*\\*[^*]+\\*\\*|\\x60[^\\x60]+\\x60)/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    parent.appendChild(document.createTextNode(text.slice(last, match.index)));
    const token = match[0], el = document.createElement(token.startsWith("**") ? "strong" : "code");
    el.textContent = token.startsWith("**") ? token.slice(2, -2) : token.slice(1, -1);
    parent.appendChild(el); last = match.index + token.length;
  }
  parent.appendChild(document.createTextNode(text.slice(last)));
}
function renderSafeMarkdown(parent, text) {
  parent.textContent = "";
  text.split("\\n").forEach((line, index) => {
    const el = document.createElement("div");
    if (/^#{1,3}\\s/.test(line)) { el.className = "md-heading"; line = line.replace(/^#{1,3}\\s+/, ""); }
    else if (/^[-*]\\s/.test(line)) { el.className = "md-list"; line = "• " + line.replace(/^[-*]\\s+/, ""); }
    appendInline(el, line); parent.appendChild(el);
    if (index === text.split("\\n").length - 1 && line === "") el.remove();
  });
}
function save() { try { sessionStorage.setItem("fire-convs", JSON.stringify(convs.slice(0, 30))); } catch {} }
function closeSide() { document.body.classList.remove("side-open"); }

async function requestChat(text, history) {
  const headers={ "Content-Type":"application/json" }; if (chatToken) headers.Authorization="Bearer "+chatToken;
  const options = { method: "POST", headers, body: JSON.stringify({ message: text, history }) };
  let res = await fetch("/api/chat", options);
  if (res.status === 401) {
    const entered = window.prompt("접속 토큰을 입력하세요.");
    if (!entered) throw new Error("인증이 필요합니다.");
    chatToken = entered.trim();
    sessionStorage.setItem("fire-chat-token", chatToken);
    headers.Authorization = "Bearer " + chatToken;
    res = await fetch("/api/chat", options);
  }
  if (!res.ok) {
    if (res.status === 429) throw new Error("요청이 너무 많습니다. 1분 후 다시 시도하세요.");
    if (res.status === 401) throw new Error("접속 토큰이 올바르지 않습니다.");
    throw new Error("요청 실패 (HTTP " + res.status + ")");
  }
  return res.json();
}

async function ask(text) {
  if (!text.trim() || send.disabled) return;
  if (current === null) { convs.unshift({ title: text.slice(0, 28), msgs: [] }); current = 0; renderList(); }
  const targetConv = convs[current];
  if (empty.parentNode) empty.remove();
  targetConv.msgs.push({ role: "user", text });
  const history = targetConv.msgs.slice(0, -1).slice(-8).map(m => ({ role: m.role === "user" ? "user" : "assistant", text: m.text }));
  addRow("user", text);
  input.value = ""; input.style.height = "auto"; send.disabled = true;
  const thinking = addRow("bot", "조회 중…");
  // AI 요약을 쓰면 수십 초가 걸릴 수 있어 경과 시간을 보여준다 (멈춘 것으로 오해 방지)
  const startedAt = Date.now();
  const ticker = setInterval(() => {
    if (convs[current] !== targetConv) return;
    const sec = Math.round((Date.now() - startedAt) / 1000);
    thinking.textContent = sec < 5 ? "조회 중…" : "조회하고 답변을 정리하는 중… " + sec + "초";
  }, 1000);
  try {
    const data = await requestChat(text, history);
    const engine = data.provider ? " · " + data.provider + "/" + (data.model || "unknown") : "";
    const meta = (data.mode === "llm" ? "AI 답변" : "조회 결과 원문") + engine + " · 근거: " + data.tool;
    if (convs.includes(targetConv)) targetConv.msgs.push({ role: "bot", text: data.answer, meta });
    if (convs[current] === targetConv) {
      renderSafeMarkdown(thinking, data.answer);
      const mm = document.createElement("div"); mm.className = "meta"; mm.textContent = meta; thinking.appendChild(mm);
    }
  } catch (e) {
    if (convs[current] === targetConv) thinking.textContent = "요청 실패: " + (e.message || "서버에 연결할 수 없습니다.");
  } finally {
    clearInterval(ticker);
  }
  save(); send.disabled = false; chat.scrollTop = chat.scrollHeight; input.focus();
}

send.onclick = () => ask(input.value);
input.addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); ask(input.value); }
});
input.addEventListener("input", () => { input.style.height = "auto"; input.style.height = input.scrollHeight + "px"; });
document.getElementById("newChat").onclick = () => { current = null; renderConv(); renderList(); };
document.querySelectorAll(".ex").forEach(el => el.onclick = () => ask(el.textContent));
document.getElementById("menu").onclick = () => document.body.classList.toggle("side-open");
renderList(); renderConv();
</script>
</body>
</html>`

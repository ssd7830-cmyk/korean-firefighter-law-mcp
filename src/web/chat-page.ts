/**
 * 챗봇 화면 — ChatGPT와 같은 문법의 UI (사이드바 + 채팅창 + 입력창)
 * 빌드 도구 없이 단일 HTML 문자열로 서빙한다. 대화 목록은 브라우저 localStorage에만 저장.
 */

export const CHAT_PAGE_HTML = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>소방 AI 도우미</title>
<style>
  :root { --bg:#212121; --side:#171717; --panel:#2f2f2f; --text:#ececec; --sub:#9b9b9b; --accent:#e5533d; }
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family:-apple-system,BlinkMacSystemFont,"Malgun Gothic","Apple SD Gothic Neo",sans-serif; background:var(--bg); color:var(--text); height:100vh; display:flex; }
  #side { width:260px; background:var(--side); display:flex; flex-direction:column; padding:12px; gap:8px; flex-shrink:0; }
  #newChat { background:transparent; border:1px solid #444; color:var(--text); border-radius:8px; padding:10px; cursor:pointer; text-align:left; font-size:14px; }
  #newChat:hover { background:#2a2a2a; }
  #convList { flex:1; overflow-y:auto; display:flex; flex-direction:column; gap:2px; }
  .conv { padding:8px 10px; border-radius:8px; font-size:13px; color:var(--sub); cursor:pointer; display:flex; align-items:center; gap:4px; }
  .conv span { flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .conv:hover, .conv.active { background:#2a2a2a; color:var(--text); }
  .conv .del { display:none; background:none; border:none; color:var(--sub); cursor:pointer; font-size:12px; padding:0 2px; flex-shrink:0; }
  .conv:hover .del, .conv.active .del { display:block; }
  .conv .del:hover { color:var(--text); }
  #brand { font-size:12px; color:var(--sub); padding:8px 4px; border-top:1px solid #333; }
  #main { flex:1; display:flex; flex-direction:column; min-width:0; }
  #chat { flex:1; overflow-y:auto; padding:24px 0; }
  .row { max-width:760px; margin:0 auto 20px; padding:0 20px; display:flex; gap:12px; }
  .avatar { width:30px; height:30px; border-radius:50%; flex-shrink:0; display:flex; align-items:center; justify-content:center; font-size:15px; }
  .user .avatar { background:#444; }
  .bot .avatar { background:var(--accent); }
  .bubble { line-height:1.7; font-size:15px; white-space:pre-wrap; word-break:break-word; padding-top:3px; min-width:0; }
  .meta { font-size:11px; color:var(--sub); margin-top:6px; }
  #empty { max-width:760px; margin:12vh auto 0; padding:0 20px; text-align:center; color:var(--sub); }
  #empty h1 { color:var(--text); font-size:26px; margin-bottom:10px; }
  #empty .ex { display:inline-block; margin:6px; padding:10px 14px; border:1px solid #444; border-radius:10px; font-size:13px; cursor:pointer; }
  #empty .ex:hover { background:var(--panel); }
  #inputWrap { padding:12px 20px 20px; }
  #inputBox { max-width:760px; margin:0 auto; background:var(--panel); border-radius:24px; display:flex; align-items:flex-end; padding:8px 8px 8px 20px; }
  #input { flex:1; background:transparent; border:none; outline:none; color:var(--text); font-size:15px; font-family:inherit; resize:none; max-height:160px; line-height:1.5; padding:8px 0; }
  #send { background:var(--text); color:var(--bg); border:none; border-radius:50%; width:34px; height:34px; cursor:pointer; font-size:16px; flex-shrink:0; }
  #send:disabled { opacity:.3; cursor:default; }
  #notice { max-width:760px; margin:6px auto 0; text-align:center; font-size:11px; color:var(--sub); }
  @media (max-width:720px) { #side { display:none; } }
</style>
</head>
<body>
<div id="side">
  <button id="newChat">＋ 새 대화</button>
  <div id="convList"></div>
  <div id="brand">소방 AI 도우미<br>소방청 공공데이터 · 법제처 국가법령정보 기반</div>
</div>
<div id="main">
  <div id="chat">
    <div id="empty">
      <h1>무엇을 도와드릴까요?</h1>
      <div>소방청·법제처 공식 데이터를 조회해서 답합니다</div>
      <div style="margin-top:18px">
        <span class="ex">소방시설법 제10조 알려줘</span>
        <span class="ex">화재예방법 시행령 검색</span>
        <span class="ex">소방시설 점검 판례 찾아줘</span>
        <span class="ex">2025년 1월 1일 화재 현황</span>
      </div>
    </div>
  </div>
  <div id="inputWrap">
    <div id="inputBox">
      <textarea id="input" rows="1" placeholder="무엇이든 물어보세요"></textarea>
      <button id="send">↑</button>
    </div>
    <div id="notice">답변은 조회된 공식 데이터를 근거로 생성됩니다. 중요한 판단은 원문을 확인하세요.</div>
  </div>
</div>
<script>
const chat = document.getElementById("chat"), input = document.getElementById("input"),
      send = document.getElementById("send"), empty = document.getElementById("empty"),
      convList = document.getElementById("convList");
let convs = JSON.parse(localStorage.getItem("fire-convs") || "[]");
let current = null;

function renderList() {
  convList.innerHTML = "";
  convs.forEach((c, i) => {
    const d = document.createElement("div");
    d.className = "conv" + (current === i ? " active" : "");
    const t = document.createElement("span"); t.textContent = c.title;
    const x = document.createElement("button"); x.className = "del"; x.textContent = "✕"; x.title = "대화 삭제";
    x.onclick = (e) => {
      e.stopPropagation();
      convs.splice(i, 1);
      if (current === i) current = null; else if (current > i) current--;
      save(); renderList(); renderConv();
    };
    d.onclick = () => { current = i; renderConv(); renderList(); };
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
  const row = document.createElement("div");
  row.className = "row " + (role === "user" ? "user" : "bot");
  const av = document.createElement("div"); av.className = "avatar";
  av.textContent = role === "user" ? "나" : "🚒";
  const b = document.createElement("div"); b.className = "bubble"; b.textContent = text;
  if (meta) { const mm = document.createElement("div"); mm.className = "meta"; mm.textContent = meta; b.appendChild(mm); }
  row.appendChild(av); row.appendChild(b); chat.appendChild(row);
  if (scroll) chat.scrollTop = chat.scrollHeight;
  return b;
}
function save() { localStorage.setItem("fire-convs", JSON.stringify(convs.slice(0, 30))); }

async function ask(text) {
  if (!text.trim()) return;
  if (current === null) { convs.unshift({ title: text.slice(0, 28), msgs: [] }); current = 0; renderList(); }
  if (empty.parentNode) empty.remove();
  convs[current].msgs.push({ role: "user", text });
  addRow("user", text);
  input.value = ""; input.style.height = "auto"; send.disabled = true;
  const thinking = addRow("bot", "조회 중…");
  try {
    const res = await fetch("/api/chat", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text }),
    });
    const data = await res.json();
    const meta = (data.mode === "llm" ? "AI 답변" : "조회 결과 원문") + " · 근거: " + data.tool;
    thinking.textContent = data.answer;
    const mm = document.createElement("div"); mm.className = "meta"; mm.textContent = meta; thinking.appendChild(mm);
    convs[current].msgs.push({ role: "bot", text: data.answer, meta });
  } catch (e) {
    thinking.textContent = "요청 실패: 서버에 연결할 수 없습니다.";
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
renderList(); renderConv();
</script>
</body>
</html>`

/** 챗봇 화면 동작 스크립트 (chat-page.ts가 <script>로 삽입). 대화는 현재 탭 sessionStorage에만 저장. */
export const CHAT_SCRIPT = `
const chat=document.getElementById("chat"),input=document.getElementById("input"),send=document.getElementById("send"),empty=document.getElementById("empty"),convList=document.getElementById("convList");
const TOOL_KO = { search_fire_law:"법령 검색", get_fire_law_text:"법령 조문", get_fire_law_annex:"법령 별표",
  search_fire_admin_rules:"행정규칙 검색", get_fire_admin_rule_text:"행정규칙 원문", search_fire_precedents:"판례 검색",
  search_fire_stats:"화재통계", get_ems_stats:"구급통계(교통사고)", search_fire_building:"소방대상물 검색",
  get_building_facilities:"소방시설 현황", search_hazmat:"위험물 정보" };
function toolKo(t) { return String(t || "").split(", ").map(x => TOOL_KO[x] || x).join(" · "); }
let convs = [];
try { convs = JSON.parse(sessionStorage.getItem("fire-convs") || "[]"); } catch { convs = []; }
if (!Array.isArray(convs)) convs = [];
convs = convs.filter(c => c && typeof c.title === "string" && Array.isArray(c.msgs)).slice(0, 30).map(c => ({
  title:c.title.slice(0,100), msgs:c.msgs.filter(m => m && (m.role === "user" || m.role === "bot") && typeof m.text === "string")
    .slice(-200).map(m => ({ role:m.role, text:m.text, meta:typeof m.meta === "string" ? m.meta : "",
      sources:typeof m.sources === "string" ? m.sources : "" }))
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
  convs[current].msgs.forEach(m => addRow(m.role, m.text, { meta:m.meta, sources:m.sources, scroll:false }));
  chat.scrollTop = chat.scrollHeight;
}
/** 봇 말풍선 내용 채우기: 본문 + 접힌 원문(details) + 메타 */
function fillBubble(b, text, o) {
  renderSafeMarkdown(b, text);
  if (o.sources) {
    const d = document.createElement("details"); d.className = "src"; if (o.open) d.open = true;
    const s = document.createElement("summary"); s.textContent = "공식 조회 자료 원문 보기";
    const body = document.createElement("div"); body.className = "src-body"; body.textContent = o.sources;
    d.appendChild(s); d.appendChild(body); b.appendChild(d);
  }
  if (o.meta) { const mm = document.createElement("div"); mm.className = "meta"; mm.textContent = o.meta; b.appendChild(mm); }
}
function addRow(role, text, o = {}) {
  const row=document.createElement("div"); row.className="row "+(role === "user" ? "user" : "bot");
  const av=document.createElement("div"); av.className="avatar";
  av.textContent = role === "user" ? "나" : "🚒";
  const b=document.createElement("div"); b.className="bubble";
  if (role === "user") b.textContent = text; else fillBubble(b, text, o);
  row.appendChild(av); row.appendChild(b); chat.appendChild(row);
  if (o.scroll !== false) chat.scrollTop = chat.scrollHeight;
  return b;
}
function appendInline(parent, text) {
  const pattern = /(\\*\\*[^*]+\\*\\*|\\x60[^\\x60]+\\x60|\\[자료 [^\\]]{1,40}\\])/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    parent.appendChild(document.createTextNode(text.slice(last, match.index)));
    const token = match[0];
    let el;
    if (token.startsWith("**")) { el = document.createElement("strong"); el.textContent = token.slice(2, -2); }
    else if (token.startsWith("[")) { el = document.createElement("span"); el.className = "cite"; el.textContent = token.slice(1, -1); }
    else { el = document.createElement("code"); el.textContent = token.slice(1, -1); }
    parent.appendChild(el); last = match.index + token.length;
  }
  parent.appendChild(document.createTextNode(text.slice(last)));
}
function renderSafeMarkdown(parent, text) {
  parent.textContent = "";
  text.split("\\n").forEach((line, index) => {
    const el = document.createElement("div");
    if (/^#{1,4}\\s/.test(line)) { el.className = "md-heading"; line = line.replace(/^#{1,4}\\s+/, ""); }
    else if (/^-{3,}\\s*$/.test(line)) { el.className = "md-hr"; line = ""; }
    else if (/^[-*]\\s/.test(line)) { el.className = "md-list"; line = "• " + line.replace(/^[-*]\\s+/, ""); }
    else if (/^\\d{1,2}[.)] /.test(line)) { el.className = "md-num"; }
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
    const known = { 429: "요청이 너무 많습니다. 1분 후 다시 시도하세요.", 401: "접속 토큰이 올바르지 않습니다.", 503: "서버에 LLM이 설정되지 않아 챗봇을 사용할 수 없습니다. 관리자에게 문의하세요." };
    throw new Error(known[res.status] || "요청 실패 (HTTP " + res.status + ")");
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
    const meta = (data.mode === "llm" ? "AI 답변" : "조회 결과 원문") + (data.model ? " · " + data.model : "") + " · 근거: " + toolKo(data.tool);
    const srcs = typeof data.sources === "string" ? data.sources : "";
    if (convs.includes(targetConv)) targetConv.msgs.push({ role: "bot", text: data.answer, meta, sources: srcs });
    if (convs[current] === targetConv) {
      thinking.textContent = "";
      fillBubble(thinking, data.answer, { meta, sources: srcs, open: data.mode !== "llm" });
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
`

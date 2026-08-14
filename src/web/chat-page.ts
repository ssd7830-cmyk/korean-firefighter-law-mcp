/** 단일 HTML 챗봇 화면 (마크업·스타일). 동작 스크립트는 chat-script.ts에서 삽입한다. */
import { CHAT_SCRIPT } from "./chat-script.js"

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
  .bubble div:empty { height:.7em; }
  .meta { font-size:11px; color:var(--sub); margin-top:6px; }
  .cite { display:inline-block; font-size:11px; line-height:1.5; color:#bfbfbf; background:#3d3d3d; border-radius:8px; padding:0 7px; margin:0 2px; vertical-align:1px; white-space:nowrap; }
  details.src { margin-top:10px; }
  details.src summary { cursor:pointer; font-size:12px; color:var(--sub); user-select:none; } details.src summary:hover { color:var(--text); }
  .src-body { margin-top:8px; padding:10px 12px; background:#282828; border-radius:8px; white-space:pre-wrap; font-size:13px; color:#cfcfcf; max-height:380px; overflow-y:auto; }
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
  .md-heading { font-weight:700; font-size:17px; margin:10px 0 4px; } .bubble code { background:#333; border-radius:4px; padding:1px 4px; }
  .md-list,.md-num { padding-left:16px; text-indent:-16px; margin:2px 0; }
  .md-hr { border-top:1px solid #3a3a3a; margin:10px 0; height:0; }
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
<script>${CHAT_SCRIPT}</script>
</body>
</html>`

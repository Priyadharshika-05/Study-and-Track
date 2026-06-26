/* ═══════════════════════════════════════
   STATE
═══════════════════════════════════════ */
let USER = null;
let NODES = [];
let TESTS = [];
let SCHEDULE = [];
let SEL = null;
let EDIT_ID = null;
let EDIT_MODE = false;
let M_PARENT = null;
let M_LEVEL = 0;
let SAVE_T = null;
let LC = null, BC = null;
let TREE_Q = '';
const EXP = {};

/* ═══════════════════════════════════════
   BOOT
═══════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', async () => {
  const r = await api('/api/auth/me');
  if (r.loggedIn) { USER = r.username; boot(); }
  $('l-pass').addEventListener('keydown', e => e.key==='Enter' && doLogin());
  $('l-user').addEventListener('keydown', e => e.key==='Enter' && doLogin());
  $('r-conf').addEventListener('keydown', e => e.key==='Enter' && doReg());
  $('md-title').addEventListener('keydown', e => e.key==='Enter' && saveNode());
  $('t-dt').value = new Date().toISOString().split('T')[0];
  $('sc-dt').value = new Date().toISOString().split('T')[0];
  document.addEventListener('keydown', e => { if(e.key==='Escape') closeModal(); });
  document.addEventListener('click', e => {
    const d = $('acct-drop');
    if (d.classList.contains('on') && !d.contains(e.target) && !e.target.closest('.tb-right')) d.classList.remove('on');
  });
});

const $ = id => document.getElementById(id);
async function api(url, method='GET', body=null) {
  const o = { method, headers:{'Content-Type':'application/json'} };
  if (body) o.body = JSON.stringify(body);
  let res;
  try {
    res = await fetch(url, o);
  } catch(e) {
    return {error:'Network error — could not reach the server.'};
  }
  let data;
  try {
    data = await res.json();
  } catch(e) {
    return {error:`Server returned an unexpected response (HTTP ${res.status}).`};
  }
  if(!res.ok && !data.error) data.error = `Request failed (HTTP ${res.status}).`;
  return data;
}
function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function toast(msg){ const t=$('toast');t.textContent=msg;t.classList.add('on');setTimeout(()=>t.classList.remove('on'),2400); }
function showErr(el,msg){ el.textContent=msg;el.classList.add('on'); }

/* ═══════════════════════════════════════
   AUTH
═══════════════════════════════════════ */
function authTab(tab) {
  document.querySelectorAll('.a-tab').forEach((t,i)=>t.classList.toggle('on',(i===0&&tab==='login')||(i===1&&tab==='register')));
  $('f-login').style.display = tab==='login'?'block':'none';
  $('f-reg').style.display   = tab==='register'?'block':'none';
}
async function doLogin() {
  const u=$('l-user').value.trim(), p=$('l-pass').value, e=$('l-err');
  e.classList.remove('on');
  if(!u||!p){showErr(e,'Fill both fields.');return;}
  const r=await api('/api/auth/login','POST',{username:u,password:p});
  if(r.error){showErr(e,r.error);return;}
  USER=r.username; boot();
}
async function doReg() {
  const u=$('r-user').value.trim(),p=$('r-pass').value,c=$('r-conf').value,e=$('r-err');
  e.classList.remove('on');
  if(!u||!p){showErr(e,'Fill all fields.');return;}
  if(p!==c){showErr(e,'Passwords do not match.');return;}
  const r=await api('/api/auth/register','POST',{username:u,password:p});
  if(r.error){showErr(e,r.error);return;}
  USER=r.username; boot();
}
async function doLogout(){ await api('/api/auth/logout','POST'); location.reload(); }
async function delAccount(){
  if(!confirm('Permanently delete your account and all data?')) return;
  await api('/api/auth/account','DELETE'); location.reload();
}
function toggleAcct(){ $('acct-drop').classList.toggle('on'); }
async function boot(){
  $('auth-page').style.display='none';
  $('app').classList.add('on');
  $('u-name').textContent=USER;
  $('u-av').textContent=USER.charAt(0).toUpperCase();
  $('acct-uname').textContent=USER;
  await loadNodes();
  await loadTests();
  await loadSchedule();
}

/* ═══════════════════════════════════════
   NAV
═══════════════════════════════════════ */
function gv(v){
  document.querySelectorAll('.view').forEach(x=>x.classList.remove('on'));
  document.querySelectorAll('.nb').forEach(x=>x.classList.remove('on'));
  $('v-'+v).classList.add('on');
  $('nb-'+v).classList.add('on');
  $('acct-drop').classList.remove('on');
  if(v==='read')     renderRead();
  if(v==='progress') renderProgress();
  if(v==='schedule') renderSchedule();
}

/* ═══════════════════════════════════════
   IMPORT
═══════════════════════════════════════ */
let IMP_UNIT_ID = null;
function openImport(unitId){
  IMP_UNIT_ID = unitId;
  const unit = NODES.find(n => n._id === unitId);
  if(!unit) return;
  $('imp-unit-name').textContent = unit.title;
  $('imp-txt').value = '';
  $('imp-err').classList.remove('on');
  $('imp-md-bg').classList.add('on');
  setTimeout(() => $('imp-txt').focus(), 80);
}
function closeImpModal(){ $('imp-md-bg').classList.remove('on'); IMP_UNIT_ID = null; }

async function doImport(){
  const raw = $('imp-txt').value.trim();
  const e = $('imp-err');
  if(!raw){ showErr(e, 'Paste a syllabus first.'); return; }
  
  const parsed = parseSyllabusIntoUnit(raw, IMP_UNIT_ID);
  if(!parsed.length){ showErr(e, 'Nothing parsed — check format.'); return; }

  // Recalculate order strictly based on parent grouping
  const orderMap = {};
  for (let node of parsed) {
    const parentKey = node.parentId || IMP_UNIT_ID;
    if (!orderMap[parentKey]) orderMap[parentKey] = 0;
    node.order = orderMap[parentKey]++;
  }

  // Map tempIds to real IDs as we create them
  const tempToRealId = {};
  let successCount = 0;
  let failedCount = 0;

  // Process sequentially to maintain order
  for (let node of parsed) {
    // Resolve parent ID: if it's a tempId, use the mapped real ID; otherwise use the actual unitId
    let parentId = node.parentId || IMP_UNIT_ID;
    if (node.tempParentId && tempToRealId[node.tempParentId]) {
      parentId = tempToRealId[node.tempParentId];
    }

    const res = await api('/api/nodes', 'POST', {
      parentId: parentId,
      title: node.title,
      content: '',
      numbering: node.numbering,
      level: node.level,
      order: node.order
    });

    if (res.error) {
      failedCount++;
      console.warn(`Failed to import "${node.title}":`, res.error);
    } else {
      successCount++;
      // Map this temp ID to the real ID returned by the server
      if (node.tempId) {
        tempToRealId[node.tempId] = res._id;
      }
    }
  }

  if (failedCount > 0) {
    showErr(e, `Imported ${successCount} topics, but ${failedCount} failed.`);
  }

  await loadNodes();
  EXP[IMP_UNIT_ID] = true;
  renderTree(); populateUnits();
  closeImpModal();
  toast(`Imported ${successCount} topics.`);
}

function parseSyllabusIntoUnit(text, unitId){
  const lines = text.split('\n');
  const result = [];
  let ctr = 0;
  const byNum = {}; // numbering -> tempId
  
  for (let raw of lines){
    let line = raw.replace(/^```.*```$/, '').replace(/^`{3}.*/, '').trim();
    if (!line) continue;
    line = line.replace(/^[●•○◦▸]\s*/, '').trim();
    if (!line) continue;

    const numM = line.match(/^(\d+(?:\.\d+)*)[.)]*\s+(.+)/);
    if (numM){
      const rawNum = numM[1];
      const title  = numM[2].trim();
      const parts  = rawNum.split('.');
      const depth  = parts.length;
      const level  = Math.min(depth, 3);

      let tempParentId = null;
      if (depth === 1){
        tempParentId = 'ROOT_UNIT';
      } else {
        const parentNum = parts.slice(0, -1).join('.');
        tempParentId = byNum[parentNum] || 'ROOT_UNIT';
      }

      const order = result.filter(n => n.tempParentId === tempParentId).length;
      const tempId = 'n' + (++ctr);
      
      // For bulk API, we'll replace ROOT_UNIT with the actual unitId
      result.push({ 
        tempId, 
        tempParentId: tempParentId === 'ROOT_UNIT' ? null : tempParentId,
        parentId: tempParentId === 'ROOT_UNIT' ? unitId : undefined,
        title, 
        numbering: rawNum, 
        level, 
        order 
      });
      byNum[rawNum] = tempId;
    }
  }
  return result;
}

function numFrom(pid,order,startUnit){
  const n=order+1;
  if(!pid) return String((startUnit?startUnit-1:0)+n);
  const p=NODES.find(x=>String(x._id)===String(pid));
  if(!p) return String(n);
  return p.numbering?`${p.numbering}.${n}`:String(n);
}

/* ═══════════════════════════════════════
   TREE
═══════════════════════════════════════ */
async function loadNodes(){ NODES=await api('/api/nodes'); renderTree(); populateUnits(); }
const kids=pid=>NODES.filter(n=>String(n.parentId)===String(pid)).sort((a,b)=>a.order-b.order);
const roots=()=>NODES.filter(n=>!n.parentId).sort((a,b)=>{
  const na=parseFloat(a.numbering)||a.order, nb=parseFloat(b.numbering)||b.order;
  return na-nb;
});

function filterTree(q){ TREE_Q=q.toLowerCase(); renderTree(); }
function nodeVis(n){ if(!TREE_Q)return true; if(n.title.toLowerCase().includes(TREE_Q))return true; return kids(n._id).some(c=>nodeVis(c)); }

function renderTree(){
  const body=$('tree-body');
  const rs=roots();
  if(!rs.length){
    body.innerHTML=`<div class="tree-empty"><p>No topics yet.</p><div class="tree-empty-hint">Paste a syllabus below and click <code>Import</code>, or use <code>+ Unit</code> to add manually.</div></div>`;
    return;
  }
  body.innerHTML='';
  rs.forEach(n=>{ if(nodeVis(n)) body.appendChild(mkNode(n)); });
}

function mkNode(node){
  const ch=kids(node._id).filter(c=>nodeVis(c));
  const hasCh=kids(node._id).length>0;
  const isExp=EXP[node._id]!==false;
  const isSel=SEL===node._id;

  const wrap=document.createElement('div');
  wrap.className=`tn l${node.level}`;

  const row=document.createElement('div');
  row.className='tn-row'+(isSel?' sel':'');

  const tog=document.createElement('span');
  tog.className='tn-tog'+(hasCh&&isExp?' open':'');
  tog.style.visibility=hasCh?'visible':'hidden';
  tog.textContent='▶';

  const num=document.createElement('span');
  num.className='tn-num'; num.textContent=node.numbering||'';

  const title=document.createElement('span');
  title.className='tn-title'; title.title=node.title; title.textContent=node.title;

  const acts=document.createElement('div');
  acts.className='tn-acts';
  const mkA=(lbl,glyph,fn)=>{
    const b=document.createElement('button');
    b.className='tn-act'+(lbl==='Print unit'?' print-act':'');b.title=lbl;
    b.textContent=glyph;
    b.onclick=e=>{e.stopPropagation();fn();};return b;
  };
  /* Unit-level (level 0) gets a single Print Unit button instead of per-node print */
  if(node.level===0){
    acts.appendChild(mkA('Import syllabus','↓',()=>openImport(node._id)));
    acts.appendChild(mkA('Print unit','⎙',()=>printUnit(node._id)));
  }
  acts.appendChild(mkA('Add child','+',()=>openAdd(node._id,node.level+1)));
  acts.appendChild(mkA('Edit','✎',()=>openEdit(node._id)));
  acts.appendChild(mkA('Delete','✕',()=>delNode(node._id)));

  row.appendChild(tog);row.appendChild(num);row.appendChild(title);row.appendChild(acts);
  row.addEventListener('click',()=>{ if(hasCh){EXP[node._id]=!isExp;renderTree();} selNode(node._id); });
  wrap.appendChild(row);

  if(hasCh&&isExp){
    const cw=document.createElement('div'); cw.className='tn-children';
    ch.forEach(c=>cw.appendChild(mkNode(c)));
    wrap.appendChild(cw);
  }
  return wrap;
}

function selNode(id){
  SEL=id; renderTree();
  const node=NODES.find(n=>n._id===id);
  if(node) showEditor(node);
}

function crumb(node){
  const parts=[]; let cur=node;
  while(cur){ parts.unshift({num:cur.numbering||'',title:cur.title}); cur=NODES.find(n=>String(n._id)===String(cur.parentId)); }
  return parts;
}

function showEditor(node){
  $('ct-tb').classList.add('on');
  const parts=crumb(node);
  const crumbHtml=parts.map((p,i)=>{
    const label=p.num?`${esc(p.num)} ${esc(p.title)}`:esc(p.title);
    return i<parts.length-1?`${label} <span class="ed-crumb-sep">›</span>`:`<span class="ed-crumb-cur">${label}</span>`;
  }).join(' ');
  $('ct-inner').innerHTML=`
    <div id="active-ed">
      <div class="ed-crumb">${crumbHtml}</div>
      <input class="ed-title" id="ed-t" value="${esc(node.title)}" placeholder="Title…" oninput="schedSave()"/>
      <div class="ed-rule"></div>
      <div class="rich" id="ed-c" contenteditable="true" data-ph="Start writing notes…" oninput="schedSave()">${node.content||''}</div>
      <div class="ed-foot">
        <div style="display:flex;gap:.4rem;">
          <button class="btn btn-ghost btn-sm" onclick="openAdd('${node._id}',${node.level+1})">+ Sub-topic</button>
        </div>
        <span class="save-dot" id="sv-dot">Saved</span>
      </div>
    </div>`;
  EDIT_ID=node._id;
}

function schedSave(){ clearTimeout(SAVE_T); SAVE_T=setTimeout(doSave,1200); }
async function doSave(){
  if(!EDIT_ID)return;
  const t=$('ed-t')?.value?.trim(); const c=$('ed-c')?.innerHTML;
  if(!t)return;
  await api(`/api/nodes/${EDIT_ID}`,'PUT',{title:t,content:c});
  const n=NODES.find(x=>x._id===EDIT_ID);
  if(n){n.title=t;n.content=c;}
  renderTree();
  const dot=$('sv-dot');
  if(dot){dot.classList.add('on');setTimeout(()=>dot.classList.remove('on'),2000);}
}

/* Modal */
function openAdd(pid,lvl){
  M_PARENT=pid; M_LEVEL=Math.min(lvl||0,3); EDIT_ID=null; EDIT_MODE=false;
  const labels=['Unit','Sub-heading','Sub-sub-heading','Deep heading'];
  $('md-hd').textContent=`Add ${labels[M_LEVEL]||'topic'}`;
  $('md-title').value=''; $('md-err').classList.remove('on');
  $('md-bg').classList.add('on'); setTimeout(()=>$('md-title').focus(),80);
}
function openEdit(id){
  const node=NODES.find(n=>n._id===id); if(!node)return;
  M_PARENT=node.parentId; M_LEVEL=node.level; EDIT_ID=id; EDIT_MODE=true;
  const labels=['Unit','Sub-heading','Sub-sub-heading','Deep heading'];
  $('md-hd').textContent=`Edit ${labels[node.level]||'topic'}`;
  $('md-title').value=node.title; $('md-err').classList.remove('on');
  $('md-bg').classList.add('on'); setTimeout(()=>$('md-title').focus(),80);
}
function closeModal(){ $('md-bg').classList.remove('on'); EDIT_MODE=false; }

async function saveNode(){
  const title=$('md-title').value.trim(); const e=$('md-err');
  if(!title){showErr(e,'Please enter a title.');return;}
  if(EDIT_MODE&&EDIT_ID){
    const r=await api(`/api/nodes/${EDIT_ID}`,'PUT',{title});
    if(r.error){showErr(e,r.error);return;}
    const idx=NODES.findIndex(n=>n._id===EDIT_ID);
    if(idx!==-1) NODES[idx].title=title;
    closeModal(); renderTree();
    if(SEL===EDIT_ID){const n=NODES.find(x=>x._id===EDIT_ID);if(n)showEditor(n);}
    toast('Updated.'); return;
  }
  const sibs=M_PARENT?kids(M_PARENT):roots();
  const order=sibs.length;
  const numbering=numFrom(M_PARENT,order);
  const r=await api('/api/nodes','POST',{parentId:M_PARENT||null,title,content:'',numbering,level:M_LEVEL,order});
  if(r.error){showErr(e,r.error);return;}
  NODES.push(r); if(M_PARENT) EXP[M_PARENT]=true;
  closeModal(); renderTree(); populateUnits(); toast('Added.');
}

async function delNode(id){
  const node=NODES.find(n=>n._id===id); if(!node)return;
  const hasK=kids(id).length>0;
  if(!confirm(hasK?`Delete "${node.title}" and all sub-topics?`:`Delete "${node.title}"?`)) return;
  await api(`/api/nodes/${id}`,'DELETE');
  const toRm=descend(id); toRm.push(id);
  NODES=NODES.filter(n=>!toRm.includes(String(n._id)));
  if(SEL&&toRm.includes(String(SEL))){
    SEL=null;EDIT_ID=null;
    $('ct-tb').classList.remove('on');
    $('ct-inner').innerHTML=`<div class="ct-empty"><div class="ct-empty-glyph">§</div><h3>Select a topic to begin</h3><p>Choose anything from the outline on the left.</p></div>`;
  }
  renderTree(); populateUnits(); toast('Deleted.');
}
function descend(id){ const r=[];kids(id).forEach(c=>{r.push(String(c._id));r.push(...descend(c._id));});return r; }
function fmt(cmd){document.execCommand(cmd,false,null);}
function fmtB(tag){document.execCommand('formatBlock',false,tag);}

/* ═══════════════════════════════════════
   UNIT PRINT (single button per unit)
═══════════════════════════════════════ */
function printUnit(unitId){
  const unit=NODES.find(n=>n._id===unitId); if(!unit)return;
  const area=$('print-area');
  let html=`<div class="pu-unit-title">${esc(unit.numbering||'')} ${esc(unit.title)}</div><div class="pu-rule"></div>`;
  if(unit.content && unit.content.replace(/<[^>]+>/g,'').trim()){
    html+=`<div class="pu-node">${unit.content}</div>`;
  }
  function build(n){
    let h=`<div class="pu-node"><h4>${esc(n.numbering||'')} ${esc(n.title)}</h4>`;
    if(n.content && n.content.replace(/<[^>]+>/g,'').trim()) h+=`<div>${n.content}</div>`;
    h+='</div>';
    kids(n._id).forEach(c=>{ h+=build(c); });
    return h;
  }
  kids(unit._id).forEach(c=>{ html+=build(c); });
  area.innerHTML=html;
  document.body.classList.add('print-unit-mode');
  window.print();
  setTimeout(()=>document.body.classList.remove('print-unit-mode'),500);
}

/* ═══════════════════════════════════════
   READ VIEW
═══════════════════════════════════════ */
function renderRead(q=''){
  const inner=$('read-inner');
  inner.innerHTML='';
  const rs=roots();
  if(!rs.length){inner.innerHTML='<p class="read-empty">No notes yet. Add content in the Notes tab.</p>';$('rs-count').textContent='';return;}
  let hits=0;
  const hl=txt=>{
    if(!q)return esc(txt);
    const rx=new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')})`,'gi');
    return esc(txt).replace(rx,(_,m)=>{hits++;return`<mark class="hl">${esc(m)}</mark>`;});
  };
  const hlHtml=html=>{
    if(!q)return html;
    const rx=new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')})`,'gi');
    return html.replace(rx,(_,m)=>{hits++;return`<mark class="hl">${m}</mark>`;});
  };
  function nodeHtml(n,depth){
    const c=kids(n._id);
    const hasContent=n.content&&n.content.replace(/<[^>]+>/g,'').trim();
    let h=`<div class="read-node">`;
    h+=`<div class="rn-hd"><span class="rn-num">${esc(n.numbering||'')}</span><span class="rn-title">${hl(n.title)}</span></div>`;
    if(hasContent) h+=`<div class="rn-body">${hlHtml(n.content)}</div>`;
    if(c.length) h+=`<div class="rn-children">${c.map(x=>nodeHtml(x,depth+1)).join('')}</div>`;
    h+=`</div>`; return h;
  }
  rs.forEach((unit,i)=>{
    const wrap=document.createElement('div');
    wrap.className='read-unit';
    let html=`<div class="ru-hd"><span class="ru-num">${esc(unit.numbering||String(i+1))}</span><span class="ru-title">${hl(unit.title)}</span></div>`;
    if(unit.content&&unit.content.replace(/<[^>]+>/g,'').trim())
      html+=`<div class="rn-body" style="margin-bottom:1.25rem;">${hlHtml(unit.content)}</div>`;
    kids(unit._id).forEach(c=>{html+=nodeHtml(c,1);});
    wrap.innerHTML=html;
    inner.appendChild(wrap);
  });
  $('rs-count').textContent=q?(hits?`${hits} match${hits!==1?'es':''}` : 'No matches'):'';
  setTimeout(initReadCrumb, 0);
}
function applySearch(v){renderRead(v);}

/* ═══════════════════════════════════════
   READ BREADCRUMB (scroll tracker)
═══════════════════════════════════════ */
let READ_CRUMB_RAF = null;
function initReadCrumb(){
  const scroll = document.querySelector('.read-scroll');
  if(!scroll) return;
  scroll.removeEventListener('scroll', onReadScroll);
  scroll.addEventListener('scroll', onReadScroll, {passive:true});
  updateReadCrumb();
}
function onReadScroll(){
  if(READ_CRUMB_RAF) cancelAnimationFrame(READ_CRUMB_RAF);
  READ_CRUMB_RAF = requestAnimationFrame(updateReadCrumb);
}
function updateReadCrumb(){
  const bar = $('read-crumb'); if(!bar) return;
  const scroll = document.querySelector('.read-scroll'); if(!scroll) return;
  const inner = $('read-inner'); if(!inner) return;
  const scrollTop = scroll.scrollTop;

  const markers = [];
  inner.querySelectorAll('.read-unit').forEach(unit => {
    const num   = unit.querySelector('.ru-num')?.textContent?.trim() || '';
    const title = unit.querySelector('.ru-title')?.textContent?.trim() || '';
    markers.push({ el:unit, num, title, depth:0 });
    unit.querySelectorAll('.read-node').forEach(node => {
      const nnum   = node.querySelector('.rn-num')?.textContent?.trim() || '';
      const ntitle = node.querySelector('.rn-title')?.textContent?.trim() || '';
      const depth  = nnum ? nnum.split('.').length : 1;
      markers.push({ el:node, num:nnum, title:ntitle, depth });
    });
  });

  if(!markers.length){ bar.innerHTML=''; bar.classList.add('empty'); return; }

  const viewMid = scrollTop + scroll.clientHeight * 0.25;
  let active = null;
  for(const m of markers){
    if(m.el.offsetTop <= viewMid) active = m;
    else break;
  }
  if(!active){ bar.innerHTML=''; bar.classList.add('empty'); return; }

  const parts = active.num ? active.num.split('.') : [];
  const crumbs = [];

  if(active.depth === 0){
    crumbs.push({num: active.num, title: active.title, cls:'unit'});
  } else {
    const unitNum = parts[0];
    const unitM = markers.find(m => m.depth===0 && m.num===unitNum);
    if(unitM) crumbs.push({num: unitM.num, title: unitM.title, cls:'unit'});
    if(parts.length >= 2){
      const subNum = parts.slice(0,2).join('.');
      const subM = markers.find(m => m.num===subNum);
      if(subM && subM !== unitM) crumbs.push({num: subM.num, title: subM.title, cls:'sub'});
    }
    if(parts.length >= 3){
      crumbs.push({num: active.num, title: active.title, cls:'deep'});
    }
  }

  bar.classList.remove('empty');
  bar.innerHTML = crumbs.map((c,i) =>
    (i>0 ? `<span class="rcb-sep">›</span>` : '') +
    `<span class="rcb-seg ${c.cls}">${esc(c.num ? c.num+' · ' : '')}${esc(c.title)}</span>`
  ).join('');
}

/* ═══════════════════════════════════════
   TESTS
═══════════════════════════════════════ */
async function loadTests(){ TESTS=await api('/api/tests'); renderTests(); }
function populateUnits(){
  const sel=$('t-un'); sel.innerHTML='<option value="">— none —</option>';
  roots().forEach(r=>{const o=document.createElement('option');o.value=r._id;o.textContent=`${r.numbering?r.numbering+' ':''}${r.title}`;sel.appendChild(o);});
}
async function addTest(){
  const nm=$('t-nm').value.trim(),dt=$('t-dt').value,uid=$('t-un').value;
  const sb=$('t-sb').value.trim(),sc=parseFloat($('t-sc').value),tt=parseFloat($('t-tt').value);
  const nt=$('t-nt').value.trim(),e=$('t-err');
  e.classList.remove('on');
  if(!nm||!dt||isNaN(sc)||isNaN(tt)||tt<=0){showErr(e,'Fill test name, date, score, and total.');return;}
  if(sc<0||sc>tt){showErr(e,'Score is out of range.');return;}
  const un=NODES.find(n=>n._id===uid);
  const r=await api('/api/tests','POST',{testName:nm,date:dt,unitId:uid||null,unitName:un?un.title:'',freeSubject:sb,score:sc,total:tt,notes:nt});
  if(r.error){showErr(e,r.error);return;}
  TESTS.unshift(r); renderTests();
  ['t-nm','t-sc','t-tt','t-nt','t-sb'].forEach(id=>$(id).value=''); $('t-un').value='';
  toast('Test saved.');
}
function renderTests(){
  const tb=$('t-body');
  if(!TESTS.length){tb.innerHTML='<tr><td colspan="6" class="tbl-empty">No tests logged yet.</td></tr>';return;}
  tb.innerHTML=TESTS.map(t=>{
    const pct=Math.round((t.score/t.total)*100);
    const cls=pct>=70?'b-hi':pct>=50?'b-mid':'b-lo';
    const bc=pct>=70?'#6fa87a':pct>=50?'#d9c06a':'#d97a7a';
    const subj=[t.unitName,t.freeSubject].filter(Boolean).join(' / ')||'—';
    const ds=new Date(t.date).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'2-digit'});
    return`<tr>
      <td style="font-weight:500;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${esc(t.testName)}">${esc(t.testName)}</td>
      <td style="white-space:nowrap;color:var(--txt2);font-size:11px;font-family:'Courier New',monospace;">${ds}</td>
      <td style="max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--txt2);font-size:11.5px;" title="${esc(subj)}">${esc(subj)}</td>
      <td><span class="badge ${cls}">${t.score}/${t.total}</span></td>
      <td><div class="pbar"><div class="pbar-track"><div class="pbar-fill" style="width:${pct}%;background:${bc};"></div></div><span class="pbar-txt" style="color:${bc};">${pct}%</span></div></td>
      <td><button class="btn btn-ghost btn-xs" onclick="delTest('${t._id}')">✕</button></td>
    </tr>`;
  }).join('');
}
async function delTest(id){
  if(!confirm('Delete this result?'))return;
  await api(`/api/tests/${id}`,'DELETE');
  TESTS=TESTS.filter(t=>t._id!==id); renderTests(); toast('Deleted.');
}

/* ═══════════════════════════════════════
   PROGRESS
═══════════════════════════════════════ */
function renderProgress(){
  if(!TESTS.length && !roots().length){
    ['ps-tot','ps-avg','ps-best'].forEach((id,i)=>$(id).textContent=['0','0%','0%'][i]);
    if(LC){LC.destroy();LC=null;} if(BC){BC.destroy();BC=null;}
    return;
  }
  const pcts=TESTS.map(t=>Math.round((t.score/t.total)*100));
  const avg=pcts.length?Math.round(pcts.reduce((a,b)=>a+b,0)/pcts.length):0;
  const best=pcts.length?Math.max(...pcts):0;
  $('ps-tot').textContent=TESTS.length;
  $('ps-avg').textContent=avg+'%';
  $('ps-best').textContent=best+'%';

  const sorted=[...TESTS].sort((a,b)=>new Date(a.date)-new Date(b.date));
  const lLabels=sorted.map(t=>new Date(t.date).toLocaleDateString('en-IN',{day:'2-digit',month:'short'}));
  const lData=sorted.map(t=>Math.round((t.score/t.total)*100));
  const gridClr='rgba(255,255,255,.08)'; const tickClr='#666666';
  const tf={family:'Times New Roman',size:13};
  if(LC)LC.destroy();
  LC=new Chart($('ch-line'),{type:'line',data:{labels:lLabels,datasets:[{label:'Score %',data:lData,borderColor:'#4d9fff',backgroundColor:'rgba(77,159,255,.08)',pointBackgroundColor:'#4d9fff',pointRadius:4,tension:.35,fill:true}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{min:0,max:100,ticks:{callback:v=>v+'%',color:tickClr,font:tf},grid:{color:gridClr}},x:{ticks:{color:tickClr,font:tf},grid:{display:false}}}}});

  const units=roots();
  const bLabels=units.map(u=>`${u.numbering?u.numbering+' ':''}${u.title}`);
  const bData=units.map(u=>{
    const utests=TESTS.filter(t=>String(t.unitId)===String(u._id));
    if(!utests.length) return 0;
    const avgU=utests.reduce((a,t)=>a+(t.score/t.total)*100,0)/utests.length;
    return Math.round(avgU);
  });
  const bColors=bData.map(v=>v>=70?'rgba(77,204,122,.7)':v>=50?'rgba(77,159,255,.6)':v>0?'rgba(255,107,107,.6)':'rgba(60,60,70,.5)');
  if(BC)BC.destroy();
  BC=new Chart($('ch-bar'),{type:'bar',data:{labels:bLabels,datasets:[{label:'Coverage %',data:bData,backgroundColor:bColors,borderRadius:3,borderSkipped:false}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{min:0,max:100,ticks:{callback:v=>v+'%',color:tickClr,font:tf},grid:{color:gridClr}},x:{ticks:{color:tickClr,font:tf,maxRotation:30},grid:{display:false}}}}});
}

/* ═══════════════════════════════════════
   SCHEDULE
═══════════════════════════════════════ */
let SCH_EDIT_ID = null;

async function loadSchedule(){ SCHEDULE=await api('/api/schedule'); }

function populateSchedulePicker(){
  const wrap=$('sc-topics');
  const rs=roots();
  if(!rs.length){ wrap.innerHTML='<p style="color:var(--txt3);font-size:11.5px;padding:.3rem;">Add notes/topics first in the Notes tab.</p>'; return; }
  let html='';
  function row(n,lvl){
    const num = n.numbering ? esc(n.numbering)+'.' : '';
    html+=`<label class="sch-topic-opt sch-lvl${lvl}"><input type="checkbox" value="${n._id}" class="sc-topic-chk"/>${num?`<span class="stp-num">${num}</span>`:''}<span class="stp-title">${esc(n.title)}</span></label>`;
    kids(n._id).forEach(c=>row(c,Math.min(lvl+1,3)));
  }
  rs.forEach(r=>row(r,0));
  wrap.innerHTML=html;
}

function gatherCheckedTopics(){
  return Array.from(document.querySelectorAll('.sc-topic-chk:checked')).map(cb=>cb.value);
}

async function addSchedule(){
  const dt=$('sc-dt').value;
  const note=$('sc-note').value.trim();
  const e=$('sc-err');
  e.classList.remove('on');
  const topicIds=gatherCheckedTopics();
  if(!dt){showErr(e,'Pick a date.');return;}
  if(!topicIds.length && !note){showErr(e,'Select at least one topic, or add a note.');return;}
  const topics=topicIds.map(id=>{
    const n=NODES.find(x=>x._id===id);
    return {nodeId:id,numbering:n?n.numbering:'',title:n?n.title:''};
  });
  if(SCH_EDIT_ID){
    const r=await api(`/api/schedule/${SCH_EDIT_ID}`,'PUT',{date:dt,topics,note});
    if(r.error){showErr(e,r.error);return;}
    const idx=SCHEDULE.findIndex(s=>s._id===SCH_EDIT_ID);
    if(idx!==-1) SCHEDULE[idx]=r;
    toast('Schedule updated.');
  }else{
    const r=await api('/api/schedule','POST',{date:dt,topics,note});
    if(r.error){showErr(e,r.error);return;}
    SCHEDULE.push(r);
    toast('Added to schedule.');
  }
  resetScheduleForm();
  renderSchedule();
}

function resetScheduleForm(){
  SCH_EDIT_ID=null;
  $('sc-note').value='';
  $('sc-dt').value=new Date().toISOString().split('T')[0];
  document.querySelectorAll('.sc-topic-chk').forEach(cb=>cb.checked=false);
  $('sc-add-btn').textContent='Add to schedule →';
}

function editSchedule(id){
  const item=SCHEDULE.find(s=>s._id===id); if(!item)return;
  SCH_EDIT_ID=id;
  $('sc-dt').value=new Date(item.date).toISOString().split('T')[0];
  $('sc-note').value=item.note||'';
  populateSchedulePicker();
  const ids=(item.topics||[]).map(t=>String(t.nodeId));
  document.querySelectorAll('.sc-topic-chk').forEach(cb=>{ if(ids.includes(cb.value)) cb.checked=true; });
  $('sc-add-btn').textContent='Update schedule →';
  window.scrollTo({top:0,behavior:'smooth'});
}

async function toggleScheduleDone(id,done){
  await api(`/api/schedule/${id}`,'PUT',{done});
  const item=SCHEDULE.find(s=>s._id===id);
  if(item) item.done=done;
  renderSchedule();
}

async function delSchedule(id){
  if(!confirm('Remove this schedule entry?'))return;
  await api(`/api/schedule/${id}`,'DELETE');
  SCHEDULE=SCHEDULE.filter(s=>s._id!==id);
  renderSchedule();
  toast('Removed.');
}

function renderSchedule(){
  populateSchedulePicker();
  const list=$('sch-list');
  if(!SCHEDULE.length){
    list.innerHTML='<div class="sch-empty">No scheduled topics yet. Pick a date and topics above to plan your revision.</div>';
    return;
  }
  const sorted=[...SCHEDULE].sort((a,b)=>new Date(a.date)-new Date(b.date));
  const itemsHtml=sorted.map(item=>{
    const d=new Date(item.date);
    const day=d.getDate();
    const mon=d.toLocaleDateString('en-IN',{month:'short'});
    const yr=d.getFullYear();
    const topicsHtml=(item.topics||[]).map(t=>`<span class="sch-topic-tag">${esc(t.numbering||'')}<span class="stt-title">${esc(t.title||'')}</span></span>`).join('');
    const noteHtml=item.note?`<div class="sch-note-txt">${esc(item.note)}</div>`:'';
    return `<div class="sch-item${item.done?' done':''}" data-id="${item._id}">
      <input type="checkbox" class="sch-sel-chk" value="${item._id}" onchange="updateSchBulkBar()"/>
      <input type="checkbox" class="sch-check" ${item.done?'checked':''} onchange="toggleScheduleDone('${item._id}',this.checked)"/>
      <div class="sch-date-badge">
        <div class="sch-date-day">${day}</div>
        <div class="sch-date-mon">${mon}</div>
        <div class="sch-date-yr">${yr}</div>
      </div>
      <div class="sch-body">
        ${topicsHtml?`<div class="sch-topics">${topicsHtml}</div>`:''}
        ${noteHtml}
      </div>
      <div class="sch-acts">
        <button class="btn btn-ghost btn-xs" onclick="editSchedule('${item._id}')">✎</button>
        <button class="btn btn-ghost btn-xs" onclick="delSchedule('${item._id}')">✕</button>
      </div>
    </div>`;
  }).join('');
  list.innerHTML=`<div class="sch-bulk-bar" id="sch-bulk-bar"><span class="sch-bulk-count" id="sch-bulk-count">0 selected</span><button class="btn btn-danger btn-xs" onclick="delSelected()">Delete selected</button><button class="btn btn-danger btn-xs" onclick="delAllSchedule()">Delete all</button></div>${itemsHtml}`;
  updateSchBulkBar();
}

function updateSchBulkBar(){
  const checked=document.querySelectorAll('.sch-sel-chk:checked');
  const bar=$('sch-bulk-bar');
  if(!bar)return;
  $('sch-bulk-count').textContent=`${checked.length} selected`;
}

async function delSelected(){
  const ids=Array.from(document.querySelectorAll('.sch-sel-chk:checked')).map(c=>c.value);
  if(!ids.length){toast('Select at least one entry.');return;}
  if(!confirm(`Delete ${ids.length} selected entr${ids.length===1?'y':'ies'}?`))return;
  for(const id of ids){ await api(`/api/schedule/${id}`,'DELETE'); }
  SCHEDULE=SCHEDULE.filter(s=>!ids.includes(s._id));
  renderSchedule(); toast(`Deleted ${ids.length} entr${ids.length===1?'y':'ies'}.`);
}

async function delAllSchedule(){
  if(!SCHEDULE.length){toast('Nothing to delete.');return;}
  if(!confirm(`Delete all ${SCHEDULE.length} schedule entries? This cannot be undone.`))return;
  for(const s of SCHEDULE){ await api(`/api/schedule/${s._id}`,'DELETE'); }
  SCHEDULE=[];
  renderSchedule(); toast('All schedule entries deleted.');
}

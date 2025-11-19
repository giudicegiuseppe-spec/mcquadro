(function(){
  var KEY = 'simac_session_v1';
  var CSV_CANDIDATES = [
    '/preventivatore/user.csv'
  ];
  var USERS_CACHE = null;
  try{ if(typeof window !== 'undefined' && window.AUTH_FORCE_RELOAD == null){ window.AUTH_FORCE_RELOAD = true; } }catch(_){ }
  function setSession(sess){ try{ localStorage.setItem(KEY, JSON.stringify(sess||{})); }catch(_){ } }
  function getSession(){ try{ var s = JSON.parse(localStorage.getItem(KEY)||'{}'); return s && typeof s==='object'? s : {}; }catch(_){ return {}; } }
  function clearSession(){ try{ localStorage.removeItem(KEY); }catch(_){ } }
  function isLogged(){ var s=getSession(); return !!(s && (s.email||s.agente_id)); }
  function requireAuth(){ if(!isLogged()){ try{ window.location.href = '/preventivatore/mirror/'; }catch(_){ } return false; } return true; }
  function normalizeEmail(e){ return String(e||'').trim().toLowerCase(); }
  function detectDelim(sample){
    var semi=(sample.match(/;/g)||[]).length;
    var comma=(sample.match(/,/g)||[]).length;
    var tab=(sample.match(/\t/g)||[]).length;
    if(tab>=semi && tab>=comma) return '\t';
    return semi>comma?';':',';
  }

  // Helper: open Agenda inline from topbar, fallback to standalone. Return false to prevent navigation.
  try{ window.openAgendaFromTop = function(){
    try{
      var wrap = document.getElementById('wrap');
      // Create #wrap if missing so inline can render
      if(!wrap){
        try{
          wrap = document.createElement('div');
          wrap.id = 'wrap';
          document.body.appendChild(wrap);
        }catch(_){ }
      }
      if(wrap){
        try{ inlineOpenAgenda('/preventivatore/mirror/agenda'); return false; }catch(_){ }
      }
    }catch(_){ }
    try{ window.location.href='/preventivatore/mirror/agenda.html'; }catch(_){ }
    return false;
  }; }catch(_){ }

  // Build inline Agenda view into #wrap directly
  function inlineOpenAgenda(url){
    try{
      var wrap = document.getElementById('wrap');
      if(!wrap){ var d=document.createElement('div'); d.id='wrap'; document.body.appendChild(d); wrap=d; }
      var v = 'inline-'+Date.now();
      var header = ''+
        '<section class="section-bg title">'+
        '  <div class="title-wrap">'+
        '    <a class="sidenav-trigger hide_please" data-target="sidenav" href="#"><i class="material-icons menu-icon">menu</i></a>'+
        '    <a class="hide_please home-link" href="#">'+
        '      <img alt="" class="page-title-logo" src="/logo.png" title="">'+
        '    </a>'+
        '    <h1 class="padding-container">Agenda</h1>'+
        '  </div>'+
        '</section>';
      var content = ''+
        '<section class="section padding-container white-bg">'+
        '  <div class="row">'+
        '    <div class="col s12">'+
        '      <iframe src="'+url+(url.indexOf('?')>-1?'&':'?')+'v='+v+'" style="width:100%;height:85vh;border:0;border-radius:8px;background:#fff;"></iframe>'+
        '    </div>'+
        '  </div>'+
        '</section>';
      wrap.innerHTML = header + content;
      try{ window.scrollTo({top:0, behavior:'smooth'}); }catch(_){ }
    }catch(_){ }
  }

  // Observe top navigation and re-ensure the Agenda button next to 'Esci'
  function setupTopbarObservers(){
    try{
      if(!window.MutationObserver) return;
      var top = document.getElementById('top_nav');
      if(top){
        try{
          if(!top.__agendaTopObs){
            top.__agendaTopObs = new MutationObserver(function(){ ensureTopbarAgenda(); });
            top.__agendaTopObs.observe(top, { childList:true, subtree:true });
          }
        }catch(_){ }
      }
      if(!document.__agendaTopRootObs){
        document.__agendaTopRootObs = new MutationObserver(function(muts){
          try{
            var hasNewTop = false;
            muts.forEach(function(m){
              m.addedNodes && m.addedNodes.forEach(function(n){ if(n && n.nodeType===1 && (n.id==='top_nav' || (n.querySelector && n.querySelector('#top_nav')))) hasNewTop=true; });
            });
            if(hasNewTop){ ensureTopbarAgenda(); setupTopbarObservers(); }
          }catch(_){ }
        });
        document.__agendaTopRootObs.observe(document.documentElement || document.body, { childList:true, subtree:true });
      }
    }catch(_){ }
  }

  // Floating fallback button: always visible near top-right (left of Esci)
  function ensureFloatingAgenda(){
    try{
      if(document.getElementById('floating-agenda-btn')) return;
      var btn = document.createElement('a');
      btn.id = 'floating-agenda-btn';
      btn.href = '#';
      btn.textContent = 'Agenda';
      btn.style.position = 'fixed';
      btn.style.top = '12px';
      btn.style.right = '110px';
      btn.style.zIndex = '9999';
      btn.style.background = '#1976d2';
      btn.style.color = '#fff';
      btn.style.padding = '6px 10px';
      btn.style.borderRadius = '14px';
      btn.style.fontSize = '13px';
      btn.style.boxShadow = '0 2px 6px rgba(0,0,0,.2)';
      btn.addEventListener('click', function(e){ e.preventDefault(); e.stopPropagation();
        var ok = (window.wireAgendaInlineOpen && document.getElementById('wrap')) ? (function(){
          var tmp = document.createElement('a'); tmp.setAttribute('href', '/preventivatore/mirror/agenda'); tmp.dataset.agendaUrl = '/preventivatore/mirror/agenda'; return window.wireAgendaInlineOpen(tmp);
        })() : false;
        if(!ok){ try{ window.location.href='/preventivatore/mirror/agenda.html'; }catch(_){ } }
      }, true);
      document.body.appendChild(btn);
    }catch(_){ }
  }

  // Ensure an 'Agenda' button in the top navigation, left of 'Esci'
  function ensureTopbarAgenda(){
    try{
      // Find top UL container
      var top = document.getElementById('top_nav') || document.querySelector('nav .nav-wrapper ul') || document.querySelector('ul#top_nav');
      if(!top) return;
      if(top.querySelector('li.top-agenda')) return;
      // Locate the 'Esci' LI using multiple strategies
      var esciLi = null;
      esciLi = top.querySelector('li.hide-mobile.esci.right-li') || esciLi;
      if(!esciLi){
        var esciA = top.querySelector('a[href="/preventivatore/mirror/"]');
        if(esciA){ esciLi = esciA.closest('li'); }
      }
      if(!esciLi){
        var icon = Array.from(top.querySelectorAll('i.material-icons')).find(function(i){ return (i.textContent||'').trim()==='logout'; });
        if(icon){
          var a = icon.closest('a');
          esciLi = (a && a.closest('li')) || icon.closest('li');
        }
      }
      // Build Agenda item
      var li = document.createElement('li'); li.className = 'top-agenda right-li'; li.style.cssText = 'float:right;';
      var a = document.createElement('a'); a.href = '/preventivatore/mirror/agenda-page.html'; a.innerHTML = '<i class="material-icons">event</i><span>Agenda</span>';
      li.appendChild(a);
      if(esciLi && esciLi.parentNode){ esciLi.parentNode.insertBefore(li, esciLi); }
      else { top.appendChild(li); }
    }catch(_){ }
  }

  try{ window.ensureAgendaLink = ensureAgendaLink; }catch(_){ }
  try{ window.wireAgendaInline = wireAgendaInline; }catch(_){ }
  function splitCSVLine(line, delim){ var res=[], cur='', inq=false; for(var i=0;i<line.length;i++){ var c=line[i]; if(c==='"'){ inq=!inq; /* non append quote to cur */ } else if(c===delim && !inq){ res.push(cur); cur=''; } else { cur+=c; } } res.push(cur); return res; }
  function cleanField(v){ return String(v==null? '': v).replace(/^\uFEFF/, '').replace(/^\s+|\s+$/g,''); }
  function parseCSV(text){
    try{
      text = String(text||'').replace(/\uFEFF/g,'').replace(/\r\n/g,'\n').replace(/\r/g,'\n');
      var lines = text.split('\n').filter(function(l){ return l!=null && l!==''; });
      if(!lines.length) return [];
      var delim = detectDelim(lines[0]);
      var rows = lines.map(function(l){ return splitCSVLine(l,delim); });
      var start = 0; var hdr = rows[0].map(function(h){ return cleanField(h).toLowerCase(); });
      if(hdr.join(',').indexOf('ruolo')>-1 || hdr.join(',').indexOf('mail')>-1){ start = 1; }
      var out = [];
      for(var i=start;i<rows.length;i++){
        var r=rows[i]; if(!r || r.length<2) continue;
        var ruolo = cleanField(r[0]);
        var mail  = cleanField(r[1]);
        var pass  = cleanField(r[2]);
        var nome  = cleanField(r[3]);
        var am    = cleanField(r[4]);
        if(!mail) continue;
        out.push({ email: normalizeEmail(mail), password: pass, agente:nome, area_manager:am, ruolo:ruolo });
      }
      return out;
    }catch(e){ return []; }
  }
  var LAST_LOAD = { url:null, count:0 };
  async function loadUsers(){
    if(USERS_CACHE && !(typeof window!=='undefined' && window.AUTH_FORCE_RELOAD)) return USERS_CACHE;
    async function tryLoad(url){
      try{
        // Cache-busting: append a version param so CDN/browser always fetch latest CSV
        var fullUrl;
        try {
          var u = new URL(url, window.location.origin);
          // Use explicit version if provided, otherwise timestamp
          var v = (window.AUTH_CSV_VERSION || Date.now());
          u.searchParams.set('v', v);
          fullUrl = u.toString();
        } catch(_) {
          var sep = (url.indexOf('?')>-1?'&':'?');
          fullUrl = url + sep + 'v=' + String(Date.now());
        }
        var rc = await fetch(fullUrl, {cache:'no-cache'});
        if(!rc.ok) return [];
        var text = await rc.text();
        return parseCSV(text);
      }catch(e){ return []; }
    }
    var list = [];
    for(var idx=0; idx<CSV_CANDIDATES.length; idx++){
      var url = CSV_CANDIDATES[idx];
      list = await tryLoad(url);
      LAST_LOAD.url = url; LAST_LOAD.count = list.length;
      if(list.length) break;
    }
    if(list.length){ USERS_CACHE = list; try{ if(typeof window!=='undefined'){ window.AUTH_FORCE_RELOAD = false; } console.log('[Auth] Utenti caricati:', list.length, 'da', LAST_LOAD.url); }catch(_){ } return USERS_CACHE; }
    // No fallback: senza CSV l'elenco utenti è vuoto
    USERS_CACHE = [];
    return USERS_CACHE;
  }
  function applyAgentToDom(){ try{
    var s=getSession(); if(!s) return;
    // hidden ids
    var hid1=document.getElementById('fk_edp_hidden'); if(hid1) hid1.value = s.agente_id||s.email||'';
    var hid2=document.getElementById('fk_agente_hidden'); if(hid2) hid2.value = s.agente_id||s.email||'';

    // Area Manager: prova a trovare input-field con label che contiene "Area Manager"
    try{
      var amLabel = Array.from(document.querySelectorAll('label')).find(function(l){ return /area\s*manager/i.test(l.textContent||''); });
      if(amLabel){
        var amField = amLabel.closest('.input-field');
        if(amField){
          // Materialize: select + .select-wrapper > input.select-dropdown
          var sel = amField.querySelector('select');
          var val = s.area_manager||'';
          if(sel && val){
            var opt = Array.from(sel.options).find(function(o){ return (o.value||o.textContent||'')===val; });
            if(!opt){ opt = document.createElement('option'); opt.value=val; opt.textContent=val; sel.appendChild(opt); }
            sel.value = val;
            sel.setAttribute('value', val);
            try{ sel.dispatchEvent(new Event('change', {bubbles:true})); }catch(_){ }
            try{ if(window.M && M.FormSelect){ M.FormSelect.init(sel); } }catch(_){ }
          }
          var dd = amField.querySelector('input.select-dropdown');
          if(dd && val){ dd.value = val; dd.setAttribute('value', val); }
        }
      }
    }catch(_){ }
  // (moved) ensureAgendaLink and wireAgendaInline are now defined at top-level scope
    // Agente: label che contiene "Agente" e input collegato
    try{
      var agLabel = Array.from(document.querySelectorAll('label')).find(function(l){ return /agente/i.test(l.textContent||''); });
      if(agLabel){
        var agField = agLabel.closest('.input-field');
        var agInput = agField && agField.querySelector('input, select, textarea');
        if(agInput){
          var valA = s.agente||s.nome||s.email||'';
          agInput.value = valA;
          agInput.setAttribute('value', valA);
          try{ agInput.setAttribute('readonly','readonly'); }catch(_){ }
        }
      }
    }catch(_){ }
  }catch(_){ }
  }

  function cleanupSponsorSection(){ try{
    var row = document.querySelector('div.row');
    if(!row) return;
    var sponsor = row.querySelector('section.sponsor.col.s12.form-section');
    if(sponsor && sponsor.parentNode){ sponsor.parentNode.removeChild(sponsor); }
  }catch(_){ }

  function renderSidebarUser(){ try{
    var s = getSession(); if(!s) return;
    var side = document.querySelector('.sidenav .sidenav-profile-wrap');
    if(!side) return;
    var exist = side.querySelector('.auth-user-box'); if(exist) exist.remove();
    var box = document.createElement('div'); box.className='auth-user-box'; box.style.marginTop='8px';
    var ruolo = (s.ruolo||'').toString(); if(ruolo){ ruolo = ruolo.charAt(0).toUpperCase()+ruolo.slice(1); }
    var agente = (s.agente||s.email||'-');
    // two link-like lines: Agente first, then Ruolo
    box.innerHTML = '<a href="#" class="user-line" onclick="return false;">'+agente+'</a>'+
                    '<a href="#" class="user-line" onclick="return false;">'+(ruolo||'-')+'</a>';
    // add clear session action
    var clearA = document.createElement('a');
    clearA.href = '#';
    clearA.className = 'user-line';
    clearA.textContent = 'Pulisci sessione';
    clearA.style.color = '#00c853';
    clearA.addEventListener('click', function(e){ e.preventDefault(); try{ localStorage.removeItem('simac_session_v1'); }catch(_){} try{ window.location.href='/preventivatore/mirror/'; }catch(_){ window.location.reload(); } }, true);
    box.appendChild(clearA);
    side.appendChild(box);
  }catch(_){ }
  async function loginWithCredentials(email, password){
    var users = await loadUsers();
    var em = normalizeEmail(email);
    var u = users.find(function(x){ return x.email===em && x.password===String(password||'').trim(); });
    if(!u) throw new Error('Credenziali non valide');
    var sess={ email: em, agente_id: em, agente: u.agente||em, area_manager: u.area_manager||'', ruolo: (u.ruolo||'').toLowerCase() };
    setSession(sess);
    return sess;
  }
  function logout(){ clearSession(); try{ window.location.href='/preventivatore/mirror/'; }catch(_){ } }
  // expose
  async function usersInfo(){ try{ var arr=await loadUsers(); return { count: arr.length, emails: arr.slice(0,5).map(function(u){ return u.email; }), url: LAST_LOAD.url }; }catch(e){ return {count:0, emails:[], url: LAST_LOAD.url||null}; } }
  function setUsersFromCSV(text){ try{ USERS_CACHE = parseCSV(text)||[]; LAST_LOAD.url = 'inline'; LAST_LOAD.count = USERS_CACHE.length; }catch(_){ USERS_CACHE = []; } }
  async function reloadUsers(){ try{ USERS_CACHE = null; if(typeof window!=='undefined'){ window.AUTH_FORCE_RELOAD = true; } return await loadUsers(); }catch(_){ return []; } }
  window.Auth = { setSession:setSession, get:getSession, clear:clearSession, isLogged:isLogged, require:requireAuth, applyAgentToDom:applyAgentToDom, cleanupSponsorSection:cleanupSponsorSection, renderSidebarUser:renderSidebarUser, login:loginWithCredentials, logout:logout, usersInfo:usersInfo, setUsersFromCSV:setUsersFromCSV, reloadUsers:reloadUsers };

  // Ensure an 'Agenda' link exists in the sidebar above 'Listini'
  function ensureAgendaLink(){
    try{
      var p = (window.location && window.location.pathname) || '';
      if(p.indexOf('/preventivatore/mirror/fv/contratto-fotovoltaico')===0 || p.indexOf('/preventivatore/mirror/i-miei-preventivi')===0){ return; }
      var side = document.getElementById('sidenav');
      if(!side) return;
      // Reuse existing LI if present; ensure correct placement before Listini
      var existingLi = side.querySelector('li.agenda-link');
      var agendaA = side.querySelector('a[href="/preventivatore/mirror/agenda-page.html"], a[href="/preventivatore/mirror/agenda"], a[href="/preventivatore/mirror/agenda.html"], li.agenda-link > a');
      if(!existingLi){
        var li = document.createElement('li');
        li.className = 'agenda-link';
        li.innerHTML = '<a href="/preventivatore/mirror/agenda-page.html"><i class="material-icons left">event</i> Agenda</a>';
        existingLi = li;
      }
      // Retrofit click handler every time to be safe
      try{
        var a = (existingLi && existingLi.querySelector('a')) || agendaA;
        if(a){
          a.setAttribute('href','/preventivatore/mirror/agenda-page.html');
          a.removeAttribute('onclick');
        }
      }catch(_){ }
      // Position as the LAST visible menu item to maximize visibility across variants
      try{
        // Remove duplicates to avoid multiple items
        Array.from(side.querySelectorAll('li.agenda-link')).forEach(function(n){ if(n!==existingLi && n.parentNode){ n.parentNode.removeChild(n); } });
      }catch(_){ }
      // Append after the last <li> in the sidenav
      var allLis = side.querySelectorAll('li');
      if(allLis && allLis.length){
        var lastLi = allLis[allLis.length-1];
        lastLi.parentNode.insertBefore(existingLi, lastLi.nextSibling);
      } else {
        side.appendChild(existingLi);
      }
    }catch(_){ }
  }

  // Intercept click on Agenda to open inline within #wrap using an iframe
  function wireAgendaInline(){
    try{
      var side = document.getElementById('sidenav');
      function isAgendaHref(href){ try{ href=String(href||''); }catch(_){ href=''; } return href.indexOf('/preventivatore/mirror/agenda')>-1; }
      window.wireAgendaInlineOpen = function(a){
        var wrap = document.getElementById('wrap');
        if(!wrap) return false; // no container: allow normal navigation
        var url = (a && (a.dataset && a.dataset.agendaUrl)) || (a && a.getAttribute('href')) || (a && a.href) || '/preventivatore/mirror/agenda.html';
        // Build inline view
        var v = 'inline-'+Date.now();
        var header = ''+
          '<section class="section-bg title">'+
          '  <div class="title-wrap">'+
          '    <a class="sidenav-trigger hide_please" data-target="sidenav" href="#"><i class="material-icons menu-icon">menu</i></a>'+
          '    <a class="hide_please home-link" href="#">'+
          '      <img alt="" class="page-title-logo" src="/logo.png" title="">'+
          '    </a>'+
          '    <h1 class="padding-container">Agenda</h1>'+
          '  </div>'+
          '</section>';
        var content = ''+
          '<section class="section padding-container white-bg">'+
          '  <div class="row">'+
          '    <div class="col s12">'+
          '      <iframe src="'+url+(url.indexOf('?')>-1?'&':'?')+'v='+v+'" style="width:100%;height:85vh;border:0;border-radius:8px;background:#fff;"></iframe>'+
          '    </div>'+
          '  </div>'+
          '</section>';
        wrap.innerHTML = header + content;
        try{ window.scrollTo({top:0, behavior:'smooth'}); }catch(_){ }
        // Mark active
        try{
          side && side.querySelectorAll('a').forEach(function(n){ n.classList.remove('active'); });
          a.classList.add('active');
        }catch(_){ }
        return true;
      }
      // Delegato per apertura inline: attivo solo se AUTH_INLINE_AGENDA===true
      try{ if(typeof window !== 'undefined' && window.AUTH_INLINE_AGENDA){
        document.addEventListener('click', function(e){
          var closest = e.target && e.target.closest ? e.target.closest('a[href]') : null;
          if(!closest) return;
          var hrefAttr = closest.getAttribute('href');
          var hrefAbs = closest.href;
          var tgt = hrefAttr || hrefAbs || '';
          if(!isAgendaHref(tgt)) return;
          try{ inlineOpenAgenda('/preventivatore/mirror/agenda'); }catch(_){ }
          e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation && e.stopImmediatePropagation();
        }, true);
      } }catch(_){ }
    }catch(_){ }
  }

  function bindExplicitLogout(){ try{
      // anchor with /logout already handled below; also bind icon and span inside top nav
      var icon = document.querySelector('#top_nav > li.hide-mobile.esci.right-li > a > i.material-icons');
      var span = document.querySelector('#top_nav > li.hide-mobile.esci.right-li > a > span');
      var a = document.querySelector('#top_nav li.hide-mobile.esci.right-li a'); if(a){ a.setAttribute('href','#'); a.style.cursor='pointer'; a.addEventListener('click', function(e){ e.preventDefault(); e.stopPropagation(); logout(); }, true); }
      [icon, span].forEach(function(el){ if(el){ el.addEventListener('click', function(e){ e.preventDefault(); e.stopPropagation(); logout(); }, true); }});
  }catch(_){ }
  }
  // intercept top logout link if present (anchor, icon, span)
  document.addEventListener('click', function(e){
    var a=e.target.closest && e.target.closest('a[href="/logout"]');
    var a2=e.target.closest && e.target.closest('#top_nav li.hide-mobile.esci.right-li a');
    if(a||a2){ e.preventDefault(); e.stopPropagation(); logout(); }
  }, true);
  function injectClearSessionButton(){
    try{
      if(document.getElementById('auth-clear-session')) return;
      // If sidebar exists, we already added the link there; but also add a floating fallback for pages without sidebar (e.g., login)
      var btn = document.createElement('a');
      btn.id = 'auth-clear-session';
      btn.href = '#';
      btn.textContent = 'Pulisci sessione';
      btn.style.position = 'fixed';
      btn.style.bottom = '12px';
      btn.style.right = '12px';
      btn.style.zIndex = '9999';
      btn.style.background = '#00c853';
      btn.style.color = '#fff';
      btn.style.padding = '8px 10px';
      btn.style.borderRadius = '6px';
      btn.style.boxShadow = '0 2px 6px rgba(0,0,0,0.2)';
      btn.style.fontSize = '12px';
      btn.style.textDecoration = 'none';
      btn.addEventListener('click', function(ev){ ev.preventDefault(); try{ localStorage.removeItem('simac_session_v1'); }catch(_){} try{ window.location.href='/preventivatore/mirror/'; }catch(_){ window.location.reload(); } }, true);
      document.body.appendChild(btn);
    }catch(_){ }
  }
  function maybeClearViaQuery(){
    try{
      var qs = new URLSearchParams(window.location.search||'');
      if(qs.has('clearSession')){
        try{ localStorage.removeItem('simac_session_v1'); }catch(_){ }
        try{ window.location.href = '/preventivatore/mirror/'; }catch(_){ window.location.reload(); }
        return true;
      }
    }catch(_){ }
    return false;
  }
  function ensureFavicon(){ try{ var link = document.querySelector('link[rel="icon"]'); if(!link){ link = document.createElement('link'); link.rel='icon'; link.type='image/png'; link.href='/logo.png'; document.head && document.head.appendChild(link); } else { link.type='image/png'; link.href='/logo.png'; } }catch(_){ } }
  function setupSidebarObservers(){
    try{
      if(!window.MutationObserver) return;
      // Observe current sidenav for internal mutations
      var side = document.getElementById('sidenav');
      if(side){
        try{
          if(!side.__agendaObs){
            side.__agendaObs = new MutationObserver(function(){ ensureAgendaLink(); });
            side.__agendaObs.observe(side, { childList:true, subtree:true });
          }
        }catch(_){ }
      }
      // Observe document for full replacement of #sidenav
      if(!document.__agendaRootObs){
        document.__agendaRootObs = new MutationObserver(function(muts){
          try{
            var hasNewSide = false;
            muts.forEach(function(m){
              m.addedNodes && m.addedNodes.forEach(function(n){
                if(n && n.nodeType===1){
                  if(n.id === 'sidenav' || (n.querySelector && n.querySelector('#sidenav'))){ hasNewSide = true; }
                }
              });
            });
            if(hasNewSide){ ensureAgendaLink(); setupSidebarObservers(); }
          }catch(_){ }
        });
        document.__agendaRootObs.observe(document.documentElement || document.body, { childList:true, subtree:true });
      }
    }catch(_){ }
  }

  function bootUI(){
    try{
      ensureFavicon();
      if(!maybeClearViaQuery()){
        bindExplicitLogout();
        renderSidebarUser();
        ensureAgendaLink();
        ensureTopbarAgenda();
        ensureFloatingAgenda();
        wireAgendaInline();
        setupSidebarObservers();
        setupTopbarObservers();
        // Timed retries: some pages rebuild sidebar shortly after load
        try{
          [150, 400, 1000, 2000, 3000, 5000].forEach(function(ms){ setTimeout(function(){ try{ ensureAgendaLink(); ensureTopbarAgenda(); ensureFloatingAgenda(); setupTopbarObservers(); }catch(_){ } }, ms); });
        }catch(_){ }
        injectClearSessionButton();
      }
    }catch(_){ injectClearSessionButton(); }
  }
  if(document.readyState==='loading'){ document.addEventListener('DOMContentLoaded', bootUI); } else { bootUI(); }
})();

// Global: robust download handler to preserve filename and handle spazi/accenti
(function(){
  async function downloadBlob(url, filename){
    const res = await fetch(url, { credentials:'same-origin' });
    if(!res.ok) throw new Error('HTTP '+res.status);
    const blob = await res.blob();
    const link = document.createElement('a');
    const objUrl = URL.createObjectURL(blob);
    link.href = objUrl;
    link.download = filename || '';
    document.body.appendChild(link);
    link.click();
    setTimeout(function(){ URL.revokeObjectURL(objUrl); link.remove(); }, 0);
  }
  function fileNameFromUrl(u){ try{ var p=new URL(u, window.location.origin).pathname; var n=p.substring(p.lastIndexOf('/')+1); return decodeURIComponent(n); }catch(_){ return ''; } }
  try{
    document.addEventListener('click', function(ev){
      var a = ev.target && ev.target.closest && ev.target.closest('a[download]');
      if(!a) return;
      try{
        var href = a.getAttribute('href') || a.href; if(!href) return;
        var enc = encodeURI(href);
        var fname = a.getAttribute('download') || fileNameFromUrl(href);
        ev.preventDefault(); ev.stopPropagation();
        downloadBlob(enc, fname).catch(function(){
          // Fallback: open encoded link in same tab
          try{ window.location.href = enc; }catch(_){ }
        });
      }catch(_){ }
    }, true);
  }catch(_){ }
})();

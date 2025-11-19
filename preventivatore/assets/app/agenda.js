(function(){
  var API = '/.netlify/functions/agenda';

  function sess(){ try{ if(window.Auth&&Auth.get) return Auth.get(); }catch(_){ } try{ return JSON.parse(localStorage.getItem('simac_session_v1')||'{}'); }catch(_){ return {}; } }
  function canonRole(r){ r=String(r||'').trim().toLowerCase();
    if(r==='direzione'||r==='direzione  '||r==='dir' || r==='d.commerciale') return 'direzione commerciale';
    if(r==='area manager'||r==='area-manager'||r==='area_manager') return 'area manager';
    if(r==='areamanager') return 'areamanager';
    if(r==='azienda') return 'azienda';
    if(r==='agente') return 'agente';
    return r; }
  function headers(){ var s=sess()||{}; return { 'Content-Type':'application/json', 'x-simac-email': (s.agente_id||s.email||''), 'x-simac-role': canonRole(s.ruolo||''), 'x-simac-agente': (s.agente||''), 'x-simac-areamanager': (s.area_manager||'') }; }
  function isElevated(){ var r=String((sess().ruolo||'')).toLowerCase(); return r==='azienda'||r==='direzione commerciale'||r==='direzione commerciale '||r==='area manager'||r==='areamanager'; }

  async function fetchJSON(url, opts){
    var res = await fetch(url, opts||{});
    var text = await res.text();
    if(!res.ok){
      try{ var j=JSON.parse(text||'{}'); throw new Error(j.error || ('HTTP '+res.status)); }catch(_){ throw new Error(text || ('HTTP '+res.status)); }
    }
    try{ return JSON.parse(text||'{}'); }catch(_){ return {}; }
  }

  function pad(n){ return (n<10? '0'+n : String(n)); }
  function fmtDisplay(dt){
    try{
      var d = new Date(dt);
      if(isNaN(d.getTime())) return String(dt||'');
      return pad(d.getDate())+'-'+pad(d.getMonth()+1)+'-'+d.getFullYear()+' - '+pad(d.getHours())+':'+pad(d.getMinutes());
    }catch(_){ return dt||''; }
  }
  function toISOFromLocal(inputValue){
    // input type=datetime-local yields 'YYYY-MM-DDTHH:mm'
    try{
      if(!inputValue) return inputValue;
      var d = new Date(inputValue);
      if(!isNaN(d.getTime())) return d.toISOString();
      return inputValue;
    }catch(_){ return inputValue; }
  }
  function gmapsLink(q){ if(!q) return ''; return 'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(q); }

  async function loadAgents(){
    try{
      var url = '/preventivatore/user.csv';
      var v = (window.AUTH_CSV_VERSION || Date.now());
      var res = await fetch(url + '?v=' + v, {cache:'no-store'});
      if(!res.ok) return [];
      var txt = await res.text();
      txt = txt.replace(/\uFEFF/g,'').replace(/\r\n/g,'\n').replace(/\r/g,'\n');
      var lines = txt.split('\n').filter(Boolean);
      var out = [];
      for(var i=0;i<lines.length;i++){
        var parts = lines[i].split(';');
        if(parts.length<3) continue;
        var ruolo = (parts[0]||'').trim();
        var email = (parts[1]||'').trim().toLowerCase();
        var pass = (parts[2]||'').trim();
        var agente = (parts[3]||'').trim();
        var area_manager = (parts[4]||'').trim();
        // includo SOLO agenti e area manager nella tendina
        var r = ruolo.toLowerCase();
        if((r==='agente' || r==='area manager' || r==='areamanager') && email){
          out.push({ruolo:ruolo, email:email, label: (agente||email), area_manager:area_manager});
        }
      }
      return out;
    }catch(_){ return []; }
  }

  function fillAgentSelect(list){
    var sel = document.getElementById('ag_agente'); if(!sel) return;
    sel.innerHTML = '<option value=""></option>' + list.map(function(a){ return '<option value="'+a.email+'" data-name="'+(a.label||'')+'">'+(a.label||a.email)+'</option>'; }).join('');
    try{ if(window.M && M.FormSelect){ var inst=M.FormSelect.getInstance(sel); if(inst&&inst.destroy) inst.destroy(); M.FormSelect.init(sel); } }catch(_){ }
  }

  function getAgentNameByEmail(list, email){ email = (email||'').toLowerCase(); var f = list.find(function(a){ return a.email===email; }); return f? (f.label||email) : email; }

  async function createAppointment(){
    try{
      var cli = document.getElementById('ag_cli').value.trim();
      var start = document.getElementById('ag_start').value.trim();
      var agentEmail = document.getElementById('ag_agente').value.trim().toLowerCase();
      var luogo = document.getElementById('ag_luogo').value.trim();
      var stato = document.getElementById('ag_stato').value.trim() || 'Nuovo';
      if(!cli || !start || !agentEmail){ try{ if(window.M&&M.toast){ M.toast({html:'Compila Cliente, Data/Ora e Agente'}); } }catch(_){ } return; }
      var list = await loadAgents();
      var payload = { cliente: cli, start_at: start, agente_id: agentEmail, agente_name: getAgentNameByEmail(list, agentEmail), luogo: luogo, stato: stato };
      await fetchJSON(API, { method:'POST', headers: headers(), body: JSON.stringify(payload) });
      await mountList();
      try{ if(window.M&&M.toast){ M.toast({html:'Appuntamento creato'}); } }catch(_){ }
      // reset minimo
      try{ document.getElementById('ag_cli').value=''; document.getElementById('ag_luogo').value=''; if(window.M&&M.updateTextFields) M.updateTextFields(); }catch(_){ }
    }catch(e){
      console.error('Errore creazione', e);
      try{ if(window.M&&M.toast){ M.toast({html:'Errore creazione: '+(e&&e.message?e.message:e), displayLength:2500}); } }catch(_){ }
    }
  }

  async function listAll(){
    var url = API;
    try{ if(isElevated()){ url = API + '?all=1'; } }catch(_){ }
    return await fetchJSON(url, { headers: headers() });
  }

  function renderRow(rec){
    var tr = document.createElement('tr');
    var tdCliente = document.createElement('td'); tdCliente.textContent = rec.cliente||'-';
    var tdDT = document.createElement('td'); tdDT.textContent = fmtDisplay(rec.start_at);
    var tdAg = document.createElement('td'); tdAg.textContent = rec.agente_name||rec.agente_id||'-';
    var tdLuogo = document.createElement('td'); var a=document.createElement('a'); a.href=gmapsLink(rec.luogo); a.target='_blank'; a.rel='noopener'; a.textContent=rec.luogo||'-'; tdLuogo.appendChild(a);
    var tdStato = document.createElement('td'); var chip=document.createElement('div'); chip.className='chip status '+String(rec.stato||'').toLowerCase(); chip.textContent=rec.stato||'Nuovo'; tdStato.appendChild(chip);
    var tdFeed = document.createElement('td'); tdFeed.textContent = rec.feedback||'';
    var tdAct = document.createElement('td'); tdAct.className='agenda-actions';

    var s = sess(); var myEmail = (s.agente_id||s.email||'').toLowerCase(); var elevated = isElevated();
    // Azioni per agente proprietario
    if(myEmail && myEmail===String(rec.agente_id||'').toLowerCase()){
      var btnEsita = document.createElement('button'); btnEsita.className='btn'; btnEsita.textContent='Esita'; btnEsita.addEventListener('click', function(){ openEsita(rec); }); tdAct.appendChild(btnEsita);
    }
    // Azioni per elevati
    if(elevated){
      var btnMod = document.createElement('button'); btnMod.className='btn'; btnMod.textContent='Modifica'; btnMod.addEventListener('click', function(){ openModifica(rec); }); tdAct.appendChild(btnMod);
      var btnDel = document.createElement('button'); btnDel.className='btn red'; btnDel.style.marginLeft='6px'; btnDel.textContent='Elimina'; btnDel.addEventListener('click', async function(){ if(confirm('Eliminare appuntamento?')){ await fetchJSON(API+'?id='+encodeURIComponent(rec.id), { method:'DELETE', headers: headers() }); mountList(); } }); tdAct.appendChild(btnDel);
    }

    tr.appendChild(tdCliente); tr.appendChild(tdDT); tr.appendChild(tdAg); tr.appendChild(tdLuogo); tr.appendChild(tdStato); tr.appendChild(tdFeed); tr.appendChild(tdAct);
    return tr;
  }

  function ensureEsitaModal(){
    if(document.getElementById('esita_modal')) return;
    var html = ''+
      '<div id="esita_modal" class="modal">'+
      '  <div class="modal-content">'+
      '    <h5 style="margin-top:0">Esita appuntamento</h5>'+
      '    <div class="row" style="margin-bottom:0">'+
      '      <div class="input-field col s12 m6">'+
      '        <select id="esita_stato" class="browser-default">'+
      '          <option value="Annullato">Annullato</option>'+
      '          <option value="Spostato">Spostato</option>'+
      '          <option value="Trattativa">Trattativa</option>'+
      '          <option value="Ko">Ko</option>'+
      '          <option value="Chiuso">Chiuso</option>'+
      '        </select>'+
      '        <label style="left:0; transform:none; font-size:0.9rem; color:#9e9e9e;">Stato</label>'+
      '      </div>'+
      '      <div class="input-field col s12 m6" id="esita_dt_wrap" style="display:none;">'+
      '        <input type="datetime-local" id="esita_dt" />'+
      '        <label class="active" for="esita_dt">Nuova data/ora</label>'+
      '      </div>'+
      '      <div class="input-field col s12">'+
      '        <textarea id="esita_feedback" class="materialize-textarea" placeholder="Feedback"></textarea>'+
      '        <label class="active" for="esita_feedback">Feedback</label>'+
      '      </div>'+
      '    </div>'+
      '  </div>'+
      '  <div class="modal-footer">'+
      '    <a href="#" id="esita_cancel" class="modal-close btn-flat">Annulla</a>'+
      '    <a href="#" id="esita_save" class="btn">Salva</a>'+
      '  </div>'+
      '</div>';
    var div = document.createElement('div'); div.innerHTML = html; document.body.appendChild(div.firstChild);
    try{ if(window.M && M.Modal){ M.Modal.init(document.getElementById('esita_modal')); } }catch(_){ }
  }

  function openEsita(rec){
    ensureEsitaModal();
    var modalEl = document.getElementById('esita_modal');
    var sel = document.getElementById('esita_stato');
    var fb = document.getElementById('esita_feedback');
    var dtWrap = document.getElementById('esita_dt_wrap');
    var dt = document.getElementById('esita_dt');
    // default values
    sel.value = 'Annullato';
    fb.value = rec.feedback||'';
    try{ if(window.M&&M.updateTextFields) M.updateTextFields(); }catch(_){ }
    // show/hide datetime on change
    function updateDt(){ dtWrap.style.display = (/^Spostato$/i.test(sel.value)? 'block':'none'); }
    sel.onchange = updateDt; updateDt();
    // wire save
    var saving = false;
    var saveBtn = document.getElementById('esita_save');
    var onSave = async function(e){ e.preventDefault(); if(saving) return; saving=true;
      try{
        var stato = sel.value;
        var feedback = fb.value||'';
        if(/^Spostato$/i.test(stato)){
          var ndLocal = dt.value && dt.value.trim();
          if(!ndLocal){ saving=false; try{ if(window.M&&M.toast){ M.toast({html:'Seleziona la nuova data'}); } }catch(_){ } return; }
          var ndISO = toISOFromLocal(ndLocal);
          // crea nuovo appuntamento duplicato con nuova data, stato Nuovo
          try{
            var payload = { cliente: rec.cliente, start_at: ndISO, agente_id: rec.agente_id, agente_name: rec.agente_name, luogo: rec.luogo, stato: 'Nuovo' };
            await fetchJSON('/.netlify/functions/agenda', { method:'POST', headers: headers(), body: JSON.stringify(payload) });
          }catch(_){ }
          // marca quello attuale come Spostato + feedback
          await updateAppointment(rec.id, { stato: 'Spostato', feedback: feedback });
        } else {
          await updateAppointment(rec.id, { stato: stato, feedback: feedback });
        }
        try{ var inst = (window.M&&M.Modal)? M.Modal.getInstance(modalEl) : null; if(inst){ inst.close(); } else { modalEl.style.display='none'; } }catch(_){ }
      }finally{ saving=false; }
    };
    saveBtn.onclick = onSave;
    // open
    try{ var inst2 = (window.M&&M.Modal)? M.Modal.getInstance(modalEl) : null; if(inst2){ inst2.open(); } else { modalEl.style.display='block'; } }catch(_){ modalEl.style.display='block'; }
  }

  function openModifica(rec){
    var start = prompt('Data/Ora (YYYY-MM-DDTHH:mm):', rec.start_at||''); if(start==null) return;
    updateAppointment(rec.id, { start_at: start });
  }

  async function updateAppointment(id, patch){
    await fetchJSON(API+'?id='+encodeURIComponent(id), { method:'PATCH', headers: headers(), body: JSON.stringify(patch||{}) });
    await mountList();
    try{ if(window.M&&M.toast){ M.toast({html:'Aggiornato'}); } }catch(_){ }
  }

  async function mountList(){
    var tbody = document.querySelector('#agenda_table tbody'); var empty=document.getElementById('agenda_empty');
    tbody.innerHTML=''; empty.textContent='Caricamento…';
    var flt = document.getElementById('flt_stato').value.trim();
    var res = await listAll(); var rows = res.items||[];
    if(flt){ rows = rows.filter(function(r){ return String(r.stato||'').toLowerCase()===flt.toLowerCase(); }); }
    rows.sort(function(a,b){ return String(a.start_at||'').localeCompare(String(b.start_at||'')); });
    rows.forEach(function(r){ tbody.appendChild(renderRow(r)); });
    empty.style.display = tbody.children.length? 'none':'block';
  }

  async function init(){
    try{ if(!sess()||!sess().ruolo) return; }catch(_){ }
    // Form visibile solo a ruoli elevati
    var wrap = document.getElementById('agenda-form-wrap'); if(wrap) wrap.style.display = isElevated()? 'block':'none';
    // Carica tendina agenti
    try{ var list = await loadAgents(); fillAgentSelect(list); }catch(_){ }
    // Wire
    document.getElementById('ag_save').addEventListener('click', createAppointment);
    document.getElementById('flt_stato').addEventListener('change', mountList);
    await mountList();
  }

  if(document.readyState==='loading'){ document.addEventListener('DOMContentLoaded', init); } else { init(); }
})();

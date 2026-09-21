import { loadFleetData, saveFleetData, uploadCarImage, prepareCarImage } from "./firebase.js";


const KEY='frota_carros_v1', ADMIN='johnfranca321'; window.adminMode=false;
function uuid(){return (window.crypto&&crypto.randomUUID)?crypto.randomUUID():'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0,v=c==='x'?r:(r&0x3|0x8);return v.toString(16)})}
const DEFAULT_CAR_PHOTO = "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 450"><rect width="800" height="450" fill="#eef2f7"/><path d="M180 285l45-95h320l75 95v55H180z" fill="#d8dee8"/><circle cx="275" cy="345" r="38" fill="#64748b"/><circle cx="525" cy="345" r="38" fill="#64748b"/><text x="400" y="150" text-anchor="middle" font-family="Arial" font-size="32" fill="#334155">CONTROLE DE FROTA</text></svg>`);
let data={cars:[],employees:[],bookings:[],history:[]};
let firebaseReady=false;
const LOCAL_KEY='controle_frota_backup_v2';
const $=id=>document.getElementById(id);
const dom=new Proxy({}, {get:(_,id)=>$(id)});
function saveLocal(){ try{ localStorage.setItem(LOCAL_KEY, JSON.stringify({version:2, updatedAt:Date.now(), data})); }catch(e){ console.warn('Backup local indisponível',e); } }
function loadLocal(){ try{ const raw=JSON.parse(localStorage.getItem(LOCAL_KEY)||'null'); if(raw&&raw.data) return {data:raw.data,updatedAt:Number(raw.updatedAt||0)}; if(raw&&raw.cars) return {data:raw,updatedAt:0}; return null; }catch(e){ return null; } }
let viewDate=new Date();viewDate.setDate(1);
async function save(){
  saveLocal();
  try { await saveFleetData(data); firebaseReady=true; return true; }
  catch(error){ console.error('Firebase: falha ao salvar', error); firebaseReady=false; alert('Os dados foram salvos neste aparelho, mas o Firebase não aceitou a gravação. Publique as regras do Firestore e tente novamente.'); return false; }
}
function esc(s=''){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}
function dt(v){if(!v)return '—';let d=new Date(v);return d.toLocaleDateString('pt-BR')+' '+d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}
function badge(s){let c=s==='DEVOLVIDO'?'b-green':s==='EM USO'?'b-orange':s==='RETIRADO'?'b-blue':'b-gray';return `<span class="badge ${c}">${s}</span>`}
function car(id){return data.cars.find(c=>c.id===id)}
function emp(id){return data.employees.find(e=>e.id===id)}
function carLabel(c){return c?`${esc(c.model)} · ${esc(c.plate)}`:'Carro removido'}
function openModal(t,b,f=''){$('modal').classList.remove('admin-mode');const mb=$('modal').querySelector('.box');if(mb)mb.classList.remove('admin-box');$('modalTitle').textContent=t;$('modalBody').innerHTML=b;$('modalFoot').innerHTML=f;$('modal').classList.add('show')}
function closeModal(){window.adminMode=false;$('modal').classList.remove('show','admin-mode');const b=$('modal').querySelector('.box');if(b)b.classList.remove('admin-box')}
function scrollToId(id){document.getElementById(id)?.scrollIntoView({behavior:'smooth'})}
function changeMonth(n){
  viewDate.setMonth(viewDate.getMonth()+n);
  if(selectedCarId) renderCalendar();
}
let selectedCarId=null;
function render(){
  renderCarousel();
  if(selectedCarId) renderCalendar();
  let p=data.bookings.filter(b=>b.status!=='DEVOLVIDO').sort((a,b)=>new Date(a.start)-new Date(b.start));
  $('pending').innerHTML=p.length?p.map(b=>`<tr><td><b>${String(car(b.carId)?.number||'').padStart(2,'0')} - ${esc(car(b.carId)?.model||'').toUpperCase()}</b><div class="tiny">${esc(car(b.carId)?.plate||'')}</div></td><td>${esc(emp(b.actualPickupId||b.employeeId)?.name||'—')}</td><td>${dt(b.actualPickupAt||b.start)}</td><td>${dt(b.end)}</td><td>${badge(b.status)}</td><td>${b.status==='PENDENTE'?'<span class="tiny">Aguardando aprovação do ADM</span>':`<button class="btn primary" onclick="showBooking('${b.id}')">${b.status==='AGENDADO'?'RETIRAR':'DEVOLVER'}</button>`}</td></tr>`).join(''):'<tr><td colspan="6"><div class="empty">Nenhuma retirada pendente.</div></td></tr>';
}
function renderCarousel(){
  if(!data.cars.length){
    $('carMiniList').innerHTML='<div class="empty">Nenhum carro cadastrado.</div>';
    $('heroName').textContent='SEM VEÍCULOS'; $('heroPlate').textContent='—'; $('heroSeats').textContent='—'; return;
  }
  if(!selectedCarId) selectedCarId=data.cars[0].id;
  let c=car(selectedCarId)||data.cars[0]; selectedCarId=c.id;
  $('heroNumber').textContent=String(c.number||'').padStart(2,'0');
  $('heroName').textContent=(c.model||'CARRO').toUpperCase();
  $('heroPlate').textContent=c.plate||'—';
  $('heroSeats').textContent=`${c.seats||'—'} LUGARES`;
  const today=new Date().toISOString().slice(0,10);
  const busy=data.bookings.some(b=>b.carId===c.id&&b.status!=='DEVOLVIDO'&&b.start.slice(0,10)<=today&&b.end.slice(0,10)>=today);
  $('heroStatus').textContent=busy?'RESERVADO HOJE':'LIVRE HOJE';
  $('heroStatus').style.color=busy?'var(--orange)':'var(--green)';
  $('heroCarImage').src=c.photo||DEFAULT_CAR_PHOTO;
  $('heroCarImage').alt=`${c.model||'Carro'} - frota ${String(c.number||'').padStart(2,'0')}`;
  $('carMiniList').innerHTML=data.cars.map(x=>`<button class="car-mini ${x.id===selectedCarId?'active':''}" onclick="selectCar('${x.id}')">${String(x.number||'').padStart(2,'0')} - ${esc(x.model).toUpperCase()}</button>`).join('');
  $('heroDots').innerHTML=data.cars.map((x)=>`<span class="hero-dot ${x.id===selectedCarId?'active':''}"></span>`).join('');
}
function selectCar(id){
  selectedCarId=id; renderCarousel();
  $('selectedCalendar').style.display='block';
  $('selectedCarTitle').textContent=`${String(car(id)?.number||'').padStart(2,'0')} - ${(car(id)?.model||'').toUpperCase()}`;
  renderCalendar();
  $('selectedCalendar').scrollIntoView({behavior:'smooth',block:'start'});
}
function carSlide(dir){
  if(!data.cars.length)return;
  let i=data.cars.findIndex(c=>c.id===selectedCarId); if(i<0)i=0;
  i=(i+dir+data.cars.length)%data.cars.length;
  const img=$('heroCarImage'); img.classList.add('swap');
  setTimeout(()=>{selectedCarId=data.cars[i].id;renderCarousel();img.classList.remove('swap')},150);
}
function openSelectedCarCalendar(){
  if(!selectedCarId||!data.cars.length)return;
  document.body.classList.add('home-hidden');
  selectCar(selectedCarId);
  window.scrollTo({top:0,behavior:'smooth'});
}
function clearSelectedCar(){
  $('selectedCalendar').style.display='none';
  document.body.classList.remove('home-hidden');
  window.scrollTo({top:0,behavior:'smooth'});
}
function renderCalendar(){
  const y=viewDate.getFullYear(),m=viewDate.getMonth(),first=(new Date(y,m,1).getDay()+6)%7,days=new Date(y,m+1,0).getDate();
  $('monthLabel').textContent=viewDate.toLocaleDateString('pt-BR',{month:'long',year:'numeric'});
  let h='<div class="calendar">'+['SEG','TER','QUA','QUI','SEX','SÁB','DOM'].map(x=>`<div class="wd">${x}</div>`).join('');
  for(let i=0;i<first;i++)h+='<div class="day muted"></div>';
  for(let d=1;d<=days;d++){
    const key=`${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`, today=new Date().toISOString().slice(0,10)===key;
    const bs=data.bookings.filter(b=>(!selectedCarId||b.carId===selectedCarId)&&b.start.slice(0,10)<=key&&b.end.slice(0,10)>=key).sort((a,b)=>new Date(a.start)-new Date(b.start));
    h+=`<div class="day ${today?'today':''}"><div class="num">${d}</div>${bs.map(b=>{let c=car(b.carId),s=new Date(b.start),e=new Date(b.end),start=s.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}),end=e.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});const cls=b.status==='DEVOLVIDO'?'done':(b.status==='EM USO'||b.status==='RETIRADO')?'inuse':(b.status==='PENDENTE'?'pending':'scheduled');const statusLabel=b.status==='DEVOLVIDO'?'ENTREGUE':(b.status==='EM USO'||b.status==='RETIRADO')?'EM USO':(b.status==='PENDENTE'?'AGUARDANDO APROVAÇÃO':'AGENDADO');const who=b.actualPickupId?` · ${esc(emp(b.actualPickupId)?.name||'')}`:'';return `<div class="event ${cls}" onclick="showBooking('${b.id}')" title="${esc(c?.model||'')}"><div class="eventtext"><div class="time">${start} até ${end}</div><div class="label"><b>${String(c?.number||'').padStart(2,'0')}</b> - ${esc(c?.model||'').toUpperCase()}</div><span class="event-status ${cls}">${statusLabel}${who}</span></div></div>`}).join('')}</div>`;
  } h+='</div>';$('calendar').innerHTML=h;
}
function openBooking(editId=''){
 if(!data.cars.length||!data.employees.length){openModal('Cadastros necessários',`<div class="notice">Cadastre pelo menos um carro e um funcionário em CONTROLE antes de agendar.</div>`,`<button class="btn primary" onclick="closeModal();openAdmin()">ABRIR CONTROLE</button>`);return}
 const edit = editId && data.bookings.some(x=>x.id===editId);
 const b=edit?data.bookings.find(x=>x.id===editId):null;
 const presetCar=!edit&&selectedCarId?selectedCarId:null;
 const cars=data.cars.map(c=>`<option value="${c.id}" ${(b?.carId===c.id||presetCar===c.id)?'selected':''}>${String(c.number).padStart(2,'0')} · ${esc(c.model)} · ${esc(c.plate)}</option>`).join('');
 const emps=data.employees.map(e=>`<option value="${e.id}" ${b?.employeeId===e.id?'selected':''}>${esc(e.name)}</option>`).join('');
 openModal(b?'Editar agendamento':'Novo agendamento',`<div class="form">
  <div class="field"><label>Carro</label><select id="fCar">${cars}</select></div>
  <div class="field"><label>Quem vai pegar</label><select id="fEmp">${emps}</select></div>
  <div class="field"><label>Data e hora da retirada</label><input id="fStart" type="datetime-local" value="${b?.start||''}"></div>
  <div class="field"><label>Data e hora da devolução</label><input id="fEnd" type="datetime-local" value="${b?.end||''}"></div>
  <div class="field wide"><label>Observação (opcional)</label><textarea id="fObs">${esc(b?.obs||'')}</textarea></div>
 </div>`,`<button class="btn dark" onclick="closeModal()">CANCELAR</button><button class="btn primary" onclick="saveBooking('${editId}')">SALVAR</button>`);
}
async function saveBooking(id){
 const start=$('fStart').value,end=$('fEnd').value,carId=$('fCar').value;
 if(!start||!end||new Date(end)<=new Date(start))return alert('Informe um período válido.');
 const conflict=data.bookings.some(b=>b.id!==id&&b.carId===carId&&b.status!=='DEVOLVIDO'&&new Date(start)<new Date(b.end)&&new Date(end)>new Date(b.start));
 if(conflict)return alert('Esse carro já possui uma solicitação/agendamento nesse horário.');
 const obj={carId,employeeId:$('fEmp').value,start,end,obs:$('fObs').value};
 if(id){
   const b=data.bookings.find(x=>x.id===id);
   if(!b)return;
   Object.assign(b,obj);
 }else{
   data.bookings.push({id:uuid(),...obj,status:'PENDENTE',createdAt:new Date().toISOString()});
 }
 await save();closeModal();render();
}
function showBooking(id){
  const b=data.bookings.find(x=>x.id===id);if(!b)return;
  const c=car(b.carId);
  let actions='';
  if(b.status==='PENDENTE'){
    actions+=`<div class="notice">Este agendamento está aguardando autorização do administrador na aba CONTROLES.</div>`;
  }
  if(b.status==='AGENDADO')actions+=`<button class="btn primary" onclick="pickup('${id}')">REGISTRAR RETIRADA</button>`;
  if((b.status==='EM USO'||b.status==='RETIRADO') && window.adminMode)actions+=`<button class="btn primary" onclick="returnCar('${id}')">REGISTRAR DEVOLUÇÃO</button>`;
  if(window.adminMode && b.status!=='DEVOLVIDO')actions+=`<button class="btn dark" onclick="openBooking('${id}')">EDITAR</button>`;
  openModal('Agendamento',`<div class="carrow" style="margin-bottom:14px"><div><b>${String(c?.number||'').padStart(2,'0')} - ${esc(c?.model||'').toUpperCase()}</b><div class="tiny">${esc(c?.plate||'')}</div></div></div>
  <div class="form">
   <div class="field"><label>Funcionário</label><input disabled value="${esc(emp(b.employeeId)?.name||'—')}"></div>
   <div class="field"><label>Status</label><input disabled value="${b.status}"></div>
   <div class="field"><label>Retirada</label><input disabled value="${dt(b.start)}"></div>
   <div class="field"><label>Devolução prevista</label><input disabled value="${dt(b.end)}"></div>
   <div class="field"><label>Quem pegou</label><input disabled value="${esc(emp(b.actualPickupId)?.name||'—')}"></div>
   <div class="field"><label>Quem devolveu</label><input disabled value="${esc(emp(b.actualReturnId)?.name||'—')}"></div>
   <div class="field wide"><label>Observação</label><textarea disabled>${esc(b.obs||'—')}</textarea></div>
  </div>`,actions+`<button class="btn dark" onclick="closeModal()">FECHAR</button>`);
}
async function approveBooking(id){
  const b=data.bookings.find(x=>x.id===id);
  if(!b||b.status!=='PENDENTE')return;
  const conflict=data.bookings.some(x=>x.id!==id&&x.carId===b.carId&&x.status!=='DEVOLVIDO'&&new Date(b.start)<new Date(x.end)&&new Date(b.end)>new Date(x.start));
  if(conflict)return alert('Não foi possível autorizar: o carro já possui outro agendamento/uso nesse período.');
  b.status='AGENDADO';b.approvedAt=new Date().toISOString();
  await save();adminTab('approvals');render();
}
async function rejectBooking(id){
  const b=data.bookings.find(x=>x.id===id);
  if(!b||b.status!=='PENDENTE')return;
  if(!confirm('Recusar esta solicitação de agendamento?'))return;
  data.bookings=data.bookings.filter(x=>x.id!==id);
  data.history.push({...b,rejectedAt:new Date().toISOString(),status:'RECUSADO'});
  await save();adminTab('approvals');render();
}
function pickup(id){
 const b=data.bookings.find(x=>x.id===id),opts=data.employees.map(e=>`<option value="${e.id}" ${e.id===b.employeeId?'selected':''}>${esc(e.name)}</option>`).join('');
 openModal('Registrar retirada',`<div class="field"><label>Quem realmente pegou?</label><select id="pickEmp">${opts}</select></div>`,`<button class="btn dark" onclick="closeModal()">CANCELAR</button><button class="btn primary" onclick="confirmPickup('${id}')">CONFIRMAR</button>`);
}
async function confirmPickup(id){let b=data.bookings.find(x=>x.id===id);b.actualPickupId=$('pickEmp').value;b.actualPickupAt=new Date().toISOString();b.status='EM USO';await save();closeModal();render()}
function returnCar(id){
 const opts=data.employees.map(e=>`<option value="${e.id}">${esc(e.name)}</option>`).join('');
 openModal('Registrar devolução',`<div class="field"><label>Quem devolveu?</label><select id="returnEmp">${opts}</select></div>`,`<button class="btn dark" onclick="closeModal()">CANCELAR</button><button class="btn primary" onclick="confirmReturn('${id}')">CONFIRMAR</button>`);
}
async function confirmReturn(id){let b=data.bookings.find(x=>x.id===id);b.actualReturnId=$('returnEmp').value;b.actualReturnAt=new Date().toISOString();b.status='DEVOLVIDO';await save();closeModal();render()}
function openAdmin(){
 openModal('Controle',`<div class="field"><label>Senha</label><input id="adminPass" type="password" placeholder="Senha administrativa"></div><div id="err" class="dangertext"></div>`,`<button class="btn dark" onclick="closeModal()">CANCELAR</button><button class="btn primary" onclick="checkAdmin()">ENTRAR</button>`);
}
function checkAdmin(){if($('adminPass').value===ADMIN){closeModal();adminPanel()}else $('err').textContent='Senha incorreta.'}
function adminPanel(){
  window.adminMode=true;
  openModal('CONTROLES',`<div class="tabs">
    <button id="ta" class="tab active" onclick="adminTab('approvals')">APROVAÇÕES</button>
    <button id="tc" class="tab" onclick="adminTab('cars')">CARROS</button>
    <button id="te" class="tab" onclick="adminTab('emp')">FUNCIONÁRIOS</button>
    <button id="th" class="tab" onclick="adminTab('hist')">REGISTROS</button>
  </div><div class="admin-content-wrap" id="adminContent"></div>`,
  `<button class="btn dark" onclick="closeModal()">VOLTAR AO PAINEL</button>`);
  $('modal').classList.add('admin-mode');
  document.querySelector('#modal .box').classList.add('admin-box');
  adminTab('approvals');
}
function adminTab(t){
  const tabs=[$('ta'),$('tc'),$('te'),$('th')]; tabs.forEach(x=>x&&x.classList.remove('active'));
  (t==='approvals'?$('ta'):t==='cars'?$('tc'):t==='emp'?$('te'):$('th')).classList.add('active');

  if(t==='approvals'){
    const pendingBookings=data.bookings.filter(b=>b.status==='PENDENTE').sort((a,b)=>new Date(a.start)-new Date(b.start));
    const activeBookings=data.bookings.filter(b=>b.status==='AGENDADO'||b.status==='EM USO'||b.status==='RETIRADO').sort((a,b)=>new Date(a.start)-new Date(b.start));
    $('adminContent').innerHTML=`<div class="admin-titleline">
      <div>
        <div class="admin-section-title">Aprovação de agendamentos</div>
        <div class="admin-help">Todo pedido novo fica pendente até o administrador autorizar. A retirada pode ser feita pelo funcionário; a devolução só pode ser registrada aqui.</div>
      </div>
    </div>
    <section class="admin-panel">
      <div class="admin-panel-head">SOLICITAÇÕES AGUARDANDO AUTORIZAÇÃO (${pendingBookings.length})</div>
      <div class="table-scroll"><table class="simple-table"><thead><tr><th>VEÍCULO</th><th>FUNCIONÁRIO</th><th>RETIRADA</th><th>DEVOLUÇÃO PREVISTA</th><th>STATUS</th><th>AÇÕES</th></tr></thead>
      <tbody>${pendingBookings.map(b=>`<tr>
        <td><b>${String(car(b.carId)?.number||'').padStart(2,'0')} - ${esc(car(b.carId)?.model||'').toUpperCase()}</b><div class="tiny">${esc(car(b.carId)?.plate||'')}</div></td>
        <td>${esc(emp(b.employeeId)?.name||'—')}</td>
        <td>${dt(b.start)}</td>
        <td>${dt(b.end)}</td>
        <td>${badge('PENDENTE')}</td>
        <td><button class="btn primary" onclick="approveBooking('${b.id}')">AUTORIZAR</button> <button class="btn danger" onclick="rejectBooking('${b.id}')">RECUSAR</button></td>
      </tr>`).join('')||'<tr><td colspan="6"><div class="empty">Nenhuma solicitação aguardando aprovação.</div></td></tr>'}</tbody></table></div>
    </section>
    <section class="admin-panel">
      <div class="admin-panel-head">AGENDAMENTOS AUTORIZADOS / EM USO</div>
      <div class="table-scroll"><table class="simple-table"><thead><tr><th>VEÍCULO</th><th>FUNCIONÁRIO</th><th>RETIRADA</th><th>DEVOLUÇÃO PREVISTA</th><th>STATUS</th><th>QUEM PEGOU</th><th>AÇÃO</th></tr></thead>
      <tbody>${activeBookings.map(b=>`<tr>
        <td><b>${String(car(b.carId)?.number||'').padStart(2,'0')} - ${esc(car(b.carId)?.model||'').toUpperCase()}</b><div class="tiny">${esc(car(b.carId)?.plate||'')}</div></td>
        <td>${esc(emp(b.employeeId)?.name||'—')}</td>
        <td>${dt(b.actualPickupAt||b.start)}</td>
        <td>${dt(b.end)}</td>
        <td>${badge(b.status)}</td>
        <td>${esc(emp(b.actualPickupId)?.name||'Ainda não retirado')}</td>
        <td>${(b.status==='EM USO'||b.status==='RETIRADO')?`<button class="btn primary" onclick="returnCar('${b.id}')">REGISTRAR DEVOLUÇÃO</button>`:'<span class="tiny">Aguardando retirada</span>'}</td>
      </tr>`).join('')||'<tr><td colspan="7"><div class="empty">Nenhum agendamento autorizado em andamento.</div></td></tr>'}</tbody></table></div>
    </section>`;
  }

  if(t==='cars'){
    $('adminContent').innerHTML=`<div class="admin-titleline">
      <div>
        <div class="admin-section-title">Frota de carros</div>
        <div class="admin-help">Cadastre e gerencie os veículos usados nos agendamentos.</div>
      </div>
    </div>
    <section class="admin-panel">
      <div class="admin-panel-head">CADASTRAR CARRO</div>
      <div class="admin-panel-body">
        <div class="admin-form-row">
          <div class="field"><input id="cm" placeholder="Nome/modelo do carro"></div>
          <div class="field"><select id="cs"><option value="2">2 lugares</option><option value="4">4 lugares</option><option value="5">5 lugares</option><option value="7">7 lugares</option></select></div>
          <div class="field"><input id="cp" placeholder="Placa"></div>
          <div class="field"><input id="cn" type="number" min="1" max="99" placeholder="Nº frota"></div>
          <button class="btn primary wide-mobile" onclick="addCar()">ADICIONAR</button>
        </div>
        <div class="photo-field" style="margin-top:9px">
          <input id="cphoto" class="upload-input" type="file" accept="image/*" onchange="previewCarPhoto(this)">
          <img id="cphotoPreview" class="photo-preview" alt="Prévia do carro" src="${DEFAULT_CAR_PHOTO}">
          <div class="photo-note">Foto do veículo. Ela fica vinculada ao carro e é usada na tela inicial.</div>
        </div>
      </div>
    </section>
    <section class="admin-panel">
      <div class="admin-panel-head">CARROS CADASTRADOS</div>
      <div class="table-scroll"><table class="simple-table"><thead><tr><th>Nº</th><th>MODELO</th><th>ESPAÇO</th><th>PLACA</th><th>AÇÕES</th></tr></thead>
      <tbody>${data.cars.map(c=>`<tr><td><b>${String(c.number).padStart(2,'0')}</b></td><td>${esc(c.model).toUpperCase()}</td><td>${c.seats} lugares</td><td>${esc(c.plate)}</td><td><button class="btn dark" onclick="editCar('${c.id}')">EDITAR</button> <button class="btn danger" onclick="removeCar('${c.id}')">EXCLUIR</button></td></tr>`).join('')||'<tr><td colspan="5"><div class="empty">Nenhum carro cadastrado.</div></td></tr>'}</tbody></table></div>
    </section>`;
  }

  if(t==='emp'){
    $('adminContent').innerHTML=`<div class="admin-titleline">
      <div>
        <div class="admin-section-title">Funcionários</div>
        <div class="admin-help">Os nomes cadastrados aqui aparecem diretamente nos agendamentos, retiradas e devoluções.</div>
      </div>
    </div>
    <section class="admin-panel">
      <div class="admin-panel-head">NOVO FUNCIONÁRIO</div>
      <div class="admin-panel-body">
        <div class="admin-form-row" style="grid-template-columns:1fr auto">
          <div class="field"><input id="en" placeholder="Nome do funcionário"></div>
          <button class="btn primary wide-mobile" onclick="addEmp()">ADICIONAR</button>
        </div>
      </div>
    </section>
    <section class="admin-panel">
      <div class="admin-panel-head">FUNCIONÁRIOS CADASTRADOS</div>
      <div class="table-scroll"><table class="simple-table"><thead><tr><th>FUNCIONÁRIO</th><th>AÇÕES</th></tr></thead>
      <tbody>${data.employees.map(e=>`<tr><td>${esc(e.name).toUpperCase()}</td><td><button class="btn danger" onclick="removeEmp('${e.id}')">EXCLUIR</button></td></tr>`).join('')||'<tr><td colspan="2"><div class="empty">Nenhum funcionário cadastrado.</div></td></tr>'}</tbody></table></div>
    </section>`;
  }

  if(t==='hist'){
    $('adminContent').innerHTML=`<div class="admin-titleline">
      <div>
        <div class="admin-section-title">Histórico de retirada/devolução de veículos</div>
        <div class="admin-help">Use o PDF no fim de cada mês para arquivar os registros de quem efetivamente retirou os carros.</div>
      </div>
    </div>
    <section class="admin-panel">
      <div class="admin-panel-head">REGISTROS E RELATÓRIO MENSAL</div>
      <div class="admin-panel-body">
        <div class="actions">
          <div class="field" style="min-width:160px"><label>Mês do PDF</label><input id="pdfMonth" type="month" value="${new Date().toISOString().slice(0,7)}"></div>
          <button class="btn primary" onclick="generatePickupPDF()">GERAR PDF</button>
          <button class="btn danger" onclick="clearCompleted()">LIMPAR REGISTROS</button>
        </div>
      </div>
      <div class="table-scroll"><table class="simple-table"><thead><tr><th>VEÍCULO</th><th>PLACA</th><th>QUEM PEGOU</th><th>RETIRADA / PREVISÃO</th><th>STATUS</th><th>QUEM DEVOLVEU</th><th>TEMPO</th></tr></thead>
      <tbody>${data.bookings.map(b=>`<tr>
        <td>${esc(car(b.carId)?.model||'Carro removido')} (${car(b.carId)?.seats||''} lugares)</td>
        <td>${esc(car(b.carId)?.plate||'—')}</td>
        <td>${esc(b.actualPickupId?emp(b.actualPickupId)?.name||'—':'Ainda não retirado')}<div class="tiny">${b.actualPickupAt?dt(b.actualPickupAt):`Agendado para ${esc(emp(b.employeeId)?.name||'—')}`}</div></td>
        <td>${dt(b.actualPickupAt||b.start)}</td>
        <td>${badge(b.status)}</td>
        <td>${b.actualReturnId?`${esc(emp(b.actualReturnId)?.name||'—')}<div class="tiny">${dt(b.actualReturnAt)}</div>`:'Ainda não devolvido'}</td>
        <td>${esc(b.actualPickupAt?durationStr(new Date(b.actualReturnAt||new Date())-new Date(b.actualPickupAt)):'—')}</td>
      </tr>`).join('')||'<tr><td colspan="7"><div class="empty">Sem registros.</div></td></tr>'}</tbody></table></div>
    </section>`;
  }
}

function durationStr(ms){
  const min=Math.max(0,Math.round(ms/60000)),h=Math.floor(min/60),m=min%60;
  return `${h?`${h}h `:''}${m}min`;
}
function previewCarPhoto(input){
  const file=input.files?.[0];
  if(!file)return;
  if(file.size>4*1024*1024){alert('Escolha uma foto de até 4 MB.');input.value='';return}
  const reader=new FileReader();
  reader.onload=()=>{$('cphotoPreview').src=reader.result;$('cphotoPreview').dataset.value=reader.result};
  reader.readAsDataURL(file);
}
async function addCar(){
  let model=$('cm').value.trim(),plate=$('cp').value.trim().toUpperCase(),n=Number($('cn').value);
  if(!model)return alert('Preencha o nome/modelo do carro.');
  if(!plate)return alert('Preencha a placa.');
  if(!Number.isInteger(n)||n<1||n>99)return alert('Informe um número de frota válido.');
  if(data.cars.some(c=>c.number===n))return alert('Esse número de frota já está em uso.');
  const id=uuid();
  let photo=DEFAULT_CAR_PHOTO;
  const file=document.getElementById('cphoto')?.files?.[0];
  if(file){ try{ photo=await uploadCarImage(file,id); }catch(error){ console.warn('Storage indisponível; usando foto comprimida no registro.',error); try{ photo=await prepareCarImage(file); }catch(e){ console.warn(e); } } }
  data.cars.push({id,model,plate,seats:Number($('cs').value),number:n,photo});
  await save();adminTab('cars');render();
}
function editCar(id){
  const c=car(id);if(!c)return;
  const photo=c.photo||DEFAULT_CAR_PHOTO;
  openModal('Editar carro',`<div class="form">
    <div class="field"><label>Nome/modelo</label><input id="ecm" value="${esc(c.model)}"></div>
    <div class="field"><label>Placa</label><input id="ecp" value="${esc(c.plate)}"></div>
    <div class="field"><label>Lugares</label><select id="ecs"><option value="2" ${c.seats==2?'selected':''}>2 lugares</option><option value="4" ${c.seats==4?'selected':''}>4 lugares</option><option value="5" ${c.seats==5?'selected':''}>5 lugares</option><option value="7" ${c.seats==7?'selected':''}>7 lugares</option></select></div>
    <div class="field"><label>Nº frota</label><input id="ecn" type="number" min="1" max="99" value="${c.number}"></div>
    <div class="field wide"><label>Foto do carro</label><input id="ecPhoto" type="file" accept="image/*" onchange="previewEditPhoto(this)"><div class="photo-field" style="margin-top:7px"><img id="ecPreview" class="photo-preview" src="${photo}"><span class="photo-note">Escolha outra foto para substituir a atual.</span></div></div>
  </div>`,`<button class="btn dark" onclick="closeModal()">CANCELAR</button><button class="btn primary" onclick="saveCarEdit('${id}')">SALVAR</button>`);
}
function previewEditPhoto(input){
  const file=input.files?.[0]; if(!file)return;
  if(file.size>4*1024*1024){alert('Escolha uma foto de até 4 MB.');input.value='';return}
  const reader=new FileReader();reader.onload=()=>{$('ecPreview').src=reader.result;$('ecPreview').dataset.value=reader.result};reader.readAsDataURL(file);
}
async function saveCarEdit(id){
  const c=car(id);if(!c)return;
  const n=Number($('ecn').value);
  if(!$('ecm').value.trim()||!$('ecp').value.trim())return alert('Preencha nome e placa.');
  if(!Number.isInteger(n)||n<1||n>99)return alert('Número de frota inválido.');
  if(data.cars.some(x=>x.id!==id&&x.number===n))return alert('Esse número de frota já está em uso.');
  c.model=$('ecm').value.trim();c.plate=$('ecp').value.trim().toUpperCase();c.seats=Number($('ecs').value);c.number=n;c.photo=c.photo||DEFAULT_CAR_PHOTO;
  const file=document.getElementById('ecPhoto')?.files?.[0];
  if(file){ try{ c.photo=await uploadCarImage(file,id); }catch(error){ console.warn('Storage indisponível; usando foto comprimida no registro.',error); try{ c.photo=await prepareCarImage(file); }catch(e){ console.warn(e); } } }
  await save();closeModal();adminTab('cars');render();
}
async function removeCar(id){if(data.bookings.some(b=>b.carId===id&&b.status!=='DEVOLVIDO'))return alert('Esse carro possui agendamento pendente ou está em uso.');if(confirm('Excluir este carro?')){data.cars=data.cars.filter(c=>c.id!==id);await save();adminTab('cars');render()}}
async function addEmp(){let name=$('en').value.trim();if(!name)return alert('Digite o nome.');data.employees.push({id:uuid(),name});await save();adminTab('emp');render()}
async function removeEmp(id){if(data.bookings.some(b=>b.employeeId===id||b.actualPickupId===id||b.actualReturnId===id))return alert('Esse funcionário possui registros vinculados.');if(confirm('Excluir este funcionário?')){data.employees=data.employees.filter(e=>e.id!==id);await save();adminTab('emp');render()}}

function generatePickupPDF(){
  const month = document.getElementById('pdfMonth')?.value || new Date().toISOString().slice(0,7);
  if(!month) return alert('Selecione o mês do relatório.');
  const rows=data.bookings
    .filter(b=>b.actualPickupId)
    .filter(b=>(b.actualPickupAt||b.start||'').slice(0,7)===month)
    .sort((a,b)=>new Date(a.actualPickupAt||a.start)-new Date(b.actualPickupAt||b.start));

  if(!rows.length) return alert('Não há registros de retirada neste mês.');

  const [yy,mm]=month.split('-');
  const monthName=new Date(Number(yy),Number(mm)-1,1).toLocaleDateString('pt-BR',{month:'long',year:'numeric'});
  const reportRows=rows.map((b,i)=>{
    const c=car(b.carId);
    return `<tr>
      <td>${i+1}</td>
      <td><b>${String(c?.number||'').padStart(2,'0')} - ${esc(c?.model||'')}</b><br>${esc(c?.plate||'')}</td>
      <td>${esc(emp(b.actualPickupId)?.name||'—')}</td>
      <td>${dt(b.actualPickupAt||b.start)}</td>
      <td>${dt(b.actualReturnAt||b.end)}</td>
    </tr>`;
  }).join('');

  $('pdfReport').innerHTML=`<div class="pdf-report">
    <div class="pdf-title">CONTROLE DE FROTA - REGISTROS DE RETIRADA</div>
    <div class="pdf-subtitle">Relatório mensal de veículos efetivamente retirados</div>
    <div class="pdf-meta"><span><b>Período:</b> ${esc(monthName)}</span><span><b>Total:</b> ${rows.length} retirada(s)</span></div>
    <table class="pdf-table">
      <thead><tr><th>#</th><th>Veículo</th><th>Quem pegou</th><th>Retirada</th><th>Devolução</th></tr></thead>
      <tbody>${reportRows}</tbody>
    </table>
    <div class="pdf-foot">Documento gerado pelo sistema de controle de frota. Use "Salvar como PDF" na janela de impressão.</div>
  </div>`;

  closeModal();
  setTimeout(()=>window.print(),80);
}
async function clearCompleted(){const completed=data.bookings.filter(b=>b.status==='DEVOLVIDO');if(!completed.length)return alert('Nenhum veículo entregue para limpar.');if(confirm(`Arquivar ${completed.length} registro(s) já entregues? Agendamentos e veículos em uso permanecerão no gerenciamento.`)){data.history.push(...completed.map(b=>({...b,archivedAt:new Date().toISOString()})));data.bookings=data.bookings.filter(b=>b.status!=='DEVOLVIDO');await save();adminTab('hist');render()}}

// Compatibilidade com os onclick do HTML: módulos ES não expõem funções no window.
Object.assign(window, {
  uuid, save, esc, dt, badge, car, emp, carLabel, openModal, closeModal, scrollToId, changeMonth, render, renderCarousel, selectCar, carSlide, openSelectedCarCalendar, clearSelectedCar, renderCalendar, openBooking, saveBooking, showBooking, approveBooking, rejectBooking, pickup, confirmPickup, returnCar, confirmReturn, openAdmin, checkAdmin, adminPanel, adminTab, durationStr, previewCarPhoto, addCar, editCar, previewEditPhoto, saveCarEdit, removeCar, addEmp, removeEmp, generatePickupPDF, clearCompleted, initApp
});
async function initApp(){
  try{
    let remote=null;
    let remoteLoaded=false;
    try{ remote=await loadFleetData(); remoteLoaded=true; firebaseReady=true; }
    catch(error){ console.warn('Firebase indisponível; usando backup local.',error); firebaseReady=false; }

    const local=loadLocal();
    if(remoteLoaded && remote && typeof remote==='object'){
      const remoteUpdated=Number(remote._meta?.clientUpdatedAt||0);
      const localUpdated=Number(local?.updatedAt||0);
      if(local && localUpdated>remoteUpdated){
        // Houve uma alteração local mais recente, inclusive exclusões feitas
        // enquanto uma gravação anterior do Firestore estava falhando.
        data=local.data;
        await save();
      }else{
        data={cars:Array.isArray(remote.cars)?remote.cars:[],employees:Array.isArray(remote.employees)?remote.employees:[],bookings:Array.isArray(remote.bookings)?remote.bookings:[],history:Array.isArray(remote.history)?remote.history:[]};
        saveLocal();
      }
    }else if(local){
      data=local.data;
    }

    if(!data.cars.length){
      data.cars=[{id:uuid(),model:'ESTRADA',seats:2,plate:'A DEFINIR',number:1,photo:DEFAULT_CAR_PHOTO},{id:uuid(),model:'FIAT STRADA',seats:2,plate:'A DEFINIR',number:2,photo:DEFAULT_CAR_PHOTO}];
      await save();
    }
    data.cars=data.cars.map((c,i)=>({...c,number:c.number||i+1,photo:c.photo||DEFAULT_CAR_PHOTO}));
    saveLocal();
    render();
  }catch(error){
    console.error('Falha ao iniciar o sistema',error);
    const local=loadLocal();
    if(local) data=local.data;
    render();
  }
}
initApp();


let gridAction = null;
function gridSummary(item) {
  if (item.id === 'live-follows') return tr('Grille dynamique');
  const count=item.layout.order?.length || 0;
  const text=item.id===gridStore.activeId?tr('Grille actuelle'):count?tr(count===1?'{count} tuile':'{count} tuiles',{count}):tr('Aucune tuile');
  return item.layout.locked ? text + ' · ' + tr('verrouillée') : text;
}
function renderGridLauncher() {
  document.getElementById('current-grid-name').textContent = gridStore ? gridStore.label() : tr('Grille par défaut');
  const lock = document.getElementById('grid-lock');
  lock.setAttribute('aria-pressed', String(locked)); lock.disabled = !restored || isLiveGrid();
  lock.title = tr(locked ? 'Déverrouiller la grille' : 'Verrouiller la grille'); lock.setAttribute('aria-label', lock.title);
  const menu = document.getElementById('grid-menu-list');
  menu.replaceChildren();
  for (const item of gridStore?.items || []) {
    const button = document.createElement('button'); button.type='button'; button.className='open-grid'; button.dataset.gridId=item.id;
    button.innerHTML='<i class="grid-mark"></i><span><strong></strong><small></small></span>';
    button.querySelector('strong').textContent=gridStore.label(item);
    button.querySelector('small').textContent=gridSummary(item);
    button.setAttribute('aria-current',String(item.id===gridStore.activeId));
    button.onclick=()=>{ document.getElementById('grid-switcher').open=false; switchNamedGrid(item.id); };
    menu.append(button);
  }
}
function nextGridName() {
  let n = gridStore.items.length + 1;
  while (gridStore.items.some(item => gridStore.label(item).toLocaleLowerCase() === tr('Grille {n}',{n}).toLocaleLowerCase())) n++;
  return tr('Grille {n}',{n});
}
function renderSavedGrids() {
  const list = document.getElementById('saved-grids');
  list.replaceChildren();
  if (!gridStore) return;
  for (const item of gridStore.items) {
    const row = document.createElement('div'); row.className='saved-grid'; row.dataset.gridId=item.id;
    row.innerHTML='<button type="button" class="open-grid"><i class="grid-mark"></i><span><strong></strong><small></small></span></button><button type="button" class="rename-grid icon-button"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></button><button type="button" class="delete-grid icon-button"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/></svg></button>';
    const open=row.querySelector('.open-grid');
    open.querySelector('strong').textContent=gridStore.label(item);
    open.querySelector('small').textContent=gridSummary(item);
    open.setAttribute('aria-current',String(item.id===gridStore.activeId));
    open.title=tr('Ouvrir cette grille'); open.disabled=!restored;
    open.onclick=()=>{ switchNamedGrid(item.id); document.getElementById('grids-dialog').close(); };
    for (const [action, label] of [['rename', 'Renommer'],['delete', 'Supprimer']]) {
      const button=row.querySelector('.'+action+'-grid');
      button.title=tr(label); button.setAttribute('aria-label',tr(label)+' '+gridStore.label(item));
      button.disabled=!restored || item.id==='live-follows';
      button.onclick=()=>openGridForm(action,item.id);
    }
    list.append(row);
  }
  document.getElementById('grid-save-copy').disabled=!restored;
  document.getElementById('grid-new').disabled=!restored;
}
function openGrids() {
  saveCurrentLayout(); gridAction=null;
  document.getElementById('grids-overview').hidden=false;
  document.getElementById('grid-form').hidden=true;
  renderSavedGrids(); closeTileMenus(); hidePreview();
  document.getElementById('grids-dialog').showModal();
}
function switchNamedGrid(id) {
  if (!gridStore || gridStore.activeId===id || !restored) return;
  saveCurrentLayout();
  restored=false; clearTiles();
  gridStore.select(id); restore(); renderList(); refresh();
}
function openGridForm(kind, id = null, participants = [], source = null) {
  gridAction={kind,id,participants,source};
  const dialog=document.getElementById('grids-dialog');
  document.getElementById('grid-form').dataset.kind=kind;
  const item=id?gridStore.items.find(item=>item.id===id):null;
  const name=document.getElementById('grid-name');
  name.value=item?gridStore.label(item):kind==='collaboration'?tr('Collaboration · {name}',{name:source.display}):kind==='copy'?gridStore.label():nextGridName();
  document.getElementById('grids-overview').hidden=true;
  document.getElementById('grid-form').hidden=false;
  document.getElementById('grid-name-label').hidden=kind==='delete'; name.disabled=kind==='delete';
  document.getElementById('grid-delete-description').hidden=kind!=='delete';
  document.getElementById('grid-form-error').textContent=''; name.removeAttribute('aria-invalid');
  updateGridFormLabels();
  closeTileMenus(); hidePreview();
  if (!dialog.open) dialog.showModal();
  if (kind==='delete') document.getElementById('grid-form-submit').focus(); else {name.focus();name.select();}
}
function updateGridFormLabels() {
  if (!gridAction) return;
  const {kind,id}=gridAction;
  document.getElementById('grid-form-title').textContent=kind==='delete'?tr('Supprimer « {name} » ?',{name:gridStore.label(gridStore.items.find(item=>item.id===id))}):tr(kind==='rename'?'Renommer':kind==='copy'?'Enregistrer sous…':'Nouvelle grille');
  document.getElementById('grid-form-submit').textContent=tr(kind==='delete'?'Supprimer':kind==='rename'||kind==='copy'?'Enregistrer':'Créer la grille');
}
function submitGridForm(event) {
  event.preventDefault();
  if (!gridAction || !restored) return;
  const {kind,id,participants,source}=gridAction, name=document.getElementById('grid-name').value.trim();
  if (kind!=='delete' && (!name || gridStore.items.some(item=>item.id!==id && gridStore.label(item).toLocaleLowerCase()===name.toLocaleLowerCase()))) {
    document.getElementById('grid-form-error').textContent=tr(name?'Choisis un nom différent pour cette grille.':'Donne un nom à cette grille.');
    document.getElementById('grid-name').setAttribute('aria-invalid','true'); document.getElementById('grid-name').focus(); return;
  }
  saveCurrentLayout();
  if (kind==='rename') gridStore.rename(id,name);
  else if (kind==='delete') {
    const deletingActive=gridStore.activeId===id;
    if (deletingActive) { restored=false; clearTiles(); }
    gridStore.remove(id);
    if (deletingActive) {restore();renderList();refresh();}
  } else if (kind==='copy') {
    gridStore.create(name,currentLayout()); save();
  } else {
    let snapshot={order:[],collapsed:document.body.classList.contains('collapsed')};
    if (kind==='collaboration') {
      const channels=[...new Map(participants.filter(s=>s.online).map(s=>[s.twitch,s])).values()];
      const main=channels.find(s=>s.twitch===source.twitch) || channels[0];
      // a multi-stream opens as a plain grid, everyone equal, only the source audible, and locked so nobody else joins by accident
      snapshot={...snapshot,order:channels.map(s=>s.twitch),channels,locked:true,muted:Object.fromEntries(channels.map(s=>[s.twitch,s!==main]))};
    }
    restored=false;clearTiles();gridStore.create(name,snapshot);restore();renderList();refresh();
  }
  renderGridLauncher(); gridAction=null;
  document.getElementById('grids-dialog').close();
}
function refreshPreferences() {
  notice(relocalizeMessage(document.getElementById('notice').textContent));
  searchError=relocalizeMessage(searchError);
  document.getElementById('grid-form-error').textContent=relocalizeMessage(document.getElementById('grid-form-error').textContent);
  translateTree(); renderGridLauncher(); renderSavedGrids(); updateGridFormLabels();
  numberFormat=new Intl.NumberFormat(preferences.language,{notation:'compact',maximumFractionDigits:1});
  for (const channels of [streamers,favorites,follows,results]) for (const s of channels) {
    if (s.viewersAmount.formatted) s.viewersAmount.formatted=numberFormat.format(s.viewersAmount.number);
  }
  updateAccount();rebuild();
  for (const t of tiles.values()) {
    paint(t); updateTileInfo(t,t.channel);
    t.chat.setAttribute('aria-label',tr('Chat de {name}',{name:t.channel.display}));
    t.el.querySelector('.player iframe')?.setAttribute('title',tr('Stream de {name}',{name:t.channel.display}));
    t.chat.querySelector('iframe')?.setAttribute('title',tr('Chat de {name}',{name:t.channel.display}));
    const button=t.bar.querySelector('.fs');
    button.title=tr(expanded===t.el.dataset.login?'Revenir à la disposition précédente':'Agrandir dans la fenêtre');button.setAttribute('aria-label',button.title);
    t.chatOptions.querySelector('a').href=`https://www.twitch.tv/popout/${t.el.dataset.login}/chat?popout=`+(document.documentElement.dataset.theme==='dark'?'&darkpopout=1':'');
  }
  for (const [login,toast] of liveNotifications) {
    const s=(library.user?follows:favorites).find(s=>s.twitch===login);
    if(s) toast.querySelector('b').textContent=tr('{name} est en direct',{name:s.display});
  }
  syncChat(); hidePreview(); paintMuteAll();
  document.getElementById('language-setting').value=preferences.language;
  document.getElementById('theme-setting').value=preferences.theme;
  document.getElementById('player-rendering-setting').value=preferences.playerRendering;
}
function initWorkspace() {
  translateTree();renderGridLauncher();
  document.getElementById('grids-shortcut').onclick=openGrids;
  document.getElementById('grids-open').onclick=()=>{document.getElementById('grid-switcher').open=false;openGrids();};
  document.getElementById('grid-switcher').ontoggle=e=>{ if (e.target.open) { closeTileMenus(false,e.target); hidePreview(); } };
  document.getElementById('grid-lock').onclick=()=>{ if (!restored || isLiveGrid()) return; locked=!locked; renderList(); layout(); };
  document.getElementById('language-setting').value=preferences.language;
  document.getElementById('theme-setting').value=preferences.theme;
  document.getElementById('language-setting').onchange=e=>setPreference('language',e.target.value);
  document.getElementById('theme-setting').onchange=e=>setPreference('theme',e.target.value);
  document.getElementById('player-rendering-setting').value=preferences.playerRendering;
  document.getElementById('player-rendering-setting').onchange=e=>setPreference('playerRendering',e.target.value);
  for(const button of document.querySelectorAll('[data-close-dialog]')) button.onclick=()=>button.closest('dialog').close();
  for(const dialog of document.querySelectorAll('dialog')) {
    dialog.addEventListener('keydown',e=>e.stopPropagation());
    dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
  }
  document.getElementById('grid-save-copy').onclick=()=>openGridForm('copy');
  document.getElementById('grid-new').onclick=()=>openGridForm('new');
  document.getElementById('grid-form-cancel').onclick=()=>{gridAction=null;document.getElementById('grid-form').hidden=true;document.getElementById('grids-overview').hidden=false;renderSavedGrids();};
  document.getElementById('grid-form').onsubmit=submitGridForm;
  document.getElementById('grid-name').oninput=e=>{e.target.removeAttribute('aria-invalid');document.getElementById('grid-form-error').textContent='';};
  addEventListener('preferenceschange',refreshPreferences);
}

(() => {
  const BANK = window.QUESTION_BANK;
  const COLORS = ['#d4ff55','#7cacf8','#ff987e','#c693ff'];
  const STORAGE = 'cultura-brava-v1';
  const app = document.querySelector('#app');
  const help = document.querySelector('#helpDialog');
  let game = readSave();
  let config = {players:['','','',''],count:10,difficulty:'mixed',mode:'mc'};
  let chosen = null;
  let notice = '';

  function readSave(){try{const saved=JSON.parse(localStorage.getItem(STORAGE));if(!saved||!Array.isArray(saved.players))return saved;for(const p of saved.players){p.score??=0;p.answers??=[];p.correct??=0;p.streak??=0;p.bestStreak??=p.streak;p.categoryWins??={}}return saved}catch{return null}}
  function save(){localStorage.setItem(STORAGE,JSON.stringify(game))}
  function readStats(){try{return JSON.parse(localStorage.getItem('cultura-brava-stats-v1'))||{games:0,wins:{},highScore:0}}catch{return {games:0,wins:{},highScore:0}}}
  function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  function home(){
    const stats=readStats();
    app.innerHTML = `<section class="hero fade-in"><div><span class="eyebrow">CULTURA GENERAL · CERO PANTALLAS ABURRIDAS</span><h1>Que empiece<br>el <em>pique.</em></h1><p>La excusa perfecta para descubrir quién sabe de todo y quién se lo inventa con mucha seguridad.</p><div class="actions"><button class="primary" id="newGame">Partida local <span aria-hidden="true">↗</span></button><button class="secondary" id="onlineGame">Jugar online <span aria-hidden="true">↗</span></button>${game&&!game.finished?'<button class="secondary" id="resume">Retomar partida</button>':''}<button class="secondary" id="instructions">Cómo se juega</button></div></div><div class="hero-art" aria-hidden="true"><div class="orbit"><span>⌁</span><span>✳</span><span>◉</span><span>✦</span></div><div class="big-cb">CB</div></div></section>${stats.games?`<section class="section-head"><div><span class="eyebrow">VUESTRO HISTORIAL · ESTE DISPOSITIVO</span><h2>${stats.games} ${stats.games===1?'partida jugada':'partidas jugadas'}</h2></div><p>Récord de puntuación: ${stats.highScore} puntos</p></section>`:''}<section><div class="section-head"><div><span class="eyebrow">DOS FORMAS DE QUEDAR EN EVIDENCIA</span><h2>Elige tu veneno.</h2></div><p>De 2 a 4 jugadores · Sin cuentas · Sin dramas</p></div><div class="features"><article class="feature"><span class="num">01 / A OJO</span><h3>La cifra más cercana</h3><p>Calcula, intuye o lánzate. El que más se acerque al dato real se lleva el punto.</p></article><article class="feature"><span class="num">02 / EL SABIONDO</span><h3>¿Te la sabes?</h3><p>Cuatro opciones. Un turno por persona. Cada acierto suma para el equipo.</p></article><article class="feature"><span class="num">03 / EL PIQUE</span><h3>Marcador al instante</h3><p>Preguntas con contexto, categorías variadas y revancha siempre disponible.</p></article></div></section><footer>HECHO PARA JUGAR JUNTOS · CULTURA BRAVA</footer>`;
    document.querySelector('#newGame').onclick=setup; document.querySelector('#instructions').onclick=()=>help.showModal();
    document.querySelector('#onlineGame').onclick=()=>import('./online.js').then(m=>m.openOnline()).catch(()=>{notice='No se pudo cargar el modo online. Comprueba tu conexión y la configuración de Supabase.';home()});
    const resume=document.querySelector('#resume'); if(resume)resume.onclick=renderGame;
  }
  function setup(){config={players:['','','',''],count:10,difficulty:'mixed',mode:'mc'};drawSetup()}
  function drawSetup(){
    const existing=game&&!game.finished;
    app.innerHTML=`<section class="setup fade-in"><div class="setup-top"><button class="back" id="backHome">← Inicio</button><span class="eyebrow">CONFIGURA EN 20 SEGUNDOS</span></div><h1>La cuadrilla.</h1><p class="explanation">De 2 a 4 jugadores. Pasad el móvil por turnos.</p><label class="field-label">JUGADORES</label><div class="players">${config.players.map((v,i)=>`<div class="player-wrap" style="--pc:${COLORS[i]}"><input class="player-input" data-player="${i}" maxlength="18" placeholder="${i<2?'Jugador '+(i+1):'Añadir jugador…'}" value="${escapeHtml(v)}" aria-label="Nombre del jugador ${i+1}" /></div>`).join('')}</div><label class="field-label">NÚMERO DE PREGUNTAS</label><div class="segmented" data-setting="count">${[10,30,50].map(n=>`<button data-value="${n}" class="${config.count===n?'selected':''}">${n} preguntas</button>`).join('')}</div><label class="field-label">DIFICULTAD</label><div class="segmented" data-setting="difficulty">${[['mixed','Mixta ✦'],['easy','Fácil'],['normal','Normal'],['difficult','Difícil'],['expert','Experta']].map(([v,l])=>`<button data-value="${v}" class="${config.difficulty===v?'selected':''}">${l}</button>`).join('')}</div><label class="field-label">MODO</label><div class="mode-grid"><button class="mode-choice ${config.mode==='mc'?'selected':''}" data-mode="mc"><b>El sabiondo ↗</b><small>Opción múltiple. Cada acierto suma.</small></button><button class="mode-choice ${config.mode==='ojo'?'selected':''}" data-mode="ojo"><b>A ojo ↗</b><small>Cifras, intuición y el más cercano gana.</small></button></div>${notice?`<p class="explanation" style="color:var(--red)">${escapeHtml(notice)}</p>`:''}<div class="setup-bottom"><span class="muted">${existing?'Empezar otra partida reemplazará la guardada.':''}</span><button class="primary" id="startGame">Que empiece el juego ↗</button></div></section>`;
    const rotation=window.BravaRotation.stats(BANK),modeRotation=rotation.byMode[config.mode];
    document.querySelector('.setup-bottom').insertAdjacentHTML('beforebegin',`<div class="rotation-tools"><span>Memoria ${config.mode==='ojo'?'A OJO':'EL SABIONDO'}: ${modeRotation.availableThisCycle}/${modeRotation.total} disponibles en este ciclo</span><div><button id="rotationStats" class="secondary">Historial</button> <button id="resetRotation" class="secondary">Reiniciar rotación</button></div></div>`);
    document.querySelector('#backHome').onclick=home;
    document.querySelectorAll('[data-player]').forEach(el=>el.oninput=()=>config.players[+el.dataset.player]=el.value);
    document.querySelectorAll('[data-setting] button').forEach(el=>el.onclick=()=>{const k=el.parentElement.dataset.setting;config[k]=k==='count'?+el.dataset.value:el.dataset.value;drawSetup()});
    document.querySelectorAll('[data-mode]').forEach(el=>el.onclick=()=>{config.mode=el.dataset.mode;drawSetup()});
    document.querySelector('#startGame').onclick=start;
    document.querySelector('#rotationStats').onclick=showRotationStats;
    document.querySelector('#resetRotation').onclick=()=>{if(confirm('¿Borrar la memoria de preguntas usadas en este dispositivo?')){window.BravaRotation.reset();drawSetup()}};
  }
  function showRotationStats(){
    const stats=window.BravaRotation.stats(BANK),r=stats.byMode[config.mode],modeName=config.mode==='ojo'?'A OJO':'EL SABIONDO',dialog=document.querySelector('#rotationDialog');
    document.querySelector('#rotationContent').innerHTML=`<p><b>${modeName} · ciclo ${r.cycle}</b></p><div class="stat-grid"><div class="stat"><small>DISPONIBLES EN EL CICLO</small><b>${r.availableThisCycle} / ${r.total}</b></div><div class="stat"><small>DISPONIBLES SIN REPETIR LAS 3 ÚLTIMAS</small><b>${r.availableWithoutRecent}</b></div><div class="stat"><small>IDS ÚNICOS USADOS · TODOS LOS MODOS</small><b>${stats.usedUnique} / ${BANK.length}</b></div><div class="stat"><small>REPETICIONES REGISTRADAS</small><b>${stats.repeatUses} (${stats.repeated.length} preguntas distintas)</b></div></div><h3>Últimas partidas</h3>${stats.history.length?`<ul class="answer-list">${stats.history.map(g=>`<li><span>${new Date(g.at).toLocaleDateString('es-ES')} · ${g.mode==='ojo'?'A OJO':'SABIONDO'} · ${g.count} preguntas</span><b>${g.repeatedIds.length} repes.</b></li>`).join('')}</ul>`:'<p class="explanation">Aún no hay partidas guardadas.</p>'}<h3>Preguntas que han reaparecido</h3>${stats.repeated.length?`<ul class="answer-list">${stats.repeated.slice(0,10).map(q=>`<li><span>${escapeHtml(q.question)}</span><b>${q.uses}×</b></li>`).join('')}</ul>`:'<p class="explanation">Todavía no hay repeticiones.</p>'}`;
    dialog.showModal();
  }
  function start(){
    const existing=game&&!game.finished;
    const names=config.players.map(x=>x.trim()).filter(Boolean).slice(0,4); const unique=names.map(n=>n.toLocaleLowerCase('es'));
    if(names.length<2){notice='Añadid al menos dos nombres para empezar.';drawSetup();return}
    if(new Set(unique).size!==unique.length){notice='Usad nombres distintos para reconocer el marcador.';drawSetup();return}
    const eligible=BANK.filter(q=>q.mode===config.mode&& (config.difficulty==='mixed'||q.difficulty===config.difficulty|| (config.difficulty==='expert'&&q.difficulty==='difficult')));
    if(eligible.length<config.count){notice=`Hay ${eligible.length} preguntas disponibles con esta combinación. Elegid otra dificultad o una partida más corta.`;drawSetup();return}
    const selection=window.BravaRotation.select(eligible,config.count,config.mode,BANK.filter(q=>q.mode===config.mode));
    if(existing&&!confirm('¿Empezar una partida nueva? Se sustituirá la partida guardada.'))return;
    window.BravaRotation.record(selection);
    game={players:names.map((name,i)=>({name,color:COLORS[i],score:0,answers:[],correct:0,streak:0,bestStreak:0,categoryWins:{}})),questions:selection.questions,mode:config.mode,round:0,turn:0,phase:'answer',pending:Array(names.length).fill(null),finished:false,created:Date.now()};save();notice='';renderGame();
  }
  function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
  function current(){return game.questions[game.round]}
  function scores(){return game.players.map(p=>`<div class="score-pill"><span style="color:${p.color}">●</span> ${escapeHtml(p.name)} <b>${p.score}</b>${p.streak>=2?` <span class="streak" title="Racha de aciertos">🔥 ${p.streak}</span>`:''}</div>`).join('')}
  function renderGame(){
    if(!game||game.finished){home();return}
    if(game.round>=game.questions.length){finish();return}
    const q=current(),p=game.players[game.turn],answer=game.pending[game.turn];
    const isReveal=game.phase==='reveal'; const isHandoff=game.phase==='handoff';
    let body='';
    if(isHandoff){const next=game.players[game.turn];body=`<div class="reveal"><span class="eyebrow">MÓVIL EN MANO</span><h2 style="margin:12px 0">Pásalo a <span style="color:${next.color}">${escapeHtml(next.name)}</span>.</h2><p class="explanation">Que nadie mire la respuesta anterior. Cuando esté listo, toca continuar.</p><button id="readyNext" class="primary">${next.name} está listo ↗</button></div>`}
    else if(isReveal){
      body=`<div class="reveal"><span class="eyebrow">RESPUESTA CORRECTA</span><p style="margin:13px 0 4px"><strong>${game.mode==='ojo'?`${formatNum(q.a)} ${q.unit}`:escapeHtml(q.a)}</strong></p></div>`;
      if(game.mode==='ojo'){
        const ordered=game.players.map((pl,i)=>({pl,ans:game.pending[i],i,dist:game.pending[i]===null?Infinity:Math.abs(Number(game.pending[i])-q.a)})).sort((a,b)=>a.dist-b.dist);
        body+=`<ul class="answer-list">${ordered.map((x,i)=>`<li class="${i===0?'winner':''}"><span><span style="color:${x.pl.color}">●</span> ${escapeHtml(x.pl.name)}</span><b>${x.ans===null?'—':`${formatNum(x.ans)} ${escapeHtml(q.unit)}`}</b></li>`).join('')}</ul><p class="private-note">${ordered[0].dist===ordered[1]?.dist?'Empate: punto para cada quien.':`Más cerca: ${escapeHtml(ordered[0].pl.name)}.`}</p>`;
      }else body+=`<ul class="answer-list">${game.players.map((pl,i)=>`<li class="${game.pending[i]===q.a?'answer-correct':'answer-wrong'}"><span><span style="color:${pl.color}">●</span> ${escapeHtml(pl.name)} <small>· ${escapeHtml(game.pending[i])}</small></span><b>${game.pending[i]===q.a?'✓ Correcta':'× Incorrecta'}</b></li>`).join('')}</ul><div class="answer-key"><span class="meta">LA BUENA</span><b>${escapeHtml(q.a)}</b></div>`;
      body+=`<div class="round-explanation"><span class="eyebrow">DATO BRAVA</span><p>${escapeHtml(q.e)}</p><small>Fuente: ${escapeHtml(q.s)}</small></div>`;
      body+=`<button id="nextRound" class="primary">${game.round+1===game.questions.length?'Ver resultados':'Siguiente pregunta'} ↗</button>`;
    }else{
      body=`<div class="turn-tag"><span style="color:${p.color}">●</span> TURNO DE ${escapeHtml(p.name.toLocaleUpperCase('es'))}</div><h2 class="question">${escapeHtml(q.q)}</h2>`;
      if(game.mode==='ojo')body+=`<div class="meta">RESPUESTA EN ${escapeHtml(q.unit.toLocaleUpperCase('es'))}</div><input id="numericAnswer" class="number-input" type="number" inputmode="decimal" step="any" placeholder="Tu apuesta…" value="${answer??''}" aria-label="Respuesta numérica" /><p class="private-note">La cifra queda oculta hasta que todos hayan respondido.</p>`;
      else body+=`<div class="options">${q.o.map((opt,i)=>`<button class="option ${answer===opt?'selected':''}" data-option="${i}">${escapeHtml(opt)}</button>`).join('')}</div><p class="private-note">Elegid y confirmad. No se puede cambiar después.</p>`;
      body+=`<button id="submitAnswer" class="primary" ${answer===null?'disabled style="opacity:.45;cursor:not-allowed"':''}>${game.turn===game.players.length-1?'Bloquear respuesta':'Bloquear y pasar'} ↗</button>`;
    }
    app.innerHTML=`<section class="game-card fade-in"><div class="game-top"><button class="back" id="quitGame">← Salir</button><span class="eyebrow">${game.mode==='ojo'?'A OJO':'EL SABIONDO'}</span><span class="meta">${game.round+1} / ${game.questions.length}</span></div><div class="progress"><span style="width:${(game.round/game.questions.length)*100}%"></span></div><div class="score-row">${scores()}</div><div class="meta">${escapeHtml(q.category.toLocaleUpperCase('es'))} · ${escapeHtml(q.difficulty.toLocaleUpperCase('es'))}</div>${body}</section>`;
    document.querySelector('#quitGame').onclick=()=>{if(confirm('¿Abandonar la partida? El progreso guardado se perderá.')){game=null;localStorage.removeItem(STORAGE);home()}};
    if(isHandoff)document.querySelector('#readyNext').onclick=()=>{game.phase='answer';save();renderGame()};
    if(isReveal)document.querySelector('#nextRound').onclick=advanceRound;
    if(!isReveal&&!isHandoff){
      if(game.mode==='ojo'){const input=document.querySelector('#numericAnswer');input.oninput=()=>{const v=input.value.trim();game.pending[game.turn]=v===''?null:Number(v);document.querySelector('#submitAnswer').disabled=v===''||!Number.isFinite(Number(v));document.querySelector('#submitAnswer').style.opacity=(v===''||!Number.isFinite(Number(v)))?'.45':'1';save()}}
      else document.querySelectorAll('[data-option]').forEach(el=>el.onclick=()=>{if(game.pending[game.turn]!==null)return;chosen=el.dataset.option;const v=current().o[+chosen];game.pending[game.turn]=v;document.querySelectorAll('[data-option]').forEach(x=>x.classList.toggle('selected',x===el));const b=document.querySelector('#submitAnswer');b.disabled=false;b.style.opacity='1';save()});
      document.querySelector('#submitAnswer').onclick=submit;
    }
  }
  function submit(){const q=current(),i=game.turn,p=game.players[i],ans=game.pending[i];if(ans===null)return;p.answers.push({question:q.id,answer:ans,correct:game.mode==='mc'?ans===q.a:false,category:q.category});if(i<game.players.length-1){game.turn++;game.phase='handoff'}else{game.phase='reveal';scoreRound(q)}save();renderGame()}
  function scoreRound(q){
    if(game.mode==='mc'){
      for(let i=0;i<game.players.length;i++){const p=game.players[i];if(game.pending[i]===q.a){p.score++;p.correct++;p.streak++;p.bestStreak=Math.max(p.bestStreak,p.streak);p.categoryWins[q.category]=(p.categoryWins[q.category]||0)+1}else p.streak=0}return;
    }
    const d=game.pending.map(x=>Math.abs(Number(x)-q.a)),best=Math.min(...d);for(let i=0;i<d.length;i++){const p=game.players[i];if(Math.abs(d[i]-best)<1e-9){p.score++;p.streak++;p.bestStreak=Math.max(p.bestStreak,p.streak);p.categoryWins[q.category]=(p.categoryWins[q.category]||0)+1}else p.streak=0}
  }
  function advanceRound(){game.round++;game.turn=0;game.pending=Array(game.players.length).fill(null);game.phase='answer';save();renderGame()}
  function formatNum(n){return Number(n).toLocaleString('es-ES',{maximumFractionDigits:3})}
  function finish(){const stats=readStats();stats.games++;for(const p of game.players)stats.wins[p.name]=(stats.wins[p.name]||0);const currentTop=Math.max(...game.players.map(p=>p.score));for(const p of game.players)if(p.score===currentTop)stats.wins[p.name]++;stats.highScore=Math.max(stats.highScore,...game.players.map(p=>p.score));localStorage.setItem('cultura-brava-stats-v1',JSON.stringify(stats));game.finished=true;save();const sorted=[...game.players].sort((a,b)=>b.score-a.score);const top=sorted[0].score,leaders=sorted.filter(p=>p.score===top);const hardest=[...game.questions].sort((a,b)=>({easy:0,normal:1,difficult:2,expert:3}[b.difficulty]??1)-({easy:0,normal:1,difficult:2,expert:3}[a.difficulty]??1))[0];
    const categories=game.players.map(p=>{const best=Object.entries(p.categoryWins||{}).sort((a,b)=>b[1]-a[1])[0];return {p,category:best?best[0]:'—',pct:game.mode==='mc'?Math.round(100*p.correct/game.questions.length):null}});
    const podium=sorted.slice(0,3),podiumOrder=podium.length===3?[podium[1],podium[0],podium[2]]:podium;
    app.innerHTML=`<section class="result-card fade-in"><span class="eyebrow">FIN DE LA PARTIDA · ${game.questions.length} PREGUNTAS</span><h1>Buen pique.</h1><p class="explanation">${leaders.length>1?'Habemus empate.':'La cultura ha hablado.'}</p><div class="podium">${podiumOrder.map(p=>`<div class="podium-place ${p===sorted[0]?'first':''}" style="--pc:${p.color}"><span class="podium-medal">${p===sorted[0]?'✦':p===sorted[1]?'Ⅱ':'Ⅲ'}</span><b>${escapeHtml(p.name)}</b><small>${p.score} ${p.score===1?'punto':'puntos'}</small></div>`).join('')}</div><span class="eyebrow">CLASIFICACIÓN</span><ul class="answer-list">${sorted.map((p,i)=>`<li class="${i===0?'winner':''}"><span>${i+1}. <span style="color:${p.color}">●</span> ${escapeHtml(p.name)}</span><b>${p.score} ${p.score===1?'punto':'puntos'} · racha ${p.bestStreak||0}</b></li>`).join('')}</ul><div class="stat-grid">${categories.map(({p,category,pct})=>`<div class="stat"><small>${escapeHtml(p.name.toLocaleUpperCase('es'))}${pct===null?'':` · ${pct}% ACIERTOS`}</small><b>Fuerte en ${escapeHtml(category)}</b></div>`).join('')}<div class="stat"><small>LA MÁS BRAVA · ${escapeHtml(hardest.category.toLocaleUpperCase('es'))}</small><b>${escapeHtml(hardest.q)}</b></div><div class="stat"><small>PRÓXIMO PLAN</small><b>La revancha ↗</b></div></div><div class="actions"><button class="primary" id="replay">Revancha ↗</button><button class="secondary" id="homeBtn">Volver al inicio</button></div></section>`;
    document.querySelector('#replay').onclick=()=>{game=null;setup()};document.querySelector('#homeBtn').onclick=home;
  }
  document.querySelector('#helpBtn').onclick=()=>help.showModal();document.querySelector('#closeHelp').onclick=()=>help.close();
  home();
})();

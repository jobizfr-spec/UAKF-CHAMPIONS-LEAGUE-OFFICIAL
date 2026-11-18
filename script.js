// UAKF CHAMPIONS LEAGUE OFFICIAL — Supabase
const SUPABASE_URL = "https://leexxuefzimilrjzjrzt.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_5yaKatzWDyCatlz2DUA5Wg_0S-yKpyw";
const STORAGE_BUCKET = "player-photos"; // Bucket public déjà créé : photos joueurs + logos clubs
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

let isAdmin = false;
let clubs = [], players = [], matches = [], scorerEntries = [], disciplineEntries = [], newsEntries = [];
let editingNewsId = null;
let currentNewsImage = null;
let editingClubId = null, editingPlayerId = null;
let currentClubLogo = null, currentPlayerPhoto = null;
let toastTimer;

const $ = id => document.getElementById(id);
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const dateText = value => value ? new Date(value).toLocaleString("fr-FR",{dateStyle:"medium",timeStyle:"short"}) : "Date à confirmer";

function notify(message) {
  const el = $("toast"); if (!el) return;
  el.textContent = message; el.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove("show"), 3200);
}
function setConnection(text) { $("connectionBadge").textContent = text; }

async function verifyAdmin() {
  const { data: { user }, error } = await supabaseClient.auth.getUser();
  if (error || !user) return false;
  const { data, error: profileError } = await supabaseClient.from("profiles").select("role").eq("id", user.id).single();
  return !profileError && data?.role === "admin";
}
async function refreshAuthUI() {
  isAdmin = await verifyAdmin();
  document.querySelectorAll(".admin-panel").forEach(el => el.classList.toggle("hidden", !isAdmin));
  if (isAdmin) {
    setConnection("ADMIN CONNECTÉ");
    $("adminClubs").textContent = clubs.length;
    $("adminPlayers").textContent = players.length;
    $("adminMatches").textContent = matches.length;
  } else setConnection("ACCÈS PUBLIC");
  renderAll();
}

function showPage(id, button) {
  if (id === "admin" && !isAdmin) id = "adminLogin";
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  $(id)?.classList.add("active");

  const navPage = ["home", "matches", "ranking"].includes(id) ? id : "more";
  document.querySelectorAll(".bottom-nav button").forEach(b => {
    b.classList.toggle("active", b.dataset.page === navPage);
  });
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function guardAdmin() {
  if (!isAdmin) { notify("Action réservée à l'administrateur."); showPage("adminLogin"); return false; }
  return true;
}
async function loadData() {
  setConnection("CHARGEMENT…");
  const [c,p,m,g,d,n] = await Promise.all([
    supabaseClient.from("clubs").select("*").order("name"),
    supabaseClient.from("players").select("*").order("full_name"),
    supabaseClient.from("matches").select("*").order("match_date",{ascending:true}),
    supabaseClient.from("match_scorers").select("*"),
    supabaseClient.from("disciplinary_events").select("*").order("created_at",{ascending:false}),
    supabaseClient.from("news").select("*").order("created_at",{ascending:false})
  ]);
  const errors = [c.error,p.error,m.error,g.error,d.error,n.error].filter(Boolean);
  if (errors.length) {
    console.error("Erreur de chargement Supabase:", errors);
    setConnection("ERREUR DE CHARGEMENT");
    notify("Impossible de charger les données. Vérifiez les politiques RLS.");
    return;
  }
  clubs = c.data || []; players = p.data || []; matches = m.data || []; scorerEntries = g.data || []; disciplineEntries = d.data || []; newsEntries = n.data || [];
  await refreshAuthUI();
}
function renderAll() {
  $("clubCount").textContent = clubs.length;
  $("playerCount").textContent = players.length;
  $("matchCount").textContent = matches.length;
  $("resultCount").textContent = matches.filter(m => m.home_score !== null && m.away_score !== null).length;
  $("adminClubs").textContent = clubs.length;
  $("adminPlayers").textContent = players.length;
  $("adminMatches").textContent = matches.length;
  renderClubs(); renderPlayers(); renderMatches(); renderRanking(); renderScorerRanking(); renderHomeMatches(); populateClubSelects(); populateScorerSelects(); renderClubStats(); renderDiscipline(); renderNews(); renderFinals(); populateDisciplineSelects();
  document.querySelectorAll(".admin-panel").forEach(el => el.classList.toggle("hidden", !isAdmin));
}
function renderClubs() {
  $("clubList").innerHTML = clubs.length ? clubs.map(c => `
    <article class="club-card">
      ${c.logo_url ? `<img class="club-logo" src="${esc(c.logo_url)}" alt="Logo ${esc(c.name)}">` : `<div class="club-logo placeholder">🏟️</div>`}
      <div class="club-meta"><h3>${esc(c.name)}</h3><p>${esc(c.city || "Localité non précisée")}</p><p>Responsable : ${esc(c.manager || "Non renseigné")}</p>
      ${isAdmin ? `<div class="card-actions"><button class="btn-secondary" onclick="editClub(${c.id})">Modifier</button><button class="danger-button" onclick="deleteClub(${c.id})">Supprimer</button></div>` : ""}</div>
    </article>`).join("") : `<p class="empty">Aucun club publié pour le moment.</p>`;
}
function renderPlayers() {
  $("playerList").innerHTML = players.length ? players.map(p => {
    const club = clubs.find(c => c.id === p.club_id);
    return `<article class="player-card">
      ${p.photo_url ? `<img class="player-photo" src="${esc(p.photo_url)}" alt="Photo de ${esc(p.full_name)}">` : `<div class="player-photo placeholder">⚽</div>`}
      <div class="player-info"><h3>${esc(p.full_name)}</h3><p class="player-number">Maillot n° ${esc(p.jersey_number ?? "—")}</p><p>Club : ${esc(club?.name || "Club non renseigné")}</p><p>Poste : ${esc(p.position || "Non précisé")}</p>
      ${isAdmin ? `<div class="card-actions"><button class="btn-secondary" onclick="editPlayer(${p.id})">Modifier</button><button class="danger-button" onclick="deletePlayer(${p.id})">Supprimer</button></div>` : ""}</div>
    </article>`;
  }).join("") : `<p class="empty">Aucun joueur publié pour le moment.</p>`;
}
function matchClub(id) { return clubs.find(c => c.id === id)?.name || "Équipe"; }
function matchCard(m) {
  const done = m.home_score !== null && m.away_score !== null;
  return `<article class="item-card"><div class="match-line">
    <div class="match-team">${esc(matchClub(m.home_club_id))}<small>Domicile</small></div>
    <div class="match-score">${done ? `${m.home_score} - ${m.away_score}` : "VS"}</div>
    <div class="match-team">${esc(matchClub(m.away_club_id))}<small>Extérieur</small></div>
  </div><div class="match-info"><span class="stage-tag">${esc(stageLabel(m.stage))}</span><br>${esc(dateText(m.match_date))} · ${esc(m.venue || "Lieu à confirmer")} · <span class="status">${done ? "Terminé" : esc(m.status || "Programmé")}</span></div>
  ${isAdmin ? `<div class="card-actions"><button class="btn-secondary" onclick="setScore(${m.id})">Saisir / modifier score</button><button class="danger-button" onclick="deleteMatch(${m.id})">Supprimer</button></div>` : ""}
  </article>`;
}
function stageLabel(stage){return ({group:"Phase de groupes",round_of_16:"Huitièmes de finale",quarter_final:"Quarts de finale",semi_final:"Demi-finales",third_place:"Match pour la 3e place",final:"Finale"})[stage||"group"]||"Phase de groupes";}
function renderMatches() { $("matchList").innerHTML = matches.length ? matches.map(matchCard).join("") : `<p class="empty">Aucun match programmé.</p>`; }
function renderHomeMatches() {
  const now = new Date();
  const sorted = [...matches].sort((a,b) => {
    const da = new Date(a.match_date), db = new Date(b.match_date);
    const aUpcoming = da >= now, bUpcoming = db >= now;
    if (aUpcoming !== bUpcoming) return aUpcoming ? -1 : 1;
    return aUpcoming ? da - db : db - da;
  });
  $("homeMatches").innerHTML = sorted.length ? sorted.slice(0,3).map(matchCard).join("") : `<p class="empty">Le calendrier sera publié ici.</p>`;
}
function renderRanking() {
  const rows = clubs.map(c => ({id:c.id,name:c.name,played:0,gf:0,ga:0,points:0}));
  matches.forEach(m => {
    if (m.home_score === null || m.away_score === null) return;
    const a = rows.find(x => x.id === m.home_club_id), b = rows.find(x => x.id === m.away_club_id);
    if (!a || !b) return;
    a.played++; b.played++; a.gf += m.home_score; a.ga += m.away_score; b.gf += m.away_score; b.ga += m.home_score;
    if (m.home_score > m.away_score) a.points += 3; else if (m.away_score > m.home_score) b.points += 3; else {a.points++;b.points++;}
  });
  rows.sort((a,b) => b.points-a.points || (b.gf-b.ga)-(a.gf-a.ga) || b.gf-a.gf || a.name.localeCompare(b.name));
  $("rankingList").innerHTML = rows.length ? rows.map((r,i)=>`<tr><td>${i+1}</td><td>${esc(r.name)}</td><td>${r.played}</td><td>${r.gf}</td><td>${r.ga}</td><td>${r.gf-r.ga}</td><td><strong>${r.points}</strong></td></tr>`).join("") : `<tr><td colspan="7">Aucun club enregistré.</td></tr>`;
}
function renderScorerRanking() {
  const totals = new Map();
  scorerEntries.forEach(entry => {
    const player = players.find(p => p.id === entry.player_id);
    if (!player) return;
    const current = totals.get(player.id) || { player, goals: 0 };
    current.goals += Number(entry.goals || 0);
    totals.set(player.id, current);
  });
  const rows = [...totals.values()].sort((a,b) => b.goals-a.goals || a.player.full_name.localeCompare(b.player.full_name));
  $("scorerRankingList").innerHTML = rows.length ? rows.map((row,index) => {
    const club = clubs.find(c => c.id === row.player.club_id);
    return `<tr><td>${index+1}</td><td>${esc(row.player.full_name)}${row.player.jersey_number !== null ? ` <small>(n° ${esc(row.player.jersey_number)})</small>` : ""}</td><td>${esc(club?.name || "—")}</td><td><strong>${row.goals}</strong></td></tr>`;
  }).join("") : `<tr><td colspan="4">Aucun buteur enregistré pour le moment.</td></tr>`;
  const adminList=$("scorerEntryAdminList");
  if(adminList) adminList.innerHTML=isAdmin ? `<h3>Corriger les buts par match</h3>` + scorerEntries.map(e=>{const p=players.find(x=>x.id===e.player_id),m=matches.find(x=>x.id===e.match_id);return `<article class="item-card"><strong>${esc(p?.full_name||'Joueur')}</strong><p class="subtle">${esc(m?matchClub(m.home_club_id)+' – '+matchClub(m.away_club_id):'Match')} · ${Number(e.goals)} but(s)</p><div class="card-actions"><button class="btn-secondary" onclick="editScorerEntry(${e.id})">Corriger</button><button class="danger-button" onclick="deleteScorerEntry(${e.id})">Supprimer</button></div></article>`}).join('') : '';
}
function populateScorerSelects() {
  const matchSelect = $("scorerMatch"), playerSelect = $("scorerPlayer");
  if (!matchSelect || !playerSelect) return;
  const oldMatch = matchSelect.value, oldPlayer = playerSelect.value;
  matchSelect.innerHTML = `<option value="">Choisir le match</option>` + matches.map(m => `<option value="${m.id}">${esc(matchClub(m.home_club_id))} – ${esc(matchClub(m.away_club_id))} · ${esc(dateText(m.match_date))}</option>`).join("");
  playerSelect.innerHTML = `<option value="">Choisir le buteur</option>` + players.map(p => {
    const club = clubs.find(c => c.id === p.club_id);
    return `<option value="${p.id}">${esc(p.full_name)}${club ? ` — ${esc(club.name)}` : ""}</option>`;
  }).join("");
  if ([...matchSelect.options].some(o => o.value === oldMatch)) matchSelect.value = oldMatch;
  if ([...playerSelect.options].some(o => o.value === oldPlayer)) playerSelect.value = oldPlayer;
}

function populateClubSelects() {
  const opts = `<option value="">Choisir un club</option>` + clubs.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join("");
  ["playerClub","teamA","teamB"].forEach(id => { const el=$(id); if (!el) return; const old=el.value; el.innerHTML=opts; if ([...el.options].some(o=>o.value===old)) el.value=old; });
}

async function uploadImage(file, folder) {
  if (!file) return null;
  const allowed = ["image/jpeg","image/png","image/webp"];
  if (!allowed.includes(file.type)) throw new Error("Format accepté : JPG, PNG ou WEBP.");
  if (file.size > 2*1024*1024) throw new Error("Image trop volumineuse : maximum 2 Mo.");
  const ext = file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1];
  const unique = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const path = `${folder}/${unique}.${ext}`;
  const {data,error} = await supabaseClient.storage.from(STORAGE_BUCKET).upload(path,file,{contentType:file.type,upsert:false});
  if (error) throw error;
  return supabaseClient.storage.from(STORAGE_BUCKET).getPublicUrl(data.path).data.publicUrl;
}

function resetClubForm() { $("clubForm").reset(); editingClubId=null; currentClubLogo=null; $("clubFormTitle").textContent="Ajouter un club"; $("clubLogoPreview").innerHTML=""; }
function cancelClubEdit() { resetClubForm(); }
function resetPlayerForm() { $("playerForm").reset(); editingPlayerId=null; currentPlayerPhoto=null; $("playerFormTitle").textContent="Ajouter un joueur"; $("playerPhotoPreview").innerHTML=""; }
function cancelPlayerEdit() { resetPlayerForm(); }
function previewFile(inputId, previewId) {
  $(inputId).addEventListener("change", () => {
    const file=$(inputId).files[0], box=$(previewId);
    if (!file) {box.innerHTML="";return;}
    if (!["image/jpeg","image/png","image/webp"].includes(file.type) || file.size>2*1024*1024) {notify("Image invalide ou supérieure à 2 Mo.");$(inputId).value="";box.innerHTML="";return;}
    box.innerHTML=`<img src="${URL.createObjectURL(file)}" alt="Aperçu de l'image">`;
  });
}
previewFile("clubLogo","clubLogoPreview"); previewFile("playerPhoto","playerPhotoPreview");

$("clubForm").addEventListener("submit", async e => {
  e.preventDefault(); if (!guardAdmin()) return;
  const button=$("clubForm").querySelector('button[type="submit"]'); button.disabled=true;
  try {
    const file=$("clubLogo").files[0];
    let logo_url=currentClubLogo;
    if(file) logo_url=await uploadImage(file,"clubs");
    const record={name:$("clubName").value.trim(),city:$("clubCity").value.trim()||null,manager:$("clubManager").value.trim()||null,logo_url,is_public:true};
    const result=editingClubId ? await supabaseClient.from("clubs").update(record).eq("id",editingClubId) : await supabaseClient.from("clubs").insert(record);
    if(result.error) throw result.error;
    resetClubForm(); await loadData(); notify("Club enregistré avec succès.");
  } catch(err) {console.error(err);notify("Erreur club : "+err.message);}
  finally {button.disabled=false;}
});
async function editClub(id) {
  if(!guardAdmin()) return;
  const c=clubs.find(x=>x.id===id); if(!c)return;
  editingClubId=id;currentClubLogo=c.logo_url||null;
  $("clubName").value=c.name;$("clubCity").value=c.city||"";$("clubManager").value=c.manager||"";
  $("clubFormTitle").textContent="Modifier le club";
  $("clubLogoPreview").innerHTML=c.logo_url?`<img src="${esc(c.logo_url)}" alt="Logo actuel">`:"";
  $("clubAdminForm").classList.remove("hidden");$("clubAdminForm").scrollIntoView({behavior:"smooth"});
}
async function deleteClub(id) {
  if(!guardAdmin()||!confirm("Supprimer ce club ? Les joueurs liés seront également supprimés par la base de données."))return;
  const {error}=await supabaseClient.from("clubs").delete().eq("id",id);
  if(error){notify("Suppression impossible : "+error.message);return;}
  await loadData();notify("Club supprimé.");
}

$("playerForm").addEventListener("submit", async e => {
  e.preventDefault();if(!guardAdmin())return;
  const button=$("playerForm").querySelector('button[type="submit"]');button.disabled=true;
  try {
    const file=$("playerPhoto").files[0];let photo_url=currentPlayerPhoto;
    if(file)photo_url=await uploadImage(file,"joueurs");
    const record={full_name:$("playerName").value.trim(),jersey_number:$("playerNumber").value===""?null:Number($("playerNumber").value),club_id:Number($("playerClub").value),position:$("playerPosition").value.trim()||null,photo_url,is_public:true};
    if(!record.club_id)throw new Error("Choisissez un club.");
    const result=editingPlayerId?await supabaseClient.from("players").update(record).eq("id",editingPlayerId):await supabaseClient.from("players").insert(record);
    if(result.error)throw result.error;
    resetPlayerForm();await loadData();notify("Joueur enregistré avec succès.");
  }catch(err){console.error(err);notify("Erreur joueur : "+err.message);}
  finally{button.disabled=false;}
});
async function editPlayer(id) {
  if(!guardAdmin())return;
  const p=players.find(x=>x.id===id);if(!p)return;
  editingPlayerId=id;currentPlayerPhoto=p.photo_url||null;
  $("playerName").value=p.full_name;$("playerNumber").value=p.jersey_number??"";$("playerClub").value=p.club_id;$("playerPosition").value=p.position||"";
  $("playerFormTitle").textContent="Modifier le joueur";
  $("playerPhotoPreview").innerHTML=p.photo_url?`<img src="${esc(p.photo_url)}" alt="Photo actuelle">`:"";
  $("playerAdminForm").classList.remove("hidden");$("playerAdminForm").scrollIntoView({behavior:"smooth"});
}
async function deletePlayer(id) {
  if(!guardAdmin()||!confirm("Supprimer ce joueur ?"))return;
  const {error}=await supabaseClient.from("players").delete().eq("id",id);
  if(error){notify("Suppression impossible : "+error.message);return;}
  await loadData();notify("Joueur supprimé.");
}

$("matchForm").addEventListener("submit",async e=>{
  e.preventDefault();if(!guardAdmin())return;
  const home=Number($("teamA").value),away=Number($("teamB").value);
  if(!home||!away||home===away){notify("Choisissez deux clubs différents.");return;}
  const record={home_club_id:home,away_club_id:away,match_date:new Date($("matchDate").value).toISOString(),venue:$("matchPlace").value.trim()||null,status:"scheduled",stage:$("matchStage").value};
  const {error}=await supabaseClient.from("matches").insert(record);
  if(error){notify("Erreur match : "+error.message);return;}
  $("matchForm").reset();await loadData();notify("Match programmé.");
});
async function setScore(id) {
  if(!guardAdmin())return;
  const m=matches.find(x=>x.id===id);if(!m)return;
  const a=prompt("Score de "+matchClub(m.home_club_id)+":",m.home_score??"");if(a===null)return;
  const b=prompt("Score de "+matchClub(m.away_club_id)+":",m.away_score??"");if(b===null)return;
  if(a.trim()===""||b.trim()===""||!Number.isInteger(Number(a))||!Number.isInteger(Number(b))||Number(a)<0||Number(b)<0){notify("Saisissez deux scores entiers positifs.");return;}
  const {error}=await supabaseClient.from("matches").update({home_score:Number(a),away_score:Number(b),status:"completed"}).eq("id",id);
  if(error){notify("Erreur score : "+error.message);return;}
  await loadData();notify("Résultat mis à jour.");
}
async function deleteMatch(id) {
  if(!guardAdmin()||!confirm("Supprimer ce match ?"))return;
  const {error}=await supabaseClient.from("matches").delete().eq("id",id);
  if(error){notify("Suppression impossible : "+error.message);return;}
  await loadData();notify("Match supprimé.");
}

$("scorerForm").addEventListener("submit", async e => {
  e.preventDefault();
  if (!guardAdmin()) return;
  const matchId = Number($("scorerMatch").value);
  const playerId = Number($("scorerPlayer").value);
  const goals = Number($("scorerGoals").value);
  if (!matchId || !playerId || !Number.isInteger(goals) || goals < 1) {
    notify("Choisissez un match, un joueur et un nombre de buts valide.");
    return;
  }
  const match = matches.find(m => m.id === matchId);
  const player = players.find(p => p.id === playerId);
  if (!match || !player) { notify("Match ou joueur introuvable."); return; }
  if (![match.home_club_id, match.away_club_id].includes(player.club_id)) {
    notify("Ce joueur n'appartient à aucune des deux équipes de ce match.");
    return;
  }
  const button = $("scorerForm").querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    const { error } = await supabaseClient.rpc("add_match_scorer_goals", {
      p_match_id: matchId, p_player_id: playerId, p_goals: goals
    });
    if (error) throw error;
    $("scorerForm").reset();
    $("scorerGoals").value = 1;
    await loadData();
    notify("Buts ajoutés au cumul du joueur. Classement actualisé !");
  } catch (err) {
    console.error(err);
    notify("Erreur buteur : " + err.message);
  } finally { button.disabled = false; }
});

$("adminLoginForm").addEventListener("submit",async e=>{
  e.preventDefault();const message=$("loginMessage");message.textContent="Connexion en cours…";
  const {error}=await supabaseClient.auth.signInWithPassword({email:$("adminEmail").value.trim(),password:$("adminPassword").value});
  if(error){message.textContent="Connexion impossible : "+error.message;return;}
  isAdmin=await verifyAdmin();
  if(!isAdmin){await supabaseClient.auth.signOut();message.textContent="Ce compte n'a pas le rôle administrateur.";return;}
  message.textContent="Connexion réussie.";await refreshAuthUI();showPage("admin");notify("Bienvenue dans l'administration.");
});
async function logoutAdmin(){await supabaseClient.auth.signOut();isAdmin=false;await refreshAuthUI();showPage("home");notify("Déconnexion effectuée.");}
supabaseClient.auth.onAuthStateChange((event)=>{if(event==="SIGNED_OUT"){isAdmin=false;document.querySelectorAll(".admin-panel").forEach(el=>el.classList.add("hidden"));}});


async function editScorerEntry(id){if(!guardAdmin())return;const e=scorerEntries.find(x=>x.id===id);if(!e)return;const value=prompt('Nouveau total de buts pour ce joueur dans ce match :',String(e.goals));if(value===null)return;const n=Number(value);if(!Number.isInteger(n)||n<0){notify('Saisissez un nombre entier positif ou zéro.');return;}if(n===0){await deleteScorerEntry(id);return;}const {error}=await supabaseClient.from('match_scorers').update({goals:n}).eq('id',id);if(error){notify('Correction impossible : '+error.message);return;}await loadData();notify('Nombre de buts corrigé. Le cumul est recalculé.');}
async function deleteScorerEntry(id){if(!guardAdmin()||!confirm('Supprimer cet enregistrement de buts pour ce match ?'))return;const {error}=await supabaseClient.from('match_scorers').delete().eq('id',id);if(error){notify('Suppression impossible : '+error.message);return;}await loadData();notify('Enregistrement supprimé.');}

// MODULES COMPLEMENTAIRES : statistiques, discipline, actualités et phases finales
function renderClubStats(){
 const rows=clubs.map(c=>({club:c,played:0,w:0,d:0,l:0,gf:0,ga:0,pts:0}));
 matches.filter(m=>m.stage==='group'||!m.stage).forEach(m=>{if(m.home_score===null||m.away_score===null)return;const a=rows.find(r=>r.club.id===m.home_club_id),b=rows.find(r=>r.club.id===m.away_club_id);if(!a||!b)return;a.played++;b.played++;a.gf+=m.home_score;a.ga+=m.away_score;b.gf+=m.away_score;b.ga+=m.home_score;if(m.home_score>m.away_score){a.w++;a.pts+=3;b.l++;}else if(m.home_score<m.away_score){b.w++;b.pts+=3;a.l++;}else{a.d++;b.d++;a.pts++;b.pts++;}});
 rows.sort((a,b)=>b.pts-a.pts||(b.gf-b.ga)-(a.gf-a.ga));
 $('clubStatsList').innerHTML=rows.length?rows.map(r=>`<tr><td>${esc(r.club.name)}</td><td>${r.played}</td><td>${r.w}</td><td>${r.d}</td><td>${r.l}</td><td>${r.gf}</td><td>${r.ga}</td><td><strong>${r.pts}</strong></td></tr>`).join(''):`<tr><td colspan="8">Aucun club.</td></tr>`;
}
function renderDiscipline(){
 const agg=new Map();disciplineEntries.forEach(e=>{const p=players.find(x=>x.id===e.player_id);if(!p)return;let r=agg.get(p.id)||{p,y:0,r:0};if(e.card_type==='red')r.r++;else r.y++;agg.set(p.id,r);});
 const rows=[...agg.values()].sort((a,b)=>b.r-a.r||b.y-a.y||a.p.full_name.localeCompare(b.p.full_name));
 $('disciplineList').innerHTML=rows.length?rows.map(x=>`<tr><td>${esc(x.p.full_name)}</td><td>${esc(clubs.find(c=>c.id===x.p.club_id)?.name||'—')}</td><td>${x.y}</td><td>${x.r}</td></tr>`).join(''):`<tr><td colspan="4">Aucune sanction enregistrée.</td></tr>`;
 $('disciplineDetails').innerHTML=disciplineEntries.length?disciplineEntries.map(e=>{const p=players.find(x=>x.id===e.player_id),m=matches.find(x=>x.id===e.match_id);return `<article class="item-card"><strong>${e.card_type==='red'?'🟥 Carton rouge':'🟨 Carton jaune'} — ${esc(p?.full_name||'Joueur')}</strong><p class="subtle">${esc(m?matchClub(m.home_club_id)+' – '+matchClub(m.away_club_id):'Match')} · ${esc(e.note||'Sans motif précisé')} ${isAdmin?`<button class="danger-button" onclick="deleteDiscipline(${e.id})">Supprimer</button>`:''}</p></article>`}).join(''):`<p class="empty">Aucun événement disciplinaire.</p>`;
}
function populateDisciplineSelects(){const ms=$('disciplineMatch'),ps=$('disciplinePlayer');if(!ms||!ps)return;ms.innerHTML='<option value="">Choisir le match</option>'+matches.map(m=>`<option value="${m.id}">${esc(matchClub(m.home_club_id))} – ${esc(matchClub(m.away_club_id))} · ${esc(dateText(m.match_date))}</option>`).join('');ps.innerHTML='<option value="">Choisir le joueur</option>'+players.map(p=>`<option value="${p.id}">${esc(p.full_name)} — ${esc(clubs.find(c=>c.id===p.club_id)?.name||'')}</option>`).join('');}
$('disciplineForm').addEventListener('submit',async e=>{e.preventDefault();if(!guardAdmin())return;const matchId=Number($('disciplineMatch').value),playerId=Number($('disciplinePlayer').value),match=matches.find(m=>m.id===matchId),player=players.find(p=>p.id===playerId);if(!match||!player||![match.home_club_id,match.away_club_id].includes(player.club_id)){notify('Le joueur doit appartenir à une équipe du match.');return;}const {error}=await supabaseClient.from('disciplinary_events').insert({match_id:matchId,player_id:playerId,card_type:$('disciplineCard').value,note:$('disciplineNote').value.trim()||null});if(error){notify('Erreur sanction : '+error.message);return;}e.target.reset();await loadData();notify('Sanction enregistrée.');});
async function deleteDiscipline(id){if(!guardAdmin()||!confirm('Supprimer cette sanction ?'))return;const {error}=await supabaseClient.from('disciplinary_events').delete().eq('id',id);if(error){notify(error.message);return;}await loadData();notify('Sanction supprimée.');}
function renderNews(){
  const published = newsEntries.filter(n => n.published);
  const visibleForPage = isAdmin ? newsEntries : published;
  const card = n => `<article class="item-card news-card">${n.image_url?`<img src="${esc(n.image_url)}" alt="">`:''}<h3>${esc(n.title)}</h3><p>${esc(n.content)}</p><div class="subtle">${esc(dateText(n.created_at))} ${n.published?'· Publié':'· Brouillon'}</div>${isAdmin?`<div class="card-actions"><button class="btn-secondary" onclick="editNews(${n.id})">Modifier</button><button class="danger-button" onclick="deleteNews(${n.id})">Supprimer</button></div>`:''}</article>`;
  const homeList = $("homeNewsList");
  if (homeList) homeList.innerHTML = published.length ? published.slice(0,8).map(card).join("") : '<p class="empty">Aucune actualité publiée pour le moment.</p>';
  $("newsList").innerHTML = visibleForPage.length ? visibleForPage.map(card).join("") : '<p class="empty">Aucune actualité publiée.</p>';
}
$('newsImageFile').addEventListener('change',()=>{
  const file=$('newsImageFile').files[0], box=$('newsImagePreview');
  if(!file){box.innerHTML=currentNewsImage?`<img src="${esc(currentNewsImage)}" alt="Photo actuelle">`:'';return;}
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>2*1024*1024){notify('Photo invalide : choisissez JPG, PNG ou WEBP de 2 Mo maximum.');$('newsImageFile').value='';return;}
  box.innerHTML=`<img src="${URL.createObjectURL(file)}" alt="Aperçu de la photo">`;
});
$('newsForm').addEventListener('submit',async e=>{
  e.preventDefault();if(!guardAdmin())return;
  const button=$('newsForm').querySelector('button[type="submit"]');button.disabled=true;
  try{
    const file=$('newsImageFile').files[0];
    let image_url=currentNewsImage;
    if(file) image_url=await uploadImage(file,'actualites');
    const rec={title:$('newsTitle').value.trim(),content:$('newsContent').value.trim(),image_url,published:$('newsPublished').checked};
    const res=editingNewsId?await supabaseClient.from('news').update(rec).eq('id',editingNewsId):await supabaseClient.from('news').insert(rec);
    if(res.error)throw res.error;
    resetNewsForm();await loadData();notify('Actualité enregistrée avec succès.');
  }catch(err){console.error(err);notify('Erreur actualité : '+err.message);}
  finally{button.disabled=false;}
});
function resetNewsForm(){editingNewsId=null;currentNewsImage=null;$('newsForm').reset();$('newsPublished').checked=true;$('newsImagePreview').innerHTML='';$('newsFormTitle').textContent='Publier une actualité';}
function editNews(id){if(!guardAdmin())return;const n=newsEntries.find(x=>x.id===id);if(!n)return;editingNewsId=id;currentNewsImage=n.image_url||null;$('newsTitle').value=n.title;$('newsContent').value=n.content;$('newsImageFile').value='';$('newsImagePreview').innerHTML=currentNewsImage?`<img src="${esc(currentNewsImage)}" alt="Photo actuelle">`:'';$('newsPublished').checked=!!n.published;$('newsFormTitle').textContent='Modifier une actualité';$('newsAdminForm').classList.remove('hidden');$('newsAdminForm').scrollIntoView({behavior:'smooth'});}
async function deleteNews(id){if(!guardAdmin()||!confirm('Supprimer cette actualité ?'))return;const {error}=await supabaseClient.from('news').delete().eq('id',id);if(error){notify(error.message);return;}await loadData();notify('Actualité supprimée.');}
function renderFinals(){const stages=['round_of_16','quarter_final','semi_final','third_place','final'];const finals=matches.filter(m=>stages.includes(m.stage));$('finalsList').innerHTML=finals.length?finals.map(m=>matchCard(m)).join(''):'<p class="empty">Aucun match de phase finale programmé. Pour en créer, allez dans Matchs et choisissez une étape dans le formulaire.</p>';}

async function init(){try{await loadData();}catch(err){console.error(err);setConnection("ERREUR");notify("Erreur de connexion à Supabase.");}}
init();

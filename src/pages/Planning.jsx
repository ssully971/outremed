import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { envoyerNotificationGroupe } from '../lib/notifier';

const JOURS_SEMAINE = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const MOIS_NOMS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

function memeJour(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function debutSemaine(date) {
  const d = new Date(date);
  const jour = (d.getDay() + 6) % 7; // 0 = lundi
  d.setDate(d.getDate() - jour);
  d.setHours(0, 0, 0, 0);
  return d;
}

export default function Planning() {
  const [monProfil, setMonProfil] = useState(null);
  const [types, setTypes] = useState([]);
  const [echeances, setEcheances] = useState([]);
  const [selectionnee, setSelectionnee] = useState(null);
  const [vue, setVue] = useState('mois');
  const [dateAffichee, setDateAffichee] = useState(new Date());
  const navigate = useNavigate();

  // Création
  const [creationOuverte, setCreationOuverte] = useState(false);
  const [typeChoisi, setTypeChoisi] = useState('');
  const [nouveauTypeOuvert, setNouveauTypeOuvert] = useState(false);
  const [nomNouveauType, setNomNouveauType] = useState('');
  const [couleurNouveauType, setCouleurNouveauType] = useState('#06b6d4');
  const [titre, setTitre] = useState('');
  const [date, setDate] = useState('');
  const [avecHoraire, setAvecHoraire] = useState(false);
  const [heureDebut, setHeureDebut] = useState('');
  const [heureFin, setHeureFin] = useState('');
  const [description, setDescription] = useState('');
  const [message, setMessage] = useState('');

  const couleursDisponibles = ['#06b6d4', '#eab308', '#14b8a6', '#f43f5e', '#8b5cf6', '#84cc16'];

  async function chargerTout() {
    const { data: session } = await supabase.auth.getSession();
    if (!session.session) { navigate('/'); return; }
    const { data: moi } = await supabase.from('profiles').select('role, categorie_compte').eq('id', session.session.user.id).single();
    if (moi?.role !== 'proprietaire') {
      const { data: params } = await supabase.from('parametres').select('cle, valeur').in('cle', ['planning_actif', 'mode_site']);
      const map = {}; (params || []).forEach((p) => { map[p.cle] = p.valeur; });
      const estEtudiantAnnale = moi?.role === 'etudiant' && moi?.categorie_compte === 'annale';
      const estTuteurRestreint = moi?.role === 'tuteur' && map.mode_site === 'annale';
      if (map.planning_actif === 'false' || estEtudiantAnnale || estTuteurRestreint) { navigate('/accueil'); return; }
    }
    setMonProfil(moi);

    const { data: t } = await supabase.from('types_echeance').select('*').order('created_at');
    setTypes(t || []);
    if (t && t.length > 0 && !typeChoisi) setTypeChoisi(t[0].id);

    const { data: e } = await supabase.from('echeances').select('*').order('date');
    setEcheances(e || []);
  }

  useEffect(() => { chargerTout(); }, []);

  async function supprimerType(type) {
    if (!confirm(`Supprimer le type "${type.nom}" ?`)) return;
    const { error } = await supabase.from('types_echeance').delete().eq('id', type.id);
    if (error) {
      alert(`Impossible de supprimer "${type.nom}" : des échéances l'utilisent encore. Change ou supprime d'abord ces échéances.`);
      return;
    }
    if (typeChoisi === type.id) setTypeChoisi('');
    chargerTout();
  }

  async function creerNouveauType() {
    if (!nomNouveauType.trim()) return;
    const { data, error } = await supabase.from('types_echeance').insert({ nom: nomNouveauType.trim(), couleur: couleurNouveauType }).select().single();
    if (error) { setMessage('Erreur : ' + error.message); return; }
    setNomNouveauType('');
    setNouveauTypeOuvert(false);
    await chargerTout();
    setTypeChoisi(data.id);
  }

  function exporterCalendrier() {
    const formaterDate = (dateStr, heureStr) => {
      const d = new Date(dateStr);
      if (heureStr) {
        const [h, m] = heureStr.split(':');
        d.setHours(Number(h), Number(m), 0);
      }
      return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    };

    let ics = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Outremed//Planning//FR\r\n';
    echeances.forEach((e) => {
      const debut = formaterDate(e.date, e.heure_debut);
      const fin = e.heure_fin ? formaterDate(e.date, e.heure_fin) : formaterDate(e.date, e.heure_debut || '23:59');
      ics += 'BEGIN:VEVENT\r\n';
      ics += `UID:${e.id}@outremed\r\n`;
      ics += `DTSTAMP:${formaterDate(new Date().toISOString().slice(0, 10), '00:00')}\r\n`;
      if (e.heure_debut) {
        ics += `DTSTART:${debut}\r\n`;
        ics += `DTEND:${fin}\r\n`;
      } else {
        ics += `DTSTART;VALUE=DATE:${e.date.replace(/-/g, '')}\r\n`;
      }
      ics += `SUMMARY:${e.titre.replace(/\n/g, ' ')}\r\n`;
      if (e.description) ics += `DESCRIPTION:${e.description.replace(/\n/g, '\\n')}\r\n`;
      ics += 'END:VEVENT\r\n';
    });
    ics += 'END:VCALENDAR\r\n';

    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'planning-outremed.ics';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function ajouterEcheance(e) {
    e.preventDefault();
    if (!titre.trim() || !date || !typeChoisi) { setMessage('Le type, le titre et la date sont obligatoires.'); return; }

    const { data: session } = await supabase.auth.getSession();
    const { error } = await supabase.from('echeances').insert({
      type_id: typeChoisi,
      titre: titre.trim(),
      date,
      heure_debut: avecHoraire ? heureDebut || null : null,
      heure_fin: avecHoraire ? heureFin || null : null,
      description: description || null,
      cree_par: session.session.user.id,
    });
    if (error) { setMessage('Erreur : ' + error.message); return; }

    const { data: etudiants } = await supabase.from('profiles').select('id').eq('role', 'etudiant');
    if (etudiants && etudiants.length > 0) {
      await envoyerNotificationGroupe(etudiants.map((e) => e.id), 'echeance', `Nouvelle échéance : ${titre.trim()}`, '/planning');
    }

    setTitre(''); setDate(''); setAvecHoraire(false); setHeureDebut(''); setHeureFin(''); setDescription('');
    setCreationOuverte(false);
    setMessage('');
    chargerTout();
  }

  async function supprimerEcheance(id) {
    if (!confirm('Supprimer cette échéance ?')) return;
    await supabase.from('echeances').delete().eq('id', id);
    setSelectionnee(null);
    chargerTout();
  }

  if (!monProfil) return <div style={{ padding: 40 }}>Chargement...</div>;

  const estAdmin = monProfil.role === 'tuteur' || monProfil.role === 'proprietaire';
  const typeParId = (id) => types.find((t) => t.id === id);
  const aujourdhui = new Date();

  function echeancesDuJour(jour) {
    return echeances.filter((e) => memeJour(new Date(e.date + 'T00:00:00'), jour));
  }

  function ouvrirCreationPourDate(jour) {
    if (!estAdmin) return;
    setDate(jour.toISOString().slice(0, 10));
    setCreationOuverte(true);
  }

  // ===== Grille du mois =====
  const anneeAff = dateAffichee.getFullYear();
  const moisAff = dateAffichee.getMonth();
  const premierDuMois = new Date(anneeAff, moisAff, 1);
  const grilleDebut = debutSemaine(premierDuMois);
  const joursMois = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(grilleDebut);
    d.setDate(d.getDate() + i);
    return d;
  });

  // ===== Grille de la semaine =====
  const debutSemAff = debutSemaine(dateAffichee);
  const joursSemaine = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(debutSemAff);
    d.setDate(d.getDate() + i);
    return d;
  });

  function naviguer(direction) {
    const d = new Date(dateAffichee);
    if (vue === 'mois') d.setMonth(d.getMonth() + direction);
    else d.setDate(d.getDate() + direction * 7);
    setDateAffichee(d);
  }

  const prochaines = echeances
    .filter((e) => new Date(e.date + 'T23:59:59') >= aujourdhui)
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(0, 6);

  return (
    <div className="container">
      <div className="page-top-row">
        <div>
          <h1 className="page-title">Planning</h1>
          <p className="page-sub">Toutes les échéances importantes, au même endroit.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-outline" onClick={exporterCalendrier}>📅 Exporter (.ics)</button>
          {estAdmin && <button className="btn btn-primary" onClick={() => setCreationOuverte(true)}>+ Ajouter une échéance</button>}
        </div>
      </div>

      <div className="planner-layout">
        <div className="calendar-card">
          <div className="calendar-header">
            <div className="month-nav">
              <button onClick={() => naviguer(-1)}>←</button>
              <h2>
                {vue === 'mois'
                  ? `${MOIS_NOMS[moisAff]} ${anneeAff}`
                  : `Semaine du ${debutSemAff.getDate()} ${MOIS_NOMS[debutSemAff.getMonth()]}`}
              </h2>
              <button onClick={() => naviguer(1)}>→</button>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <button className="btn btn-outline" style={{ padding: '7px 14px', fontSize: '0.78rem' }} onClick={() => setDateAffichee(new Date())}>Aujourd'hui</button>
              <div className="view-toggle">
                <button className={vue === 'mois' ? 'active' : ''} onClick={() => setVue('mois')}>Mois</button>
                <button className={vue === 'semaine' ? 'active' : ''} onClick={() => setVue('semaine')}>Semaine</button>
              </div>
            </div>
          </div>

          {vue === 'mois' ? (
            <>
              <div className="weekday-row">{JOURS_SEMAINE.map((j) => <span key={j}>{j}</span>)}</div>
              <div className="month-grid">
                {joursMois.map((jour, idx) => {
                  const evenements = echeancesDuJour(jour);
                  const horsMois = jour.getMonth() !== moisAff;
                  return (
                    <div
                      key={idx}
                      className={`day-cell ${horsMois ? 'other-month' : ''} ${memeJour(jour, aujourdhui) ? 'today' : ''}`}
                      onClick={() => (evenements.length === 0 ? ouvrirCreationPourDate(jour) : null)}
                    >
                      <span className="day-num">{jour.getDate()}</span>
                      <div className="day-events">
                        {evenements.slice(0, 2).map((e) => {
                          const t = typeParId(e.type_id);
                          return (
                            <div key={e.id} className="day-event-chip" style={{ background: t?.couleur || 'var(--accent)' }} onClick={(ev) => { ev.stopPropagation(); setSelectionnee(e); }}>
                              {e.titre}
                            </div>
                          );
                        })}
                        {evenements.length > 2 && <span className="day-event-more">+{evenements.length - 2} de plus</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="week-grid">
              {joursSemaine.map((jour, idx) => {
                const evenements = echeancesDuJour(jour);
                return (
                  <div key={idx} className={`week-day-col ${memeJour(jour, aujourdhui) ? 'today' : ''}`} onClick={() => (evenements.length === 0 ? ouvrirCreationPourDate(jour) : null)}>
                    <div className="week-day-head">
                      <div className="wd-name">{JOURS_SEMAINE[idx]}</div>
                      <div className="wd-num">{jour.getDate()}</div>
                    </div>
                    {evenements.map((e) => {
                      const t = typeParId(e.type_id);
                      return (
                        <div key={e.id} className="week-event-card" style={{ background: t?.couleur || 'var(--accent)' }} onClick={(ev) => { ev.stopPropagation(); setSelectionnee(e); }}>
                          {e.heure_debut && <span className="we-time">{e.heure_debut.slice(0, 5)}</span>}
                          {e.titre}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}

          {types.length > 0 && (
            <div className="legend-row">
              {types.map((t) => (
                <div key={t.id} className="legend-item">
                  <span className="legend-dot" style={{ background: t.couleur }} />
                  {t.nom}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="upcoming-card">
          <h3>À venir</h3>
          <p className="uc-sub">Les 6 prochaines échéances</p>
          {prochaines.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Rien de prévu pour l'instant.</p>}
          {prochaines.map((e) => {
            const t = typeParId(e.type_id);
            const d = new Date(e.date + 'T00:00:00');
            return (
              <div key={e.id} className="upcoming-item" onClick={() => setSelectionnee(e)}>
                <div className="upcoming-date-badge" style={{ background: t?.couleur || 'var(--accent)' }}>
                  <span className="ud-day">{d.getDate()}</span>
                  <span className="ud-month">{MOIS_NOMS[d.getMonth()].slice(0, 3)}</span>
                </div>
                <div className="upcoming-info">
                  <div className="upcoming-title">{e.titre}</div>
                  <div className="upcoming-meta">{e.heure_debut ? e.heure_debut.slice(0, 5) : 'Toute la journée'}</div>
                  <span className="upcoming-type-tag" style={{ background: t?.couleur || 'var(--accent)' }}>{t?.nom}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {selectionnee && (
        <div className="modal-overlay open" onClick={() => setSelectionnee(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            {(() => {
              const t = typeParId(selectionnee.type_id);
              return (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <span style={{ display: 'inline-block', fontSize: '0.7rem', fontWeight: 800, padding: '3px 10px', borderRadius: 20, background: (t?.couleur || '#888') + '26', color: t?.couleur, marginBottom: 10 }}>
                      {t?.nom}
                    </span>
                    <button onClick={() => setSelectionnee(null)} style={{ background: 'none', border: 'none', fontSize: '1.3rem', cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
                  </div>
                  <h3 style={{ margin: '0 0 8px' }}>{selectionnee.titre}</h3>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: 4 }}>
                    {new Date(selectionnee.date + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                  </p>
                  {selectionnee.heure_debut && (
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: 12 }}>
                      {selectionnee.heure_debut.slice(0, 5)}{selectionnee.heure_fin ? ` — ${selectionnee.heure_fin.slice(0, 5)}` : ''}
                    </p>
                  )}
                  {selectionnee.description && <p style={{ fontSize: '0.88rem', marginBottom: 16 }}>{selectionnee.description}</p>}
                  {estAdmin && (
                    <button className="btn btn-outline" style={{ color: 'var(--error)', borderColor: 'var(--error)', fontSize: '0.8rem' }} onClick={() => supprimerEcheance(selectionnee.id)}>
                      Supprimer
                    </button>
                  )}
                </>
              );
            })()}
          </div>
        </div>
      )}

      {creationOuverte && (
        <div className="modal-overlay open" onClick={() => setCreationOuverte(false)}>
          <form onSubmit={ajouterEcheance} className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3>Nouvelle échéance</h3>
              <button type="button" onClick={() => setCreationOuverte(false)} style={{ background: 'none', border: 'none', fontSize: '1.3rem', cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
            </div>

            <div className="field">
              <label>Type d'échéance</label>
              <div className="type-quick-grid">
                {types.map((t) => (
                  <div
                    key={t.id}
                    className={`type-quick-card ${typeChoisi === t.id ? 'selected' : ''}`}
                    style={{ '--sel-color': t.couleur, '--sel-glow': t.couleur + '26' }}
                    onClick={() => setTypeChoisi(t.id)}
                  >
                    {t.nom}
                    <div onClick={(e) => { e.stopPropagation(); supprimerType(t); }} style={{ fontSize: '0.65rem', opacity: 0.6, marginTop: 4 }}>✕ supprimer</div>
                  </div>
                ))}
                <div className="type-quick-card" onClick={() => setNouveauTypeOuvert((v) => !v)}>+ Nouveau</div>
              </div>

              {nouveauTypeOuvert && (
                <div style={{ background: 'var(--bg-panel)', borderRadius: 'var(--radius-md)', padding: 14, marginTop: 10 }}>
                  <input value={nomNouveauType} onChange={(e) => setNomNouveauType(e.target.value)} placeholder="Nom du type" style={{ marginBottom: 10 }} />
                  <div className="color-grid" style={{ marginBottom: 10 }}>
                    {couleursDisponibles.map((c) => (
                      <div key={c} className={`color-swatch ${couleurNouveauType === c ? 'selected' : ''}`} style={{ background: c }} onClick={() => setCouleurNouveauType(c)} />
                    ))}
                  </div>
                  <button type="button" className="btn btn-outline btn-sm" onClick={creerNouveauType}>Créer ce type</button>
                </div>
              )}
            </div>

            <div className="field">
              <label>Titre</label>
              <input value={titre} onChange={(e) => setTitre(e.target.value)} placeholder="Ex : Clôture des inscriptions au parrainage" />
            </div>

            <div className="field">
              <label>Date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>

            <div className="field">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={avecHoraire} onChange={(e) => setAvecHoraire(e.target.checked)} style={{ width: 'auto' }} />
                Ajouter un horaire (optionnel)
              </label>
              {avecHoraire && (
                <div className="field-row" style={{ marginTop: 10 }}>
                  <input type="time" value={heureDebut} onChange={(e) => setHeureDebut(e.target.value)} />
                  <input type="time" value={heureFin} onChange={(e) => setHeureFin(e.target.value)} />
                </div>
              )}
            </div>

            <div className="field">
              <label>Description (optionnel)</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Lieu, matières concernées, consignes..." />
            </div>

            {message && <div className="error-msg">{message}</div>}

            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setCreationOuverte(false)}>Annuler</button>
              <button className="btn btn-primary" type="submit">Ajouter au planning</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

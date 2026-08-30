import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

const COULEURS = ['#FF3EB5', '#38bdf8', '#22c55e', '#f97316', '#a78bfa', '#ef4444', '#eab308', '#14b8a6'];

export default function PopupMatieres({ onFermer }) {
  const [matieres, setMatieres] = useState([]);
  const [nouvelleMatiere, setNouvelleMatiere] = useState('');
  const [nouvelEmoji, setNouvelEmoji] = useState('');
  const [nouveauSemestre, setNouveauSemestre] = useState('');
  const [nouveauCours, setNouveauCours] = useState({});
  const [editionOuverte, setEditionOuverte] = useState(null);
  const [nomEdition, setNomEdition] = useState('');
  const [semestreEdition, setSemestreEdition] = useState('');
  const [ajoutOuvert, setAjoutOuvert] = useState(false);

  async function charger() {
    const { data: mats } = await supabase.from('matieres').select('*').eq('est_prive', false).order('ordre', { ascending: true, nullsFirst: false });
    const { data: crs } = await supabase.from('cours').select('*').eq('est_prive', false).order('nom');
    setMatieres((mats || []).map((m) => ({ ...m, cours: (crs || []).filter((c) => c.matiere_id === m.id) })));
  }

  useEffect(() => { charger(); }, []);

  async function ajouterMatiere(e) {
    e.preventDefault();
    if (!nouvelleMatiere.trim()) return;
    const maxOrdre = Math.max(0, ...matieres.map((m) => m.ordre || 0));
    await supabase.from('matieres').insert({
      nom: nouvelleMatiere.trim(),
      semestre: nouveauSemestre || null,
      ordre: maxOrdre + 1,
      couleur: COULEURS[matieres.length % COULEURS.length],
      emoji: nouvelEmoji.trim() || null,
    });
    setNouvelleMatiere('');
    setNouveauSemestre('');
    setNouvelEmoji('');
    setAjoutOuvert(false);
    charger();
  }

  async function ajouterCours(matiereId) {
    const nom = (nouveauCours[matiereId] || '').trim();
    if (!nom) return;
    await supabase.from('cours').insert({ matiere_id: matiereId, nom });
    setNouveauCours((prev) => ({ ...prev, [matiereId]: '' }));
    charger();
  }

  function ouvrirEdition(m) {
    setEditionOuverte(editionOuverte === m.id ? null : m.id);
    setNomEdition(m.nom);
    setSemestreEdition(m.semestre || '');
  }

  async function enregistrerEdition(m) {
    await supabase.from('matieres').update({ nom: nomEdition, semestre: semestreEdition || null }).eq('id', m.id);
    setEditionOuverte(null);
    charger();
  }

  async function changerCouleur(m, couleur) {
    await supabase.from('matieres').update({ couleur }).eq('id', m.id);
    charger();
  }

  async function changerEmoji(m, emoji) {
    await supabase.from('matieres').update({ emoji: emoji.trim() || null }).eq('id', m.id);
    charger();
  }

  async function basculerActif(m) {
    await supabase.from('matieres').update({ actif: !m.actif }).eq('id', m.id);
    charger();
  }

  async function deplacer(index, direction) {
    const autreIndex = index + direction;
    if (autreIndex < 0 || autreIndex >= matieres.length) return;
    const a = matieres[index];
    const b = matieres[autreIndex];
    await supabase.from('matieres').update({ ordre: b.ordre }).eq('id', a.id);
    await supabase.from('matieres').update({ ordre: a.ordre }).eq('id', b.id);
    charger();
  }

  return (
    <div className="modal-overlay open" onClick={onFermer}>
      <div onClick={(e) => e.stopPropagation()} className="modal-box" style={{ maxWidth: 640, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>Matières et cours</h3>
          <button onClick={onFermer} style={{ background: 'none', border: 'none', fontSize: '1.3rem', cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
        </div>
        <p className="modal-sub">Réordonne, colore, active ou désactive tes matières.</p>

        <div style={{ overflowY: 'auto', flex: 1 }}>
          <div className="subjects-manage-grid">
            {matieres.map((m, index) => (
              <div key={m.id} className={`subject-manage-card ${m.actif === false ? 'inactive' : ''}`}>
                <div className="smc-top">
                  <span className="smc-dot" style={{ background: m.couleur }} />
                  <input
                    value={m.emoji || ''}
                    onChange={(e) => changerEmoji(m, e.target.value)}
                    placeholder="🎯"
                    maxLength={4}
                    style={{ width: 34, padding: '4px 6px', textAlign: 'center', fontSize: '1rem', flexShrink: 0 }}
                    title="Emoji (optionnel)"
                  />
                  {editionOuverte === m.id ? (
                    <input className="smc-name" value={nomEdition} onChange={(e) => setNomEdition(e.target.value)} onBlur={() => enregistrerEdition(m)} autoFocus />
                  ) : (
                    <div className="smc-name" style={{ cursor: 'pointer' }} onClick={() => ouvrirEdition(m)}>{m.nom}</div>
                  )}
                  <div className="smc-order-btns">
                    <button className="order-btn" onClick={() => deplacer(index, -1)} disabled={index === 0}>▲</button>
                    <button className="order-btn" onClick={() => deplacer(index, 1)} disabled={index === matieres.length - 1}>▼</button>
                  </div>
                </div>

                {editionOuverte === m.id && (
                  <input
                    value={semestreEdition}
                    onChange={(e) => setSemestreEdition(e.target.value)}
                    onBlur={() => enregistrerEdition(m)}
                    placeholder="Semestre"
                    style={{ marginBottom: 10, fontSize: '0.8rem' }}
                  />
                )}

                <div className="smc-meta">{m.semestre || 'Aucun semestre'} · {m.cours.length} cours</div>

                <div className="color-grid" style={{ marginBottom: 14 }}>
                  {COULEURS.map((c) => (
                    <div key={c} className={`color-swatch ${m.couleur === c ? 'selected' : ''}`} style={{ background: c, width: 22, height: 22 }} onClick={() => changerCouleur(m, c)} />
                  ))}
                </div>

                {m.cours.map((c) => (
                  <div key={c.id} style={{ fontSize: '0.82rem', color: 'var(--text-muted)', padding: '2px 0' }}>— {c.nom}</div>
                ))}
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  <input
                    value={nouveauCours[m.id] || ''}
                    onChange={(e) => setNouveauCours((prev) => ({ ...prev, [m.id]: e.target.value }))}
                    placeholder="Nom du cours"
                    style={{ flex: 1, fontSize: '0.8rem' }}
                  />
                  <button className="btn btn-ghost btn-sm" onClick={() => ajouterCours(m.id)}>+</button>
                </div>

                <div className="smc-actions" style={{ marginTop: 12 }}>
                  <button
                    className="btn btn-outline btn-sm"
                    style={{ color: m.actif === false ? 'var(--success)' : 'var(--error)', borderColor: m.actif === false ? 'var(--success)' : 'var(--error)' }}
                    onClick={() => basculerActif(m)}
                  >
                    {m.actif === false ? 'Activer' : 'Désactiver'}
                  </button>
                </div>
              </div>
            ))}

            {ajoutOuvert ? (
              <form onSubmit={ajouterMatiere} className="subject-manage-card">
                <div className="field" style={{ marginBottom: 10, display: 'flex', gap: 8 }}>
                  <input value={nouvelEmoji} onChange={(e) => setNouvelEmoji(e.target.value)} placeholder="🎯" maxLength={4} style={{ width: 46, textAlign: 'center' }} />
                  <input value={nouvelleMatiere} onChange={(e) => setNouvelleMatiere(e.target.value)} placeholder="Nom de la matière" style={{ flex: 1 }} />
                </div>
                <div className="field" style={{ marginBottom: 10 }}>
                  <input value={nouveauSemestre} onChange={(e) => setNouveauSemestre(e.target.value)} placeholder="Semestre (optionnel)" />
                </div>
                <button className="btn btn-primary btn-sm" type="submit" style={{ width: '100%' }}>Ajouter</button>
              </form>
            ) : (
              <div className="add-subject-card" onClick={() => setAjoutOuvert(true)}>+ Nouvelle matière</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

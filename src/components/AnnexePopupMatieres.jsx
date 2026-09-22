import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

const COULEURS = ['#FF3EB5', '#38bdf8', '#22c55e', '#f97316', '#a78bfa', '#ef4444', '#eab308', '#14b8a6'];

export default function AnnexePopupMatieres({ onFermer }) {
  const [matieres, setMatieres] = useState([]);
  const [nouvelleMatiere, setNouvelleMatiere] = useState('');
  const [nouvelEmoji, setNouvelEmoji] = useState('');
  const [editionOuverte, setEditionOuverte] = useState(null);
  const [nomEdition, setNomEdition] = useState('');
  const [ajoutOuvert, setAjoutOuvert] = useState(false);
  const [nouvelleSousMatiere, setNouvelleSousMatiere] = useState({});

  async function charger() {
    const { data } = await supabase.from('annexe_matieres').select('*').order('ordre', { ascending: true, nullsFirst: false });
    setMatieres(data || []);
  }

  useEffect(() => { charger(); }, []);

  const matieresTop = matieres.filter((m) => !m.parent_id);
  const sousMatieresDe = (parentId) => matieres.filter((m) => m.parent_id === parentId);

  async function ajouterMatiere(e) {
    e.preventDefault();
    if (!nouvelleMatiere.trim()) return;
    const maxOrdre = Math.max(0, ...matieresTop.map((m) => m.ordre || 0));
    await supabase.from('annexe_matieres').insert({
      nom: nouvelleMatiere.trim(),
      ordre: maxOrdre + 1,
      couleur: COULEURS[matieresTop.length % COULEURS.length],
      emoji: nouvelEmoji.trim() || null,
    });
    setNouvelleMatiere('');
    setNouvelEmoji('');
    setAjoutOuvert(false);
    charger();
  }

  async function ajouterSousMatiere(parentId) {
    const nom = (nouvelleSousMatiere[parentId] || '').trim();
    if (!nom) return;
    await supabase.from('annexe_matieres').insert({ nom, parent_id: parentId });
    setNouvelleSousMatiere((prev) => ({ ...prev, [parentId]: '' }));
    charger();
  }

  async function renommerSousMatiere(sousMatiere, nouveauNom) {
    if (!nouveauNom.trim() || nouveauNom.trim() === sousMatiere.nom) return;
    await supabase.from('annexe_matieres').update({ nom: nouveauNom.trim() }).eq('id', sousMatiere.id);
    charger();
  }

  async function supprimerSousMatiere(sousMatiere) {
    if (!confirm(`Supprimer la sous-matière "${sousMatiere.nom}" ? Les QCM qui y étaient liés perdront leur matière mais resteront disponibles.`)) return;
    await supabase.from('annexe_matieres').delete().eq('id', sousMatiere.id);
    charger();
  }

  function ouvrirEdition(m) {
    setEditionOuverte(editionOuverte === m.id ? null : m.id);
    setNomEdition(m.nom);
  }

  async function enregistrerEdition(m) {
    if (nomEdition.trim()) {
      await supabase.from('annexe_matieres').update({ nom: nomEdition.trim() }).eq('id', m.id);
    }
    setEditionOuverte(null);
    charger();
  }

  async function changerCouleur(m, couleur) {
    await supabase.from('annexe_matieres').update({ couleur }).eq('id', m.id);
    charger();
  }

  async function changerEmoji(m, emoji) {
    await supabase.from('annexe_matieres').update({ emoji: emoji.trim() || null }).eq('id', m.id);
    charger();
  }

  async function basculerActif(m) {
    await supabase.from('annexe_matieres').update({ actif: !m.actif }).eq('id', m.id);
    charger();
  }

  async function supprimerMatiere(m) {
    if (!confirm(`Supprimer la matière "${m.nom}" ? Ses sous-matières seront supprimées avec elle, et les QCM liés perdront leur matière mais resteront disponibles.`)) return;
    await supabase.from('annexe_matieres').delete().eq('id', m.id);
    charger();
  }

  async function deplacer(index, direction) {
    const autreIndex = index + direction;
    if (autreIndex < 0 || autreIndex >= matieresTop.length) return;
    const a = matieresTop[index];
    const b = matieresTop[autreIndex];
    await supabase.from('annexe_matieres').update({ ordre: b.ordre }).eq('id', a.id);
    await supabase.from('annexe_matieres').update({ ordre: a.ordre }).eq('id', b.id);
    charger();
  }

  return (
    <div className="modal-overlay open" onClick={onFermer}>
      <div onClick={(e) => e.stopPropagation()} className="modal-box" style={{ maxWidth: 640, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>Matières de l'espace tuteurs</h3>
          <button onClick={onFermer} style={{ background: 'none', border: 'none', fontSize: '1.3rem', cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
        </div>
        <p className="modal-sub">Partagées entre tous les tuteurs et le propriétaire.</p>

        <div style={{ overflowY: 'auto', flex: 1 }}>
          <div className="subjects-manage-grid">
            {matieresTop.map((m, index) => (
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
                    <button className="order-btn" onClick={() => deplacer(index, 1)} disabled={index === matieresTop.length - 1}>▼</button>
                  </div>
                </div>

                <div className="color-grid" style={{ margin: '10px 0 14px' }}>
                  {COULEURS.map((c) => (
                    <div key={c} className={`color-swatch ${m.couleur === c ? 'selected' : ''}`} style={{ background: c, width: 22, height: 22 }} onClick={() => changerCouleur(m, c)} />
                  ))}
                </div>

                <div style={{ marginBottom: 10 }}>
                  {sousMatieresDe(m.id).map((sm) => (
                    <div key={sm.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0' }}>
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>↳</span>
                      <input
                        defaultValue={sm.nom}
                        onBlur={(e) => renommerSousMatiere(sm, e.target.value)}
                        style={{ flex: 1, fontSize: '0.82rem', padding: '4px 8px', border: '1px solid transparent', background: 'transparent' }}
                        onFocus={(e) => { e.target.style.border = '1px solid var(--border)'; e.target.style.background = 'var(--bg-panel)'; }}
                      />
                      <button className="icon-action danger" style={{ width: 22, height: 22, fontSize: '0.75rem' }} title="Supprimer cette sous-matière" onClick={() => supprimerSousMatiere(sm)}>🗑</button>
                    </div>
                  ))}
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    <input
                      value={nouvelleSousMatiere[m.id] || ''}
                      onChange={(e) => setNouvelleSousMatiere((prev) => ({ ...prev, [m.id]: e.target.value }))}
                      placeholder="Sous-matière"
                      style={{ flex: 1, fontSize: '0.8rem' }}
                    />
                    <button className="btn btn-ghost btn-sm" onClick={() => ajouterSousMatiere(m.id)}>+</button>
                  </div>
                </div>

                <div className="smc-actions" style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="btn btn-outline btn-sm"
                    style={{ color: m.actif === false ? 'var(--success)' : 'var(--error)', borderColor: m.actif === false ? 'var(--success)' : 'var(--error)' }}
                    onClick={() => basculerActif(m)}
                  >
                    {m.actif === false ? 'Activer' : 'Désactiver'}
                  </button>
                  <button className="icon-action danger" title="Supprimer cette matière" onClick={() => supprimerMatiere(m)}>🗑</button>
                </div>
              </div>
            ))}

            {ajoutOuvert ? (
              <form onSubmit={ajouterMatiere} className="subject-manage-card">
                <div className="field" style={{ marginBottom: 10, display: 'flex', gap: 8 }}>
                  <input value={nouvelEmoji} onChange={(e) => setNouvelEmoji(e.target.value)} placeholder="🎯" maxLength={4} style={{ width: 46, textAlign: 'center' }} />
                  <input value={nouvelleMatiere} onChange={(e) => setNouvelleMatiere(e.target.value)} placeholder="Nom de la matière" style={{ flex: 1 }} />
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

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

export default function GestionFilieres() {
  const [chargement, setChargement] = useState(true);
  const [matieres, setMatieres] = useState([]);
  const [modalites, setModalites] = useState([]);
  const [sousFilieres, setSousFilieres] = useState([]);
  const [statutsMatieres, setStatutsMatieres] = useState([]);

  const [modaliteSelectionnee, setModaliteSelectionnee] = useState(null);
  const [sousFiliereSelectionnee, setSousFiliereSelectionnee] = useState(null);

  const [editionModalite, setEditionModalite] = useState(null);
  const [nomModaliteEdition, setNomModaliteEdition] = useState('');
  const [ajoutModaliteOuvert, setAjoutModaliteOuvert] = useState(false);
  const [nouvelleModalite, setNouvelleModalite] = useState('');

  const [editionSousFiliere, setEditionSousFiliere] = useState(null);
  const [nomSousFiliereEdition, setNomSousFiliereEdition] = useState('');
  const [ajoutSousFiliereOuvert, setAjoutSousFiliereOuvert] = useState(false);
  const [nouvelleSousFiliere, setNouvelleSousFiliere] = useState('');

  const navigate = useNavigate();

  async function charger() {
    const { data: session } = await supabase.auth.getSession();
    if (!session.session) { navigate('/'); return; }
    const { data: moi } = await supabase.from('profiles').select('role').eq('id', session.session.user.id).single();
    if (moi?.role !== 'tuteur' && moi?.role !== 'proprietaire') { navigate('/accueil'); return; }

    const { data: mats } = await supabase.from('matieres').select('*').eq('est_prive', false).order('ordre', { ascending: true, nullsFirst: false });
    setMatieres(mats || []);
    const { data: mods } = await supabase.from('modalites').select('*').order('ordre', { ascending: true, nullsFirst: false });
    setModalites(mods || []);
    const { data: sf } = await supabase.from('sous_filieres').select('*').order('ordre', { ascending: true, nullsFirst: false });
    setSousFilieres(sf || []);
    const { data: sfm } = await supabase.from('sous_filiere_matieres').select('*');
    setStatutsMatieres(sfm || []);

    setChargement(false);
  }

  useEffect(() => { charger(); }, []);

  async function ajouterModalite(e) {
    e.preventDefault();
    if (!nouvelleModalite.trim()) return;
    const maxOrdre = Math.max(0, ...modalites.map((m) => m.ordre || 0));
    await supabase.from('modalites').insert({ nom: nouvelleModalite.trim(), ordre: maxOrdre + 1 });
    setNouvelleModalite('');
    setAjoutModaliteOuvert(false);
    charger();
  }

  function ouvrirEditionModalite(m) {
    setEditionModalite(editionModalite === m.id ? null : m.id);
    setNomModaliteEdition(m.nom);
  }

  async function enregistrerEditionModalite(m) {
    if (nomModaliteEdition.trim() && nomModaliteEdition.trim() !== m.nom) {
      await supabase.from('modalites').update({ nom: nomModaliteEdition.trim() }).eq('id', m.id);
    }
    setEditionModalite(null);
    charger();
  }

  async function basculerSansFacultatif(m) {
    await supabase.from('modalites').update({ sans_facultatif: !m.sans_facultatif }).eq('id', m.id);
    charger();
  }

  async function supprimerModalite(m) {
    if (!confirm(`Supprimer la modalité "${m.nom}" ? Ses sous-filières seront supprimées aussi, et les étudiants qui l'avaient choisie perdront leur filière (à reconfigurer par un tuteur).`)) return;
    await supabase.from('modalites').delete().eq('id', m.id);
    if (modaliteSelectionnee?.id === m.id) { setModaliteSelectionnee(null); setSousFiliereSelectionnee(null); }
    charger();
  }

  async function ajouterSousFiliere(e) {
    e.preventDefault();
    if (!nouvelleSousFiliere.trim() || !modaliteSelectionnee) return;
    const maxOrdre = Math.max(0, ...sousFilieres.filter((s) => s.modalite_id === modaliteSelectionnee.id).map((s) => s.ordre || 0));
    await supabase.from('sous_filieres').insert({ modalite_id: modaliteSelectionnee.id, nom: nouvelleSousFiliere.trim(), ordre: maxOrdre + 1 });
    setNouvelleSousFiliere('');
    setAjoutSousFiliereOuvert(false);
    charger();
  }

  function ouvrirEditionSousFiliere(s) {
    setEditionSousFiliere(editionSousFiliere === s.id ? null : s.id);
    setNomSousFiliereEdition(s.nom);
  }

  async function enregistrerEditionSousFiliere(s) {
    if (nomSousFiliereEdition.trim() && nomSousFiliereEdition.trim() !== s.nom) {
      await supabase.from('sous_filieres').update({ nom: nomSousFiliereEdition.trim() }).eq('id', s.id);
    }
    setEditionSousFiliere(null);
    charger();
  }

  async function supprimerSousFiliere(s) {
    if (!confirm(`Supprimer la sous-filière "${s.nom}" ? Les étudiants qui l'avaient choisie perdront cette sous-filière (à reconfigurer par un tuteur).`)) return;
    await supabase.from('sous_filieres').delete().eq('id', s.id);
    if (sousFiliereSelectionnee?.id === s.id) setSousFiliereSelectionnee(null);
    charger();
  }

  async function definirStatutMatiere(matiereId, statut) {
    if (!sousFiliereSelectionnee) return;
    if (statut === null) {
      await supabase.from('sous_filiere_matieres').delete().eq('sous_filiere_id', sousFiliereSelectionnee.id).eq('matiere_id', matiereId);
    } else {
      await supabase.from('sous_filiere_matieres').upsert({ sous_filiere_id: sousFiliereSelectionnee.id, matiere_id: matiereId, statut });
    }
    charger();
  }

  if (chargement) return <div style={{ padding: 40 }}>Chargement...</div>;

  const sousFilieresDeLaModalite = modaliteSelectionnee ? sousFilieres.filter((s) => s.modalite_id === modaliteSelectionnee.id) : [];
  const statutsDeLaSousFiliere = sousFiliereSelectionnee ? statutsMatieres.filter((sfm) => sfm.sous_filiere_id === sousFiliereSelectionnee.id) : [];

  return (
    <div className="container">
      <h1 className="page-title">Filières</h1>
      <p className="page-sub">Modalités, sous-filières, et matières obligatoires/facultatives par sous-filière.</p>

      <div className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ marginTop: 0 }}>Modalités</h3>
        <div className="subjects-manage-grid">
          {modalites.map((m) => (
            <div
              key={m.id}
              className="subject-manage-card"
              style={{ borderColor: modaliteSelectionnee?.id === m.id ? 'var(--accent)' : undefined, cursor: 'pointer' }}
              onClick={() => { setModaliteSelectionnee(m); setSousFiliereSelectionnee(null); }}
            >
              <div className="smc-top">
                {editionModalite === m.id ? (
                  <input
                    className="smc-name"
                    value={nomModaliteEdition}
                    onChange={(e) => setNomModaliteEdition(e.target.value)}
                    onBlur={() => enregistrerEditionModalite(m)}
                    onClick={(e) => e.stopPropagation()}
                    autoFocus
                  />
                ) : (
                  <div className="smc-name" onClick={(e) => { e.stopPropagation(); ouvrirEditionModalite(m); }}>{m.nom}</div>
                )}
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', color: 'var(--text-muted)', margin: '10px 0' }} onClick={(e) => e.stopPropagation()}>
                <input type="checkbox" checked={!!m.sans_facultatif} onChange={() => basculerSansFacultatif(m)} />
                Pas de matières facultatives
              </label>
              <div className="smc-actions">
                <button className="btn btn-outline btn-sm" style={{ color: 'var(--error)', borderColor: 'var(--error)' }} onClick={(e) => { e.stopPropagation(); supprimerModalite(m); }}>
                  Supprimer
                </button>
              </div>
            </div>
          ))}

          {ajoutModaliteOuvert ? (
            <form onSubmit={ajouterModalite} className="subject-manage-card">
              <div className="field" style={{ marginBottom: 10 }}>
                <input value={nouvelleModalite} onChange={(e) => setNouvelleModalite(e.target.value)} placeholder="Nom de la modalité" autoFocus />
              </div>
              <button className="btn btn-primary btn-sm" type="submit" style={{ width: '100%' }}>Ajouter</button>
            </form>
          ) : (
            <div className="add-subject-card" onClick={() => setAjoutModaliteOuvert(true)}>+ Nouvelle modalité</div>
          )}
        </div>
      </div>

      {modaliteSelectionnee && (
        <div className="card" style={{ marginBottom: 24 }}>
          <h3 style={{ marginTop: 0 }}>Sous-filières de « {modaliteSelectionnee.nom} »</h3>
          <div className="subjects-manage-grid">
            {sousFilieresDeLaModalite.map((s) => (
              <div
                key={s.id}
                className="subject-manage-card"
                style={{ borderColor: sousFiliereSelectionnee?.id === s.id ? 'var(--accent)' : undefined, cursor: 'pointer' }}
                onClick={() => setSousFiliereSelectionnee(s)}
              >
                <div className="smc-top">
                  {editionSousFiliere === s.id ? (
                    <input
                      className="smc-name"
                      value={nomSousFiliereEdition}
                      onChange={(e) => setNomSousFiliereEdition(e.target.value)}
                      onBlur={() => enregistrerEditionSousFiliere(s)}
                      onClick={(e) => e.stopPropagation()}
                      autoFocus
                    />
                  ) : (
                    <div className="smc-name" onClick={(e) => { e.stopPropagation(); ouvrirEditionSousFiliere(s); }}>{s.nom}</div>
                  )}
                </div>
                <div className="smc-actions" style={{ marginTop: 12 }}>
                  <button className="btn btn-outline btn-sm" style={{ color: 'var(--error)', borderColor: 'var(--error)' }} onClick={(e) => { e.stopPropagation(); supprimerSousFiliere(s); }}>
                    Supprimer
                  </button>
                </div>
              </div>
            ))}

            {ajoutSousFiliereOuvert ? (
              <form onSubmit={ajouterSousFiliere} className="subject-manage-card">
                <div className="field" style={{ marginBottom: 10 }}>
                  <input value={nouvelleSousFiliere} onChange={(e) => setNouvelleSousFiliere(e.target.value)} placeholder="Nom de la sous-filière" autoFocus />
                </div>
                <button className="btn btn-primary btn-sm" type="submit" style={{ width: '100%' }}>Ajouter</button>
              </form>
            ) : (
              <div className="add-subject-card" onClick={() => setAjoutSousFiliereOuvert(true)}>+ Nouvelle sous-filière</div>
            )}
          </div>
        </div>
      )}

      {sousFiliereSelectionnee && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Matières de « {sousFiliereSelectionnee.nom} »</h3>
          {modaliteSelectionnee?.sans_facultatif && (
            <p className="field-hint" style={{ marginBottom: 16 }}>Cette modalité n'autorise pas de matières facultatives : seuls « Obligatoire » et « Ne concerne pas » sont disponibles.</p>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {matieres.map((mat) => {
              const statutActuel = statutsDeLaSousFiliere.find((sfm) => sfm.matiere_id === mat.id)?.statut || null;
              return (
                <div key={mat.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ flex: 1, fontWeight: 600 }}>{mat.emoji ? `${mat.emoji} ` : ''}{mat.nom}</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      className={`status-chip ${statutActuel === 'obligatoire' ? 'active' : ''}`}
                      style={statutActuel === 'obligatoire' ? { borderColor: 'var(--success)', color: 'var(--success)', background: 'var(--success-bg)' } : undefined}
                      onClick={() => definirStatutMatiere(mat.id, 'obligatoire')}
                    >
                      Obligatoire
                    </button>
                    {!modaliteSelectionnee?.sans_facultatif && (
                      <button
                        className={`status-chip ${statutActuel === 'facultative' ? 'active' : ''}`}
                        style={statutActuel === 'facultative' ? { borderColor: 'var(--warning)', color: 'var(--warning)', background: 'var(--warning-bg)' } : undefined}
                        onClick={() => definirStatutMatiere(mat.id, 'facultative')}
                      >
                        Facultative
                      </button>
                    )}
                    <button
                      className={`status-chip ${statutActuel === null ? 'active' : ''}`}
                      style={statutActuel === null ? { borderColor: 'var(--error)', color: 'var(--error)', background: 'var(--error-bg)' } : undefined}
                      onClick={() => definirStatutMatiere(mat.id, null)}
                    >
                      Ne concerne pas
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

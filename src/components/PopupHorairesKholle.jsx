import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { envoyerNotificationGroupe } from '../lib/notifier';

// Reporter/corriger l'horaire d'une semaine de kholle, quelle que soit son ancienneté (pas
// seulement la plus récente) — les QCM de kholle sont communs à toutes les filières, donc un
// seul outil centralisé ici plutôt qu'un par sous-filière dans Classement.jsx.
export default function PopupHorairesKholle({ monId, onFermer }) {
  const [semaines, setSemaines] = useState([]);
  const [editionOuverte, setEditionOuverte] = useState(null);
  const [nouvelleDate, setNouvelleDate] = useState('');
  const [nouveauDebut, setNouveauDebut] = useState('');
  const [nouveauFin, setNouveauFin] = useState('');
  const [erreurHoraire, setErreurHoraire] = useState('');
  const [enregistrement, setEnregistrement] = useState(false);

  async function charger() {
    const { data } = await supabase.from('semaines_kholle').select('*').order('date_samedi', { ascending: false });
    setSemaines(data || []);
  }

  useEffect(() => { charger(); }, []);

  function ouvrirEdition(s) {
    if (editionOuverte === s.id) { setEditionOuverte(null); return; }
    setEditionOuverte(s.id);
    setErreurHoraire('');
    setNouvelleDate(s.date_samedi);
    setNouveauDebut(new Date(s.debut).toISOString().slice(0, 16));
    setNouveauFin(new Date(s.fin).toISOString().slice(0, 16));
  }

  async function enregistrer(s) {
    if (!nouvelleDate || !nouveauDebut || !nouveauFin) return;
    setErreurHoraire('');
    if (new Date(nouveauFin) <= new Date(nouveauDebut)) { setErreurHoraire('La fin doit être après le début.'); return; }

    setEnregistrement(true);
    const { error } = await supabase.from('semaines_kholle').update({
      date_samedi: nouvelleDate,
      debut: new Date(nouveauDebut).toISOString(),
      fin: new Date(nouveauFin).toISOString(),
      modifie_par: monId,
      modifie_le: new Date().toISOString(),
    }).eq('id', s.id);
    setEnregistrement(false);

    if (error) {
      setErreurHoraire(error.code === '23505' ? 'Une kholle est déjà programmée à cette date.' : 'Erreur : ' + error.message);
      return;
    }

    const dateFormatee = new Date(nouvelleDate).toLocaleDateString('fr-FR');

    const { data: autresAdmins } = await supabase.from('profiles').select('id').in('role', ['tuteur', 'proprietaire']).neq('id', monId);
    if (autresAdmins && autresAdmins.length > 0) {
      await envoyerNotificationGroupe(autresAdmins.map((a) => a.id), 'compte_admin', `L'horaire de la kholle du ${dateFormatee} a été modifié.`, '/qcm/gerer');
    }

    const { data: etudiants } = await supabase.from('profils_publics').select('id').eq('role', 'etudiant');
    if (etudiants && etudiants.length > 0) {
      await envoyerNotificationGroupe(etudiants.map((e) => e.id), 'echeance', `L'horaire de la kholle du ${dateFormatee} a changé.`, '/qcm');
    }

    setEditionOuverte(null);
    charger();
  }

  return (
    <div className="modal-overlay open" onClick={onFermer}>
      <div onClick={(e) => e.stopPropagation()} className="modal-box" style={{ maxWidth: 560, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0 }}>Horaires des kholles</h3>
          <button onClick={onFermer} style={{ background: 'none', border: 'none', fontSize: '1.3rem', cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
        </div>
        <p className="modal-sub" style={{ marginTop: 0 }}>Commun à toutes les filières — un changement ici s'applique à tout le monde.</p>

        <div style={{ overflowY: 'auto', flex: 1 }}>
          {semaines.length === 0 && <p style={{ color: 'var(--text-muted)' }}>Aucune semaine de kholle programmée.</p>}
          {semaines.map((s) => (
            <div key={s.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>Semaine du {new Date(s.date_samedi).toLocaleDateString('fr-FR')}</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>
                    Du {new Date(s.debut).toLocaleString('fr-FR')} au {new Date(s.fin).toLocaleString('fr-FR')}
                  </div>
                </div>
                <button className="btn btn-outline btn-sm" onClick={() => ouvrirEdition(s)}>
                  {editionOuverte === s.id ? 'Annuler' : 'Modifier'}
                </button>
              </div>

              {editionOuverte === s.id && (
                <div style={{ marginTop: 12 }}>
                  <div className="field">
                    <label>Date</label>
                    <input type="date" value={nouvelleDate} onChange={(e) => setNouvelleDate(e.target.value)} />
                  </div>
                  <div className="field-row">
                    <div className="field">
                      <label>Nouveau début</label>
                      <input type="datetime-local" value={nouveauDebut} onChange={(e) => setNouveauDebut(e.target.value)} />
                    </div>
                    <div className="field">
                      <label>Nouvelle fin</label>
                      <input type="datetime-local" value={nouveauFin} onChange={(e) => setNouveauFin(e.target.value)} />
                    </div>
                  </div>
                  {erreurHoraire && <div className="error-msg">{erreurHoraire}</div>}
                  <button className="btn btn-primary btn-sm" disabled={enregistrement} onClick={() => enregistrer(s)}>
                    {enregistrement ? 'Enregistrement...' : 'Enregistrer'}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

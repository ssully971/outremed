import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

export default function ArchiveQcm() {
  const [groupes, setGroupes] = useState({});
  const navigate = useNavigate();

  async function charger() {
    const { data: session } = await supabase.auth.getSession();
    if (!session.session) { navigate('/'); return; }

    const { data } = await supabase.from('qcms').select('*').eq('visible', false).order('created_at', { ascending: false });
    const g = {};
    (data || []).forEach((q) => {
      const sem = q.semestre || 'Sans semestre';
      if (!g[sem]) g[sem] = [];
      g[sem].push(q);
    });
    setGroupes(g);
  }

  useEffect(() => { charger(); }, []);

  async function remontrer(qcmId) {
    await supabase.from('qcms').update({ visible: true }).eq('id', qcmId);
    charger();
  }

  const estVide = Object.keys(groupes).length === 0;

  return (
    <div style={{ minHeight: '100vh', padding: 40 }}>
      <div style={{ maxWidth: 700, margin: '0 auto' }}>
        <h2>Archive des QCM</h2>

        {estVide && <p style={{ color: 'var(--text-muted)' }}>Aucun QCM archivé pour l'instant.</p>}

        {Object.entries(groupes).map(([semestre, qcmsGroupe]) => (
          <section key={semestre} style={{ marginBottom: 28 }}>
            <h3>{semestre}</h3>
            {qcmsGroupe.map((q) => (
              <div key={q.id} className="item" style={{ justifyContent: 'space-between' }}>
                <span>{q.titre}</span>
                <button className="btn btn-outline" style={{ padding: '4px 12px', fontSize: '0.78rem' }} onClick={() => remontrer(q.id)}>
                  Remontrer
                </button>
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}

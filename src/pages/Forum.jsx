import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { envoyerNotificationGroupe } from '../lib/notifier';

function renderContenuAvecTags(texte, qcmsMap) {
  const regex = /#(\d{4})(-Q(\d+))?|@([a-zA-Z0-9_-]+)/g;
  const parts = [];
  let dernierIndex = 0;
  let match;
  while ((match = regex.exec(texte)) !== null) {
    if (match.index > dernierIndex) parts.push(texte.slice(dernierIndex, match.index));
    if (match[4]) {
      parts.push(<span key={match.index} style={{ color: 'var(--accent)', fontWeight: 700 }}>@{match[4]}</span>);
    } else {
      const numero = parseInt(match[1], 10);
      const question = match[3];
      const qcmId = qcmsMap[numero];
      if (qcmId) {
        const dest = question ? `/qcm/${qcmId}?q=${question}` : `/qcm/${qcmId}`;
        parts.push(
          <Link key={match.index} to={dest} style={{ color: 'var(--accent)', fontWeight: 700, textDecoration: 'none' }}>
            {match[0]}
          </Link>
        );
      } else {
        parts.push(match[0]);
      }
    }
    dernierIndex = match.index + match[0].length;
  }
  if (dernierIndex < texte.length) parts.push(texte.slice(dernierIndex));
  return parts;
}

export default function Forum() {
  const [monProfil, setMonProfil] = useState(null);
  const [canaux, setCanaux] = useState([]);
  const [canalActif, setCanalActif] = useState(null);
  const [messages, setMessages] = useState([]);
  const [profilsMap, setProfilsMap] = useState({});
  const [tousLesProfils, setTousLesProfils] = useState([]);
  const [qcmsMap, setQcmsMap] = useState({});
  const [nouveauMessage, setNouveauMessage] = useState('');
  const [enReponseA, setEnReponseA] = useState(null);
  const [tousLesQcms, setTousLesQcms] = useState([]);
  const [suggestionsQcm, setSuggestionsQcm] = useState([]);
  const [suggestionsQuestions, setSuggestionsQuestions] = useState([]);
  const [suggestionsPseudo, setSuggestionsPseudo] = useState([]);
  const [questionsDuQcmCible, setQuestionsDuQcmCible] = useState([]);
  const [nonLusParCanal, setNonLusParCanal] = useState({});
  const navigate = useNavigate();

  // Création de canal
  const [creationOuverte, setCreationOuverte] = useState(false);
  const [nomCanal, setNomCanal] = useState('');
  const [typeCanal, setTypeCanal] = useState('general');
  const [matiereCanal, setMatiereCanal] = useState('');
  const [lectureSeuleCanal, setLectureSeuleCanal] = useState(false);
  const [categorieCanal, setCategorieCanal] = useState('');
  const [matieres, setMatieres] = useState([]);
  const [etudiants, setEtudiants] = useState([]);
  const [membresChoisis, setMembresChoisis] = useState([]);
  const [messageCreation, setMessageCreation] = useState('');

  // Recherche / filtre / tri des canaux
  const [rechercheCanal, setRechercheCanal] = useState('');
  const [filtreTypeCanal, setFiltreTypeCanal] = useState('tous');
  const [triCanal, setTriCanal] = useState('nom');
  const [sidebarMobileOuverte, setSidebarMobileOuverte] = useState(false);
  const [sidebarReduite, setSidebarReduite] = useState(false);
  const [gestionMembresOuverte, setGestionMembresOuverte] = useState(false);
  const [membresActuels, setMembresActuels] = useState([]);

  async function chargerTout() {
    const { data: session } = await supabase.auth.getSession();
    if (!session.session) { navigate('/'); return; }
    const uid = session.session.user.id;

    const { data: moi } = await supabase.from('profiles').select('*').eq('id', session.session.user.id).single();
    if (moi?.role !== 'proprietaire') {
      const { data: params } = await supabase.from('parametres').select('cle, valeur').in('cle', ['forum_actif', 'mode_site']);
      const map = {}; (params || []).forEach((p) => { map[p.cle] = p.valeur; });
      const estEtudiantAnnale = moi?.role === 'etudiant' && moi?.categorie_compte === 'annale';
      const estTuteurRestreint = moi?.role === 'tuteur' && map.mode_site === 'annale';
      if (map.forum_actif === 'false' || estEtudiantAnnale || estTuteurRestreint) { navigate('/accueil'); return; }
    }
    setMonProfil(moi);

    const { data: profils } = await supabase.from('profils_publics').select('id, pseudo, role');
    const pmap = {};
    (profils || []).forEach((p) => { pmap[p.id] = p; });
    setProfilsMap(pmap);
    setTousLesProfils(profils || []);
    setEtudiants((profils || []).filter((p) => p.role === 'etudiant'));

    const { data: mats } = await supabase.from('matieres').select('*').order('nom');
    setMatieres(mats || []);

    const { data: qcms } = await supabase.from('qcms').select('id, numero, titre');
    const qmap = {};
    (qcms || []).forEach((q) => { qmap[q.numero] = q.id; });
    setQcmsMap(qmap);
    setTousLesQcms(qcms || []);

    const { data: c } = await supabase.from('canaux').select('*').order('type');
    setCanaux(c || []);
    if (c && c.length > 0 && !canalActif) setCanalActif(c[0].id);

    // Non-lus par canal
    const { data: vus } = await supabase.from('canal_dernier_vu').select('*').eq('user_id', uid);
    const vusMap = {};
    (vus || []).forEach((v) => { vusMap[v.canal_id] = v.vu_le; });

    const compteurs = {};
    for (const canal of c || []) {
      const depuis = vusMap[canal.id];
      let requete = supabase.from('messages').select('id', { count: 'exact', head: true }).eq('canal_id', canal.id);
      if (depuis) requete = requete.gt('created_at', depuis);
      const { count } = await requete;
      compteurs[canal.id] = count || 0;
    }
    setNonLusParCanal(compteurs);
  }

  useEffect(() => { chargerTout(); }, []);

  useEffect(() => {
    if (canalActif) {
      chargerMessages();
      marquerCommeVu(canalActif);
    }
  }, [canalActif]);

  async function marquerCommeVu(canalId) {
    const { data: session } = await supabase.auth.getSession();
    await supabase.from('canal_dernier_vu').upsert({ canal_id: canalId, user_id: session.session.user.id, vu_le: new Date().toISOString() });
    setNonLusParCanal((prev) => ({ ...prev, [canalId]: 0 }));
  }

  async function chargerMessages() {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('canal_id', canalActif)
      .order('epingle', { ascending: false })
      .order('created_at', { ascending: true });
    setMessages(data || []);
  }

  async function envoyer(e) {
    e.preventDefault();
    if (!nouveauMessage.trim()) return;
    const { data: session } = await supabase.auth.getSession();
    const contenu = nouveauMessage.trim();

    const { error } = await supabase.from('messages').insert({
      canal_id: canalActif,
      auteur_id: session.session.user.id,
      contenu,
      reply_to: enReponseA?.id || null,
    });
    if (error) { alert('Erreur : ' + error.message); return; }

    const canal = canaux.find((c) => c.id === canalActif);

    // Notification de mention @pseudo
    const mentions = [...contenu.matchAll(/@([a-zA-Z0-9_-]+)/g)].map((m) => m[1]);
    if (mentions.length > 0) {
      const mentionnes = tousLesProfils.filter((p) => mentions.includes(p.pseudo) && p.id !== session.session.user.id);
      if (mentionnes.length > 0) {
        await envoyerNotificationGroupe(mentionnes.map((m) => m.id), 'forum_mention', `${monProfil.pseudo} t'a mentionné dans #${canal.nom}`, '/forum');
      }
    }

    // Notification d'annonce si canal en lecture seule (donc réservé aux admins qui postent = annonce)
    if (canal?.lecture_seule) {
      let destinataires = [];
      if (canal.type === 'selectif') {
        const { data: membres } = await supabase.from('canal_membres').select('user_id').eq('canal_id', canal.id);
        destinataires = (membres || []).map((m) => m.user_id);
      } else {
        destinataires = tousLesProfils.map((p) => p.id);
      }
      destinataires = destinataires.filter((idDest) => idDest !== session.session.user.id);
      if (destinataires.length > 0) {
        await envoyerNotificationGroupe(destinataires, 'forum_annonce', `Nouvelle annonce dans #${canal.nom}`, '/forum');
      }
    }

    // Notification optionnelle "tous les messages" (opt-in uniquement, pas par défaut)
    let audienceCanal = [];
    if (canal.type === 'selectif') {
      const { data: membres } = await supabase.from('canal_membres').select('user_id').eq('canal_id', canal.id);
      audienceCanal = (membres || []).map((m) => m.user_id);
    } else {
      audienceCanal = tousLesProfils.map((p) => p.id);
    }
    audienceCanal = audienceCanal.filter((idDest) => idDest !== session.session.user.id);
    if (audienceCanal.length > 0) {
      const { data: profilsAvecPrefs } = await supabase.from('profiles').select('id, notif_prefs').in('id', audienceCanal);
      const interesses = (profilsAvecPrefs || []).filter((p) => p.notif_prefs?.forum_tous_messages === true).map((p) => p.id);
      if (interesses.length > 0) {
        await envoyerNotificationGroupe(interesses, 'forum_tous_messages', `${monProfil.pseudo} a écrit dans #${canal.nom}`, '/forum');
      }
    }

    setNouveauMessage('');
    setEnReponseA(null);
    chargerMessages();
    marquerCommeVu(canalActif);
  }

  async function basculerEpingle(msg) {
    await supabase.from('messages').update({ epingle: !msg.epingle }).eq('id', msg.id);
    chargerMessages();
  }

  async function basculerSuppression(msg) {
    if (!confirm('Supprimer ce message ?')) return;
    const { data: session } = await supabase.auth.getSession();
    await supabase.from('messages').update({ supprime: true, supprime_par: session.session.user.id }).eq('id', msg.id);
    chargerMessages();
  }

  async function purgerDefinitivement(msg) {
    if (!confirm('Effacer complètement toute trace de ce message ? Action irréversible.')) return;
    await supabase.from('messages').delete().eq('id', msg.id);
    chargerMessages();
  }

  async function ouvrirGestionMembres() {
    const { data } = await supabase.from('canal_membres').select('user_id').eq('canal_id', canalActif);
    setMembresActuels((data || []).map((m) => m.user_id));
    setGestionMembresOuverte(true);
  }

  async function basculerMembre(userId) {
    if (membresActuels.includes(userId)) {
      await supabase.from('canal_membres').delete().eq('canal_id', canalActif).eq('user_id', userId);
      setMembresActuels((prev) => prev.filter((id) => id !== userId));
    } else {
      await supabase.from('canal_membres').insert({ canal_id: canalActif, user_id: userId });
      setMembresActuels((prev) => [...prev, userId]);
      await envoyerNotificationGroupe([userId], 'forum_nouveau_canal', `Tu as été ajouté(e) au canal "${canaux.find((c) => c.id === canalActif)?.nom}".`, '/forum');
    }
  }

  async function supprimerCanal(canal) {
    if (!confirm(`Supprimer le canal "${canal.nom}" et tous ses messages ? Action irréversible.`)) return;
    await supabase.from('canaux').delete().eq('id', canal.id);
    if (canalActif === canal.id) setCanalActif(null);
    chargerTout();
  }

  async function creerCanal(e) {
    e.preventDefault();
    if (!nomCanal.trim()) { setMessageCreation('Le nom du canal est obligatoire.'); return; }

    const { data: session } = await supabase.auth.getSession();
    const { data: canal, error } = await supabase.from('canaux').insert({
      nom: nomCanal.trim(),
      type: typeCanal,
      matiere_id: typeCanal === 'matiere' ? matiereCanal : null,
      lecture_seule: lectureSeuleCanal,
      categorie: categorieCanal.trim() || null,
      cree_par: session.session.user.id,
    }).select().single();

    if (error) { setMessageCreation('Erreur : ' + error.message); return; }

    if (typeCanal === 'selectif' && membresChoisis.length > 0) {
      await supabase.from('canal_membres').insert(membresChoisis.map((user_id) => ({ canal_id: canal.id, user_id })));
      await envoyerNotificationGroupe(membresChoisis, 'forum_nouveau_canal', `Un nouveau canal "${canal.nom}" a été créé pour toi.`, '/forum');
    } else {
      const destinataires = tousLesProfils.map((p) => p.id).filter((idP) => idP !== session.session.user.id);
      if (destinataires.length > 0) {
        await envoyerNotificationGroupe(destinataires, 'forum_nouveau_canal', `Un nouveau canal "${canal.nom}" a été créé dans le forum.`, '/forum');
      }
    }

    setNomCanal(''); setTypeCanal('general'); setMatiereCanal(''); setLectureSeuleCanal(false); setMembresChoisis([]); setCategorieCanal('');
    setCreationOuverte(false);
    setMessageCreation('');
    setCanalActif(canal.id);
    chargerTout();
  }

  async function gererSaisieMessage(valeur) {
    setNouveauMessage(valeur);
    setSuggestionsQuestions([]);
    setSuggestionsQcm([]);
    setSuggestionsPseudo([]);

    const matchPseudo = valeur.match(/@([a-zA-Z0-9_-]*)$/);
    if (matchPseudo) {
      const prefixe = matchPseudo[1].toLowerCase();
      const filtres = tousLesProfils.filter((p) => p.pseudo.toLowerCase().startsWith(prefixe));
      setSuggestionsPseudo(filtres.slice(0, 6));
      return;
    }

    const matchQuestion = valeur.match(/#(\d{4})-Q(\d*)$/);
    if (matchQuestion) {
      const numero = parseInt(matchQuestion[1], 10);
      const prefixeQuestion = matchQuestion[2];
      const qcm = tousLesQcms.find((q) => q.numero === numero);
      if (qcm) {
        let qs = questionsDuQcmCible;
        if (qs.length === 0 || qs[0]?.qcm_id !== qcm.id) {
          const { data } = await supabase.from('questions').select('ordre, enonce, qcm_id').eq('qcm_id', qcm.id).order('ordre');
          qs = data || [];
          setQuestionsDuQcmCible(qs);
        }
        const filtrees = qs.filter((q) => String(q.ordre).startsWith(prefixeQuestion || ''));
        setSuggestionsQuestions(filtrees.slice(0, 6));
      }
      return;
    }

    const matchQcm = valeur.match(/#(\d{0,4})$/);
    if (matchQcm) {
      const prefixe = matchQcm[1];
      const filtres = tousLesQcms.filter((q) => String(q.numero).padStart(4, '0').startsWith(prefixe));
      setSuggestionsQcm(filtres.slice(0, 6));
    }
  }

  function choisirPseudoSuggestion(profil) {
    const nouveauTexte = nouveauMessage.replace(/@([a-zA-Z0-9_-]*)$/, `@${profil.pseudo} `);
    setNouveauMessage(nouveauTexte);
    setSuggestionsPseudo([]);
  }

  function choisirQcmSuggestion(qcm) {
    const nouveauTexte = nouveauMessage.replace(/#(\d{0,4})$/, `#${String(qcm.numero).padStart(4, '0')}`);
    setNouveauMessage(nouveauTexte);
    setSuggestionsQcm([]);
  }

  function choisirQuestionSuggestion(question) {
    const numeroActuel = nouveauMessage.match(/#(\d{4})/)[1];
    const nouveauTexte = nouveauMessage.replace(/#(\d{4})-Q(\d*)$/, `#${numeroActuel}-Q${question.ordre}`);
    setNouveauMessage(nouveauTexte);
    setSuggestionsQuestions([]);
  }

  if (!monProfil) return <div style={{ padding: 40 }}>Chargement...</div>;

  const estAdmin = monProfil.role === 'tuteur' || monProfil.role === 'proprietaire';
  const canal = canaux.find((c) => c.id === canalActif);
  const peutEcrire = canal && (estAdmin || !canal.lecture_seule);

  function etiquetteCanal(c) {
    if (c.categorie) return c.categorie;
    return c.type === 'general' ? 'Général' : c.type === 'matiere' ? 'Matière' : 'Sélectif';
  }

  const etiquettesDisponibles = [...new Set(canaux.map((c) => etiquetteCanal(c)))];

  const canauxAffiches = canaux
    .filter((c) => c.nom.toLowerCase().includes(rechercheCanal.toLowerCase()))
    .filter((c) => filtreTypeCanal === 'tous' || etiquetteCanal(c) === filtreTypeCanal)
    .sort((a, b) => {
      if (triCanal === 'non_lus') return (nonLusParCanal[b.id] || 0) - (nonLusParCanal[a.id] || 0);
      return a.nom.localeCompare(b.nom);
    });

  const initiales = (pseudo) => (pseudo || '?').slice(0, 2).toUpperCase();

  return (
    <div className="forum-layout">
      <div className={`channel-sidebar ${sidebarMobileOuverte ? 'mobile-open' : ''} ${sidebarReduite ? 'collapsed' : ''}`}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 20px 12px' }}>
          <h3 style={{ margin: 0, fontSize: '1rem' }}>Canaux</h3>
          {estAdmin && (
            <button onClick={() => setCreationOuverte(true)} style={{ fontSize: '0.78rem', color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}>
              + Nouveau
            </button>
          )}
        </div>

        <div style={{ padding: '0 16px' }}>
          <input
            value={rechercheCanal}
            onChange={(e) => setRechercheCanal(e.target.value)}
            placeholder="Rechercher..."
            style={{ width: '100%', marginBottom: 8, fontSize: '0.85rem' }}
          />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
            <button className={`filter-chip ${filtreTypeCanal === 'tous' ? 'active' : ''}`} style={{ padding: '3px 10px', fontSize: '0.68rem' }} onClick={() => setFiltreTypeCanal('tous')}>Tous</button>
            {etiquettesDisponibles.map((etq) => (
              <button key={etq} className={`filter-chip ${filtreTypeCanal === etq ? 'active' : ''}`} style={{ padding: '3px 10px', fontSize: '0.68rem' }} onClick={() => setFiltreTypeCanal(etq)}>
                {etq}
              </button>
            ))}
          </div>
          <select value={triCanal} onChange={(e) => setTriCanal(e.target.value)} style={{ width: '100%', marginBottom: 14, fontSize: '0.78rem' }}>
            <option value="nom">Trier par nom</option>
            <option value="non_lus">Non lus en premier</option>
          </select>
        </div>

        {canauxAffiches.map((c) => (
          <div key={c.id} className={`channel-item ${canalActif === c.id ? 'active' : ''}`} onClick={() => { setCanalActif(c.id); setSidebarMobileOuverte(false); }}>
            <span className="hash">{c.lecture_seule ? '🔒' : '#'}</span>
            <span style={{ flex: 1 }}>{c.nom}</span>
            {filtreTypeCanal === 'tous' && (
              <span className="channel-type-badge">{etiquetteCanal(c)}</span>
            )}
            {nonLusParCanal[c.id] > 0 && <span className="unread-badge">{nonLusParCanal[c.id] > 99 ? '99+' : nonLusParCanal[c.id]}</span>}
            {estAdmin && (
              <button onClick={(e) => { e.stopPropagation(); supprimerCanal(c); }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.8rem' }} title="Supprimer">✕</button>
            )}
          </div>
        ))}
      </div>

      <div className="chat-area">
        {canal && (
          <>
            <div className="chat-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button className="icon-btn" onClick={() => setSidebarReduite((v) => !v)} title={sidebarReduite ? 'Afficher les canaux' : 'Plein écran'}>
                  {sidebarReduite ? '☰' : '⛶'}
                </button>
                <h2>{canal.nom}</h2>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {estAdmin && canal.type === 'selectif' && (
                  <button className="home-btn" onClick={ouvrirGestionMembres}>👥 Membres</button>
                )}
                <button className="home-btn mobile-only-btn" onClick={() => setSidebarMobileOuverte(true)}>☰ Canaux</button>
              </div>
            </div>

            <div className="messages-list">
              {messages.length === 0 && <p style={{ color: 'var(--text-muted)' }}>Aucun message pour l'instant.</p>}
              {messages.map((m) => {
                const auteur = profilsMap[m.auteur_id];
                const messageCite = m.reply_to ? messages.find((x) => x.id === m.reply_to) : null;
                return (
                  <div key={m.id} id={`msg-${m.id}`} className="message-row">
                    <div className="msg-avatar">{initiales(auteur?.pseudo)}</div>
                    <div className="msg-body">
                      <div className={m.epingle ? 'msg-pinned' : ''}>
                        {m.epingle && <div className="pinned-label">📌 Épinglé</div>}
                        <div className="msg-head">
                          <span className="msg-author">{auteur?.pseudo || '—'}</span>
                          <span className={`role-badge ${auteur?.role}`}>{auteur?.role}</span>
                          <span className="msg-time">{new Date(m.created_at).toLocaleString('fr-FR')}</span>
                        </div>

                        {messageCite && (
                          <div
                            onClick={() => document.getElementById(`msg-${messageCite.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                            style={{ borderLeft: '3px solid var(--accent)', paddingLeft: 10, marginBottom: 6, fontSize: '0.8rem', color: 'var(--text-muted)', cursor: 'pointer' }}
                          >
                            <strong>{profilsMap[messageCite.auteur_id]?.pseudo || '—'}</strong> :{' '}
                            {messageCite.supprime ? <em>message supprimé</em> : messageCite.contenu.slice(0, 80)}
                          </div>
                        )}

                        {m.supprime ? (
                          <div className="msg-text" style={{ fontStyle: 'italic', color: 'var(--text-muted)' }}>
                            🚫 Message supprimé par {profilsMap[m.supprime_par]?.pseudo || '—'} ({profilsMap[m.supprime_par]?.role})
                          </div>
                        ) : (
                          <div className="msg-text">{renderContenuAvecTags(m.contenu, qcmsMap)}</div>
                        )}
                      </div>

                      <div className="msg-actions">
                        {!m.supprime && <button onClick={() => setEnReponseA(m)}>Répondre</button>}
                        {estAdmin && !m.supprime && <button onClick={() => basculerEpingle(m)}>{m.epingle ? 'Désépingler' : 'Épingler'}</button>}
                        {!m.supprime && (estAdmin || m.auteur_id === monProfil.id) && (
                          <button style={{ color: 'var(--error)' }} onClick={() => basculerSuppression(m)}>Supprimer</button>
                        )}
                        {m.supprime && monProfil.role === 'proprietaire' && (
                          <button style={{ color: 'var(--error)' }} onClick={() => purgerDefinitivement(m)}>Purger définitivement</button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {peutEcrire ? (
              <div className="chat-input-row" style={{ flexDirection: 'column', gap: 8 }}>
                {enReponseA && (
                  <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    background: 'var(--bg-panel)', padding: '8px 12px', borderRadius: 'var(--radius-md)',
                    fontSize: '0.8rem', borderLeft: '3px solid var(--accent)', width: '100%',
                  }}>
                    <span>Réponse à <strong>{profilsMap[enReponseA.auteur_id]?.pseudo}</strong> : {enReponseA.contenu.slice(0, 60)}</span>
                    <button onClick={() => setEnReponseA(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1rem' }}>✕</button>
                  </div>
                )}
                <form onSubmit={envoyer} style={{ display: 'flex', gap: 8, width: '100%', position: 'relative' }}>
                  <div style={{ flex: 1, position: 'relative' }}>
                    <input
                      value={nouveauMessage}
                      onChange={(e) => gererSaisieMessage(e.target.value)}
                      placeholder="Écris un message... (# pour un QCM, @ pour mentionner)"
                    />
                    {(suggestionsQcm.length > 0 || suggestionsQuestions.length > 0 || suggestionsPseudo.length > 0) && (
                      <div style={{
                        position: 'absolute', bottom: '110%', left: 0, right: 0,
                        background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
                        boxShadow: '0 15px 30px -10px rgba(0,0,0,0.6)', overflow: 'hidden', zIndex: 300, maxHeight: 200, overflowY: 'auto',
                      }}>
                        {suggestionsPseudo.map((p) => (
                          <div key={p.id} onClick={() => choisirPseudoSuggestion(p)} style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '0.85rem', borderBottom: '1px solid var(--border)' }}>@{p.pseudo}</div>
                        ))}
                        {suggestionsQcm.map((q) => (
                          <div key={q.id} onClick={() => choisirQcmSuggestion(q)} style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '0.85rem', borderBottom: '1px solid var(--border)' }}>
                            <span style={{ color: 'var(--accent)', fontFamily: 'monospace' }}>#{String(q.numero).padStart(4, '0')}</span> — {q.titre}
                          </div>
                        ))}
                        {suggestionsQuestions.map((q) => (
                          <div key={q.ordre} onClick={() => choisirQuestionSuggestion(q)} style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '0.85rem', borderBottom: '1px solid var(--border)' }}>
                            <strong>Q{q.ordre}</strong> — {q.enonce.slice(0, 50)}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <button className="send-btn" type="submit">Envoyer</button>
                </form>
              </div>
            ) : (
              <div className="chat-input-row"><p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>Ce canal est en lecture seule.</p></div>
            )}
          </>
        )}
      </div>

      {sidebarMobileOuverte && <div onClick={() => setSidebarMobileOuverte(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 140 }} />}

      {creationOuverte && (
        <div onClick={() => setCreationOuverte(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <form onSubmit={creerCanal} onClick={(e) => e.stopPropagation()} className="card" style={{ maxWidth: 420, width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>Nouveau canal</h3>
              <button type="button" onClick={() => setCreationOuverte(false)} style={{ background: 'none', border: 'none', fontSize: '1.3rem', cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
            </div>
            <div className="field">
              <label>Nom</label>
              <input value={nomCanal} onChange={(e) => setNomCanal(e.target.value)} placeholder="Ex : Annonces" />
            </div>
            <div className="field">
              <label>Type (détermine qui peut voir le canal)</label>
              <select value={typeCanal} onChange={(e) => setTypeCanal(e.target.value)}>
                <option value="general">Général</option>
                <option value="matiere">Par matière</option>
                <option value="selectif">Sélectif</option>
              </select>
            </div>
            <div className="field">
              <label>Étiquette affichée (optionnel — ex: "Annonces")</label>
              <input value={categorieCanal} onChange={(e) => setCategorieCanal(e.target.value)} placeholder="Laisse vide pour garder le nom du type" />
            </div>
            {typeCanal === 'matiere' && (
              <div className="field">
                <label>Matière</label>
                <select value={matiereCanal} onChange={(e) => setMatiereCanal(e.target.value)}>
                  <option value="">— choisir —</option>
                  {matieres.map((m) => <option key={m.id} value={m.id}>{m.nom}</option>)}
                </select>
              </div>
            )}
            {typeCanal === 'selectif' && (
              <div className="field">
                <label>Étudiants inclus (tu pourras en rajouter plus tard)</label>
                <select multiple value={membresChoisis} onChange={(e) => setMembresChoisis([...e.target.selectedOptions].map((o) => o.value))} style={{ minHeight: 120 }}>
                  {etudiants.map((e) => <option key={e.id} value={e.id}>{e.pseudo}</option>)}
                </select>
              </div>
            )}
            <div className="field">
              <label style={{ fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={lectureSeuleCanal} onChange={(e) => setLectureSeuleCanal(e.target.checked)} />
                Lecture seule (seuls les admins peuvent écrire)
              </label>
            </div>
            {messageCreation && <div className="error-msg">{messageCreation}</div>}
            <button className="btn btn-full" type="submit">Créer le canal</button>
          </form>
        </div>
      )}

      {gestionMembresOuverte && (
        <div onClick={() => setGestionMembresOuverte(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} className="card" style={{ maxWidth: 420, width: '100%', maxHeight: '75vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>Membres de #{canal?.nom}</h3>
              <button onClick={() => setGestionMembresOuverte(false)} style={{ background: 'none', border: 'none', fontSize: '1.3rem', cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 12 }}>Coche les étudiants qui doivent avoir accès à ce canal.</p>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {etudiants.map((e) => (
                <label key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: '0.88rem', cursor: 'pointer' }}>
                  <input type="checkbox" checked={membresActuels.includes(e.id)} onChange={() => basculerMembre(e.id)} />
                  {e.pseudo}
                </label>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

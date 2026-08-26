import { useEffect, useState } from 'react';
import { supabase } from './lib/supabaseClient';

function App() {
  const [statut, setStatut] = useState('Test en cours...');

  useEffect(() => {
    supabase.from('matieres').select('*').then(({ data, error }) => {
      if (error) setStatut('Erreur : ' + error.message);
      else setStatut('Connexion réussie ! (' + data.length + ' matières trouvées)');
    });
  }, []);

  return <div style={{ padding: 40, fontFamily: 'sans-serif' }}>{statut}</div>;
}

export default App;

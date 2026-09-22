import { BrowserRouter, Routes, Route, Outlet } from 'react-router-dom';
import Navbar from './components/Navbar';
import Login from './pages/Login';
import Accueil from './pages/Accueil';
import DefinirMotDePasse from './pages/DefinirMotDePasse';
import CreationQcm from './pages/CreationQcm';
import ListeQcm from './pages/ListeQcm';
import QcmDetail from './pages/QcmDetail';
import Resultats from './pages/Resultats';
import DetailTentative from './pages/DetailTentative';
import Classement from './pages/Classement';
import FicheEtudiant from './pages/FicheEtudiant';
import Profil from './pages/Profil';
import Historiques from './pages/Historiques';
import ArchiveQcm from './pages/ArchiveQcm';
import GestionQcm from './pages/GestionQcm';
import Forum from './pages/Forum';
import Planning from './pages/Planning';
import Statistiques from './pages/Statistiques';
import Comptes from './pages/Comptes';
import EditionQcm from './pages/EditionQcm';
import RevisionErreurs from './pages/RevisionErreurs';
import MesStats from './pages/MesStats';
import FicheTuteur from './pages/FicheTuteur';
import GestionFilieres from './pages/GestionFilieres';
import ChoisirFiliere from './pages/ChoisirFiliere';
import AnnexeListeQcm from './pages/AnnexeListeQcm';
import AnnexeCreationQcm from './pages/AnnexeCreationQcm';
import AnnexeGestionQcm from './pages/AnnexeGestionQcm';
import AnnexeEditionQcm from './pages/AnnexeEditionQcm';
import AnnexeQcmDetail from './pages/AnnexeQcmDetail';
import AnnexeMesStats from './pages/AnnexeMesStats';
import AnnexeCarnetErreurs from './pages/AnnexeCarnetErreurs';
import AnnexeStats from './pages/AnnexeStats';
import AnnexeHistorique from './pages/AnnexeHistorique';
import DemandeInscription from './pages/DemandeInscription';
import DemandesInscription from './pages/DemandesInscription';
import './styles/theme.css';

function Layout() {
  return (
    <>
      <Navbar />
      <Outlet />
    </>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/definir-mot-de-passe" element={<DefinirMotDePasse />} />
        <Route path="/choisir-filiere" element={<ChoisirFiliere />} />
        <Route path="/demande-inscription" element={<DemandeInscription />} />

        <Route element={<Layout />}>
          <Route path="/accueil" element={<Accueil />} />
          <Route path="/qcm/nouveau" element={<CreationQcm />} />
          <Route path="/qcm" element={<ListeQcm />} />
          <Route path="/qcm/:id" element={<QcmDetail />} />
          <Route path="/resultats" element={<Resultats />} />
          <Route path="/resultats/:attemptId" element={<DetailTentative />} />
          <Route path="/classement" element={<Classement />} />
          <Route path="/etudiants/:id" element={<FicheEtudiant />} />
          <Route path="/profil" element={<Profil />} />
          <Route path="/historiques" element={<Historiques />} />
          <Route path="/qcm/archive" element={<ArchiveQcm />} />
          <Route path="/qcm/gerer" element={<GestionQcm />} />
          <Route path="/forum" element={<Forum />} />
          <Route path="/planning" element={<Planning />} />
          <Route path="/statistiques" element={<Statistiques />} />
          <Route path="/comptes" element={<Comptes />} />
          <Route path="/qcm/:id/modifier" element={<EditionQcm />} />
          <Route path="/carnet-erreurs/revision" element={<RevisionErreurs />} />
          <Route path="/mes-stats" element={<MesStats />} />
          <Route path="/tuteurs/:id" element={<FicheTuteur />} />
          <Route path="/filieres" element={<GestionFilieres />} />
          <Route path="/annexe" element={<AnnexeListeQcm />} />
          <Route path="/annexe/qcm/nouveau" element={<AnnexeCreationQcm />} />
          <Route path="/annexe/qcm/gerer" element={<AnnexeGestionQcm />} />
          <Route path="/annexe/qcm/:id/modifier" element={<AnnexeEditionQcm />} />
          <Route path="/annexe/qcm/:id" element={<AnnexeQcmDetail />} />
          <Route path="/annexe/mes-stats" element={<AnnexeMesStats />} />
          <Route path="/annexe/carnet-erreurs" element={<AnnexeCarnetErreurs />} />
          <Route path="/annexe/stats" element={<AnnexeStats />} />
          <Route path="/annexe/historique" element={<AnnexeHistorique />} />
          <Route path="/demandes-inscription" element={<DemandesInscription />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;

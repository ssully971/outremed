// Une matière sans semestre fixe (transversale) est toujours active ; sinon elle ne l'est que
// pendant le semestre correspondant du site (semestre_actif au format "AAAA-Sx"). Si
// semestre_actif n'est pas configuré, on échoue "ouvert" (rien n'est masqué) plutôt que de
// bloquer silencieusement toutes les matières verrouillées.
export function estMatiereActive(matiere, semestreActif) {
  if (!matiere.semestre || !semestreActif) return true;
  return matiere.semestre === semestreActif.split('-')[1];
}

// Senza import: lo usano il cruscotto e i test (node --test).
type VoceConSotto = { codice: string; sotto?: { codice: string }[] | null };

/** La voce del cruscotto di un codice: prima la voce con QUEL codice, poi quella che lo ha tra i sotto-filtri.
 *  16/11/2026 (Christian: «Attesa ricambi non me la fa selezionare»): «attesa_ricambi» è sia una voce del gruppo Lavoro sia un
 *  sotto-filtro di «In riparazione»; cercando la prima voce che lo conteneva vinceva «In riparazione» e il chip non si
 *  selezionava mai. */
export function faseMadre<T extends VoceConSotto>(fasi: T[] | null | undefined, codice: string): T | undefined {
  return fasi?.find((f) => f.codice === codice) || fasi?.find((f) => f.sotto?.some((x) => x.codice === codice));
}

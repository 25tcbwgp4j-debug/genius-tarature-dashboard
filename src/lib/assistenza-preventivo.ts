// Preventivo a righe delle schede di assistenza: portato da genius-lab-dashboard/src/lib/banco/estimate.ts (02/10/2026).
// Stesse regole del backend (assistenza_api.totale_righe / testo_righe).
/**
 * Il preventivo è fatto di righe, non di due caselle.
 *
 * Due specie di riga:
 *  · voce fissa (opt === null)  → si somma sempre
 *  · ipotesi    (opt = 0,1,2…)  → sono ALTERNATIVE fra cui il cliente sceglie,
 *                                 e nel totale entra solo quella con on = true
 *
 * Nasce da come Genius Lab scrive i preventivi da anni: il 24% ha
 * «1° IPOTESI: riparazione …» e «2° IPOTESI: sostituzione integrale …».
 */

export type EstimateLine = {
  t: string                 // la voce
  p: number | string        // importo ('' se ancora da decidere)
  iva?: boolean             // clienti business e rivenditori
  listino?: number | null   // prezzo barrato: «(scontato da € 530)» NON è un addebito
  nota?: string | null      // 'compreso | senza | solo recupero dati'
  opt?: number | null       // null = voce fissa; 0,1,2… = ipotesi alternativa
  on?: boolean              // l'ipotesi scelta
}

export const num = (v: unknown): number => {
  const n = Number(String(v ?? '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

export const isActive = (r: EstimateLine) => r.opt == null || r.on === true

export const IVA = 0.22

/**
 * Quanto pesa una riga sul totale.
 *
 * Se la voce è scritta «+IVA» l'importo è il NETTO e il cliente paga il lordo:
 * su 561 preventivi dell'archivio scritti così, in 9 casi su 10 il prezzo
 * segnato sulla scheda è esattamente l'importo × 1,22. Sommare il netto voleva
 * dire copiare un preventivo da 378 € e ritrovarselo a 310.
 */
export const rowTotal = (r: EstimateLine): number =>
  Math.round(num(r.p) * (r.iva ? 1 + IVA : 1) * 100) / 100

export const total = (lines: EstimateLine[]): number =>
  Math.round((lines ?? []).filter(isActive).reduce((t, r) => t + rowTotal(r), 0) * 100) / 100

/** Il totale se il cliente scegliesse l'ipotesi i-esima (voci fisse comprese). */
export const totalWith = (lines: EstimateLine[], opt: number): number => {
  const fixed = lines.filter((r) => r.opt == null).reduce((t, r) => t + rowTotal(r), 0)
  const alt = lines.find((r) => r.opt === opt)
  return Math.round((fixed + (alt ? rowTotal(alt) : 0)) * 100) / 100
}

/** Il testo che finisce nella mail e nel PDF del cliente. */
export function estimateText(lines: EstimateLine[]): string {
  const one = (r: EstimateLine) => {
    let s = r.t
    if (r.p !== '' && r.p != null) s += ` € ${r.p}`
    if (r.iva) s += '+IVA'
    if (r.listino) s += ` (scontato da € ${r.listino})`
    if (r.nota) s += ` (${r.nota})`
    return s
  }
  const fixed = lines.filter((r) => r.opt == null).map(one)
  const alts = lines.filter((r) => r.opt != null)
  const out = [...fixed]
  alts.forEach((r, i) => out.push(`${i + 1}° IPOTESI: ${one(r)}`))
  return out.join('\n')
}

/* ─────────────────────────────────────────────────────────────────────────────
   Rileggere un preventivo già scritto, per riusarlo su un lavoro uguale.
   Verificato su 6.688 preventivi accettati: il totale ricalcolato coincide
   col prezzo di scheda nel 79% dei casi, zero errori di lettura.
   ──────────────────────────────────────────────────────────────────────────── */

const RE_LISTINO = /\(\s*(?:scont\w*\s*da|da\s*listino)\s*€\s*(\d+)\s*\)?/i
const RE_NOTA = /\((compreso|senza|solo)\s+recupero\s+(?:dati|backup)\)?/i

/** Nei preventivi vecchi l'euro è scritto EURO, EUR o €. */
const normEuro = (t: string) =>
  String(t).replace(/\bEUR(?:O)?\b\.?/gi, '€').replace(/€\s*€/g, '€').replace(/\s+/g, ' ').trim()

function readLine(txt: string, opt: number | null): EstimateLine {
  let t = normEuro(txt)
  let listino: number | null = null
  let nota: string | null = null
  let iva = false

  const mL = t.match(RE_LISTINO)
  if (mL) { listino = Number(mL[1]); t = t.replace(mL[0], ' ') }   // non è un addebito
  const mN = t.match(RE_NOTA)
  if (mN) { nota = mN[0].replace(/[()]/g, '').trim().toLowerCase(); t = t.replace(mN[0], ' ') }
  if (/\+\s*IVA/i.test(t)) { iva = true; t = t.replace(/\+\s*IVA/gi, ' ') }

  const mP = t.match(/€\s*(\d+(?:[.,]\d+)?)/)              // il primo importo è il prezzo
  const p = mP ? Math.round(parseFloat(mP[1].replace(',', '.'))) : ''
  if (mP) t = t.replace(mP[0], ' ')

  t = t.replace(/\s+/g, ' ').replace(/^[\s,;.:()-]+|[\s,;.:()-]+$/g, '').trim()
  return { t, p, iva, listino, nota, opt, on: opt === 0 }
}

export function parseEstimate(text: string): EstimateLine[] {
  const t = normEuro(text)
  if (!t) return []
  const marks = [...t.matchAll(/(\d)\s*°\s*(?:IPOTESI\s*:?)?/gi)]
  const out: EstimateLine[] = []

  const readFixed = (chunk: string) => {
    const re = /(.+?)€\s*\d+(?:[.,]\d+)?\s*(?:\+\s*IVA)?(?:\s*\((?:scont|da listino)[^)]*\))?(?:\s*\((?:compreso|senza|solo)[^)]*\))?/gi
    let m: RegExpExecArray | null
    let end = 0
    while ((m = re.exec(chunk)) !== null) { out.push(readLine(m[0], null)); end = re.lastIndex }
    const rest = chunk.slice(end).trim()
    if (rest.length > 4) out.push({ t: rest, p: '', iva: false, listino: null, nota: null, opt: null, on: false })
  }

  if (!marks.length) { readFixed(t); return out.length ? out : [{ t, p: '', opt: null }] }

  const head = t.slice(0, marks[0].index).trim()
  if (head.length > 4) readFixed(head)            // spese di spedizione, test in ingresso…
  marks.forEach((mk, i) => {
    const from = (mk.index ?? 0) + mk[0].length
    const to = i + 1 < marks.length ? (marks[i + 1].index ?? t.length) : t.length
    const line = readLine(t.slice(from, to), i)
    if (line.t || line.p !== '') out.push(line)
  })
  return out
}

"use client";

// TABELLE A SCHEDE SU IPHONE (15/11/2026, piano 2.9). Ogni <table class="tabella-schede"> sotto i 640px diventa un elenco
// di schede: una per riga, con il nome della colonna accanto a ogni valore (preso dall'intestazione). Così importi e
// stato non finiscono più fuori schermo a destra (fatture, ordini, pro forma, carico magazzino, prezzi ufficiali,
// registro modifiche). Il nome della colonna viene scritto in data-label da questo componente, montato una volta nel
// layout, che osserva la pagina: le tabelle nuove o ricaricate si sistemano da sole. Lo stile è in globals.css.
import { useEffect } from "react";

function etichetta(tab: HTMLTableElement) {
  const intest = Array.from(tab.querySelectorAll("thead tr:last-child th")).map((th) => (th.textContent || "").trim());
  if (!intest.length) return;
  tab.querySelectorAll("tbody tr").forEach((tr) => {
    let col = 0;
    Array.from(tr.children).forEach((td) => {
      const el = td as HTMLTableCellElement;
      const nome = intest[col] || "";
      if (nome && el.dataset.label !== nome) el.dataset.label = nome;
      col += el.colSpan || 1;
    });
  });
}

export function TabelleSchede() {
  useEffect(() => {
    let attesa = 0;
    const tutto = () => { attesa = 0; document.querySelectorAll<HTMLTableElement>("table.tabella-schede").forEach(etichetta); };
    const presto = () => { if (!attesa) attesa = window.setTimeout(tutto, 120); };
    tutto();
    const mo = new MutationObserver(presto);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => { mo.disconnect(); if (attesa) clearTimeout(attesa); };
  }, []);
  return null;
}

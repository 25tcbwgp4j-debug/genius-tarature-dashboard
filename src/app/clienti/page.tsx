"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { searchCustomers } from "@/lib/api";
import { Search, Loader2, Phone, Mail, MapPin } from "lucide-react";

export default function ClientiPage() {
  const [query, setQuery] = useState("");
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = async () => {
    if (query.length < 2) return;
    setLoading(true);
    setSearched(true);
    try {
      const data = await searchCustomers(query, 50);
      setCustomers(data.customers || []);
    } catch {
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Clienti</h2>

      <div className="flex gap-2 max-w-lg">
        <Input
          placeholder="Cerca per nome, P.IVA..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
        />
        <Button onClick={handleSearch} disabled={loading}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
        </Button>
      </div>

      <Card>
        <div className="divide-y">
          {loading ? (
            <div className="p-8 text-center">
              <Loader2 className="w-6 h-6 animate-spin mx-auto text-gray-400" />
            </div>
          ) : customers.length === 0 && searched ? (
            <p className="p-8 text-center text-gray-500">Nessun cliente trovato</p>
          ) : !searched ? (
            <p className="p-8 text-center text-gray-500">
              Cerca un cliente per nome o P.IVA (4.552 clienti in archivio)
            </p>
          ) : (
            customers.map((c) => (
              <div key={c.id} className="p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-semibold text-gray-900">{c.company_name}</p>
                    <p className="text-sm text-gray-500">
                      Cod. {c.legacy_code} | P.IVA: {c.vat_number || "N/D"} | CF: {c.tax_id || "N/D"}
                    </p>
                  </div>
                  {c.discount_percent > 0 && (
                    <span className="text-sm bg-green-100 text-green-800 px-2 py-0.5 rounded">
                      Sconto {c.discount_percent}%
                    </span>
                  )}
                </div>
                <div className="flex gap-6 mt-2 text-sm text-gray-600">
                  {c.address && (
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5" />
                      {c.address}, {c.zip_code} {c.city} {c.province}
                    </span>
                  )}
                  {(c.mobile || c.phone1) && (
                    <span className="flex items-center gap-1">
                      <Phone className="w-3.5 h-3.5" />
                      {c.mobile || c.phone1}
                    </span>
                  )}
                  {c.email && (
                    <span className="flex items-center gap-1">
                      <Mail className="w-3.5 h-3.5" />
                      {c.email}
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}

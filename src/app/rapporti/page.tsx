"use client";

import { Card } from "@/components/ui/card";
import { FileText } from "lucide-react";

export default function RapportiPage() {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Rapporti di taratura</h2>
      <Card className="p-8 text-center">
        <FileText className="w-12 h-12 mx-auto text-gray-300 mb-4" />
        <p className="text-gray-500">
          I rapporti vengono generati automaticamente quando uno strumento viene tarato.
        </p>
        <p className="text-sm text-gray-400 mt-2">
          Accedi a una sessione per visualizzare e scaricare i rapporti.
        </p>
      </Card>
    </div>
  );
}

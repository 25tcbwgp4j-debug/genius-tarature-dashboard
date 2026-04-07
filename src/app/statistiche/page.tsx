"use client";

import { Card } from "@/components/ui/card";
import { BarChart3 } from "lucide-react";

export default function StatistichePage() {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Statistiche</h2>
      <Card className="p-8 text-center">
        <BarChart3 className="w-12 h-12 mx-auto text-gray-300 mb-4" />
        <p className="text-gray-500">
          Le statistiche saranno disponibili dopo le prime sessioni di taratura.
        </p>
      </Card>
    </div>
  );
}

"use client";

import { useEffect, useState, useRef } from "react";
import QRCode from "qrcode";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getWhatsAppQR } from "@/lib/api";
import { Loader2, Download, QrCode, Smartphone } from "lucide-react";

export default function QRCodePage() {
  const [qrData, setQrData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    getWhatsAppQR()
      .then(setQrData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Genera QR code localmente con libreria 'qrcode' (no dipendenze esterne) — fix F8
  useEffect(() => {
    if (!qrData || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const qrCanvas = document.createElement("canvas");
    QRCode.toCanvas(qrCanvas, qrData.wa_link, {
      width: 450,
      margin: 1,
      errorCorrectionLevel: "H",
      color: { dark: "#000000", light: "#FFFFFF" },
    })
      .then(() => {
        canvas.width = 600;
        canvas.height = 750;

        // Sfondo bianco
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, 600, 750);

        // QR Code centrato
        ctx.drawImage(qrCanvas, 75, 30, 450, 450);

        // Testo sotto il QR
        ctx.fillStyle = "#1a1a1a";
        ctx.font = "bold 28px Arial, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("AvaTech Tarature Certificazioni", 300, 520);

        ctx.font = "20px Arial, sans-serif";
        ctx.fillStyle = "#444";
        ctx.fillText("Scansiona il QR per contattarci su WhatsApp", 300, 555);

        ctx.font = "18px Arial, sans-serif";
        ctx.fillStyle = "#666";
        ctx.fillText(qrData.phone, 300, 590);

        ctx.fillText("Viale Somalia, 246 — 00199 Roma", 300, 620);
        ctx.fillText("Tel. +39 06 80074880 | Cell. +39 375 7371888", 300, 650);
        ctx.fillText("LUN-VEN 9:30-13:30 e 15:00-19:00", 300, 680);

        ctx.fillStyle = "#2563eb";
        ctx.font = "bold 18px Arial, sans-serif";
        ctx.fillText("www.avatechlab.it", 300, 720);
      })
      .catch(() => {});
  }, [qrData]);

  const handleDownload = () => {
    if (!canvasRef.current) return;
    const link = document.createElement("a");
    link.download = "AvaTech-Tarature-QRCode-WhatsApp.png";
    link.href = canvasRef.current.toDataURL("image/png");
    link.click();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
        <QrCode className="w-7 h-7" />
        QR Code WhatsApp
      </h2>

      <Card className="p-6">
        <div className="text-center space-y-4">
          <p className="text-gray-600">
            Esponi questo QR code in laboratorio. I clienti possono scansionarlo
            per contattarti direttamente su WhatsApp.
          </p>

          {/* Canvas QR */}
          <div className="flex justify-center">
            <canvas
              ref={canvasRef}
              className="border rounded-lg shadow-lg max-w-full"
              style={{ maxWidth: "500px" }}
            />
          </div>

          {/* Pulsanti */}
          <div className="flex gap-3 justify-center">
            <Button size="lg" onClick={handleDownload}>
              <Download className="w-5 h-5 mr-2" />
              Scarica PNG
            </Button>
            {qrData && (
              <Button
                size="lg"
                variant="outline"
                onClick={() => window.open(qrData.wa_link, "_blank")}
              >
                <Smartphone className="w-5 h-5 mr-2" />
                Apri WhatsApp
              </Button>
            )}
          </div>

          {qrData && (
            <p className="text-sm text-gray-400">
              Link: {qrData.wa_link}
            </p>
          )}
        </div>
      </Card>

      {/* Istruzioni */}
      <Card className="p-6">
        <h3 className="font-semibold mb-3 flex items-center gap-2">
          <Smartphone className="w-5 h-5" />
          Come funziona per il cliente
        </h3>
        <ol className="list-decimal list-inside space-y-2 text-sm text-gray-600">
          <li>Il cliente scansiona il QR code con il telefono</li>
          <li>Si apre WhatsApp con un messaggio pre-compilato</li>
          <li>Il cliente puo inviare i propri dati (nome, P.IVA, indirizzo)</li>
          <li>Puo anche inviare una foto del biglietto da visita o dell&apos;intestazione</li>
          <li>Il bot registra automaticamente il nuovo cliente</li>
          <li>Lo staff riceve una notifica Telegram</li>
        </ol>
      </Card>
    </div>
  );
}

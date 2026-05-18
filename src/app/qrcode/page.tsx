"use client";

import { useEffect, useState, useRef } from "react";
import QRCode from "qrcode";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getWhatsAppQR, getPhoneQR } from "@/lib/api";
import { Loader2, Download, QrCode, Smartphone, Phone } from "lucide-react";

type QRKind = "whatsapp" | "phone";

interface QRData {
  link: string;
  phone: string;
  title: string;
  subtitle: string;
}

function renderQRToCanvas(canvas: HTMLCanvasElement, data: QRData) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.resolve();

  const qrCanvas = document.createElement("canvas");
  return QRCode.toCanvas(qrCanvas, data.link, {
    width: 450,
    margin: 1,
    errorCorrectionLevel: "H",
    color: { dark: "#000000", light: "#FFFFFF" },
  }).then(() => {
    canvas.width = 600;
    canvas.height = 750;

    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, 600, 750);

    ctx.drawImage(qrCanvas, 75, 30, 450, 450);

    ctx.fillStyle = "#1a1a1a";
    ctx.font = "bold 28px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("AvaTech Tarature Certificazioni", 300, 520);

    ctx.font = "20px Arial, sans-serif";
    ctx.fillStyle = "#444";
    ctx.fillText(data.subtitle, 300, 555);

    ctx.font = "18px Arial, sans-serif";
    ctx.fillStyle = "#666";
    ctx.fillText(data.phone, 300, 590);

    ctx.fillText("Viale Somalia, 246 — 00199 Roma", 300, 620);
    ctx.fillText("Tel. +39 06 80074880 | Cell. +39 375 7371888", 300, 650);
    ctx.fillText("LUN-VEN 9:30-13:30 e 15:00-19:00", 300, 680);

    ctx.fillStyle = "#2563eb";
    ctx.font = "bold 18px Arial, sans-serif";
    ctx.fillText("www.avatechlab.it", 300, 720);
  });
}

export default function QRCodePage() {
  const [whatsappData, setWhatsappData] = useState<QRData | null>(null);
  const [phoneData, setPhoneData] = useState<QRData | null>(null);
  const [loading, setLoading] = useState(true);
  const whatsappCanvasRef = useRef<HTMLCanvasElement>(null);
  const phoneCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    Promise.all([
      getWhatsAppQR().catch(() => null),
      getPhoneQR().catch(() => null),
    ])
      .then(([wa, ph]) => {
        if (wa) {
          setWhatsappData({
            link: wa.wa_link,
            phone: wa.phone,
            title: "QR Code WhatsApp",
            subtitle: "Scansiona per contattarci su WhatsApp",
          });
        }
        if (ph) {
          setPhoneData({
            link: ph.tel_link,
            phone: ph.phone,
            title: "QR Code Telefono",
            subtitle: "Scansiona per chiamarci direttamente",
          });
        }
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (whatsappData && whatsappCanvasRef.current) {
      renderQRToCanvas(whatsappCanvasRef.current, whatsappData).catch(() => {});
    }
  }, [whatsappData]);

  useEffect(() => {
    if (phoneData && phoneCanvasRef.current) {
      renderQRToCanvas(phoneCanvasRef.current, phoneData).catch(() => {});
    }
  }, [phoneData]);

  const downloadQR = (canvasRef: React.RefObject<HTMLCanvasElement | null>, kind: QRKind) => {
    if (!canvasRef.current) return;
    const link = document.createElement("a");
    link.download = `AvaTech-Tarature-QRCode-${kind === "whatsapp" ? "WhatsApp" : "Telefono"}.png`;
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
    <div className="space-y-6 max-w-6xl mx-auto">
      <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
        <QrCode className="w-7 h-7" />
        QR Code Contatti
      </h2>

      <p className="text-gray-600">
        Esponi questi QR code in laboratorio. I clienti possono scansionare
        quello che preferiscono per contattarti via WhatsApp o chiamata.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* QR WhatsApp */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-green-700">
            <Smartphone className="w-5 h-5" />
            WhatsApp
          </h3>
          <div className="text-center space-y-4">
            <div className="flex justify-center">
              <canvas
                ref={whatsappCanvasRef}
                className="border rounded-lg shadow-lg max-w-full"
                style={{ maxWidth: "400px" }}
              />
            </div>
            <div className="flex gap-3 justify-center flex-wrap">
              <Button onClick={() => downloadQR(whatsappCanvasRef, "whatsapp")}>
                <Download className="w-4 h-4 mr-2" />
                Scarica PNG
              </Button>
              {whatsappData && (
                <Button
                  variant="outline"
                  onClick={() => window.open(whatsappData.link, "_blank")}
                >
                  <Smartphone className="w-4 h-4 mr-2" />
                  Apri WhatsApp
                </Button>
              )}
            </div>
            {whatsappData && (
              <p className="text-xs text-gray-400 break-all">{whatsappData.link}</p>
            )}
          </div>
        </Card>

        {/* QR Telefono */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-blue-700">
            <Phone className="w-5 h-5" />
            Telefono
          </h3>
          <div className="text-center space-y-4">
            <div className="flex justify-center">
              <canvas
                ref={phoneCanvasRef}
                className="border rounded-lg shadow-lg max-w-full"
                style={{ maxWidth: "400px" }}
              />
            </div>
            <div className="flex gap-3 justify-center flex-wrap">
              <Button onClick={() => downloadQR(phoneCanvasRef, "phone")}>
                <Download className="w-4 h-4 mr-2" />
                Scarica PNG
              </Button>
              {phoneData && (
                <Button
                  variant="outline"
                  onClick={() => window.open(phoneData.link, "_self")}
                >
                  <Phone className="w-4 h-4 mr-2" />
                  Chiama
                </Button>
              )}
            </div>
            {phoneData && (
              <p className="text-xs text-gray-400 break-all">{phoneData.link}</p>
            )}
          </div>
        </Card>
      </div>

      {/* Istruzioni */}
      <Card className="p-6">
        <h3 className="font-semibold mb-3 flex items-center gap-2">
          <Smartphone className="w-5 h-5" />
          Come funziona per il cliente
        </h3>
        <ol className="list-decimal list-inside space-y-2 text-sm text-gray-600">
          <li>
            <b>WhatsApp:</b> il cliente scansiona, si apre WhatsApp con messaggio
            pre-compilato; può inviare dati, foto biglietto, intestazione → bot
            registra cliente + notifica Telegram allo staff.
          </li>
          <li>
            <b>Telefono:</b> il cliente scansiona, si apre direttamente la
            chiamata in uscita verso il numero ordinario AvaTech.
          </li>
        </ol>
      </Card>
    </div>
  );
}

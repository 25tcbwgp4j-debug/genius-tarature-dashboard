"use client";

import { useCallback, useEffect, useState } from "react";

type PushStatus = "loading" | "unsupported" | "denied" | "default" | "subscribed";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = typeof window !== "undefined" ? window.atob(base64) : "";
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export function usePushNotifications() {
  const [status, setStatus] = useState<PushStatus>("loading");
  const [busy, setBusy] = useState(false);

  // Stato iniziale: capisce se browser supporta + permission corrente
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setStatus("unsupported");
      return;
    }
    const perm = Notification.permission;
    if (perm === "denied") setStatus("denied");
    else if (perm === "granted") {
      // Verifica subscription esistente
      navigator.serviceWorker.ready.then(async (reg) => {
        const sub = await reg.pushManager.getSubscription();
        setStatus(sub ? "subscribed" : "default");
      });
    } else setStatus("default");
  }, []);

  const subscribe = useCallback(async (): Promise<boolean> => {
    if (status === "unsupported" || status === "denied") return false;
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setStatus(perm === "denied" ? "denied" : "default");
        return false;
      }

      // Recupera VAPID public key (preferisci NEXT_PUBLIC env, fallback proxy backend)
      const envPub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      let public_key = envPub || "";
      if (!public_key) {
        const keyRes = await fetch("/api/backend/api/chat/push/vapid-public-key");
        if (!keyRes.ok) throw new Error("vapid_key_fetch_failed");
        const data = await keyRes.json();
        public_key = data.public_key || "";
      }
      if (!public_key) throw new Error("vapid_not_configured");

      // Service worker ready
      const reg = await navigator.serviceWorker.ready;

      // Subscribe al PushManager (cast Uint8Array → BufferSource per TS strict)
      const key = urlBase64ToUint8Array(public_key);
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: key as unknown as BufferSource,
      });

      const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        throw new Error("invalid_subscription");
      }

      // Invia subscription al backend (via proxy generico /api/backend)
      const subRes = await fetch("/api/backend/api/chat/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: json.endpoint,
          p256dh: json.keys.p256dh,
          auth: json.keys.auth,
          user_agent: navigator.userAgent,
        }),
      });
      if (!subRes.ok) throw new Error("subscribe_backend_failed");

      setStatus("subscribed");
      return true;
    } catch (e) {
      console.error("[push] subscribe error", e);
      return false;
    } finally {
      setBusy(false);
    }
  }, [status]);

  const unsubscribe = useCallback(async (): Promise<boolean> => {
    if (status !== "subscribed") return false;
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/backend/api/chat/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setStatus("default");
      return true;
    } catch (e) {
      console.error("[push] unsubscribe error", e);
      return false;
    } finally {
      setBusy(false);
    }
  }, [status]);

  return { status, busy, subscribe, unsubscribe };
}

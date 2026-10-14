"use client";

import { useEffect, useRef } from "react";

type CredentialResponse = { credential: string };

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: { client_id: string; callback: (response: CredentialResponse) => void }) => void;
          renderButton: (parent: HTMLElement, options: Record<string, string | number>) => void;
        };
      };
    };
  }
}

export function GoogleSignIn({ onCredential }: { onCredential: (credential: string) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  const callback = useRef(onCredential);
  callback.current = onCredential;

  useEffect(() => {
    if (!clientId || !host.current) return;
    let cancel = false;
    const render = () => {
      if (cancel || !host.current || !window.google) return;
      host.current.replaceChildren();
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (response) => callback.current(response.credential),
      });
      window.google.accounts.id.renderButton(host.current, {
        theme: "outline",
        size: "large",
        text: "continue_with",
        shape: "rectangular",
        width: 320,
      });
    };
    if (window.google?.accounts?.id) {
      render();
      return () => {
        cancel = true;
      };
    }
    const found = document.querySelector<HTMLScriptElement>("script[data-google-gsi]");
    if (found) {
      found.addEventListener("load", render);
      return () => {
        cancel = true;
        found.removeEventListener("load", render);
      };
    }
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.dataset.googleGsi = "1";
    script.onload = () => render();
    document.head.appendChild(script);
    return () => {
      cancel = true;
    };
  }, [clientId]);

  if (!clientId) {
    return <p className="mt-4 font-extrabold">Google sign-in is not switched on yet.</p>;
  }

  return <div ref={host} className="mt-4 flex min-h-11 justify-center" />;
}

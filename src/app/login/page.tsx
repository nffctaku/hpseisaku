"use client";

// 管理画面シェル・CareerContext・Firestore profile 取得から切り離した
// 最小構成のログイン経路。Firebase Auth の初期化とGoogleログインだけを行い、
// ログイン済みなら /admin へ遷移する。

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithCredential,
  signInWithPopup,
} from "firebase/auth";
import { auth } from "@/lib/firebase";

// Firebase Google provider が使う Web OAuth client（handler の OAuth URL で確認済み）。
// この client 宛の ID token は signInWithCredential で Firebase Auth に入れる。
const GOOGLE_CLIENT_ID =
  "37351204331-41dfdcurli5qh9a7vjbjjbmefjie7s8i.apps.googleusercontent.com";

export default function LoginPage() {
  const [signingIn, setSigningIn] = useState(false);
  const [mode, setMode] = useState<"pending" | "gis" | "custom">("pending");
  const signingInRef = useRef(false);
  const gisRef = useRef<HTMLDivElement>(null);

  // ログイン済みになったら /admin へ遷移（redirect復帰時もここで拾う）
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (u) {
        window.location.href = "/admin";
      }
    });
    return () => unsub();
  }, []);

  // bfcache復帰時にロックを解除
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        signingInRef.current = false;
        setSigningIn(false);
      }
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  // mobile は GIS (Google Identity Services) 経路、それ以外は従来ボタン
  useEffect(() => {
    const ua = window.navigator.userAgent || "";
    const inApp = /(Line|FBAN|FBAV|Instagram|MicroMessenger|Twitter)/i.test(ua);
    const mobile =
      /iPhone|iPad|iPod|Android/i.test(ua) ||
      (/Macintosh/i.test(ua) && window.navigator.maxTouchPoints > 1);
    setMode(mobile && !inApp ? "gis" : "custom");
  }, []);

  // GISボタン初期化: ID token → signInWithCredential（popup/redirect不使用）
  useEffect(() => {
    if (mode !== "gis" || !gisRef.current) return;
    const init = () => {
      const g = (window as any).google;
      g.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: async (resp: { credential: string }) => {
          signingInRef.current = true;
          setSigningIn(true);
          if (!resp?.credential) {
            signingInRef.current = false;
            setSigningIn(false);
            return;
          }
          try {
            const credential = GoogleAuthProvider.credential(resp.credential);
            await Promise.race([
              signInWithCredential(auth, credential),
              new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error("SDK_SIGNIN_TIMEOUT")), 15000)
              ),
            ]);
            // 以降は onAuthStateChanged が /admin へ遷移
          } catch (e: any) {
            console.error("[LoginPage] mobile sign-in error", e);
            signingInRef.current = false;
            setSigningIn(false);
            window.alert(`ログインエラー: ${e.message || e.code || "Unknown error"}`);
          }
        },
      });
      g.accounts.id.renderButton(gisRef.current, {
        type: "standard",
        theme: "outline",
        size: "large",
        width: 234,
        text: "signin_with",
        locale: "ja",
      });
    };
    if ((window as any).google?.accounts?.id) {
      init();
    } else {
      const s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client";
      s.async = true;
      s.defer = true;
      s.onload = init;
      document.head.appendChild(s);
    }
  }, [mode]);

  const handleGoogleLogin = async () => {
    const ua = window.navigator.userAgent || "";
    const isInApp = /(Line|FBAN|FBAV|Instagram|MicroMessenger|Twitter)/i.test(ua);
    if (isInApp) {
      window.alert(
        "LINE/Instagram等のアプリ内ブラウザではGoogleログインがブロックされます。右上のメニューから「ブラウザで開く」を選ぶか、Safari/Chromeでこのページを開いてからログインしてください。"
      );
      return;
    }

    if (signingInRef.current) return;
    signingInRef.current = true;

    const provider = new GoogleAuthProvider();
    setSigningIn(true);
    try {
      await signInWithPopup(auth, provider);
      // 以降は onAuthStateChanged が /admin へ遷移
    } catch (e: any) {
      console.error("[LoginPage] Error signing in with popup", e);
      if (e?.code !== "auth/popup-closed-by-user" && e?.code !== "auth/cancelled-popup-request") {
        window.alert(`ログインエラー: ${e.message || e.code || "Unknown error"}`);
      }
    } finally {
      signingInRef.current = false;
      setSigningIn(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f7f7f5] px-6 text-gray-900">
      <div className="w-full max-w-[360px] text-center">
        <div className="mx-auto mb-9 flex h-[68px] w-[68px] items-center justify-center rounded-2xl bg-white shadow-sm">
          <Image
            src="/favicon.png"
            alt="FootChron"
            width={34}
            height={34}
            className="object-contain"
            priority
          />
        </div>
        <h1 className="text-[24px] font-bold leading-tight tracking-tight text-gray-950">
          ログインまたは新規作成
        </h1>
        <p className="mt-4 text-[15px] font-semibold leading-relaxed text-gray-500">
          Googleアカウントでログインすると、クラブや大会の管理を始められます。
        </p>
        <div className="mt-10 flex justify-center">
          {mode === "gis" ? (
            <div className="flex flex-col items-center">
              <div ref={gisRef} className={signingIn ? "opacity-70 pointer-events-none" : ""} />
              {signingIn && (
                <div className="mt-3 flex items-center text-[13px] font-semibold text-gray-500">
                  <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-700" />
                  ログイン中…
                </div>
              )}
            </div>
          ) : (
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={signingIn}
            className="inline-flex h-[54px] w-[234px] items-center justify-center rounded-[10px] border border-gray-300 bg-white text-[15px] font-bold text-gray-900 shadow-none hover:bg-gray-50 disabled:opacity-70"
          >
            {signingIn ? (
              <>
                <span className="mr-3 h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-700" />
                ログイン画面へ移動中…
              </>
            ) : (
              <>
                <svg className="mr-3 h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Googleでログイン
              </>
            )}
          </button>
          )}
        </div>
        <p className="mt-6 text-[12px] font-semibold leading-relaxed text-gray-400">
          ログインすることで
          <Link
            href="/terms"
            className="font-bold text-gray-600 underline underline-offset-2 hover:text-gray-900"
            target="_blank"
            rel="noreferrer"
          >
            利用規約
          </Link>
          および
          <Link
            href="/privacy"
            className="font-bold text-gray-600 underline underline-offset-2 hover:text-gray-900"
            target="_blank"
            rel="noreferrer"
          >
            プライバシーポリシー
          </Link>
          に<br />
          同意したものとみなされます
        </p>
      </div>
    </div>
  );
}

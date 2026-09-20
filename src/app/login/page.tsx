"use client";

// 管理画面シェル・CareerContext・Firestore profile 取得から切り離した
// 最小構成のログイン経路。Firebase Auth の初期化とGoogleログインだけを行い、
// ログイン済みなら /admin へ遷移する。

import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import Image from "next/image";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithRedirect,
} from "firebase/auth";
import { auth } from "@/lib/firebase";

export default function LoginPage() {
  const [signingIn, setSigningIn] = useState(false);
  const [stage, setStage] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const signingInRef = useRef(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

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

  const handleGoogleLogin = async () => {
    console.log("[LoginPage] Google login tapped");
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
    // Firebase標準のredirectのみ。useSelfAuthDomainForRedirect等の
    // 独自制御は介さない。promiseは設計上resolveしないためawaitしない。
    console.log("AUTH_READY", (auth.config as any).authDomain);
    flushSync(() => {
      setStage("BEFORE_REDIRECT_CALL");
    });
    setSigningIn(true);
    try {
      void signInWithRedirect(auth, provider).catch((e: any) => {
        console.error("REDIRECT_ERROR", e);
        setStage("REDIRECT_ERROR " + (e.code || e.message || e));
        signingInRef.current = false;
        setSigningIn(false);
        window.alert(`ログインエラー: ${e.message || e.code || "Unknown error"}`);
      });
      flushSync(() => {
        setStage("REDIRECT_CALL_RETURNED");
      });
    } catch (e: any) {
      console.error("REDIRECT_ERROR(sync)", e);
      setStage("REDIRECT_ERROR(sync) " + (e.code || e.message || e));
      signingInRef.current = false;
      setSigningIn(false);
      window.alert(`ログインエラー: ${e.message || e.code || "Unknown error"}`);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f7f7f5] px-6 text-gray-900">
      <div className="w-full max-w-[360px] text-center">
        <div className="mb-4 text-lg font-bold text-red-600">LOGIN_BUILD_41e9876</div>
        {hydrated && (
          <div className="mb-4 text-lg font-bold text-emerald-600">HYDRATED</div>
        )}
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
        </div>
        {stage && (
          <div className="mt-4 text-[11px] font-mono text-gray-500 break-all">{stage}</div>
        )}
        {/* 一時切り分け用: React onClickのみ（Firebase不使用）の最小テスト */}
        <div className="mt-3 flex justify-center">
          <button
            type="button"
            onClick={() => {
              document.body.dataset.reactClick = "ok";
              window.location.href = "https://accounts.google.com";
            }}
            className="text-[12px] font-semibold text-gray-400 underline underline-offset-2"
          >
            （テスト）React動作テスト
          </button>
        </div>
        {/* 一時切り分け用: JavaScriptを一切介さない純粋なHTMLリンク */}
        <div className="mt-3 flex justify-center">
          <a
            href="https://accounts.google.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[12px] font-semibold text-gray-400 underline underline-offset-2"
          >
            （テスト）Googleを開くリンク
          </a>
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

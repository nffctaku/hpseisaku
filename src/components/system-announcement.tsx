"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

export function SystemAnnouncement() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="w-full bg-amber-50 border-l-4 border-amber-500">
      <div className="max-w-5xl mx-auto">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-full p-2 sm:p-3 flex items-center justify-between text-left hover:bg-amber-100 transition-colors"
        >
          <h3 className="text-sm sm:text-base font-bold text-amber-900">
            最新のアップデート情報
          </h3>
          {isOpen ? (
            <ChevronUp className="h-4 w-4 text-amber-700 flex-shrink-0 ml-2" />
          ) : (
            <ChevronDown className="h-4 w-4 text-amber-700 flex-shrink-0 ml-2" />
          )}
        </button>
        {isOpen && (
          <div className="px-4 sm:px-6 pb-4 sm:pb-6">
            <div className="text-sm sm:text-base text-amber-900 leading-relaxed">
              <div className="mb-4">
                <strong className="block mb-2">2026年7月22日 - トップページUI改善</strong>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  <li>モバイル用トップヒーロー画像を新しい画像に差し替え</li>
                  <li>2枚目と3枚目の画像を自動スライド形式に変更</li>
                  <li>「無料で始める」ボタンのデザイン変更（青色、横長化）</li>
                  <li>トップヒーロー画像のトリミング調整</li>
                  <li>お知らせバナーの厚みを細く調整</li>
                </ul>
              </div>
              <div className="mb-4">
                <strong className="block mb-2">2026年7月21日 - 公開ページの選手スタッツ集計の修正</strong>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  <li>管理画面で入力した手動スタッツが公開ページで正しく反映されるよう修正</li>
                  <li>getPlayer.tsのマージロジックを改善</li>
                </ul>
              </div>
              <div className="mb-4">
                <strong className="block mb-2">2026年7月20日 - 管理画面UI一貫性改善</strong>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  <li>クラブ情報設定ページの完全再設計</li>
                  <li>SNSリンクタブの再設計</li>
                  <li>友好試合管理ページの再設計</li>
                  <li>A3選手名鑑エディターの大幅改善</li>
                </ul>
              </div>
              <div className="mt-4 pt-4 border-t border-amber-200">
                <a href="/updates" className="text-amber-700 hover:text-amber-900 underline">
                  詳細なアップデート情報はこちら
                </a>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

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
          className="w-full p-4 sm:p-6 flex items-center justify-between text-left hover:bg-amber-100 transition-colors"
        >
          <h3 className="text-base sm:text-lg font-bold text-amber-900">
            【重要なお知らせ】システムアップデートに関するご案内
          </h3>
          {isOpen ? (
            <ChevronUp className="h-5 w-5 text-amber-700 flex-shrink-0 ml-2" />
          ) : (
            <ChevronDown className="h-5 w-5 text-amber-700 flex-shrink-0 ml-2" />
          )}
        </button>
        {isOpen && (
          <div className="px-4 sm:px-6 pb-4 sm:pb-6">
            <div className="text-sm sm:text-base text-amber-900 leading-relaxed whitespace-pre-line">
日頃よりFootChronをご利用いただき、誠にありがとうございます。
現在、より快適にご利用いただけるサービスへ向けて、大規模なアップデート作業を進めております。この影響により、皆様からいただいております不具合のご報告やお問い合わせに対して、十分なご返信ができていない状況が続いております。
本来であれば速やかにご対応すべきところ、ご連絡をいただいた皆様には大変長らくお待たせしてしまっており、心よりお詫び申し上げます。
アップデート作業は7月20日頃の完了を目途に進めており、完了後、順次ご返信・ご対応をさせていただきます。今しばらくお待ちいただけますよう、何卒よろしくお願い申し上げます。
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

// 選手選択などで使うモバイル風ホイールピッカーの共通モーダル。
// event-form（新しいイベントを追加）と ocr-review-panel（読み取り確認）で
// 同じ操作・文言になるよう共有する。

import { useState } from 'react';

export interface PickerOption {
  value: string;
  label: string;
}

export interface PickerRequest {
  title: string;
  value: string;
  options: PickerOption[];
  onSelect: (value: string) => void;
}

interface MobilePickerModalProps {
  picker: PickerRequest | null;
  onClose: () => void;
  /** true の場合はモバイル幅でのみ表示（イベント追加フォームの既存挙動） */
  mobileOnly?: boolean;
}

export function MobilePickerModal({ picker, onClose, mobileOnly = false }: MobilePickerModalProps) {
  const [pressedPickerValue, setPressedPickerValue] = useState<string | null>(null);
  if (!picker) return null;
  return (
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center bg-black/45 px-4${mobileOnly ? ' sm:hidden' : ''}`}
      onClick={onClose}
    >
      <div className="w-full max-w-md overflow-hidden rounded-[28px] bg-[#f4f4f6] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex h-12 items-center justify-between border-b border-slate-300/80 bg-white px-4">
          <button type="button" className="text-base font-bold text-blue-500" onClick={onClose}>
            キャンセル
          </button>
          <div className="text-sm font-bold text-slate-500">{picker.title}</div>
          <button type="button" className="text-base font-bold text-blue-500" onClick={onClose}>
            完了
          </button>
        </div>
        <div className="relative h-[56vh] overflow-y-auto px-5 py-[22vh] [scroll-snap-type:y_mandatory]">
          {picker.options.map((option) => {
            const isPressed = pressedPickerValue === option.value;
            const isSelected = option.value === picker.value;
            return (
              <button
                key={option.value}
                type="button"
                onPointerDown={() => setPressedPickerValue(option.value)}
                onClick={() => {
                  setPressedPickerValue(option.value);
                  window.setTimeout(() => {
                    picker.onSelect(option.value);
                    onClose();
                    setPressedPickerValue(null);
                  }, 140);
                }}
                className={`block h-14 w-full scroll-mt-[22vh] [scroll-snap-align:center] truncate rounded-xl text-center text-[22px] font-bold leading-[56px] transition-colors ${isPressed ? 'bg-blue-500/25 text-blue-700' : isSelected ? 'bg-blue-500/10 text-blue-600' : 'text-slate-400'}`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

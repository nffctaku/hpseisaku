"use client";

// 選手選択などで使うモバイル風ホイールピッカーの共通モーダル。
// event-form（新しいイベントを追加）と ocr-review-panel（読み取り確認）で
// 同じ操作・文言になるよう共有する。

import { useEffect, useRef, useState } from 'react';

export interface PickerOption {
  value: string;
  label: string;
  /** ラベル左側に表示する画像（チームロゴ等。任意） */
  iconUrl?: string;
}

export interface PickerRequest {
  title: string;
  value: string;
  options: PickerOption[];
  onSelect: (value: string) => void;
  /** 'sheet' は通常のリスト形式、未指定はホイールピッカー */
  variant?: 'wheel' | 'sheet';
  /** false の場合、選択後も自動で閉じない */
  autoClose?: boolean;
}

/**
 * ピッカー内の現在値（data-picker-selected="true"）を
 * scroll-snap の中央選択位置までスクロールする。
 * scroll-margin（scroll-mt-[22vh]）を考慮して
 * 「ユーザーが実際にスクロールして選ぶ位置」と同じ場所に止める。
 */
export function scrollPickerToValue(container: HTMLElement | null) {
  if (!container) return;
  const selected = container.querySelector<HTMLElement>('[data-picker-selected="true"]');
  if (!selected) return;
  const scrollMt = parseFloat(getComputedStyle(selected).scrollMarginTop) || 0;
  const marginBoxTop = selected.offsetTop - scrollMt;
  const marginBoxHeight = selected.offsetHeight + scrollMt;
  container.scrollTop = marginBoxTop + marginBoxHeight / 2 - container.clientHeight / 2;
}

interface MobilePickerModalProps {
  picker: PickerRequest | null;
  onClose: () => void;
  /** true の場合はモバイル幅でのみ表示（イベント追加フォームの既存挙動） */
  mobileOnly?: boolean;
}

export function MobilePickerModal({ picker, onClose, mobileOnly = false }: MobilePickerModalProps) {
  const [pressedPickerValue, setPressedPickerValue] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // ピッカーを開いた時点で現在値を中央の選択位置にする（0件目起点にしない）
  useEffect(() => {
    if (!picker || picker.variant === 'sheet') return;
    scrollPickerToValue(scrollRef.current);
  }, [picker]);

  if (!picker) return null;

  const isSheet = picker.variant === 'sheet';

  return (
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center bg-black/60 px-4${mobileOnly ? ' sm:hidden' : ''}`}
      onClick={onClose}
    >
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl sm:rounded-[28px]" onClick={(e) => e.stopPropagation()}>
        <div className="flex h-12 items-center justify-between border-b border-slate-200 bg-white px-4">
          <button type="button" className="text-base font-bold text-blue-600" onClick={onClose}>
            キャンセル
          </button>
          <div className="text-sm font-bold text-slate-800">{picker.title}</div>
          <button type="button" className="text-base font-bold text-blue-600" onClick={onClose}>
            完了
          </button>
        </div>
        <div
          ref={scrollRef}
          className={
            isSheet
              ? 'max-h-[70vh] overflow-y-auto px-0 py-2'
              : 'relative h-[56vh] overflow-y-auto px-5 py-[22vh] [scroll-snap-type:y_mandatory]'
          }
        >
          {picker.options.map((option) => {
            const isPressed = pressedPickerValue === option.value;
            const isSelected = option.value === picker.value;
            return (
              <button
                key={option.value}
                type="button"
                data-picker-selected={isSelected ? "true" : undefined}
                onPointerDown={() => setPressedPickerValue(option.value)}
                onClick={() => {
                  setPressedPickerValue(option.value);
                  window.setTimeout(() => {
                    picker.onSelect(option.value);
                    if (picker.autoClose !== false) {
                      onClose();
                    }
                    setPressedPickerValue(null);
                  }, 120);
                }}
                className={
                  isSheet
                    ? `flex h-12 w-full items-center gap-3 px-4 text-left text-base font-medium transition-colors ${
                        isPressed
                          ? 'bg-blue-100 text-blue-900'
                          : isSelected
                            ? 'bg-blue-50 text-blue-800'
                            : 'text-slate-900 hover:bg-slate-100'
                      }`
                    : `flex h-14 w-full scroll-mt-[22vh] items-center justify-center gap-2 [scroll-snap-align:center] rounded-xl px-3 text-center text-[22px] font-bold leading-[56px] transition-colors ${
                        isPressed ? 'bg-blue-500/25 text-blue-700' : isSelected ? 'bg-blue-500/10 text-blue-600' : 'text-slate-600'
                      }`
                }
              >
                {option.iconUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={option.iconUrl} alt="" className={isSheet ? 'h-6 w-6 shrink-0 rounded-full object-contain' : 'h-8 w-8 shrink-0 rounded-full object-contain'} />
                )}
                <span className="truncate">{option.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// イベント画像（イベント一覧画面）専用の前処理。
// 中央のタイムライン領域だけを割合で切り出して2倍拡大し、
// 小さい時刻数字・イベントアイコンの読み取り精度を上げる。
// 元画像・Firestore保存画像は変更しない（API送信バッファのみ加工）。
// 失敗時は例外にせず元画像をそのまま返す。

import sharp from 'sharp';

// FC27イベント画面のタイムライン領域（実機画像で検証済みの割合）
const CROP = { left: 0.26, top: 0.24, width: 0.5, height: 0.7 };
const SCALE = 2;
const JPEG_QUALITY = 95;

export interface PreprocessedImage {
  image: string;
  imageType: string;
}

/**
 * events種別の画像をタイムライン領域にクロップして拡大する。
 * 戻り値はAPI送信用の { base64, mediaType }。失敗時は入力をそのまま返す。
 */
export async function preprocessEventsImage(
  imageBase64: string,
  imageType: string
): Promise<PreprocessedImage> {
  try {
    const input = Buffer.from(imageBase64, 'base64');
    const meta = await sharp(input).metadata();
    const w = meta.width;
    const h = meta.height;
    if (!w || !h) throw new Error('no_dimensions');
    // 画像の向き・寸法を取得してから割合で切り出す（固定ピクセル座標は使わない）
    const left = Math.round(w * CROP.left);
    const top = Math.round(h * CROP.top);
    const cw = Math.min(Math.round(w * CROP.width), w - left);
    const ch = Math.min(Math.round(h * CROP.height), h - top);
    if (cw <= 0 || ch <= 0) throw new Error('empty_crop');

    const out = await sharp(input)
      .extract({ left, top, width: cw, height: ch })
      .resize(cw * SCALE, ch * SCALE, { kernel: 'lanczos3' })
      .jpeg({ quality: JPEG_QUALITY })
      .toBuffer();

    console.log(
      `[ocr-preprocess] events ok: src=${w}x${h}(${input.length}B) -> out=${cw * SCALE}x${ch * SCALE}(${out.length}B)`
    );
    return { image: out.toString('base64'), imageType: 'image/jpeg' };
  } catch (e) {
    console.log(`[ocr-preprocess] events fallback: ${e instanceof Error ? e.message : e}`);
    return { image: imageBase64, imageType };
  }
}

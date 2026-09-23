import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { preprocessEventsImage } from './ocr-image-preprocess';

test('events前処理: タイムライン領域を割合で切り出し2倍拡大する', async () => {
  // 1706x960の合成画像（実機096と同寸）
  const src = await sharp({
    create: { width: 1706, height: 960, channels: 3, background: { r: 30, g: 30, b: 40 } },
  }).jpeg().toBuffer();
  const out = await preprocessEventsImage(src.toString('base64'), 'image/jpeg');
  assert.equal(out.imageType, 'image/jpeg');
  const meta = await sharp(Buffer.from(out.image, 'base64')).metadata();
  // crop: 26%-76% x (50%), 24%-94% y (70%) → 2x
  assert.equal(meta.width, Math.round(1706 * 0.5) * 2);
  assert.equal(meta.height, Math.round(960 * 0.7) * 2);
});

test('events前処理: 縦長・小さい画像でも割合で切り出す（固定ピクセル非依存）', async () => {
  const src = await sharp({
    create: { width: 500, height: 1000, channels: 3, background: { r: 10, g: 20, b: 30 } },
  }).png().toBuffer();
  const out = await preprocessEventsImage(src.toString('base64'), 'image/png');
  const meta = await sharp(Buffer.from(out.image, 'base64')).metadata();
  assert.equal(meta.width, Math.round(500 * 0.5) * 2);
  assert.equal(meta.height, Math.round(1000 * 0.7) * 2);
});

test('events前処理: 破損入力は例外にせず元画像へフォールバック', async () => {
  const garbage = Buffer.from('not an image').toString('base64');
  const out = await preprocessEventsImage(garbage, 'image/png');
  assert.equal(out.image, garbage);
  assert.equal(out.imageType, 'image/png');
});

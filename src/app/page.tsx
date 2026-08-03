"use client";

import Link from "next/link";
import Image from "next/image";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <main className="flex-grow">
        <section className="relative overflow-hidden">
          <div className="relative w-screen left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] bg-[#0b1220] text-slate-100 overflow-hidden">
            <Image
              src="/背景スタジアム１.png"
              alt=""
              fill
              priority
              className="object-cover object-center opacity-85 sm:opacity-55"
              sizes="100vw"
            />
            <div className="absolute inset-0 bg-[#07101f]/20 sm:bg-[#07101f]/55" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_42%_18%,rgba(52,211,153,0.12),transparent_30%),linear-gradient(90deg,rgba(7,16,31,0.70)_0%,rgba(7,16,31,0.46)_48%,rgba(7,16,31,0.64)_100%)]" />
            <div className="absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.05)_1px,transparent_1px)] bg-[size:96px_96px]" />
            <div className="absolute inset-x-0 top-0 h-px bg-slate-700/40" />
            <header className="relative z-10 mx-auto flex h-[58px] max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
              <Link href="/" className="flex shrink-0 items-center gap-2 font-black tracking-tight text-white">
                <Image
                  src="/favicon.png"
                  alt="FootChron"
                  width={28}
                  height={28}
                  className="h-7 w-7 rounded-full object-contain"
                />
                <span>FootChron</span>
              </Link>
              <nav className="hidden items-center gap-9 text-sm font-medium text-slate-400 lg:flex">
                <a href="#features" className="hover:text-white transition-colors">機能</a>
                <a href="#pricing" className="hover:text-white transition-colors">料金</a>
                <a href="#faq" className="hover:text-white transition-colors">よくある質問</a>
              </nav>
              <div className="flex shrink-0 items-center gap-3 text-sm font-semibold sm:gap-6">
                <Link href="/admin" className="hidden text-slate-400 hover:text-white transition-colors sm:inline">ログイン</Link>
                <Link href="/admin" className="rounded-md bg-emerald-400 px-4 py-2 text-xs text-[#06111f] hover:bg-emerald-300 transition-colors sm:px-5 sm:py-2.5 sm:text-sm">無料で始める</Link>
              </div>
            </header>
            <div className="relative z-10 mx-auto flex min-h-[620px] max-w-7xl flex-col items-start justify-center px-5 pb-14 pt-10 text-left sm:min-h-[560px] sm:px-6 sm:pb-16 sm:pt-14">
              <div className="mb-7 inline-flex max-w-full items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1.5 text-[11px] font-bold text-emerald-300 shadow-[0_0_40px_rgba(52,211,153,0.18)] sm:mb-9 sm:px-4 sm:text-xs">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                サッカー・フットサルチームのための管理ツール
              </div>
              <h1 className="max-w-6xl text-[clamp(2.6rem,10.6vw,5.5rem)] font-black leading-[1.08] tracking-[-0.055em] text-slate-100 drop-shadow-2xl sm:text-[clamp(3.6rem,6.2vw,5.5rem)] sm:leading-[1.02] sm:tracking-[-0.08em]">
                セーブデータを、<br />
                公式サイト級の<br />
                <span className="text-emerald-400">クラブページに。</span>
              </h1>
              <p className="mt-7 max-w-3xl text-sm font-medium leading-7 text-slate-300 drop-shadow-lg sm:mt-8 sm:text-xl sm:leading-9">
                サッカー・フットサルのシミュレーションゲームで積み上げたセーブデータを、そのまま可視化。順位表も、試合結果も、まるで本当のクラブのように。実チームの記録管理にも使えます。
              </p>
              <div className="mt-8 flex w-full flex-col gap-3 sm:mt-9 sm:w-auto sm:flex-row sm:items-center sm:gap-4">
                <Link href="/admin" className="rounded-xl bg-emerald-400 px-6 py-3.5 text-center text-sm font-black text-[#06111f] shadow-lg shadow-emerald-950/20 hover:bg-emerald-300 transition-colors sm:px-8 sm:py-4 sm:text-base">
                  無料でチームを作成する →
                </Link>
              </div>
            </div>
          </div>

          <div className="relative w-screen left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] bg-[#08111f] px-4 py-8 text-white sm:px-6 sm:py-14 sm:py-16">
            <div className="mx-auto max-w-5xl">
              <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:mb-10">
                <div>
                  <p className="text-xs font-black tracking-[0.18em] text-emerald-400 sm:text-sm">NEWS</p>
                  <h2 className="mt-2 text-2xl font-black tracking-[-0.06em] text-white sm:mt-3 sm:text-3xl sm:text-5xl">
                    運営からのお知らせ
                  </h2>
                </div>
                <Link href="/updates" className="text-xs font-black text-emerald-400 transition-colors hover:text-emerald-300 sm:text-sm">
                  一覧を見る →
                </Link>
              </div>

              <div className="divide-y divide-slate-800/90 border-y border-slate-800/90">
                <article className="grid gap-3 py-4 sm:grid-cols-[120px_1fr] sm:gap-7 sm:py-8">
                  <time className="font-mono text-xs text-sky-300/55 sm:text-sm">2026.08.03</time>
                  <div>
                    <span className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-black bg-blue-500/15 text-blue-300 sm:px-3 sm:py-1 sm:text-xs">
                      改善
                    </span>
                    <h3 className="mt-2 text-sm font-black leading-snug tracking-[-0.03em] text-white sm:mt-3 sm:text-lg sm:text-xl">
                      トップページのモバイル表示を改善
                    </h3>
                    <p className="mt-2 text-xs font-medium leading-6 text-slate-400 sm:mt-3 sm:text-sm sm:leading-7 sm:text-base">
                      UIを一新しました。
                    </p>
                  </div>
                </article>
                <article className="grid gap-3 py-4 sm:grid-cols-[120px_1fr] sm:gap-7 sm:py-8">
                  <time className="font-mono text-xs text-sky-300/55 sm:text-sm">2026.07.28</time>
                  <div>
                    <span className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-black bg-emerald-500/15 text-emerald-300 sm:px-3 sm:py-1 sm:text-xs">
                      新機能
                    </span>
                    <h3 className="mt-2 text-sm font-black leading-snug tracking-[-0.03em] text-white sm:mt-3 sm:text-lg sm:text-xl">
                      選手名鑑の出力機能をリリースしました
                    </h3>
                    <p className="mt-2 text-xs font-medium leading-6 text-slate-400 sm:mt-3 sm:text-sm sm:leading-7 sm:text-base">
                      選手プロフィール・スタッフ・写真をまとめた名鑑を、管理画面から直接出力できるようになりました。
                    </p>
                  </div>
                </article>
                <article className="grid gap-3 py-4 sm:grid-cols-[120px_1fr] sm:gap-7 sm:py-8">
                  <time className="font-mono text-xs text-sky-300/55 sm:text-sm">2026.07.10</time>
                  <div>
                    <span className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-black bg-blue-500/15 text-blue-300 sm:px-3 sm:py-1 sm:text-xs">
                      改善
                    </span>
                    <h3 className="mt-2 text-sm font-black leading-snug tracking-[-0.03em] text-white sm:mt-3 sm:text-lg sm:text-xl">
                      レーダーチャートの項目をカスタマイズできるようになりました
                    </h3>
                    <p className="mt-2 text-xs font-medium leading-6 text-slate-400 sm:mt-3 sm:text-sm sm:leading-7 sm:text-base">
                      表示するスタッフ項目を大会ごとに自由に設定できるようになりました。
                    </p>
                  </div>
                </article>
              </div>
            </div>
          </div>

          <div className="container mx-auto bg-[#08111f] px-0 pt-0 pb-0">
            <div className="max-w-none mx-auto bg-[#08111f]">
              <div id="features" className="relative w-screen left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] overflow-hidden bg-[#0a2f1d] text-white">
                <div className="absolute inset-0 bg-[linear-gradient(rgba(74,222,128,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(74,222,128,0.08)_1px,transparent_1px)] bg-[size:120px_120px]" />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(34,197,94,0.30),transparent_32%),linear-gradient(180deg,rgba(22,163,74,0.56),rgba(5,46,22,0.92))]" />
                <div className="relative mx-auto max-w-7xl px-6 py-16 sm:py-20">
                  <div className="max-w-3xl">
                    <p className="text-sm font-black text-emerald-300">機能</p>
                    <h2 className="mt-4 text-2xl font-black leading-tight tracking-[-0.06em] text-white sm:text-4xl lg:text-5xl">
                      チーム運営に必要なものが<br />
                      すべて揃っている
                    </h2>
                  </div>

                  <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {[
                            {
                              number: '01',
                              label: '公式サイト作成',
                              title: 'クラブ専用サイトを\n即時公開',
                              body: 'コーディング不要。チーム情報を入力するだけで、プロ品質のクラブ公式サイトが完成。',
                              icon: 'M4 5h16v14H4z M8 9h4v6H8z M14 9h3 M14 13h3',
                            },
                            {
                              number: '02',
                              label: 'スタッフ管理',
                              title: '試合・シーズン単位の\n選手スタッフ管理',
                              body: '得点・アシスト・出場時間を記録。シーズンをまたいだ個人成長が一覧で確認できます。',
                              icon: 'M6 20V10 M12 20V4 M18 20v-8',
                            },
                            {
                              number: '03',
                              label: '順位表・試合結果',
                              title: '順位表も試合結果も\n自動で整理',
                              body: '入力したスコアから順位表を更新。節ごとの試合カードもクラブページに反映されます。',
                              icon: 'M4 13a8 8 0 1 0 8-8v8z M12 5a8 8 0 0 1 8 8h-8z',
                            },
                            {
                              number: '04',
                              label: 'チーム分析',
                              title: 'シーズン比較・対戦相手別\n戦績をグラフ化',
                              body: '勝敗・得失点の推移、対戦相手ごとの傾向が自動でグラフになります。',
                              icon: 'M4 19h16 M7 15l3-3 3 2 4-6 M7 9h.01 M13 9h.01 M19 9h.01',
                            },
                            {
                              number: '05',
                              label: 'チーム広報',
                              title: 'ニュースも動画も、\nまとめて発信',
                              body: '記事の作成から外部リンク・動画の埋め込みまで。チームの最新情報を、公式サイトのように発信できます。',
                              icon: 'M21 11.5a8.5 8.5 0 0 1-9.8 8.4L5 21l1.7-4.6A8.5 8.5 0 1 1 21 11.5z',
                            },
                            {
                              number: '06',
                              label: '選手名鑑',
                              title: '選手名鑑を、\nワンクリックで自動生成',
                              body: 'プロフィール・スタッフ・写真を自動でまとめ、本格的な名鑑に。入力の手間なく、印刷してすぐ配布できます。',
                              icon: 'M7 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M3 21a4 4 0 0 1 8 0 M17 11a3 3 0 1 0 0-6 M14 21a4 4 0 0 1 7 0',
                            },
                          ].map((feature) => (
                      <article key={feature.number} className="group relative overflow-hidden rounded-2xl bg-emerald-50/95 p-7 text-slate-950 shadow-[0_22px_70px_rgba(2,6,23,0.20)] ring-1 ring-white/20 transition-all duration-300 hover:shadow-[0_30px_80px_rgba(2,6,23,0.30)] hover:-translate-y-2">
                        <div className="absolute right-4 top-1 text-7xl font-black leading-none text-emerald-200/60">{feature.number}</div>
                        <div className="relative z-10">
                          <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-200/70 text-emerald-700">
                            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d={feature.icon} />
                            </svg>
                          </div>
                          <p className="text-xs font-black tracking-wide text-emerald-700">{feature.label}</p>
                          <h3 className="mt-2 whitespace-pre-line text-xl font-black leading-snug tracking-[-0.03em] text-slate-950">{feature.title}</h3>
                          <p className="mt-4 text-sm font-medium leading-7 text-slate-600">{feature.body}</p>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              </div>

              <div className="relative w-screen left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] overflow-hidden border-t-4 border-emerald-500 bg-[#08111f] text-white">
                <div className="absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.08)_1px,transparent_1px)] bg-[size:128px_128px]" />
                <div className="absolute inset-0 opacity-[0.10]">
                  <div className="absolute left-[5%] top-[26%] h-[190px] w-[155px] border-4 border-white/80" />
                  <div className="absolute left-[11%] top-[41%] h-[112px] w-[70px] border-4 border-white/80" />
                  <div className="absolute left-[20%] top-[29%] h-[180px] w-[120px] rounded-r-full border-4 border-l-0 border-white/80" />
                  <div className="absolute left-1/2 top-[28%] h-[170px] w-[170px] -translate-x-1/2 rounded-full border-4 border-white/80" />
                  <div className="absolute right-[5%] top-[26%] h-[190px] w-[155px] border-4 border-white/80" />
                  <div className="absolute right-[11%] top-[41%] h-[112px] w-[70px] border-4 border-white/80" />
                  <div className="absolute right-[20%] top-[29%] h-[180px] w-[120px] rounded-l-full border-4 border-r-0 border-white/80" />
                </div>
                <div className="relative mx-auto max-w-7xl px-6 py-20 sm:py-24">
                  <div className="text-center">
                    <p className="text-sm font-black text-emerald-400">使い方</p>
                    <h2 className="mt-3 text-4xl font-black tracking-[-0.06em] text-slate-100 sm:text-5xl">
                      4ステップで、<br className="sm:hidden" />
                      今日から始められる
                    </h2>
                  </div>

                  <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
                    {[
                      {
                        number: '01',
                        title: 'マイページを作成',
                        body: 'アカウント作成でログイン。チーム名とエンブレムを登録',
                      },
                      {
                        number: '02',
                        title: '選手・大会登録',
                        body: '選手を登録し、大会作成や試合カード登録すれば準備完了。CSVで一括登録も対応',
                      },
                      {
                        number: '03',
                        title: 'HPを公開',
                        body: '管理画面の登録内容をすぐ確認可能。公開はURL共有でいつでも簡単に。',
                      },
                      {
                        number: '04',
                        title: '記録を更新',
                        body: '試合後にスコアやスタッツ入力することでデータは自動集計され公開HPにも瞬時に反映。',
                      },
                    ].map((step, index, steps) => (
                      <article key={step.number} className="relative overflow-hidden rounded-xl border border-slate-700/70 bg-slate-950/30 p-5 backdrop-blur-sm">
                        {index < steps.length - 1 ? <div className="absolute left-[calc(100%-1px)] top-1/2 hidden h-px w-6 bg-emerald-500/40 lg:block" /> : null}
                        <div className="absolute right-5 top-4 text-6xl font-black italic leading-none text-emerald-500/20">{step.number}</div>
                        <div className="relative z-10 pt-14">
                          <h3 className="text-lg font-black text-white">{step.title}</h3>
                          <p className="mt-3 text-sm font-medium leading-7 text-slate-400">{step.body}</p>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-6 hidden">
                <div className="sm:hidden relative w-screen left-1/2 -ml-[50vw] bg-zinc-900 text-white">
                  <div className="mx-auto max-w-5xl px-6 py-6 text-center">
                    <div className="text-lg font-bold">LINE登録で、最新情報をすぐゲット！</div>
                    <div className="mt-2 text-sm text-white/90">アップデート情報をLINEでお届け</div>

                    <a
                      href="https://lin.ee/0IxYvaa"
                      target="_blank"
                      rel="noreferrer"
                      className="mt-5 inline-flex items-center justify-center gap-2 bg-[#21c45a] text-white font-semibold rounded-full h-12 px-8"
                    >
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-white text-[#21c45a] text-[10px] font-bold">
                        LINE
                      </span>
                      <span>LINE登録する</span>
                    </a>
                  </div>
                </div>

                <div className="hidden sm:hidden relative w-screen left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] bg-zinc-900 text-white">
                  <div className="mx-auto max-w-5xl px-6 py-6 text-center">
                    <div className="text-lg font-bold">LINE登録で、最新情報をすぐゲット！</div>
                    <div className="mt-2 text-sm text-white/90">アップデート情報をLINEでお届け</div>

                    <a
                      href="https://lin.ee/0IxYvaa"
                      target="_blank"
                      rel="noreferrer"
                      className="mt-5 inline-flex items-center justify-center gap-2 bg-[#21c45a] text-white font-semibold rounded-full h-12 px-8"
                    >
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-white text-[#21c45a] text-[10px] font-bold">
                        LINE
                      </span>
                      <span>LINE登録する</span>
                    </a>
                  </div>
                </div>
              </div>

              {/* Plan Cards */}
              <div className="relative w-screen left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] bg-slate-950 py-12">
                <div className="mx-auto max-w-4xl px-6">
                  <div className="grid gap-6 md:grid-cols-2">
                  {/* Free Card */}
                  <div className="relative rounded-xl border border-slate-700/70 bg-slate-900/50 p-6 shadow-lg backdrop-blur-sm">
                    <div className="flex items-center justify-between mb-2">
                      <h2 className="text-[14px] font-semibold text-white">Free プラン</h2>
                      <p className="text-[20px] font-semibold text-white">月額 0円</p>
                    </div>
                    <p className="text-[11px] text-slate-400 mb-6">まずは無料で始められます</p>

                    <ul className="space-y-3 mb-6">
                      <li className="flex items-start gap-2">
                        <svg className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="text-sm text-slate-300">選手登録 30名まで（1シーズン）</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <svg className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="text-sm text-slate-300">選手画像登録 20名まで（1シーズン）</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <svg className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="text-sm text-slate-300">チーム画像登録 20枚まで</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <svg className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="text-sm text-slate-300">チーム登録数 無制限</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <svg className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="text-sm text-slate-300">大会作成 3つまで（1シーズン）</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <svg className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="text-sm text-slate-300">選手名鑑生成 A4ver</span>
                      </li>
                    </ul>

                    <Link
                      href="/admin"
                      className="block w-full text-center py-3 rounded-md bg-slate-800 text-white font-semibold hover:bg-slate-700 transition-colors"
                    >
                      無料で始める
                    </Link>
                  </div>

                  {/* Pro Card */}
                  <div className="relative rounded-xl border border-emerald-500/50 bg-slate-900/50 p-6 shadow-lg backdrop-blur-sm">
                    <div className="absolute -top-3 left-4">
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500 text-white">
                        おすすめ
                      </span>
                    </div>

                    <div className="flex items-center justify-between mb-2">
                      <h2 className="text-[14px] font-semibold text-white">Pro プラン</h2>
                      <p className="text-[20px] font-semibold text-emerald-400">月額 380円</p>
                    </div>
                    <p className="text-[11px] text-slate-400 mb-6">チーム運営を本格的にサポート</p>

                    <ul className="space-y-3 mb-6">
                      <li className="flex items-start gap-2">
                        <svg className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="text-sm text-slate-300">選手登録 50名まで（1シーズン）</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <svg className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="text-sm text-slate-300">選手画像登録 50枚まで（1シーズン）</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <svg className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="text-sm text-slate-300">チーム登録数 無制限</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <svg className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="text-sm text-slate-300">チーム画像登録 無制限</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <svg className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="text-sm text-slate-300">大会作成 無制限</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <svg className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="text-sm text-slate-300">選手名鑑生成 フル機能</span>
                      </li>
                    </ul>

                    <Link
                      href="/admin"
                      className="block w-full text-center py-3 rounded-md bg-emerald-500 text-white font-semibold hover:bg-emerald-400 transition-colors"
                    >
                      Proで始める
                    </Link>
                  </div>
                </div>
                </div>
              </div>

              <div className="relative w-screen left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] bg-[#08111f] px-6 py-20 text-white sm:py-24">
                <div className="mx-auto max-w-4xl">
                  <div className="text-center">
                    <p className="text-sm font-black tracking-widest text-emerald-400">FAQ</p>
                    <h2 className="mt-4 text-4xl font-black tracking-[-0.06em] text-slate-100 sm:text-5xl">
                      よくある質問
                    </h2>
                  </div>

                  <div className="mt-12 space-y-3">
                    {[
                      {
                        question: 'Q1. 対応しているゲームはありますか?',
                        answer: '特定のゲームタイトルとの公式連携は行っておりません。サッカー・フットサル系のシミュレーションゲームで作成したチームデータを、ご自身で入力・登録していただくことで、公式サイト風のクラブページとして可視化できます。',
                      },
                      {
                        question: 'Q2. 実際のサッカー・フットサルチームでも使えますか?',
                        answer: 'はい、ご利用いただけます。もともとはゲームデータの可視化を目的としたサービスですが、選手名鑑・試合結果・順位表の管理機能は、実際のチーム運営における記録管理としてもそのままお使いいただけます。',
                      },
                      {
                        question: 'Q3. 実在するクラブや大会と提携しているのですか?',
                        answer: 'いいえ、実在する特定のクラブ・リーグ・大会とは提携しておりません。あくまでユーザー様ご自身のチーム・記録を、公式サイトのようなデザインで表示・管理するためのツールです。',
                      },
                      {
                        question: 'Q4. 無料プランでどこまで使えますか?',
                        answer: '基本的な記録管理機能(選手登録・試合結果の入力・順位表の自動生成)は無料でご利用いただけます。登録できるクラブや選手、画像数、選手名鑑の自動生成など一部機能は有料プランでのご提供となります。',
                      },
                    ].map((item) => (
                      <details key={item.question} className="group rounded-xl border border-slate-700/70 bg-slate-950/30 px-5 py-4 backdrop-blur-sm">
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-black text-slate-100 sm:text-base">
                          <span>{item.question}</span>
                          <span className="text-emerald-400 transition-transform group-open:rotate-180">⌄</span>
                        </summary>
                        <p className="mt-4 text-sm font-medium leading-7 text-slate-400">{item.answer}</p>
                      </details>
                    ))}
                  </div>
                </div>
              </div>

              <div className="relative w-screen left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] bg-[#08111f] py-8">
                <div className="mx-auto flex justify-center">
                  <a
                    href="https://x.com/footchron_hp?s=20"
                    target="_blank"
                    rel="noreferrer"
                    aria-label="公式X"
                    className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-slate-900 text-white hover:bg-slate-800 transition-colors"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                    </svg>
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-[#08111f] text-zinc-100 mt-0">
        <div className="mx-auto max-w-5xl px-6 py-10">
          <div className="text-left">
            <div className="flex flex-col gap-3 text-sm text-zinc-200">
              <Link href="/privacy" className="hover:text-white transition-colors">
                プライバシーポリシー
              </Link>
              <Link href="/terms" className="hover:text-white transition-colors">
                利用規約（ユーザー）
              </Link>
              <Link href="/tokusho" className="hover:text-white transition-colors">
                特定商取引法に基づく表記
              </Link>
            </div>
          </div>

          <div className="mt-10 border-t border-zinc-800 pt-6 text-center text-xs text-zinc-400">
            &copy; 2024-{new Date().getFullYear()} 株式会社Loco All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}

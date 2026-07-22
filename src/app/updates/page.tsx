import Link from "next/link";

const updates = [
  {
    date: "2026年7月22日",
    title: "アップデートのお知らせ",
    description: [
      "日頃よりFootChronをご利用いただきありがとうございます。今回、管理画面・公開ページの両方にわたる大型アップデートを実施しましたのでお知らせします。",
      "",
      "管理画面の改善",
      "クラブ情報設定ページを全面リニューアル",
      "クラブの基本情報を設定する画面をゼロから見直しました。",
      "「クラブ設定」「SNSリンク」をタブで切り替えられるように整理",
      "「基本設定」「クラブ詳細」「タイトル管理」など、項目ごとに迷わず入力できる構成に変更",
      "選択肢はカード形式で見やすく、公開・非公開はスイッチひとつで簡単に切り替えられるようになりました",
      "SNSリンクの設定をより使いやすく",
      "SNSアカウントのリンク設定画面も、見やすさと操作性を改善しました。",
      "練習試合(フレンドリーマッチ)管理を改善",
      "より見やすいデザインに変更",
      "対戦相手などを自由に入力できるオプションを追加",
      "スマホでも見やすいレイアウトに対応",
      "選手名鑑(A3)作成機能を大幅にアップデート",
      "選手名鑑エディターを、初めての方でも迷わず作れるように改善しました。",
      "作成の手順が一目でわかる「ステップ表示」を追加",
      "スマートフォンでの操作を優先した使いやすい画面に",
      "カードの配置がより自由に、見やすく調整できるようになりました",
      "その他、選手情報の入力・管理画面も細かく改善しています。",
      "",
      "公開ページ(チームサイト)の改善",
      "チームサイトを見に来てくれるファンの方にとっても、より見やすいサイトになりました。",
      "シーズン成績・選手登録フォームの表示を改善",
      "クラブページ、ニュース、試合結果、選手一覧、順位表、移籍情報など、各ページの表示を細かく調整",
      "試合一覧の表示方法をアップデート",
      "",
      "トップページのリニューアル",
      "FootChronのトップページも見やすく生まれ変わりました。",
      "メインビジュアルの画像を差し替え、自動で切り替わるスライド表示に対応",
      "「始める」ボタンをより目立つデザインに変更",
      "お知らせ表示をコンパクトにし、他の情報が見やすくなりました",
      "",
      "不具合修正",
      "公開ページで選手の成績が正しく集計・表示されない場合がある問題を修正しました",
      "",
      "今後もFootChronをより使いやすいサービスにしていくため、アップデートを続けてまいります。ご意見・ご要望がございましたら、お気軽にお問い合わせください。",
    ],
  },
];

export default function UpdatesPage() {
  return (
    <div className="min-h-screen bg-gray-900 text-gray-100">
      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <div className="mb-8">
          <Link
            href="/"
            className="text-sm text-gray-400 hover:text-gray-100 transition-colors"
          >
            ← トップに戻る
          </Link>
        </div>

        <h1 className="text-3xl font-bold mb-2">アップデート情報</h1>
        <p className="text-gray-400 mb-8">
          FootChronの最新のアップデート情報をお知らせします
        </p>

        <div className="space-y-8">
          {updates.map((update, index) => (
            <div
              key={index}
              className="border border-gray-700 rounded-lg p-6 bg-gray-800"
            >
              <div className="text-sm text-gray-400 mb-2">
                {update.date}
              </div>
              <h2 className="text-xl font-bold mb-4">{update.title}</h2>
              <ul className="space-y-2">
                {update.description.map((item, itemIndex) => (
                  <li key={itemIndex} className="text-sm text-gray-300 flex items-start">
                    <span className="text-gray-500 mr-2">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

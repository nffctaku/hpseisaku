export default function TokushoPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="container mx-auto px-4 py-10 max-w-3xl">
        <h1 className="text-2xl md:text-3xl font-bold mb-6">特定商取引法に基づく表記</h1>
        <div className="space-y-4 text-sm">
          <div>
            <h2 className="font-semibold mb-1">販売業者</h2>
            <p>株式会社Loco</p>
          </div>
          <div>
            <h2 className="font-semibold mb-1">運営責任者</h2>
            <p>代表取締役　石井 巧真</p>
          </div>
          <div>
            <h2 className="font-semibold mb-1">所在地</h2>
            <p>〒104-0061</p>
            <p>東京都中央区銀座1丁目12番4号 N＆E BLD. 7階</p>
          </div>
          <div>
            <h2 className="font-semibold mb-1">お問い合わせ先</h2>
            <p>
              お問い合わせフォーム：
              <a
                href="https://www.locofootball.com/contact"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline-offset-2 hover:underline"
              >
                https://www.locofootball.com/contact
              </a>
            </p>
            <p>※電話番号については、お問い合わせいただいた場合、遅滞なく開示いたします。</p>
          </div>
          <div>
            <h2 className="font-semibold mb-1">販売価格</h2>
            <p>月額 380円（税込）</p>
          </div>
          <div>
            <h2 className="font-semibold mb-1">お支払い方法</h2>
            <p>クレジットカード（Stripe）</p>
            <p>※他の決済方法を追加する場合は別途記載</p>
          </div>
          <div>
            <h2 className="font-semibold mb-1">サービス提供時期</h2>
            <p>決済完了後、即時にご利用可能となります。</p>
          </div>
          <div>
            <h2 className="font-semibold mb-1">返品・キャンセルについて</h2>
            <p>
              サービスの性質上、決済完了後の返金・キャンセルはお受けいたしかねます。ただし、当社が特別に認めた場合を除きます。
            </p>
          </div>
          <div>
            <h2 className="font-semibold mb-1">動作環境</h2>
            <p>最新バージョンの主要ブラウザ、またはスマートフォンOSに対応（詳細はサービスページに記載）</p>
          </div>
          <div>
            <h2 className="font-semibold mb-1">事業内容</h2>
            <p>観戦記アプリケーションの開発・運営</p>
            <p>サッカーファン向けメディアの運営</p>
            <p>ファンイベントの企画・運営</p>
            <p>HP制作および Web アプリの開発・運営</p>
          </div>
        </div>
      </div>
    </main>
  );
}

export default function TokushoPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="container mx-auto px-4 py-10 max-w-3xl">
        <h1 className="text-2xl md:text-3xl font-bold mb-6">特定商取引法に基づく表記</h1>
        <div className="space-y-5 text-sm leading-relaxed">
          <div>
            <h2 className="font-semibold mb-1">販売業者</h2>
            <p>株式会社Loco</p>
          </div>
          <div>
            <h2 className="font-semibold mb-1">運営責任者</h2>
            <p>代表取締役 石井 巧真</p>
          </div>
          <div>
            <h2 className="font-semibold mb-1">所在地</h2>
            <p>〒104-0061</p>
            <p>東京都中央区銀座1丁目12番4号 N&amp;E BLD. 7階</p>
          </div>
          <div>
            <h2 className="font-semibold mb-1">お問い合わせ先</h2>
            <p>
              お問い合わせフォーム: 
              <a
                href="https://docs.google.com/forms/d/e/1FAIpQLSeu1Yb6hQUtAwdHbrIlaxIL3F_mBgvhDy1KPdAqz728tERXMw/viewform"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline underline-offset-2 hover:no-underline break-all"
              >
                https://docs.google.com/forms/d/e/1FAIpQLSeu1Yb6hQUtAwdHbrIlaxIL3F_mBgvhDy1KPdAqz728tERXMw/viewform
              </a>
            </p>
            <p>※電話番号については、お問い合わせいただいた場合、遅滞なく開示いたします。</p>
          </div>
          <div>
            <h2 className="font-semibold mb-1">事業内容</h2>
            <ul className="space-y-1">
              <li>サッカー・フットサルチーム向け運営管理サービス(FootChron)の開発・運営</li>
              <li>クラブ公式サイトの作成・公開支援</li>
              <li>チーム・大会・選手データの管理システムの提供</li>
              <li>上記に付随するWebアプリケーションの開発・運営</li>
            </ul>
          </div>
          <div>
            <h2 className="font-semibold mb-1">販売価格</h2>
            <p>月額 380円(税込)〜</p>
            <p>※現在提供中のプランに加え、今後複数のプランを追加する予定です。最新の価格・プラン内容は、本サービス内の料金ページをご確認ください。</p>
          </div>
          <div>
            <h2 className="font-semibold mb-1">お支払い方法</h2>
            <p>クレジットカード(Stripe)</p>
            <p>※他の決済方法を追加する場合は別途記載</p>
          </div>
          <div>
            <h2 className="font-semibold mb-1">お支払い時期</h2>
            <p>決済完了日を起算日として、毎月自動的に同日に課金されます(自動更新)。</p>
            <p>※初回登録時は、お申し込み手続き完了時に決済されます。</p>
          </div>
          <div>
            <h2 className="font-semibold mb-1">サービス提供時期</h2>
            <p>決済完了後、即時にご利用可能となります。</p>
          </div>
          <div>
            <h2 className="font-semibold mb-1">中途解約について</h2>
            <ul className="space-y-1">
              <li>ユーザーはいつでも、本サービス内の所定の手続きにより、有料プランの解約(次回更新の停止)を行うことができます。</li>
              <li>解約手続きを行った場合、現在の請求期間の終了日まで有料機能をご利用いただけます。日割りでの返金は行いません。</li>
              <li>解約手続きを行わない限り、有料プランは自動的に更新されます。</li>
            </ul>
          </div>
          <div>
            <h2 className="font-semibold mb-1">返品・キャンセルについて</h2>
            <p>サービスの性質上、決済完了後の返金・キャンセルは原則としてお受けいたしかねます。ただし、以下の場合を除きます。</p>
            <ul className="mt-2 space-y-1">
              <li>当社の重大な過失により、サービスが提供できなかった場合</li>
              <li>二重課金その他決済処理上の誤りがあった場合</li>
              <li>法令上、返金が必要と認められる場合</li>
            </ul>
          </div>
          <div>
            <h2 className="font-semibold mb-1">動作環境</h2>
            <p>最新バージョンの主要ブラウザ、またはスマートフォンOSに対応(詳細はサービスページに記載)</p>
          </div>
        </div>
      </div>
    </main>
  );
}

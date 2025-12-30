import Link from 'next/link';

const TermsPage = () => {
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#e6f7ff] via-[#eaf6ff] to-white text-slate-900 flex flex-col">
      <main className="container mx-auto px-4 py-8 md:py-16">
        <h1 className="text-3xl md:text-4xl font-bold mb-8 text-center">利用規約</h1>
        <div className="prose max-w-4xl mx-auto bg-white/80 border border-sky-200 p-6 md:p-8 rounded-lg shadow-sm">
          <h2 className="text-xl font-bold">第1条（適用）</h2>
          <p>
            本規約は、FHUB（以下「当サービス」）が提供するすべてのサービス利用に関し、ユーザーと運営者の間に適用されます。
          </p>

          <h2 className="text-xl font-bold mt-6">第2条（有料プランと決済）</h2>
          <p>ユーザーは、別途定める有料プランを申し込むことで、追加機能を利用できます。</p>
          <p>利用料金、決済方法、および更新ルールは、当サービス内の価格表示に従うものとします。</p>
          <p>支払済みの料金については、理由の如何を問わず返金を行わないものとします。</p>

          <h2 className="text-xl font-bold mt-6">第3条（ユーザー生成コンテンツ）</h2>
          <p>ユーザーが投稿した選手データ、画像、試合結果等の著作権はユーザー自身に帰属します。</p>
          <p>
            ユーザーは、第三者の肖像権や知的財産権を侵害しない内容を投稿するものとします。万が一トラブルが発生した場合、運営は一切の責任を負いません。
          </p>
          <p>運営が提供するAI生成画像は、本アプリ内での利用に限定されるものとします。</p>

          <h2 className="text-xl font-bold mt-6">第4条（禁止事項）</h2>
          <p>以下の行為を禁止します。</p>
          <ul>
            <li>虚偽のデータの登録。</li>
            <li>他のユーザーへの誹謗中傷や迷惑行為。</li>
            <li>サービスの運営を妨げるような不正アクセス。</li>
          </ul>

          <h2 className="text-xl font-bold mt-6">第5条（免責事項）</h2>
          <p>
            システムの不具合、サーバー障害等によりデータが消失した場合、運営は責任を負いかねます。重要なデータは各自で管理してください。
          </p>
          <p>当サービスは、提供するデータの正確性や完全性を保証するものではありません。</p>

          <h2 className="text-xl font-bold mt-6">第6条（規約の変更）</h2>
          <p>運営が必要と判断した場合、いつでも本規約を変更できるものとします。</p>
        </div>
        <div className="text-center mt-12">
          <Link href="/" className="text-sky-700 hover:text-sky-800 transition-colors underline">
            トップページに戻る
          </Link>
        </div>
      </main>
      <footer className="p-4 md:p-6 text-center text-gray-500 text-sm">
        <p>&copy; {new Date().getFullYear()} Your Club Site. All rights reserved.</p>
      </footer>
    </div>
  );
};

export default TermsPage;

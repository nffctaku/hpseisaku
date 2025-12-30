import Link from 'next/link';

const PrivacyPolicyPage = () => {
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#e6f7ff] via-[#eaf6ff] to-white text-slate-900 flex flex-col">
      <main className="container mx-auto px-4 py-8 md:py-16">
        <h1 className="text-3xl md:text-4xl font-bold mb-8 text-center">プライバシーポリシー</h1>
        <div className="prose max-w-4xl mx-auto bg-white/80 border border-sky-200 p-6 md:p-8 rounded-lg shadow-sm">
          <h2 className="text-xl font-bold">1. 取得する情報</h2>
          <p>当サービスは、以下の情報を取得します。</p>
          <ul>
            <li>アカウント登録時のメールアドレス、ユーザー名</li>
            <li>有料プラン利用時の決済情報（決済代行会社を通じて取得）</li>
            <li>サービス利用履歴、アクセスログ</li>
          </ul>

          <h2 className="text-xl font-bold mt-6">2. 利用目的</h2>
          <p>取得した情報は、以下の目的でのみ利用します。</p>
          <ul>
            <li>ログインおよび本人確認のため</li>
            <li>サービスの提供、維持、改善のため</li>
            <li>有料プランの決済および管理のため</li>
            <li>メンテナンスやお知らせの通知のため</li>
          </ul>

          <h2 className="text-xl font-bold mt-6">3. 第三者提供の禁止</h2>
          <p>当サービスは、法令に基づく場合を除き、ユーザーの同意なく個人情報を第三者に提供することはありません。</p>

          <h2 className="text-xl font-bold mt-6">4. 決済代行サービスの利用</h2>
          <p>
            有料プランの決済には外部の決済代行サービス（Stripe等）を利用します。クレジットカード情報は当サービスのサーバーには保存されず、決済代行会社のポリシーに従って管理されます。
          </p>

          <h2 className="text-xl font-bold mt-6">5. 情報の開示・訂正</h2>
          <p>
            ユーザーは、自身の個人情報の照会・訂正・削除を希望する場合、所定の手続きによりこれを行うことができます。
          </p>
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

export default PrivacyPolicyPage;

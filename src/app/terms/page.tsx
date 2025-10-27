import Link from 'next/link';

const TermsPage = () => {
  return (
    <div className="min-h-screen bg-[#121826] text-white flex flex-col">
      <main className="container mx-auto px-4 py-8 md:py-16">
        <h1 className="text-3xl md:text-4xl font-bold mb-8 text-center">利用規約</h1>
        <div className="prose prose-invert max-w-4xl mx-auto bg-[#1a2233] p-6 md:p-8 rounded-lg">
          <h2 className="text-xl font-bold">第1条（適用）</h2>
          <p>この利用規約は、本サービスの利用に関する条件を定めるものです。ユーザーは、本規約に同意の上、本サービスを利用するものとします。</p>
          
          <h2 className="text-xl font-bold mt-6">第2条（禁止事項）</h2>
          <p>ユーザーは、本サービスの利用にあたり、以下の行為をしてはなりません。</p>
          <ul>
            <li>法令または公序良俗に違反する行為</li>
            <li>犯罪行為に関連する行為</li>
            <li>本サービスの運営を妨害するおそれのある行為</li>
            <li>他のユーザーに関する個人情報等を収集または蓄積する行為</li>
            <li>その他、当社が不適切と判断する行為</li>
          </ul>

          <p className="mt-6">（ここに規約の詳細が続きます）</p>
        </div>
        <div className="text-center mt-12">
          <Link href="/" className="text-red-500 hover:text-red-400 transition-colors">
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

import Link from "next/link";

const CancelPolicyPage = () => {
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#e6f7ff] via-[#eaf6ff] to-white text-slate-900 flex flex-col">
      <main className="container mx-auto px-4 py-8 md:py-16">
        <h1 className="text-3xl md:text-4xl font-bold mb-8 text-center">キャンセルポリシー</h1>
        <div className="prose max-w-4xl mx-auto bg-white/80 border border-sky-200 p-6 md:p-8 rounded-lg shadow-sm">
          <p>
            本ページはキャンセルポリシーの詳細ページです。内容は運営方針に合わせて更新してください。
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

export default CancelPolicyPage;

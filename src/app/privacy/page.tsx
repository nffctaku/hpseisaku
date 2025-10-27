import Link from 'next/link';

const PrivacyPolicyPage = () => {
  return (
    <div className="min-h-screen bg-[#121826] text-white flex flex-col">
      <main className="container mx-auto px-4 py-8 md:py-16">
        <h1 className="text-3xl md:text-4xl font-bold mb-8 text-center">プライバシーポリシー</h1>
        <div className="prose prose-invert max-w-4xl mx-auto bg-[#1a2233] p-6 md:p-8 rounded-lg">
          <h2 className="text-xl font-bold">第1条（個人情報）</h2>
          <p>「個人情報」とは、個人情報保護法にいう「個人情報」を指すものとし、生存する個人に関する情報であって、当該情報に含まれる氏名、生年月日、住所、電話番号、連絡先その他の記述等により特定の個人を識別できる情報及び容貌、指紋、声紋にかかるデータ、及び健康保険証の保険者番号などの当該情報単体から特定の個人を識別できる情報（個人識別情報）を指します。</p>
          
          <h2 className="text-xl font-bold mt-6">第2条（個人情報の収集方法）</h2>
          <p>当社は、ユーザーが利用登録をする際に氏名、生年月日、住所、電話番号、メールアドレス、銀行口座番号、クレジットカード番号、運転免許証番号などの個人情報をお尋ねすることがあります。また、ユーザーと提携先などとの間でなされたユーザーの個人情報を含む取引記録や決済に関する情報を、当社の提携先（情報提供元、広告主、広告配信先などを含みます。以下、｢提携先｣といいます。）などから収集することがあります。</p>

          <p className="mt-6">（ここにポリシーの詳細が続きます）</p>
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

export default PrivacyPolicyPage;

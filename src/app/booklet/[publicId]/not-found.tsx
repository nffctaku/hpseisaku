export default function BookletNotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="text-center">
        <h1 className="text-xl font-bold text-gray-900">この名鑑は公開されていません</h1>
        <p className="mt-2 text-sm text-gray-500">
          URLが無効か、公開が停止された可能性があります。
        </p>
      </div>
    </div>
  );
}

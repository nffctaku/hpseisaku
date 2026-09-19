/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.FOOTCHRON_DEV_MODE === 'emulator' ? '.next-emulator' : process.env.FOOTCHRON_DEV_MODE === 'normal' ? '.next-normal' : '.next',
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  productionBrowserSourceMaps: true,
  serverExternalPackages: ['firebase-admin'],
  // Firebase Auth のリダイレクトログインを自ドメイン経由にするためのプロキシ。
  // NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN を www.footchron.com に切り替えた時点で有効になる。
  // （切替前は従来通り hpsakusei-app.web.app の authDomain が使われるため無害）
  async rewrites() {
    return [
      {
        source: '/__/auth/:path*',
        destination: 'https://hpsakusei-app.firebaseapp.com/__/auth/:path*',
      },
      {
        source: '/__/firebase/:path*',
        destination: 'https://hpsakusei-app.firebaseapp.com/__/firebase/:path*',
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
      {
        protocol: 'https',
        hostname: 'firebasestorage.googleapis.com',
      },
      {
        protocol: 'https',
        hostname: 'storage.googleapis.com',
      },
      {
        protocol: 'https',
        hostname: 'i.ytimg.com',
      },
    ],
  },
};

export default nextConfig;

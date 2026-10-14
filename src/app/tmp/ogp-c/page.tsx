import type { Metadata } from "next";

const imageUrl = "https://www.footchron.com/booklet-ogp.jpg?v=2";

export const metadata: Metadata = {
  title: "OGP Test",
  description: "OGP card test page.",
  openGraph: {
    title: "OGP Test",
    description: "OGP card test page.",
    url: "https://www.footchron.com/tmp/ogp-c",
    siteName: "FootChron",
    images: [{ url: imageUrl, width: 1672, height: 941 }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "OGP Test",
    description: "OGP card test page.",
    images: [imageUrl],
  },
};

export default function OgpTestC() {
  return <main><h1>OGP test page C</h1></main>;
}

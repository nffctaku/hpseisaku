import React from "react";

export function BookletGlobalStyles({ paper }: { paper: "a4" | "a3_landscape" }) {
  return (
    <style jsx global>{`
      @page {
        size: ${paper === "a3_landscape" ? "A3 landscape" : "A4"};
        margin: 0;
      }

      @media print {
        html, body { background: #fff !important; }
        * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .no-print { display: none !important; }
        .print-page { break-after: page; }
      }

      .booklet-name-2l {
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }

      .booklet-vertical-name {
        writing-mode: vertical-rl;
        text-orientation: upright;
      }

      .booklet-vertical-name-mixed {
        writing-mode: vertical-rl;
        text-orientation: mixed;
      }

      .booklet-color-strip {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }

      .font-source-han {
        font-family: "Source Han Sans", "Noto Sans JP", system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", "Liberation Sans", sans-serif;
      }
    `}</style>
  );
}

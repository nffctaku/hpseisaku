import React from "react";

type Block =
  | { type: "heading"; text: string }
  | { type: "list"; items: string[] }
  | { type: "paragraph"; text: string };

const LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|(https?:\/\/[^\s]+)/g;

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const match of text.matchAll(LINK_RE)) {
    const index = match.index ?? 0;
    if (index > last) nodes.push(text.slice(last, index));
    const label = match[1] ?? match[3];
    const href = match[2] ?? match[3];
    nodes.push(
      <a
        key={`${keyPrefix}-l${i++}`}
        href={href}
        target="_blank"
        rel="noreferrer"
        className="text-emerald-300 underline underline-offset-2 hover:text-emerald-200"
      >
        {label}
      </a>
    );
    last = index + match[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function parseBlocks(body: string): Block[] {
  const blocks: Block[] = [];
  let list: string[] | null = null;
  const flushList = () => {
    if (list && list.length > 0) blocks.push({ type: "list", items: list });
    list = null;
  };
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "") {
      flushList();
      continue;
    }
    if (line.startsWith("## ")) {
      flushList();
      blocks.push({ type: "heading", text: line.slice(3).trim() });
      continue;
    }
    if (line.startsWith("- ")) {
      if (!list) list = [];
      list.push(line.slice(2).trim());
      continue;
    }
    flushList();
    blocks.push({ type: "paragraph", text: line });
  }
  flushList();
  return blocks;
}

export function UpdateBody({ body }: { body: string }) {
  const blocks = parseBlocks(body);
  return (
    <div className="space-y-5">
      {blocks.map((block, i) => {
        if (block.type === "heading") {
          return (
            <h3 key={i} className="pt-2 text-lg font-black tracking-[-0.02em] text-white sm:text-xl">
              {block.text}
            </h3>
          );
        }
        if (block.type === "list") {
          return (
            <ul key={i} className="list-disc space-y-1.5 pl-6 text-sm font-medium leading-7 text-slate-300 sm:text-base sm:leading-8">
              {block.items.map((item, j) => (
                <li key={j}>{renderInline(item, `u${i}-${j}`)}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className="text-sm font-medium leading-7 text-slate-300 sm:text-base sm:leading-8">
            {renderInline(block.text, `p${i}`)}
          </p>
        );
      })}
    </div>
  );
}

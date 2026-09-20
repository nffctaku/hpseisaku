// 診断用: Firebase SDK 初期化より前に通信監視を仕込む。
// root layout の先頭で import する（import順 = 評価順）。
// 失敗したリクエストのみ記録する（method/URL/status/body/network error）。

const entries: string[] = [];

const record = (s: string) => {
  entries.push(s);
  if (entries.length > 60) entries.shift();
};

export function getNetLog(): string[] {
  return entries;
}

if (typeof window !== "undefined") {
  const origFetch = window.fetch.bind(window);
  window.fetch = (async (input: any, init?: any) => {
    const url = typeof input === "string" ? input : input?.url || "";
    const method =
      init?.method || (typeof input !== "string" && input?.method) || "GET";
    try {
      const res = await origFetch(input, init);
      if (!res.ok) {
        const body = await res
          .clone()
          .text()
          .catch(() => "");
        record(
          `HTTP ${res.status} ${method} ${url.slice(0, 120)} :: ${body.slice(0, 200)}`
        );
      }
      return res;
    } catch (err: any) {
      record(
        `ERR ${method} ${url.slice(0, 120)} :: ${(err?.message || String(err)).slice(0, 80)}`
      );
      throw err;
    }
  }) as typeof window.fetch;

  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (
    this: any,
    method: string,
    url: any,
    ...rest: any[]
  ) {
    this.__tapM = method;
    this.__tapU = String(url);
    return (origOpen as any).call(this, method, url, ...rest);
  } as any;
  XMLHttpRequest.prototype.send = function (this: any, body?: any) {
    this.addEventListener("loadend", () => {
      if (this.status === 0 || this.status >= 400) {
        record(
          `XHR ${this.status} ${this.__tapM} ${String(this.__tapU).slice(0, 120)} :: ${(this.responseText || "").slice(0, 200)}`
        );
      }
    });
    this.addEventListener("error", () => {
      record(`XHR ERR ${this.__tapM} ${String(this.__tapU).slice(0, 120)}`);
    });
    return origSend.call(this, body);
  } as any;
}

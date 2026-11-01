import { describe, expect, it } from "vitest";
import { hasSameOrigin } from "@/lib/http";

describe("浏览器同源保护", () => {
  it("兼容 Next.js 的内部 localhost 地址，按真实 Host 校验来源", () => {
    expect(hasSameOrigin(new Request("http://localhost:3000/api/dashboard/login", {
      headers: { host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000" },
    }))).toBe(true);
  });
  it.each(["https://attacker.invalid", "http://localhost:3000", "null", "http://127.0.0.1:3001", "https://127.0.0.1:3000"])("拒绝跨来源 %s", origin => {
    expect(hasSameOrigin(new Request("http://localhost:3000", { headers: { host: "127.0.0.1:3000", origin } }))).toBe(false);
  });
});

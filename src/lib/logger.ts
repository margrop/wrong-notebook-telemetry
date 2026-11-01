import "server-only";

// 只记录固定错误码，不序列化异常、数据库地址、请求头或请求体。
export const logger = {
  error(code: string): void {
    process.stderr.write(`${JSON.stringify({ level: "error", code })}\n`);
  },
};

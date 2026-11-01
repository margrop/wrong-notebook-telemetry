import { Writable } from "node:stream";
import { createInterface } from "node:readline/promises";
import { hash } from "bcryptjs";

if (!process.stdin.isTTY) {
  process.stderr.write("请在交互式终端运行，避免密码进入命令行历史。\n");
  process.exitCode = 1;
} else {
  let muted = false;
  const output = new Writable({ write(chunk, encoding, callback) { if (!muted) process.stdout.write(chunk, encoding); callback(); } });
  const readline = createInterface({ input: process.stdin, output, terminal: true });
  try {
    process.stdout.write("输入至少 12 字符的看板密码（输入隐藏）：");
    muted = true;
    const password = await readline.question("");
    process.stdout.write("\n再次输入：");
    const confirmation = await readline.question("");
    process.stdout.write("\n");
    if (password !== confirmation || password.length < 12 || Buffer.byteLength(password) > 72) {
      process.stderr.write("两次输入须一致，长度至少 12 字符且不超过 72 字节。\n");
      process.exitCode = 1;
    } else {
      const passwordHash = await hash(password, 12);
      process.stdout.write(`平台环境变量使用原始哈希：\n${passwordHash}\n`);
      process.stdout.write(`本地 .env.local 使用转义写法：\nDASHBOARD_PASSWORD_HASH=${passwordHash.replaceAll("$", "\\$")}\n`);
    }
  } finally { readline.close(); }
}

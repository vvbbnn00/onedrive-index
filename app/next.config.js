const { i18n } = require('./next-i18next.config')
const { exec } = require('child_process');

module.exports = {
  i18n,
  reactStrictMode: true,
  // Required by Next i18n with API routes, otherwise API routes 404 when fetching without trailing slash
  trailingSlash: true,
  generateBuildId: async () => {
    try {
      // 使用 child_process 模块执行 Git 命令
      const gitHashCommand = 'git rev-parse HEAD';

      // 使用 await 将异步结果转为同步
      const commitHash = await new Promise((resolve, reject) => {
        exec(gitHashCommand, (error, stdout, stderr) => {
          if (error) {
            console.error(`Error executing command: ${gitHashCommand}`);
            reject(error);
          } else {
            // 提取 git commit 哈希值，并去除换行符
            const hash = stdout.trim();
            resolve(hash);
          }
        });
      });

      // 返回生成的 build id（这里使用 git commit 哈希值）
      return commitHash;
    } catch (error) {
      console.error('Error generating build id:', error);
      // 如果获取 git commit 哈希值失败，则返回默认值或者抛出错误，根据你的需求决定
      return 'unknown-build-id';
    }
  }
}

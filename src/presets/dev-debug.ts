import Taro from '@tarojs/taro';

/**
 * 小程序调试工具
 * 在开发版/体验版自动开启调试模式
 * 支持微信小程序
 */
export function devDebug() {
  const env = Taro.getEnv();
  if (env === Taro.ENV_TYPE.WEAPP) {
    try {
      const accountInfo = Taro.getAccountInfoSync();
      const envVersion = accountInfo.miniProgram.envVersion;
      console.log('[Debug] envVersion:', envVersion);

      if (envVersion === 'develop') {
        Taro.setEnableDebug({ enableDebug: true });
      } else {
        // 显式关闭调试模式，清除之前 develop 版本持久化的调试状态
        Taro.setEnableDebug({ enableDebug: false });
      }
    } catch (error) {
      console.error('[Debug] 开启调试模式失败:', error);
    }
  }
}

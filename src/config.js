/* 功能开关 */

/* 病友分享（M4）默认关闭：开启后部署者即成为健康类 UGC 的内容主体，
   须自行承担内容审核与合规责任（见 README「分享模块」一节）。
   开启方式：构建时设置环境变量 VITE_ENABLE_SHARE=true */
const FEATURES = {
  share: (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_ENABLE_SHARE) === "true",
};

export { FEATURES };

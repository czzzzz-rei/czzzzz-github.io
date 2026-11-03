// 公共资源（public/）引用统一走这里：自动带上 vite base 前缀。
// GitHub Pages 项目页部署在 /czzzzz-github.io/ 子路径下，
// 组件里写死的 "/xxx" 绝对路径不会被 vite 改写，会导致线上 404。
export const BASE_URL = import.meta.env.BASE_URL;

export function asset(path: string): string {
  const p = path.startsWith('/') ? path.slice(1) : path;
  return BASE_URL + p;
}

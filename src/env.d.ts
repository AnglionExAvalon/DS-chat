declare module '*.module.css' {
  const classes: Record<string, string>
  export default classes
}

declare module '*.css' {}

/** 图片按 url 导入，由 rspack.config.ts 的 asset/resource 规则处理 */
declare module '*.png' {
  const url: string
  export default url
}

/** 公开 API 的地址，见 rspack.config.ts 的 createConfig */
declare const __API_ORIGIN__: string

/** 云同步的 Supabase 项目地址与可公开的 publishable key，见 rspack.config.ts */
declare const __SUPABASE_URL__: string
declare const __SUPABASE_KEY__: string

/** Prism 语言包通过副作用注册到全局 Prism */
declare module 'prismjs/components/*' {}

/** KaTeX 化学公式扩展通过副作用注册到 KaTeX */
declare module 'katex/contrib/mhchem' {}

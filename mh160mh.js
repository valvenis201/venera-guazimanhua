/** @type {import('./_venera_.js')} */
// 漫畫160 Venera 自訂來源。僅解析網站公開的頁面；不執行網站內嵌 JavaScript。
class Mh160mh extends ComicSource {
    name = "漫畫160"
    key = "mh160mh"
    version = "0.1.3"
    minAppVersion = "1.6.0"
    url = "https://raw.githubusercontent.com/valvenis201/venera-guazimanhua/mh160mh/mh160mh.js"

    baseUrl = "https://www.mh160mh.com"
    // 保底封面：不再傳入空 URL 導致 Venera 的 relative URL without a base。
    fallbackCover = "https://raw.githubusercontent.com/valvenis201/venera-guazimanhua/mh160mh/assets/no-cover.png"
    mobileUrl = "https://m.mh160mh.com"
    userAgent = "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36"

    headers(referer = null) {
        return {
            "user-agent": this.userAgent,
            "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "accept-language": "zh-CN,zh;q=0.9,zh-TW;q=0.8",
            "referer": referer || `${this.mobileUrl}/`,
        }
    }

    text(node) { return String(node?.text || "").replace(/\s+/g, " ").trim() }
    attr(node, name) { return String(node?.attributes?.[name] || "").trim() }

    absoluteUrl(value, parent = this.baseUrl) {
        let input = String(value || "").replace(/&amp;/g, "&").trim()
        if (!input || /^(?:data:|blob:|javascript:|about:|#)/i.test(input)) return ""
        if (/^https?:\/\//i.test(input)) return input
        if (input.startsWith("//")) return `https:${input}`
        const match = String(parent).match(/^(https?:\/\/[^/]+)(\/[^?#]*)?/i)
        if (!match) return ""
        const origin = match[1]
        if (input.startsWith("/")) return origin + input
        const path = (match[2] || "/").replace(/\/[^/]*$/, "/")
        const parts = (path + input).split("/")
        const stack = []
        for (const part of parts) {
            if (part === "..") stack.pop()
            else if (part && part !== ".") stack.push(part)
        }
        return origin + "/" + stack.join("/")
    }

    comicId(href) {
        const m = String(href || "").match(/\/kanmanhua\/([^/?#]+)\/?(?:[?#].*)?$/i)
        if (!m) return null
        const reserved = new Set([
            "all", "html", "search", "rexue", "gedou", "kehuan", "jingji",
            "gaoxiao", "tuili", "kongbu", "danmei", "shaonv", "lianai",
            "shenghuo", "zhanzheng", "gushi", "maoxian", "mohuan", "xuanhuan",
            "xiaoyuan", "xuanyi", "mengxi", "chuanyue", "hougong", "dushi",
            "wuxia", "lishi", "tongren", "qita",
        ])
        if (reserved.has(m[1].toLowerCase()) || /^zaixian/i.test(m[1])) return null
        return m[1]
    }

    episodeId(href) {
        const match = String(href || "").match(/\/kanmanhua\/([^/?#]+)\/([^/?#]+\.html)(?:[?#].*)?$/i)
        if (!match) return null
        return `${match[1]}/${match[2]}`
    }

    comicUrl(id, host = this.baseUrl) {
        const slug = String(id || "").replace(/^.*?\/kanmanhua\//, "").replace(/^\/+|\/+$/g, "")
        if (!/^[a-z0-9_-]+$/i.test(slug)) throw "無效的漫畫代號"
        return `${host}/kanmanhua/${slug}/`
    }

    epUrl(epId, host = this.baseUrl) {
        const id = String(epId || "").replace(/^.*?\/kanmanhua\//, "").replace(/^\/+/, "")
        if (!/^[a-z0-9_-]+\/[a-z0-9_.-]+\.html$/i.test(id) || id.includes("..")) throw "無效的章節代號"
        return `${host}/kanmanhua/${id}`
    }

    async request(url, referer = null) {
        const res = await Network.get(url, this.headers(referer))
        if (res.status !== 200 || !String(res.body || "").trim()) throw `漫畫160 請求失敗：HTTP ${res.status} (${url})`
        return res
    }

    async getPage(path, referer = null) {
        // 網站同時提供桌面與行動網域；發生 HTTP/網路問題時再嘗試另一網域。
        // 漫畫160 的章節圖資料由手機版頁面的 qTcms_S_m_murl_e 提供。
        const urls = [this.absoluteUrl(path, this.mobileUrl), this.absoluteUrl(path, this.baseUrl)]
        let lastError = ""
        for (const url of [...new Set(urls)]) {
            try {
                const res = await this.request(url, referer)
                return { doc: new HtmlDocument(res.body), html: String(res.body), url }
            } catch (error) { lastError = String(error) }
        }
        throw `漫畫160 無法取得頁面：${lastError}`
    }

    imageUrl(node, parent = this.baseUrl) {
        if (!node) return ""
        for (const key of ["data-original", "data-src", "data-lazy-src", "data-url", "data-echo", "data-img", "data-cover", "data-ks-lazyload", "src"]) {
            const url = this.absoluteUrl(this.attr(node, key), parent)
            if (url && !/\/(?:loading|blank|placeholder|favicon|logo)(?:[._/-]|$)/i.test(url)) return url
        }
        const srcset = this.attr(node, "srcset")
        if (srcset) return this.absoluteUrl(srcset.split(",")[0].trim().split(/\s+/)[0], parent)
        const style = this.attr(node, "style")
        const match = style.match(/(?:background(?:-image)?)\s*:[^;]*url\(\s*['"]?([^'")]+)['"]?\s*\)/i)
        return match ? this.absoluteUrl(match[1], parent) : ""
    }

    findCover(link, parent) {
        let node = link
        for (let i = 0; i < 5 && node; i++, node = node.parent) {
            const image = node.querySelector?.("img")
            const url = this.imageUrl(image, parent)
            if (url) return url
        }
        // 該站封面有時和文字連結是同一列表卡片中的兄弟節點。
        for (const selector of [".mh-date-bgpic img", "[class*='cover'] img", "[class*='pic'] img", "img"]) {
            const img = link.parent?.querySelector?.(selector)
            const url = this.imageUrl(img, parent)
            if (url) return url
        }
        return ""
    }

    parseComicList(doc, pageUrl = this.baseUrl, limit = 60) {
        const found = new Map()
        // 搜尋結果可能使用相對路徑（如 kanmanhua/xxx/ 或 ../kanmanhua/xxx/）。
        // 先抓全部連結，再由 comicId() 嚴格判斷是否漫畫詳情頁。
        for (const link of doc.querySelectorAll("a[href]")) {
            const id = this.comicId(this.absoluteUrl(this.attr(link, "href"), pageUrl))
            if (!id) continue
            const title = this.text(link) || this.attr(link, "title") || this.attr(link.querySelector?.("img"), "alt")
            if (!title || title.length > 100 || /^(?:开始阅读|查看更多|立即阅读|阅读|更多)$/i.test(title)) continue
            const cover = this.findCover(link, pageUrl)
            const score = (/^(?:第?\d+(?:\.\d+)?(?:话|話|回|章|卷)|番外|更新至)/i.test(title) ? 0 : 10)
                + (cover ? 1 : 0)
            const old = found.get(id)
            if (!old || score > old.score) found.set(id, {
                id, title, cover: cover || old?.cover || "", score,
            })
        }
        return [...found.values()].slice(0, limit).map(item => new Comic({
            id: item.id, title: item.title, cover: item.cover || this.fallbackCover, subTitle: "",
        }))
    }

    parseMaxPage(doc, current, pathPrefix) {
        let max = Math.max(1, Number(current) || 1)
        const prefix = String(pathPrefix).replace(/\/$/, "")
        for (const a of doc.querySelectorAll("a[href]")) {
            const href = this.attr(a, "href")
            const text = this.text(a)
            let m = href.match(new RegExp(`${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/(\\d+)\\.html`))
            if (!m && /^\d{1,4}$/.test(text) && /^\d{1,4}$/.test(href)) m = [href, href]
            if (m) max = Math.max(max, Number(m[1]))
        }
        // 未能從網站確認總頁數；僅使用頁碼連結推定，不宣稱是確切尾頁。
        return max
    }

    async loadList(path, page = 1, paginated = true) {
        const p = Math.max(1, Number(page) || 1)
        const basePath = `/kanmanhua/${path.replace(/^\/+|\/+$/g, "")}`
        const url = paginated
            ? `${basePath}/${p === 1 ? "" : `${p}.html`}`
            : `${basePath}.html`
        if (!paginated && p > 1) return { comics: [], maxPage: 1 }
        const { doc, url: finalUrl } = await this.getPage(url)
        return {
            comics: this.parseComicList(doc, finalUrl),
            maxPage: paginated ? this.parseMaxPage(doc, p, basePath) : 1,
        }
    }

    explore = [
        { title: "最新更新", type: "multiPageComicList", load: async (page) => this.loadList("zaixian_recent", page, false) },
        { title: "全部漫畫", type: "multiPageComicList", load: async (page) => this.loadList("all", page) },
        { title: "人氣排行", type: "multiPageComicList", load: async (page) => this.loadList("zaixian_hit", page, false) },
    ]

    category = {
        title: "分類",
        parts: [{
            name: "題材／地區",
            type: "fixed",
            categories: ["全部", "熱血", "格鬥", "科幻", "搞笑", "戀愛", "少女", "恐怖", "冒險", "玄幻", "校園", "都市", "日韓", "內地", "港台"],
            categoryParams: ["all", "rexue", "gedou", "kehuan", "gaoxiao", "lianai", "shaonv", "kongbu", "maoxian", "xuanhuan", "xiaoyuan", "dushi", "zaixian_rhmh", "zaixian_dlmh", "zaixian_gtmh"],
            itemType: "category",
        }],
        enableRankingPage: false,
    }

    categoryComics = {
        load: async (category, param, options, page) => this.loadList(param || "all", page),
        optionList: [],
    }

    // 已由漫畫160瀏覽器搜尋結果網址確認 GET /statics/search.aspx?key=關鍵字。
    // 不再猜測不存在的 /kanmanhua/search/、/search 路徑。
    searchPath(keyword) {
        return `/statics/search.aspx?key=${encodeURIComponent(String(keyword || "").trim())}`
    }

    async loadSearch(keyword, page = 1) {
        const kw = String(keyword || "").trim()
        if (!kw) return { comics: [], maxPage: 1 }
        // 搜尋分頁參數未經源站證實；保守地只開放第 1 頁。
        if (Math.max(1, Number(page) || 1) > 1) return { comics: [], maxPage: 1 }

        const { doc, url } = await this.getPage(this.searchPath(kw), `${this.mobileUrl}/`)
        const comics = this.parseComicList(doc, url, 100)
        // 源站有「大家都在搜」等推薦區，避免當成符合搜尋關鍵字的結果。
        // 作者搜尋的真實 HTML 尚待確認，目前只保證漫畫名稱搜尋。
        const term = kw.toLowerCase()
        const matches = comics.filter(item => item.title.toLowerCase().includes(term))
        return { comics: matches, maxPage: 1 }
    }

    search = {
        load: async (keyword, options, page) => this.loadSearch(keyword, page),
        optionList: [],
        enableTagsSuggestions: false,
    }

    parseChapterLinks(doc, comicId = null, pageUrl = this.mobileUrl) {
        const entries = new Map()
        // 包含詳情頁內的相對章節網址，例如 1689580801.html。
        for (const link of doc.querySelectorAll("a[href]")) {
            const href = this.absoluteUrl(this.attr(link, "href"), pageUrl)
            const id = this.episodeId(href)
            if (!id || (comicId && !id.startsWith(`${comicId}/`)) || entries.has(id)) continue
            const title = this.text(link) || `章節 ${id.split("/")[1].replace(/\.html$/, "")}`
            if (/^(?:上一话|下一话|上一章|下一章|阅读|开始阅读)$/i.test(title)) continue
            entries.set(id, title)
        }
        // 源站詳情頁多為新到舊，Venera 章節地圖使用舊到新。
        return new Map([...entries].reverse())
    }

    extractDetail(doc, id, url) {
        const title = this.text(doc.querySelector("h1")) || this.text(doc.querySelector("h2")) ||
            this.attr(doc.querySelector('meta[property="og:title"]'), "content") || id
        const cover = this.absoluteUrl(this.attr(doc.querySelector('meta[property="og:image"]'), "content"), url) ||
            this.imageUrl(doc.querySelector(".mh-date-bgpic img, .detail img, .comic-cover img, .book-cover img"), url) ||
            this.imageUrl(doc.querySelector("img[alt]"), url) || this.fallbackCover
        let description = ""
        for (const selector of ["[class*='intro']", "[class*='desc']", "[class*='summary']", "meta[name='description']"]) {
            const item = doc.querySelector(selector)
            const value = selector.startsWith("meta") ? this.attr(item, "content") : this.text(item)
            if (value && value.length > 12 && value.length < 3000) { description = value; break }
        }
        const bodyText = this.text(doc.querySelector("body"))
        const author = (bodyText.match(/作者\s*[:：]\s*([^\s]{1,60})/) || [])[1] || ""
        const status = (bodyText.match(/(?:状态|狀態)\s*[:：]\s*(连载中|已完结|已完結|连载|完结|完結)/) || [])[1] || ""
        const genre = (bodyText.match(/(?:标签|標籤)\s*[:：]\s*([^\s]{1,32})/) || [])[1] || ""
        const tags = {}
        if (author && author !== "未知") tags["作者"] = [author]
        if (status) tags["狀態"] = [status]
        if (genre) tags["題材"] = genre.split(/[,，/]/).filter(Boolean)
        return new ComicDetails({ title, subTitle: author, cover, description, tags, chapters: this.parseChapterLinks(doc, id, url), url })
    }

    decodeMh160Images(html) {
        // 漫畫160 把章節圖片路徑序列以 Base64 包在 qTcms_S_m_murl_e。
        // 已有公開漫畫160 使用者腳本以相同資料欄位解碼，不執行網頁 JS。
        const raw = String(html || "")
        const imageMatch = raw.match(/\bqTcms_S_m_murl_e\s*=\s*["']([^"']+)["']/i)
        if (!imageMatch) return []
        const comicPageMatch = raw.match(/\bqTcms_S_p_id\s*=\s*["']?(\d+)/i)
        const imageId = Number(comicPageMatch?.[1] || 0)
        let decoded = ""
        try { decoded = Convert.decodeUtf8(Convert.decodeBase64(imageMatch[1])) }
        catch (error) { throw `漫畫160 Base64 圖片路徑解碼失敗：${error}` }
        const primaryHost = imageId > 542724 ? "https://xwdf.tgmhfc.uk" : "https://mhpic6.tgmhfc.uk"
        const paths = decoded.split("$qingtiandy$").map(x => x.trim()).filter(Boolean)
        const results = []
        for (const path of paths) {
            if (path.startsWith("//")) results.push("https:" + path)
            else if (path.startsWith("/")) results.push(primaryHost + path)
            else if (/^https?:\/\//i.test(path)) results.push(path)
        }
        return results
    }

    extractImages(doc, html, pageUrl) {
        const results = []
        const seen = new Set()
        // 先使用本站真正的 Base64 章節資料；其內圖片不出現在一般 img 標籤。
        const mh160Images = this.decodeMh160Images(html)
        if (mh160Images.length) return mh160Images
        const add = candidate => {
            const url = this.absoluteUrl(String(candidate || "").replace(/\\\//g, "/").replace(/\\u002f/gi, "/"), pageUrl)
            if (!url || seen.has(url) || !/^https?:\/\//i.test(url)) return
            if (!/\.(?:png|jpe?g|webp|gif|avif)(?:[?#]|$)/i.test(url)) return
            if (/(?:logo|loading|favicon|avatar|banner|ad[-_/]|placeholder|icon)/i.test(url)) return
            seen.add(url); results.push(url)
        }
        for (const selector of [
            ".comic-img img", ".comic-image img", ".read-content img", ".chapter-content img",
            ".chapter-img img", "#comic img", "#images img", "#chapter img", "img[data-original]", "img[data-src]",
        ]) {
            for (const img of doc.querySelectorAll(selector)) add(this.imageUrl(img, pageUrl))
            if (results.length) break
        }
        if (!results.length) {
            for (const img of doc.querySelectorAll("img")) {
                const url = this.imageUrl(img, pageUrl)
                if (/(?:read|comic|chapter|page|manga|mhimg|\/uploads\/|\/images\/)/i.test(url)) add(url)
            }
        }
        // 只讀取字串及陣列，不 eval 遠端 script；避免觸發未知程式。
        const arrayMatch = String(html).match(/(?:chapterImages|imageList|imglist|piclist|images|pageImages)\s*[:=]\s*(\[[\s\S]*?\])/i)
        if (arrayMatch) {
            try {
                const raw = JSON.parse(arrayMatch[1].replace(/'/g, '"'))
                if (Array.isArray(raw)) for (const candidate of raw) if (typeof candidate === "string") add(candidate)
            } catch (_) {}
        }
        if (!results.length) {
            const htmlUrls = String(html).replace(/\\\//g, "/")
                .match(/(?:https?:)?\/\/[^\s"'<>\\]+?\.(?:jpe?g|png|webp|gif|avif)(?:\?[^\s"'<>\\]*)?/gi) || []
            for (const url of htmlUrls) {
                if (/(?:read|comic|chapter|page|manga|mhimg|image|pic|\/uploads\/)/i.test(url)) add(url)
            }
        }
        return results
    }

    comic = {
        loadInfo: async (id) => {
            const { doc, url } = await this.getPage(`/kanmanhua/${encodeURIComponent(id)}/`)
            return this.extractDetail(doc, id, url)
        },
        loadEp: async (comicId, epId) => {
            if (!epId) throw "缺少章節代號"
            const path = `/kanmanhua/${this.epUrl(epId).split("/kanmanhua/")[1]}`
            const { doc, html, url } = await this.getPage(path, this.comicUrl(comicId))
            const images = this.extractImages(doc, html, url)
            if (!images.length) {
                throw "漫畫160 章節圖片尚無法解析：可能由 JavaScript 動態產生；請提供本章 HTML 或瀏覽器 Network 記錄。"
            }
            return { images }
        },
        onImageLoad: (url, comicId, epId) => ({
            headers: {
                "user-agent": this.userAgent,
                "referer": `${this.mobileUrl}/`,
                "accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
            },
        }),
        onThumbnailLoad: (url) => ({ headers: { "user-agent": this.userAgent, "referer": `${this.mobileUrl}/` } }),
        link: {
            domains: ["www.mh160mh.com", "m.mh160mh.com", "mh160mh.com"],
            linkToId: url => this.comicId(url),
        },
        enableTagsTranslate: false,
    }
}

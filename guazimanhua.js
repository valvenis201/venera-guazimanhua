/** @type {import('./_venera_.js')} */
class GuaziManhua extends ComicSource {
    name = "瓜子漫畫"
    key = "guazimanhua"
    version = "1.0.0"
    minAppVersion = "1.6.0"
    url = ""

    baseUrl = "https://www.guazimanhua.com"

    headers(referer = null) {
        return {
            "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
            "accept-language": "zh-TW,zh;q=0.9,zh-CN;q=0.8,en;q=0.6",
            "cache-control": "no-cache",
            "pragma": "no-cache",
            "user-agent": "Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36",
            "referer": referer || `${this.baseUrl}/`,
        }
    }

    absoluteUrl(url) {
        if (!url) return ""
        url = String(url).trim().replace(/&amp;/g, "&")
        if (!url || url.startsWith("data:") || url.startsWith("javascript:")) return ""
        if (url.startsWith("//")) return `https:${url}`
        if (/^https?:\/\//i.test(url)) return url
        if (url.startsWith("/")) return `${this.baseUrl}${url}`
        return `${this.baseUrl}/${url.replace(/^\.\//, "")}`
    }

    async request(url, referer = null) {
        const res = await Network.get(url, this.headers(referer))
        if (res.status !== 200) throw `瓜子漫畫請求失敗：HTTP ${res.status}`
        return res
    }

    async getHtml(url, referer = null) {
        const res = await this.request(url, referer)
        return new HtmlDocument(res.body)
    }

    getImageUrl(img) {
        if (!img) return ""
        const attrs = img.attributes || {}
        const keys = ["data-src", "data-original", "data-lazy-src", "data-url", "src"]
        for (const key of keys) {
            const v = this.absoluteUrl(attrs[key])
            if (v) return v
        }
        return ""
    }

    extractComicId(href) {
        if (!href) return null
        const m = String(href).replace(/&amp;/g, "&").match(/comic\.php\?[^#]*\bid=(\d+)/i)
        return m ? m[1] : null
    }

    extractChapterId(href) {
        if (!href) return null
        const m = String(href).replace(/&amp;/g, "&").match(/chapter\.php\?[^#]*\bid=(\d+)/i)
        return m ? m[1] : null
    }

    cleanTitle(s) {
        if (!s) return ""
        return String(s)
            .replace(/^\s*\d+(?:\.\d+)?\s*(?:連載|连载|完結|完结)?\s*$/g, "")
            .replace(/^(?:去閱讀|去阅读|閱讀|阅读|更新)\s*>?\s*/g, "")
            .trim()
    }

    findNearbyImage(link) {
        let cur = link
        for (let i = 0; i < 6 && cur; i++) {
            const img = cur.querySelector ? cur.querySelector("img") : null
            const url = this.getImageUrl(img)
            if (url) return url
            cur = cur.parent
        }
        return ""
    }

    findNearbySubtitle(link, title) {
        let cur = link ? link.parent : null
        for (let i = 0; i < 4 && cur; i++) {
            let text = (cur.text || "").replace(/\s+/g, " ").trim()
            if (title) text = text.replace(title, "").trim()
            text = text.replace(/^\d+(?:\.\d+)?\s*(?:連載|连载|完結|完结)?/, "").trim()
            if (text && text.length <= 100) return text
            cur = cur.parent
        }
        return ""
    }

    parseComicList(document) {
        const grouped = new Map()
        const links = document.querySelectorAll("a[href*='comic.php?id=']")

        for (const a of links) {
            const id = this.extractComicId(a.attributes?.href)
            if (!id) continue
            if (!grouped.has(id)) grouped.set(id, [])
            grouped.get(id).push(a)
        }

        const comics = []
        for (const [id, candidates] of grouped) {
            let title = ""
            let cover = ""
            let subTitle = ""

            for (const a of candidates) {
                if (!title) {
                    title = this.cleanTitle(a.text)
                    if (!title) title = this.cleanTitle(a.attributes?.title)
                    if (!title) title = this.cleanTitle(a.querySelector("img")?.attributes?.alt)
                }
                if (!cover) cover = this.findNearbyImage(a)
                if (!subTitle && title) subTitle = this.findNearbySubtitle(a, title)
            }

            if (!title || title.length > 120) continue
            comics.push(new Comic({ id, title, subTitle, cover }))
        }
        return comics
    }

    parseMaxPage(document, currentPage = 1) {
        let maxPage = currentPage
        const links = document.querySelectorAll("a[href*='page=']")
        for (const a of links) {
            const href = String(a.attributes?.href || "").replace(/&amp;/g, "&")
            const m = href.match(/[?&]page=(\d+)/i)
            if (m) maxPage = Math.max(maxPage, parseInt(m[1]))
        }

        const bodyText = document.querySelector("body")?.text || ""
        const pageText = bodyText.match(/第\s*\d+\s*\/\s*(\d+)\s*頁|第\s*\d+\s*\/\s*(\d+)\s*页/i)
        if (pageText) maxPage = Math.max(maxPage, parseInt(pageText[1] || pageText[2]))
        return Math.max(1, maxPage)
    }

    async loadCategory(sort, page) {
        const p = Math.max(1, Number(page) || 1)
        let url = `${this.baseUrl}/category.php?page=${p}`
        if (sort) url += `&sort=${encodeURIComponent(sort)}`
        const doc = await this.getHtml(url)
        return {
            comics: this.parseComicList(doc),
            maxPage: this.parseMaxPage(doc, p),
        }
    }

    explore = [
        {
            title: "瓜子漫畫",
            type: "multiPageComicList",
            load: async (page) => this.loadCategory("hits", page),
        }
    ]

    category = {
        title: "分類",
        parts: [
            {
                name: "排序",
                type: "fixed",
                categories: [
                    { label: "全部", target: { page: "category", attributes: { category: "全部", param: "" } } },
                    { label: "最新", target: { page: "category", attributes: { category: "最新", param: "update" } } },
                    { label: "人氣", target: { page: "category", attributes: { category: "人氣", param: "hits" } } },
                    { label: "評分", target: { page: "category", attributes: { category: "評分", param: "score" } } },
                ],
            }
        ],
        enableRankingPage: false,
    }

    categoryComics = {
        load: async (category, param, options, page) => {
            return this.loadCategory(param || "", page)
        },
        optionList: [],
    }

    async discoverSearchForm() {
        try {
            const doc = await this.getHtml(`${this.baseUrl}/`)
            for (const form of doc.querySelectorAll("form")) {
                const inputs = form.querySelectorAll("input")
                for (const input of inputs) {
                    const a = input.attributes || {}
                    const hint = `${a.placeholder || ""} ${a.name || ""} ${a.id || ""}`
                    if (!/搜索|search|keyword|關鍵|关键/i.test(hint)) continue

                    const formAttrs = form.attributes || {}
                    const action = this.absoluteUrl(formAttrs.action || "/search.php")
                    const method = String(formAttrs.method || "GET").toUpperCase()
                    const field = a.name || "keyword"
                    return { action, method, field }
                }
            }
        } catch (_) {}
        return null
    }

    async trySearchUrl(url, page, keyword) {
        try {
            const doc = await this.getHtml(url)
            const comics = this.parseComicList(doc)
            const body = (doc.querySelector("body")?.text || "").toLowerCase()
            const kw = keyword.toLowerCase()
            const relevant = comics.filter(c => c.title.toLowerCase().includes(kw))
            if (relevant.length > 0 || (comics.length > 0 && body.includes(kw))) {
                return { comics, maxPage: this.parseMaxPage(doc, page) }
            }
        } catch (_) {}
        return null
    }

    search = {
        load: async (keyword, options, page) => {
            const p = Math.max(1, Number(page) || 1)
            const kw = String(keyword || "").trim()
            if (!kw) return { comics: [], maxPage: 1 }

            const form = await this.discoverSearchForm()
            if (form && form.method === "GET") {
                const sep = form.action.includes("?") ? "&" : "?"
                const url = `${form.action}${sep}${encodeURIComponent(form.field)}=${encodeURIComponent(kw)}&page=${p}`
                const r = await this.trySearchUrl(url, p, kw)
                if (r) return r
            }

            if (form && form.method === "POST") {
                try {
                    const body = `${encodeURIComponent(form.field)}=${encodeURIComponent(kw)}&page=${p}`
                    const res = await Network.post(form.action, {
                        ...this.headers(`${this.baseUrl}/`),
                        "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
                    }, body)
                    if (res.status === 200) {
                        const doc = new HtmlDocument(res.body)
                        const comics = this.parseComicList(doc)
                        if (comics.length > 0) return { comics, maxPage: this.parseMaxPage(doc, p) }
                    }
                } catch (_) {}
            }

            const candidates = [
                `${this.baseUrl}/search.php?keyword=${encodeURIComponent(kw)}&page=${p}`,
                `${this.baseUrl}/search.php?q=${encodeURIComponent(kw)}&page=${p}`,
                `${this.baseUrl}/category.php?keyword=${encodeURIComponent(kw)}&page=${p}`,
            ]
            for (const url of candidates) {
                const r = await this.trySearchUrl(url, p, kw)
                if (r) return r
            }

            return { comics: [], maxPage: 1 }
        },
        optionList: [],
        enableTagsSuggestions: false,
    }

    findMeta(document, selector, attr = "content") {
        const e = document.querySelector(selector)
        return e ? String(e.attributes?.[attr] || "").trim() : ""
    }

    findLabelValue(document, label) {
        const nodes = document.querySelectorAll("div, span, p, li, dd, dt")
        let best = ""
        for (const e of nodes) {
            const text = String(e.text || "").replace(/\s+/g, " ").trim()
            const re = new RegExp(`^${label}\\s*[:：]\\s*(.+)$`, "i")
            const m = text.match(re)
            if (!m) continue
            const value = m[1].trim()
            if (value && (!best || value.length < best.length)) best = value
        }
        return best
    }

    findDescription(document, title) {
        const selectors = [
            "[class*='description']",
            "[class*='desc']",
            "[class*='intro']",
            "[class*='summary']",
            "[class*='content'] p",
            "main p",
            "article p",
        ]
        const noise = ["瓜子漫畫提供", "瓜子漫画提供", "掃碼下載", "扫码下载", "Copyright", "APP下載", "APP下载"]
        let best = ""
        for (const selector of selectors) {
            for (const e of document.querySelectorAll(selector)) {
                const text = String(e.text || "").replace(/\s+/g, " ").trim()
                if (text.length < 25 || text.length > 2000) continue
                if (noise.some(n => text.includes(n))) continue
                if (title && text === title) continue
                if (!best || text.length > best.length) best = text
            }
            if (best) return best
        }

        const meta = this.findMeta(document, "meta[name='description']")
        return meta && !noise.some(n => meta.includes(n)) ? meta : ""
    }

    findCover(document, title) {
        let cover = this.findMeta(document, "meta[property='og:image']")
        if (cover) return this.absoluteUrl(cover)

        const imgs = document.querySelectorAll("img")
        for (const img of imgs) {
            const alt = String(img.attributes?.alt || "")
            if (title && alt.includes(title)) {
                cover = this.getImageUrl(img)
                if (cover) return cover
            }
        }
        return ""
    }

    parseChapters(document) {
        const map = new Map()
        for (const a of document.querySelectorAll("a[href*='chapter.php?id=']")) {
            const id = this.extractChapterId(a.attributes?.href)
            if (!id) continue
            let title = String(a.text || "").replace(/\s+/g, " ").trim()
            if (/^(?:開始閱讀|开始阅读|閱讀|阅读|去閱讀|去阅读)\s*>?$/i.test(title)) continue
            title = title.replace(/\d{4}-\d{2}-\d{2}\s*(?:更新)?/g, "").replace(/(?:去閱讀|去阅读|閱讀|阅读)\s*>?$/g, "").trim()
            if (!title) title = `章節 ${id}`
            if (!map.has(id) || title.length < map.get(id).length) map.set(id, title)
        }

        return new Map([...map.entries()].sort((a, b) => Number(a[0]) - Number(b[0])))
    }

    comic = {
        loadInfo: async (id) => {
            const url = `${this.baseUrl}/comic.php?id=${encodeURIComponent(id)}`
            const doc = await this.getHtml(url)
            const title = String(doc.querySelector("h1")?.text || this.findMeta(doc, "meta[property='og:title']") || id).trim()
            const cover = this.findCover(doc, title)
            const description = this.findDescription(doc, title)
            const author = this.findLabelValue(doc, "作者")
            const status = this.findLabelValue(doc, "狀態") || this.findLabelValue(doc, "状态")
            const genreText = this.findLabelValue(doc, "題材") || this.findLabelValue(doc, "题材") || this.findLabelValue(doc, "分類") || this.findLabelValue(doc, "分类")

            const tags = {}
            if (author) tags["作者"] = [author]
            if (status) tags["狀態"] = [status]
            if (genreText) tags["題材"] = genreText.split(/[\/·,，|]/).map(s => s.trim()).filter(Boolean)

            return new ComicDetails({
                title,
                subTitle: author,
                cover,
                description,
                tags,
                chapters: this.parseChapters(doc),
                url,
            })
        },

        loadEp: async (comicId, epId) => {
            if (!epId) throw "缺少章節 ID"
            const pageUrl = `${this.baseUrl}/chapter.php?id=${encodeURIComponent(epId)}`
            const res = await this.request(pageUrl, `${this.baseUrl}/comic.php?id=${encodeURIComponent(comicId)}`)
            const doc = new HtmlDocument(res.body)

            let imgs = doc.querySelectorAll("img[alt*='页'], img[alt*='頁']")
            const precise = imgs.length > 0
            if (!precise) imgs = doc.querySelectorAll("img")

            const images = []
            const seen = new Set()
            const noise = /logo|favicon|icon|avatar|qrcode|qr-code|loading|placeholder|\/app\//i
            for (const img of imgs) {
                const u = this.getImageUrl(img)
                if (!u || seen.has(u)) continue
                if (!precise && noise.test(u)) continue
                seen.add(u)
                images.push(u)
            }

            if (images.length === 0) {
                const html = String(res.body).replace(/\\\//g, "/").replace(/&amp;/g, "&")
                const matches = html.match(/https?:\/\/[^\s\"'<>\\]+?\.(?:jpe?g|png|webp|avif)(?:\?[^\s\"'<>\\]*)?/gi) || []
                for (const raw of matches) {
                    const u = this.absoluteUrl(raw)
                    if (!u || seen.has(u) || noise.test(u)) continue
                    seen.add(u)
                    images.push(u)
                }
            }

            if (images.length === 0) throw "本章沒有解析到圖片；請把 Venera 錯誤日誌提供給我調整來源。"
            return { images }
        },

        onImageLoad: (url, comicId, epId) => {
            return {
                headers: {
                    "referer": `${this.baseUrl}/chapter.php?id=${encodeURIComponent(epId || "")}`,
                    "user-agent": "Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36",
                    "accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
                }
            }
        },

        onThumbnailLoad: (url) => {
            return {
                headers: {
                    "referer": `${this.baseUrl}/`,
                    "user-agent": "Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36",
                }
            }
        },

        link: {
            domains: ["guazimanhua.com", "www.guazimanhua.com"],
            linkToId: (url) => this.extractComicId(url),
        },
        enableTagsTranslate: false,
    }
}

const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')

const sourceCode = fs.readFileSync(path.join(__dirname, '../mh160mh.js'), 'utf8')
const requests = []
let responder = async () => ({ status: 200, body: '<html></html>' })
const sandbox = {
  ComicSource: class {},
  Comic: class { constructor(data) { Object.assign(this, data) } },
  ComicDetails: class { constructor(data) { Object.assign(this, data) } },
  HtmlDocument: class { constructor(html) { this.html = html } },
  Network: {
    get: async (url, headers) => { requests.push({ url, headers }); return responder(url) },
    post: async () => { throw Error('POST disabled in mock') }
  },
  console,
}
vm.createContext(sandbox)
vm.runInContext(sourceCode + '\nthis.Source = Mh160mh', sandbox)
const src = new sandbox.Source()
const anchor = (href, text, child = null) => ({
  attributes: { href }, text, parent: null,
  querySelector: () => child
})
const img = (url) => ({ attributes: { 'data-src': url }, text: '' })
const docWithLinks = links => ({
  querySelectorAll(selector) {
    if (selector === "a[href*='/kanmanhua/']") return links
    if (selector === 'a[href]') return links
    return []
  },
  querySelector: () => null
})

test('來源定義與網址解析', () => {
  assert.equal(src.key, 'mh160mh')
  assert.equal(src.comicId('https://m.mh160mh.com/kanmanhua/12094/'), '12094')
  assert.equal(src.comicId('/kanmanhua/wanjieshoumenren/'), 'wanjieshoumenren')
  assert.equal(src.comicId('/kanmanhua/all/'), null)
  assert.equal(src.comicId('/kanmanhua/rexue/'), null)
  assert.equal(src.episodeId('/kanmanhua/wanjieshoumenren/82510201.html'), 'wanjieshoumenren/82510201.html')
  assert.equal(src.episodeId('/kanmanhua/all/2.html'), 'all/2.html')
  assert.equal(src.epUrl('wanjieshoumenren/82510201.html'), 'https://www.mh160mh.com/kanmanhua/wanjieshoumenren/82510201.html')
  assert.throws(() => src.comicUrl('../../x'), /無效/)
  assert.throws(() => src.epUrl('../../x.html'), /無效/)
})

test('相對圖片網址與 lazy-load', () => {
  assert.equal(src.absoluteUrl('//p.miyeye.cn/test.jpg'), 'https://p.miyeye.cn/test.jpg')
  assert.equal(src.absoluteUrl('../1.jpg', 'https://www.mh160mh.com/kanmanhua/12094/a.html'), 'https://www.mh160mh.com/kanmanhua/1.jpg')
  assert.equal(src.absoluteUrl('javascript:alert(1)'), '')
  assert.equal(src.imageUrl(img('//p.miyeye.cn/cover.jpg')), 'https://p.miyeye.cn/cover.jpg')
})

test('漫畫列表去重，過濾列表頁與章節', () => {
  const links = [
    anchor('/kanmanhua/12094/', '第352話'),
    anchor('/kanmanhua/12094/', '風起蒼嵐'),
    anchor('/kanmanhua/wanjieshoumenren/', '萬界守門人'),
    anchor('/kanmanhua/12094/123.html', '第123話'),
    anchor('/kanmanhua/all/', '全部漫畫'),
    anchor('/kanmanhua/rexue/', '熱血'),
  ]
  const comics = src.parseComicList(docWithLinks(links))
  assert.equal(comics.length, 2)
  assert.equal(comics[0].title, '風起蒼嵐')
  assert.deepEqual(Array.from(comics, c => String(c.id)), ['12094', 'wanjieshoumenren'])
})

test('章節順序為舊到新，保留完整章節 ID', () => {
  const links = [
    anchor('/kanmanhua/12094/3.html', '第三話'),
    anchor('/kanmanhua/12094/2.html', '第二話'),
    anchor('/kanmanhua/12094/1.html', '第一話'),
    anchor('/kanmanhua/12094/1.html', '第一話'),
  ]
  const ep = src.parseChapterLinks(docWithLinks(links))
  assert.deepEqual([...ep.keys()], ['12094/1.html', '12094/2.html', '12094/3.html'])
})

test('圖片只解析符合格式的網址，不執行 HTML 裡的 JS', () => {
  const emptyDoc = { querySelectorAll: () => [] }
  const html = `<script>var chapterImages = ["//p.miyeye.cn/chapter/001.jpg", "https://p.miyeye.cn/chapter/002.webp"]</script>`
  const images = src.extractImages(emptyDoc, html, 'https://m.mh160mh.com/kanmanhua/12094/1.html')
  assert.deepEqual(Array.from(images), ['https://p.miyeye.cn/chapter/001.jpg', 'https://p.miyeye.cn/chapter/002.webp'])
  assert.equal(src.extractImages(emptyDoc, '<div>no image</div>', src.baseUrl).length, 0)
})

test('檢查桌面網域失敗時是否切到行動網域', async () => {
  requests.length = 0
  responder = url => url.includes('www.') ? { status: 404, body: '' } : { status: 200, body: '<html>ok</html>' }
  const page = await src.getPage('/kanmanhua/12094/')
  assert.equal(page.url, 'https://m.mh160mh.com/kanmanhua/12094/')
  assert.equal(requests.length, 2)
})

test('index.json 的離線基本格式', () => {
  const entries = JSON.parse(fs.readFileSync(path.join(__dirname, '../index.json'), 'utf8'))
  assert.equal(entries.length, 1)
  assert.equal(entries[0].filename, 'mh160mh.js')
  assert.equal(entries[0].version, src.version)
})

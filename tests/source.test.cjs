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
  Convert: {
    decodeBase64: input => Uint8Array.from(Buffer.from(input, 'base64')),
    decodeUtf8: buffer => Buffer.from(buffer).toString('utf8'),
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

test('行動版網域優先於桌面站', async () => {
  requests.length = 0
  responder = url => url.includes('www.') ? { status: 404, body: '' } : { status: 200, body: '<html>ok</html>' }
  const page = await src.getPage('/kanmanhua/12094/')
  assert.equal(page.url, 'https://m.mh160mh.com/kanmanhua/12094/')
  assert.equal(requests.length, 1)
})

test('index.json 的離線基本格式', () => {
  const entries = JSON.parse(fs.readFileSync(path.join(__dirname, '../index.json'), 'utf8'))
  assert.equal(entries.length, 1)
  assert.equal(entries[0].url, 'https://raw.githubusercontent.com/valvenis201/venera-guazimanhua/mh160mh/mh160mh.js')
  assert.equal(entries[0].version, src.version)
})

test('Base64 章節圖片解碼：新站 CDN，保留圖片順序', () => {
  const imgPaths = ['/comic/123/1.jpg', '/comic/123/2.jpg']
  const payload = Buffer.from(imgPaths.join('$qingtiandy$')).toString('base64')
  const html = `<script>var qTcms_S_m_murl_e="${payload}";var qTcms_S_p_id="542725";</script>`
  const doc = { querySelectorAll: () => [] }
  assert.deepEqual(Array.from(src.extractImages(doc, html, 'https://m.mh160mh.com/kanmanhua/12094/1.html')), [
    'https://xwdf.tgmhfc.uk/comic/123/1.jpg',
    'https://xwdf.tgmhfc.uk/comic/123/2.jpg'
  ])
})

test('Base64 章節圖片解碼：舊站 CDN 與非 ASCII 資料', () => {
  const payload = Buffer.from('/漫画/第一话/1.jpg').toString('base64')
  const html = `<script>qTcms_S_m_murl_e='${payload}'; qTcms_S_p_id='100';</script>`
  assert.deepEqual(Array.from(src.decodeMh160Images(html)), ['https://mhpic6.tgmhfc.uk/漫画/第一话/1.jpg'])
})

test('未取得封面網址時使用有效 HTTPS 預設封面，不傳遞空字串', () => {
  const comics = src.parseComicList(docWithLinks([anchor('/kanmanhua/12094/', '風起蒼嵐')]))
  assert.equal(comics[0].cover, 'https://raw.githubusercontent.com/valvenis201/venera-guazimanhua/mh160mh/assets/no-cover.png')
})

test('相對章節連結可以解析', () => {
  const doc = {
    querySelectorAll: selector => selector === 'a[href]' ? [anchor('123.html','第一話'),anchor('124.html','第二話')] : []
  }
  const result = src.parseChapterLinks(doc, 'abc', 'https://m.mh160mh.com/kanmanhua/abc/')
  assert.deepEqual([...result.keys()], ['abc/124.html','abc/123.html'])
})


test('搜尋使用漫畫160真正的 /statics/search.aspx?key= 接口（中文 URL 編碼）', async () => {
  const called = []
  const original = src.getPage
  try {
    src.getPage = async (path) => {
      called.push(path)
      return { doc: docWithLinks([
        anchor('/kanmanhua/tianmozhixiang/', '天魔只想苟住'),
        anchor('/kanmanhua/yaoshenji/', '妖神記'),
      ]), url: 'https://m.mh160mh.com' + path }
    }
    const result = await src.search.load('天魔只想', [], 1)
    assert.deepEqual(called, ['/statics/search.aspx?key=%E5%A4%A9%E9%AD%94%E5%8F%AA%E6%83%B3'])
    assert.deepEqual(Array.from(result.comics, item => item.id), ['tianmozhixiang'])
    assert.equal(result.maxPage, 1)
  } finally { src.getPage = original }
})

test('搜尋結果允許非絕對路徑的漫畫連結', () => {
  const links = [anchor('kanmanhua/tianmo/', '天魔只想'), anchor('../kanmanhua/12094/', '風起蒼嵐')]
  const comics = src.parseComicList(docWithLinks(links), 'https://m.mh160mh.com/statics/search.aspx?key=test')
  assert.deepEqual(Array.from(comics, item => item.id), ['tianmo', '12094'])
})

test('空搜尋與無結果安全回傳，未經證實的第 2 頁不會發出網路請求', async () => {
  const original = src.getPage
  let count = 0
  try {
    src.getPage = async (path) => { count++; return { doc: docWithLinks([]), url: src.mobileUrl + path } }
    assert.equal((await src.search.load('不存在的作品', [], 1)).comics.length, 0)
    assert.equal((await src.search.load('天魔只想', [], 2)).comics.length, 0)
    assert.equal((await src.search.load(' ', [], 1)).comics.length, 0)
    assert.equal(count, 1)
  } finally { src.getPage = original }
})

test('來源發送行動版真實搜尋路徑，保留 www 域名作為備援', async () => {
  const prior = responder
  requests.length = 0
  try {
    responder = url => url.includes('m.mh160mh.com') ? { status: 404, body: 'not found' } : { status: 200, body: '<html>ok</html>' }
    await src.getPage(src.searchPath('天魔只想'))
    assert.deepEqual(requests.map(x => x.url), [
      'https://m.mh160mh.com/statics/search.aspx?key=%E5%A4%A9%E9%AD%94%E5%8F%AA%E6%83%B3',
      'https://www.mh160mh.com/statics/search.aspx?key=%E5%A4%A9%E9%AD%94%E5%8F%AA%E6%83%B3',
    ])
  } finally { responder = prior }
})

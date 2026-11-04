// Chrome runs captions.js in the same global scope as the scripts that use it.
// Compile each real combination as one script so name clashes fail here, not in the browser.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')
const manifest = JSON.parse(read('manifest.json'))

const bundles = {
  'background (importScripts)': ['captions.js', 'background.js'],
  'popup.html': ['captions.js', 'popup.js'],
  'offscreen.html': ['captions.js', 'offscreen.js'],
  ...Object.fromEntries(manifest.content_scripts.map(cs => [`content script ${cs.matches[0]}`, cs.js])),
}

for (const [name, files] of Object.entries(bundles)) {
  test(`${name} loads without name clashes`, () => {
    assert.doesNotThrow(() => new vm.Script(files.map(read).join('\n;\n'), { filename: name }))
  })
}

test('popup.html loads captions.js before popup.js', () => {
  const html = read('popup.html')
  assert.ok(html.indexOf('src="captions.js"') < html.indexOf('src="popup.js"'))
})

test('offscreen.html loads offscreen.js', () => {
  const html = read('offscreen.html')
  assert.ok(html.indexOf('src="captions.js"') > 0 && html.indexOf('src="captions.js"') < html.indexOf('src="offscreen.js"'))
  assert.ok(manifest.permissions.includes('offscreen') && manifest.permissions.includes('tabCapture'))
})

test('background imports captions.js', () => {
  assert.match(read('background.js'), /importScripts\('captions\.js'\)/)
})

test('every file the manifest references exists', () => {
  const files = [manifest.background.service_worker, manifest.action.default_popup, 'offscreen.html', 'offscreen.js',
    ...manifest.content_scripts.flatMap(cs => cs.js), ...Object.values(manifest.icons)]
  for (const f of files) assert.ok(fs.existsSync(path.join(__dirname, '..', f)), `missing ${f}`)
})

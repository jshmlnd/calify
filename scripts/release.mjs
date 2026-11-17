// Builds and publishes Calify <version> to GitHub Releases (jshmlnd/calify). Run on the PC that holds
// ~/.android/debug.keystore (every Android release must be signed with it).
//   npm run release              build, test and publish
//   npm run release -- --dry-run print every command without running anything
// Needs: gh logged in as the repo owner (GH_TOKEN defaults to `gh auth token`), JAVA_HOME for Gradle.
import { spawnSync, execFileSync } from 'node:child_process'
import { readFileSync, copyFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dry = process.argv.includes('--dry-run')
const root = fileURLToPath(new URL('..', import.meta.url))
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
globalThis.__APP_VERSION__ = version
const { CHANGELOG } = await import('../src/changelog.js')
const entry = CHANGELOG[0]

// Checks run before anything builds or uploads. A dry run reports them and carries on.
const problems = []
const check = (ok, msg) => { if (!ok) problems.push(msg) }
const git = (...a) => { try { return execFileSync('git', a, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() } catch { return '' } }
check(entry.version === version, `CHANGELOG[0] is ${entry.version}, package.json is ${version}`)
// Android refuses an APK whose versionCode isn't higher than the installed one.
const gradleVer = text => ({ name: /versionName\s+"([^"]+)"/.exec(text)?.[1], code: +/versionCode\s+(\d+)/.exec(text)?.[1] || 0 })
const android = gradleVer(readFileSync(join(root, 'android/app/build.gradle'), 'utf8'))
check(android.name === version, `android/app/build.gradle versionName is ${android.name}, package.json is ${version}`)
check(android.code > 1, `android/app/build.gradle versionCode is missing or not above 1`)
let lastTag = ''
try { lastTag = execFileSync('gh', ['api', 'repos/jshmlnd/calify/releases/latest', '-q', '.tag_name'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() } catch {}
const last = lastTag && gradleVer(git('show', `${lastTag}:android/app/build.gradle`))
if (last?.code) check(android.code > last.code, `versionCode ${android.code} is not above ${last.code} (last release ${lastTag}); bump it in android/app/build.gradle`)
else console.log(`(couldn't read the last release's versionCode${lastTag ? ` from tag ${lastTag}` : ''}; only checked it is above 1)`)
const tag = `v${version}`
// The tag is created at this commit when the draft is published, so it must be committed and on GitHub.
const sha = git('rev-parse', 'HEAD')
check(git('status', '--porcelain') === '', 'Uncommitted changes: commit or stash them first')
check(git('branch', '-r', '--contains', 'HEAD') !== '', 'HEAD is not on the remote: git push first')
if (problems.length) {
  console.log(problems.map(p => `! ${p}`).join('\n'))
  if (!dry) process.exit(1)
  console.log('(dry run: a real run would stop here)\n')
}
const win = process.platform === 'win32'
const apkOut = join(root, 'android/app/build/outputs/apk/release/app-release.apk')
const apk = join(root, `release/Calify-${version}.apk`)
const list = (title, items) => items.length ? `### ${title}\n${items.map(i => `- ${i}`).join('\n')}\n` : ''
const notes = [list('New', entry.new), list('Fixed', entry.fixed)].filter(Boolean).join('\n')

if (!existsSync(join(homedir(), '.android/debug.keystore'))) throw new Error('~/.android/debug.keystore is missing: releases must be signed with it')
const env = { ...process.env }
if (!env.GH_TOKEN && !dry) env.GH_TOKEN = execFileSync('gh', ['auth', 'token'], { encoding: 'utf8' }).trim()

// gh runs without a shell so the multi-line notes pass through untouched; npm/npx/gradlew are .cmd/.bat on Windows and need one.
function run(cmd, args, cwd = root) {
  console.log(`> ${cwd === root ? '' : `(in ${cwd}) `}${cmd} ${args.map(a => /[\s"]/.test(a) ? JSON.stringify(a) : a).join(' ')}`)
  if (dry) return
  const r = spawnSync(cmd, args, { cwd, env, stdio: 'inherit', shell: cmd !== 'gh' })
  if (r.status !== 0) { console.error(`\nFailed: ${cmd} ${args[0]} (exit ${r.status ?? r.error?.message})`); process.exit(1) }
}

console.log(`Calify ${version} → github.com/jshmlnd/calify, tag ${tag}${dry ? ' (dry run: nothing runs)' : ''}\n`)
run('npm', ['test'])
run('npx', ['vite', 'build'])
// Uploads the installer, its blockmap and latest.yml (what electron-updater reads) to a draft release tagged v<version>.
run('npx', ['electron-builder', '--win', 'nsis', '--publish', 'always'])
run('npx', ['cap', 'sync', 'android'])
run(win ? 'gradlew.bat' : './gradlew', ['assembleRelease'], join(root, 'android'))
console.log(`> copy ${apkOut} ${apk}`)
if (!dry) copyFileSync(apkOut, apk)
run('gh', ['release', 'upload', tag, apk, '--clobber', '-R', 'jshmlnd/calify'])
run('gh', ['release', 'edit', tag, '--draft=false', '--target', sha, '--title', `Calify ${version}`, '--notes', notes, '-R', 'jshmlnd/calify'])
console.log(dry ? '\nDry run done.' : `\nPublished: https://github.com/jshmlnd/calify/releases/tag/${tag}`)

// electron-builder afterSign hook: VMP-sign the packaged app with castLabs EVS so Spotify's Widevine
// licence server accepts it. Runs after Windows code-signing, as EVS requires on Windows.
// Needs a free EVS account (python -m castlabs_evs.account signup); without one the build still succeeds.
const { execFileSync } = require('child_process')

exports.default = async ctx => {
  if (ctx.electronPlatformName !== 'win32') return
  try {
    execFileSync('python', ['-m', 'castlabs_evs.vmp', 'sign-pkg', ctx.appOutDir], { stdio: 'inherit', env: { ...process.env, EVS_NO_ASK: '1' } })
  } catch (e) {
    console.warn(`  • EVS signing skipped (${e.message.split('\n')[0]}). Spotify songs won't play until it's signed; see README.`)
  }
}

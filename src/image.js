// Fit an image inside max×max and re-encode as WebP, so uploads stay small.
export async function resizeImage(file, max = 1024) {
  const img = await createImageBitmap(file)
  const k = Math.min(1, max / Math.max(img.width, img.height))
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k))
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
  img.close()
  return new Promise((ok, no) => c.toBlob(b => b ? ok(b) : no(new Error('Couldn’t read that image')), 'image/webp', 0.85))
}

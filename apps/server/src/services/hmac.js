import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Verify HMAC signature for incoming webhooks.
 * Supports: sha256=<hex> (GitHub style) and sha1=<hex>
 */
export function verifyHmac(secret, rawBody, signatureHeader) {
  if (!signatureHeader) return false

  const [algo, receivedSig] = signatureHeader.split('=')
  if (!algo || !receivedSig) return false

  const hmacAlgo = algo === 'sha256' ? 'sha256' : algo === 'sha1' ? 'sha1' : null
  if (!hmacAlgo) return false

  const expected = createHmac(hmacAlgo, secret)
    .update(rawBody)
    .digest('hex')

  try {
    return timingSafeEqual(
      Buffer.from(receivedSig, 'hex'),
      Buffer.from(expected, 'hex')
    )
  } catch {
    return false
  }
}

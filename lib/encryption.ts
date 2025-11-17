import crypto from "crypto"

const ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 12 // bytes
const TAG_LENGTH = 16 // bytes

function getEncryptionKey() {
  const secret = process.env.INBOX_PASSWORD_ENCRYPTION_KEY
  if (!secret) {
    throw new Error("INBOX_PASSWORD_ENCRYPTION_KEY is not set")
  }

  // Derive a 32-byte key using SHA-256
  return crypto.createHash("sha256").update(secret).digest()
}

export function encryptSecret(plaintext: string) {
  if (!plaintext) {
    throw new Error("Cannot encrypt empty value")
  }

  const key = getEncryptionKey()
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const authTag = cipher.getAuthTag()

  return [
    iv.toString("base64"),
    authTag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":")
}

export function decryptSecret(payload: string) {
  if (!payload) {
    throw new Error("Cannot decrypt empty value")
  }

  const [ivPart, tagPart, dataPart] = payload.split(":")
  if (!ivPart || !tagPart || !dataPart) {
    throw new Error("Invalid encrypted payload format")
  }

  const key = getEncryptionKey()
  const iv = Buffer.from(ivPart, "base64")
  const authTag = Buffer.from(tagPart, "base64")
  const encryptedData = Buffer.from(dataPart, "base64")

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)

  const decrypted = Buffer.concat([decipher.update(encryptedData), decipher.final()])
  return decrypted.toString("utf8")
}


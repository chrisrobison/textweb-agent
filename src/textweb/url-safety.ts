export function normalizeAndValidateUrl(input: string): string {
  let url: URL
  try {
    url = new URL(input)
  } catch {
    throw new Error('Invalid URL')
  }

  const protocol = url.protocol.toLowerCase()
  if (protocol !== 'http:' && protocol !== 'https:') {
    throw new Error('Only http:// and https:// URLs are allowed')
  }

  url.hash = ''
  return url.toString()
}

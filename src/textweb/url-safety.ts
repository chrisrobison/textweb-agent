import dns from 'node:dns/promises'
import net from 'node:net'

import { env } from '../config/env.js'

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split('.').map((part) => Number(part))
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) return true

  const [a, b] = parts
  if (a === 10) return true
  if (a === 127) return true
  if (a === 0) return true
  if (a === 100 && b >= 64 && b <= 127) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 192 && b === 0) return true
  if (a === 192 && b === 88 && parts[2] === 99) return true
  if (a === 198 && (b === 18 || b === 19)) return true
  if (a >= 224) return true
  return false
}

function isPrivateIpv6(ip: string): boolean {
  const value = ip.toLowerCase()
  const mappedPrefix = '::ffff:'
  if (value.startsWith(mappedPrefix)) {
    const mappedIpv4 = value.slice(mappedPrefix.length)
    return isPrivateIpv4(mappedIpv4)
  }
  return (
    value === '::1' ||
    value === '::' ||
    value.startsWith('fc') ||
    value.startsWith('fd') ||
    value.startsWith('fe80:') ||
    value.startsWith('ff')
  )
}

function isPrivateIp(ip: string): boolean {
  const family = net.isIP(ip)
  if (family === 4) return isPrivateIpv4(ip)
  if (family === 6) return isPrivateIpv6(ip)
  return true
}

function normalizeIpHost(hostname: string): string {
  if (hostname.startsWith('[') && hostname.endsWith(']')) {
    return hostname.slice(1, -1)
  }
  return hostname
}

function parseAllowlist(): string[] {
  return String(env.URL_ALLOWLIST || '')
    .split(',')
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean)
}

function hostMatchesAllowlist(hostname: string, allowlist: string[]): boolean {
  if (allowlist.length === 0) return true
  const host = hostname.toLowerCase()

  return allowlist.some((rule) => {
    if (rule.startsWith('*.')) {
      const suffix = rule.slice(1)
      return host.endsWith(suffix) && host !== suffix.slice(1)
    }
    return host === rule
  })
}

export function normalizeAndValidateUrl(input: string): string {
  if (input.length > env.MAX_URL_LENGTH) {
    throw new Error(`URL exceeded MAX_URL_LENGTH (${env.MAX_URL_LENGTH})`)
  }

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

  if (url.username || url.password) {
    throw new Error('URLs with embedded credentials are not allowed')
  }

  const hostname = url.hostname.toLowerCase()
  if (!hostname) throw new Error('Invalid URL hostname')
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.internal')
  ) {
    throw new Error('Local hostnames are not allowed')
  }

  const allowlist = parseAllowlist()
  if (!hostMatchesAllowlist(hostname, allowlist)) {
    throw new Error('URL hostname is not in allowlist')
  }

  const ipHost = normalizeIpHost(hostname)
  if (env.BLOCK_PRIVATE_NETWORKS && net.isIP(ipHost) && isPrivateIp(ipHost)) {
    throw new Error('Private network IPs are blocked')
  }

  url.hash = ''
  return url.toString()
}

export async function assertSafeResolvedAddress(urlInput: string): Promise<void> {
  if (!env.BLOCK_PRIVATE_NETWORKS) return

  const url = new URL(urlInput)
  const hostname = normalizeIpHost(url.hostname)

  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) throw new Error('Resolved private network IP is blocked')
    return
  }

  const lookup = dns.lookup(hostname, { all: true, verbatim: true })
  const records = (await Promise.race([
    lookup,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`DNS lookup timeout after ${env.DNS_LOOKUP_TIMEOUT_MS}ms`)), env.DNS_LOOKUP_TIMEOUT_MS),
    ),
  ])) as Awaited<typeof lookup>
  if (records.length === 0) {
    throw new Error('Unable to resolve hostname')
  }

  for (const record of records) {
    if (isPrivateIp(record.address)) {
      throw new Error('Hostname resolved to private network IP')
    }
  }
}

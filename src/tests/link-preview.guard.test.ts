// c:\Users\Ael\Desktop\Asgard!\src\tests\link-preview.guard.test.ts
/// <reference types="vitest/globals" />
/**
 * Garde SSRF des aperçus de liens.
 *
 * L'URL vient d'un message reçu : sans garde, `fetchLinkPreview` laissait un
 * pair faire interroger localhost, le LAN ou les métadonnées cloud par la
 * machine de l'utilisateur, puis renvoyait le titre obtenu. La politique est
 * une fonction pure, testée ici : schéma, identifiants, port standard, nom
 * d'hôte local, et toutes les plages d'adresses non routables — y compris les
 * formes IPv6 qui encapsulent une IPv4 privée.
 */
import { describe, it, expect } from 'vitest'
import {
  isDisallowedHostname,
  isDisallowedIpAddress,
  isSafePreviewUrl,
} from '../../electron/utils/previewUrlSafety'

describe('garde SSRF des aperçus de liens', () => {
  it.each([
    ['localhost', 'http://localhost/'],
    ['localhost en majuscules', 'http://LOCALHOST/'],
    ['sous-domaine localhost', 'http://foo.localhost/'],
    ['mDNS .local', 'http://printer.local/'],
    ['zone interne', 'http://service.internal/'],
    ['home.arpa', 'http://router.home.arpa/'],
    ['.lan', 'http://nas.lan/'],
    ['loopback 127/8', 'http://127.0.0.1/'],
    ['loopback décalé', 'http://127.9.9.9/'],
    ['RFC 1918 10/8', 'http://10.1.2.3/'],
    ['RFC 1918 172.16/12', 'http://172.16.0.1/'],
    ['RFC 1918 borne haute', 'http://172.31.255.254/'],
    ['RFC 1918 192.168/16', 'http://192.168.0.1/'],
    ['métadonnées cloud', 'http://169.254.169.254/latest/meta-data'],
    ['adresse non spécifiée', 'http://0.0.0.0/'],
    ['CGNAT', 'http://100.64.0.1/'],
    ['banc d’essai', 'http://198.18.0.1/'],
    ['TEST-NET-3', 'http://203.0.113.7/'],
    ['IPv6 loopback', 'http://[::1]/'],
    ['IPv6 non spécifiée', 'http://[::]/'],
    ['IPv6 lien local', 'http://[fe80::1]/'],
    ['IPv6 ULA', 'http://[fd12:3456::1]/'],
    ['IPv6 projetée privée', 'http://[::ffff:127.0.0.1]/'],
    ['IPv6 projetée LAN', 'http://[::ffff:192.168.1.10]/'],
    ['6to4 vers loopback', 'http://[2002:7f00:1::]/'],
    ['NAT64 vers LAN', 'http://[64:ff9b::a00:1]/'],
    ['entier IPv4', 'http://2130706433/'],
    ['IPv4 hexadécimale', 'http://0x7f000001/'],
    ['schéma ftp', 'ftp://example.com/file'],
    ['schéma file', 'file:///etc/passwd'],
    ['identifiants dans l’URL', 'https://user:secret@example.com/'],
    ['port non standard', 'https://example.com:8443/'],
    ['port SSH', 'https://example.com:22/'],
    ['URL invalide', 'not a url'],
    ['chaîne vide', ''],
  ])('refuse %s', (_label, url) => {
    expect(isSafePreviewUrl(url)).toBe(false)
  })

  it.each([
    ['site public', 'https://example.com/'],
    ['chemin et requête', 'http://example.com/article?a=1#top'],
    ['sous-domaine', 'https://news.example.co.uk/'],
    ['IPv4 publique', 'https://8.8.8.8/'],
    ['IPv4 publique voisine de 172.16/12', 'https://172.32.0.1/'],
    ['IPv6 publique', 'https://[2606:4700:4700::1111]/'],
    ['point final du FQDN', 'http://example.com./'],
    ['6to4 vers une IPv4 publique', 'http://[2002:808:808::]/'],
  ])('accepte %s', (_label, url) => {
    expect(isSafePreviewUrl(url)).toBe(true)
  })

  it('classe les adresses par plage, pas par préfixe textuel', () => {
    expect(isDisallowedIpAddress('172.15.255.255')).toBe(false)
    expect(isDisallowedIpAddress('172.16.0.0')).toBe(true)
    expect(isDisallowedIpAddress('172.32.0.0')).toBe(false)
    expect(isDisallowedIpAddress('198.51.99.1')).toBe(false)
    expect(isDisallowedIpAddress('198.51.100.1')).toBe(true)
    expect(isDisallowedIpAddress('203.0.112.1')).toBe(false)
    expect(isDisallowedIpAddress('203.0.113.1')).toBe(true)
    expect(isDisallowedIpAddress('192.0.1.1')).toBe(false)
    expect(isDisallowedIpAddress('192.0.2.1')).toBe(true)
    expect(isDisallowedIpAddress('::ffff:8.8.8.8')).toBe(false)
    expect(isDisallowedIpAddress('2001:db8::1')).toBe(true)
    expect(isDisallowedIpAddress('2606:4700::1111')).toBe(false)
  })

  it('refuse un hôte vide ou un IPv6 malformé', () => {
    expect(isDisallowedHostname('')).toBe(true)
    expect(isDisallowedHostname('   ')).toBe(true)
    expect(isDisallowedIpAddress('1::2::3')).toBe(true)
    expect(isDisallowedIpAddress('')).toBe(true)
  })
})

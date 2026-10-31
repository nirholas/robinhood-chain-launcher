import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ProposalStore } from '../../src/auto/proposals.js'
import { launchConfigSchema } from '../../src/core/config.js'
import type { RailPreflight } from '../../src/rails/types.js'

let dataDir: string

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'hood-launcher-proposals-'))
})

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true })
})

// The shape every rail's preflight() returns: fee and value are bigint wei.
const NOXA_PREFLIGHT: RailPreflight = {
  rail: 'noxa',
  network: 'mainnet',
  ready: true,
  blockers: [],
  protocolFeeWei: 500_000_000_000_000n,
  estimatedValueWei: 500_000_000_000_000n,
}

describe('ProposalStore', () => {
  it('stores a proposal built from a real rail preflight (bigint wei fields)', () => {
    const store = new ProposalStore(dataDir)
    const created = store.create({
      narrativeTitle: 'test narrative',
      theme: 'test',
      launchConfig: launchConfigSchema.parse({ name: 'Test', symbol: 'TEST', rail: 'noxa' }),
      concept: { name: 'Test', symbol: 'TEST', description: '', logoUri: '', socials: {}, initialBuyWei: '0' },
      preflight: NOXA_PREFLIGHT,
    })

    const stored = new ProposalStore(dataDir).get(created.id)
    expect(stored?.status).toBe('pending')
    expect(String(stored?.preflight.protocolFeeWei)).toBe('500000000000000')
  })

  it('stores a direct-rail proposal, whose launch config carries a bigint totalSupply', () => {
    const store = new ProposalStore(dataDir)
    const launchConfig = launchConfigSchema.parse({ name: 'Test', symbol: 'TEST', rail: 'direct', direct: { seedEth: 0.01 } })
    const created = store.create({
      narrativeTitle: 'direct narrative',
      theme: 'test',
      launchConfig,
      concept: { name: 'Test', symbol: 'TEST', description: '', logoUri: '', socials: {}, initialBuyWei: '0' },
      preflight: { ...NOXA_PREFLIGHT, rail: 'direct', protocolFeeWei: 0n, estimatedValueWei: 10_000_000_000_000_000n },
    })

    const stored = new ProposalStore(dataDir).get(created.id)
    expect(stored?.launchConfig.direct?.totalSupply).toBe(1_000_000_000n)
  })
})

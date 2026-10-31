import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AutoScheduler, loadAutoConfig } from '../../src/auto/scheduler.js'
import { ProposalStore } from '../../src/auto/proposals.js'
import { launchConfigSchema, type OperatorConfig } from '../../src/core/config.js'
import type { HoodLauncher, LaunchOutcome } from '../../src/core/launcher.js'
import type { RailPreflight } from '../../src/rails/types.js'

let dataDir: string

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'hood-launcher-sched-'))
})

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true })
})

const LIVE: OperatorConfig = {
  network: 'mainnet',
  live: true,
  maxLaunchesPerDay: 3,
  maxSeedUsdgEquivalent: 50,
  acknowledgeLaunchResponsibility: true,
}

const BLOCKED: RailPreflight = {
  rail: 'noxa',
  network: 'mainnet',
  ready: false,
  blockers: ['NOXA launchFactory.launchEnabled() is currently false — launches will revert.'],
  protocolFeeWei: 500_000_000_000_000n,
  estimatedValueWei: 500_000_000_000_000n,
}

/** A launcher whose rail preflight is blocked: `launch()` returns without launching, as HoodLauncher does. */
function blockedLauncher(): HoodLauncher {
  return {
    async launch(): Promise<LaunchOutcome> {
      return {
        input: { name: 'Test', symbol: 'TEST', description: '', logoUri: '', socials: {}, initialBuyWei: 0n },
        preflight: BLOCKED,
        result: null,
        dryRun: false,
      }
    },
  } as unknown as HoodLauncher
}

function pendingProposal(store: ProposalStore) {
  return store.create({
    narrativeTitle: 'test narrative',
    theme: 'test',
    launchConfig: launchConfigSchema.parse({ name: 'Test', symbol: 'TEST', rail: 'noxa' }),
    concept: { name: 'Test', symbol: 'TEST', description: '', logoUri: '', socials: {}, initialBuyWei: '0' },
    preflight: BLOCKED,
  })
}

describe('AutoScheduler.approve', () => {
  it('does not mark a proposal executed when the live launch was refused at preflight', async () => {
    const store = new ProposalStore(dataDir)
    const proposal = pendingProposal(store)
    const scheduler = new AutoScheduler(blockedLauncher(), LIVE, loadAutoConfig({}), store)

    const result = await scheduler.approve(proposal.id)

    expect(result.status).not.toBe('executed')
    expect(result.status).toBe('failed')
  })
})

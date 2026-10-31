import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import type { LaunchConfig } from '../core/config.js'
import type { RailPreflight, Socials } from '../rails/types.js'

/**
 * A JSON-safe snapshot of the resolved concept for display/audit purposes
 * (dashboard, CLI listing). `initialBuyWei` is a decimal string, not a
 * `bigint` — {@link AutoScheduler.approve} re-derives the real launch from
 * `launchConfig` (whose `initialBuyEth` is a plain number), never from this
 * summary, so no bigint round-trip through JSON is ever required.
 */
export interface ProposalConceptSummary {
  name: string
  symbol: string
  description: string
  logoUri: string
  socials: Socials
  initialBuyWei: string
}

export interface PendingProposal {
  id: string
  createdAt: number
  narrativeTitle: string
  theme: string
  launchConfig: LaunchConfig
  concept: ProposalConceptSummary
  preflight: RailPreflight
  status: 'pending' | 'approved' | 'rejected' | 'executed' | 'failed'
}

/** File-backed store for autonomous-mode launch proposals awaiting operator approval. */
export class ProposalStore {
  private readonly path: string

  constructor(dataDir: string) {
    mkdirSync(dataDir, { recursive: true })
    this.path = join(dataDir, 'proposals.json')
  }

  private readAll(): Record<string, PendingProposal> {
    if (!existsSync(this.path)) return {}
    const all = JSON.parse(readFileSync(this.path, 'utf8')) as Record<string, PendingProposal>
    for (const id of Object.keys(all)) all[id] = reviveBigints(all[id] as PendingProposal)
    return all
  }

  private writeAll(all: Record<string, PendingProposal>): void {
    // A rail preflight carries bigint wei amounts and a direct-rail config a
    // bigint totalSupply; JSON.stringify throws on bigint, so store them as
    // decimal strings and restore them in readAll().
    const json = JSON.stringify(all, (_key, value) => (typeof value === 'bigint' ? value.toString() : value), 2)
    writeFileSync(this.path, json, 'utf8')
  }

  create(input: Omit<PendingProposal, 'id' | 'createdAt' | 'status'>): PendingProposal {
    const proposal: PendingProposal = {
      ...input,
      id: randomBytes(6).toString('hex'),
      createdAt: Date.now(),
      status: 'pending',
    }
    const all = this.readAll()
    all[proposal.id] = proposal
    this.writeAll(all)
    return proposal
  }

  list(status?: PendingProposal['status']): PendingProposal[] {
    const all = Object.values(this.readAll())
    return status ? all.filter((p) => p.status === status) : all
  }

  get(id: string): PendingProposal | null {
    return this.readAll()[id] ?? null
  }

  updateStatus(id: string, status: PendingProposal['status']): void {
    const all = this.readAll()
    const proposal = all[id]
    if (!proposal) throw new Error(`No proposal with id ${id}`)
    proposal.status = status
    this.writeAll(all)
  }
}

/** Restore the bigint fields {@link ProposalStore} wrote as decimal strings. */
function reviveBigints(proposal: PendingProposal): PendingProposal {
  const { launchConfig, preflight } = proposal
  return {
    ...proposal,
    launchConfig: launchConfig.direct
      ? { ...launchConfig, direct: { ...launchConfig.direct, totalSupply: BigInt(launchConfig.direct.totalSupply) } }
      : launchConfig,
    preflight: {
      ...preflight,
      protocolFeeWei: BigInt(preflight.protocolFeeWei),
      estimatedValueWei: BigInt(preflight.estimatedValueWei),
    },
  }
}

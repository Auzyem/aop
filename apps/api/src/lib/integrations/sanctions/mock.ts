import { logger } from '@aop/utils';
import type { ISanctionsProvider, SanctionsSearchParams, SanctionsSearchResult } from './types.js';

// ---------------------------------------------------------------------------
// Mock sanctions provider — deterministic, no network calls
// Returns CLEAR for any name unless it contains "BLOCKED" or "FLAGGED"
// ---------------------------------------------------------------------------

const PROVIDER_NAME = 'MockSanctions';

export class MockSanctionsProvider implements ISanctionsProvider {
  async search(params: SanctionsSearchParams): Promise<SanctionsSearchResult> {
    const upper = params.name.toUpperCase();
    const isHit = upper.includes('BLOCKED');
    const isPossible = upper.includes('FLAGGED');

    const outcome = isHit ? 'HIT' : isPossible ? 'POSSIBLE_MATCH' : 'CLEAR';

    const rawResult: Record<string, unknown> = {
      mock: true,
      search_term: params.name,
      content: {
        number_of_hits: outcome === 'CLEAR' ? 0 : 1,
        hits:
          outcome === 'CLEAR'
            ? []
            : [
                {
                  match_status: isHit ? 'true_positive' : 'potential_match',
                  name: params.name,
                  match_types: isHit ? ['sanction'] : ['warning'],
                },
              ],
      },
    };

    logger.debug({ name: params.name, outcome }, '[MockSanctions] screening result');
    return { outcome, provider: PROVIDER_NAME, rawResult };
  }
}

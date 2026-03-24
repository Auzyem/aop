import axios, { type AxiosError } from 'axios';
import { logger, ExternalServiceError } from '@aop/utils';
import type { SanctionsOutcome } from '@aop/db';
import type { ISanctionsProvider, SanctionsSearchParams, SanctionsSearchResult } from './types.js';

// ---------------------------------------------------------------------------
// ComplyAdvantage live adapter
// Docs: https://docs.complyadvantage.com/#search-for-an-entity
// ---------------------------------------------------------------------------

const PROVIDER_NAME = 'ComplyAdvantage';
const BASE_URL = process.env.SANCTIONS_API_URL ?? 'https://api.complyadvantage.com';
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 60_000; // 60 s on 429

function mapOutcome(data: Record<string, unknown>): SanctionsOutcome {
  const content = data.content as Record<string, unknown> | undefined;
  const totalHits = (content?.number_of_hits as number) ?? 0;
  if (totalHits === 0) return 'CLEAR';

  const hits = (content?.hits as Array<Record<string, unknown>>) ?? [];
  const hasTruePositive = hits.some((h) => (h.match_status as string) === 'true_positive');
  return hasTruePositive ? 'HIT' : 'POSSIBLE_MATCH';
}

async function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export class ComplyAdvantageSanctionsProvider implements ISanctionsProvider {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async search(params: SanctionsSearchParams): Promise<SanctionsSearchResult> {
    const payload = {
      search_term: params.name,
      fuzziness: 0.6,
      filters: {
        entity_type: params.entityType,
        ...(params.countryCode && { country_codes: [params.countryCode] }),
        types: ['sanction', 'warning', 'pep', 'adverse-media'],
      },
    };

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await axios.post<Record<string, unknown>>(
          `${BASE_URL}/v4/searches`,
          payload,
          {
            headers: {
              Authorization: `Token ${this.apiKey}`,
              'Content-Type': 'application/json',
            },
            timeout: 15_000,
          },
        );

        const rawResult = response.data;
        const outcome = mapOutcome(rawResult);

        logger.info({ name: params.name, outcome, attempt }, 'ComplyAdvantage screening complete');
        return { outcome, provider: PROVIDER_NAME, rawResult };
      } catch (err) {
        const axiosErr = err as AxiosError;
        if (axiosErr.response?.status === 429 && attempt < MAX_RETRIES) {
          logger.warn({ attempt, name: params.name }, 'ComplyAdvantage 429 — retrying after 60s');
          await sleep(RETRY_DELAY_MS);
          continue;
        }
        throw new ExternalServiceError('ComplyAdvantage', 'Sanctions screening request failed', {
          name: params.name,
          error: String(err),
        });
      }
    }

    throw new ExternalServiceError(
      'ComplyAdvantage',
      'Max retries exceeded for sanctions screening',
      {
        name: params.name,
      },
    );
  }
}

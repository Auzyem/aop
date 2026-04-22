import axios, { type AxiosError } from 'axios';
import { logger, ExternalServiceError } from '@aop/utils';
import type { SanctionsOutcome } from '@aop/db';
import type { ISanctionsProvider, SanctionsSearchParams, SanctionsSearchResult } from './types.js';

// ---------------------------------------------------------------------------
// Dilisense live adapter
// Docs: https://dilisense.com/api-docs
// Endpoints: /v1/checkIndividual (persons) | /v1/checkEntity (companies)
// ---------------------------------------------------------------------------

const PROVIDER_NAME = 'dilisense';
const BASE_URL = 'https://api.dilisense.com/v1';
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 60_000; // 60 s on 429
const HIT_SCORE_THRESHOLD = 0.85; // score >= threshold → confirmed HIT

interface DilisenseRecord {
  name?: string;
  score?: number;
  sources?: string[];
  [key: string]: unknown;
}

interface DilisenseResponse {
  found_records?: DilisenseRecord[];
  total_hits?: number;
  [key: string]: unknown;
}

function mapOutcome(data: DilisenseResponse): SanctionsOutcome {
  const total = data.total_hits ?? data.found_records?.length ?? 0;
  if (total === 0) return 'CLEAR';

  const records = data.found_records ?? [];
  const hasHighConfidenceHit = records.some((r) => (r.score ?? 0) >= HIT_SCORE_THRESHOLD);
  return hasHighConfidenceHit ? 'HIT' : 'POSSIBLE_MATCH';
}

async function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export class DilisenseSanctionsProvider implements ISanctionsProvider {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async search(params: SanctionsSearchParams): Promise<SanctionsSearchResult> {
    // Route to the appropriate endpoint based on entity type
    const endpoint =
      params.entityType === 'company' ? `${BASE_URL}/checkEntity` : `${BASE_URL}/checkIndividual`;

    const payload: Record<string, unknown> = { name: params.name };

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await axios.post<DilisenseResponse>(endpoint, payload, {
          headers: {
            'x-api-key': this.apiKey,
            'Content-Type': 'application/json',
          },
          timeout: 15_000,
        });

        const rawResult = response.data as Record<string, unknown>;
        const outcome = mapOutcome(response.data);

        logger.info(
          { name: params.name, entityType: params.entityType, outcome, attempt },
          'Dilisense screening complete',
        );
        return { outcome, provider: PROVIDER_NAME, rawResult };
      } catch (err) {
        const axiosErr = err as AxiosError;
        if (axiosErr.response?.status === 429 && attempt < MAX_RETRIES) {
          logger.warn({ attempt, name: params.name }, 'Dilisense 429 — retrying after 60s');
          await sleep(RETRY_DELAY_MS);
          continue;
        }
        throw new ExternalServiceError('Dilisense', 'Sanctions screening request failed', {
          name: params.name,
          error: String(err),
        });
      }
    }

    throw new ExternalServiceError('Dilisense', 'Max retries exceeded for sanctions screening', {
      name: params.name,
    });
  }
}

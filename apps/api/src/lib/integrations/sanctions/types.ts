import type { SanctionsOutcome } from '@aop/db';

// ---------------------------------------------------------------------------
// ISanctionsProvider — adapter contract for sanctions screening providers
// ---------------------------------------------------------------------------

export interface SanctionsSearchParams {
  /** Full legal name of the individual or entity */
  name: string;
  /** 'person' for individuals; 'company' for legal entities */
  entityType: 'person' | 'company';
  /** ISO-3166-1 alpha-2 country code — narrows the search */
  countryCode?: string;
}

export interface SanctionsSearchResult {
  /** Normalised outcome across all providers */
  outcome: SanctionsOutcome;
  /** Provider name used to populate SanctionsScreening.provider */
  provider: string;
  /** Raw API response — stored as JSON in SanctionsScreening.rawResult */
  rawResult: Record<string, unknown>;
}

export interface ISanctionsProvider {
  search(params: SanctionsSearchParams): Promise<SanctionsSearchResult>;
}

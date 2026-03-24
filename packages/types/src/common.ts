/**
 * Common API response shapes shared across all AOP services.
 */

export interface ApiResponse<T = unknown> {
  success: boolean;
  data: T;
  message?: string;
  timestamp: string;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  timestamp: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface PaginationQuery {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export type ID = string;

export type ISO8601 = string;

export type CurrencyCode = 'USD' | 'EUR' | 'GBP' | 'KES' | 'TZS' | 'UGX' | 'RWF' | 'XAF';

export type WeightUnit = 'troy_oz' | 'grams' | 'kilograms';

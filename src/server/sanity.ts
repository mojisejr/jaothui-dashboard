/* eslint-disable @typescript-eslint/prefer-nullish-coalescing */
import { createClient } from '@sanity/client';
import { env } from '~/env';

export const sanityClient = createClient({
  projectId: env.SANITY_PROJECT_ID || 'q38mtihr', // Fallback to known project ID
  dataset: env.SANITY_DATASET,
  useCdn: false, // Use CDN for production, disable for development
  apiVersion: '2024-01-01', // Use a stable API version
  token: env.SANITY_API_TOKEN, // Optional token for private datasets
});

// Type definitions for Sanity eventRegister documents
export interface EventRegister {
  _id: string;
  _type: 'eventRegister';
  event: { _ref: string }; // Relationship to event document
  ownerName: string;
  ownerTel: string;
  microchip: string;
  name: string;
  color?: string;
  sex?: string;
  buffaloAge?: number;
  type?: string;
  level?: string;
  birthday?: string;
  father?: string; // Optional user input from registration form
  mother?: string; // Optional user input from registration form
  createdAt: string;
  updatedAt: string;
}

export interface SanityQueryResponse<T> {
  result: T[];
  query: string;
  ms: number;
}
